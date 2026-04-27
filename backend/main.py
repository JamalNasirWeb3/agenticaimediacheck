import sys
import math
import json
import traceback
import asyncio
from pydantic import BaseModel, ValidationError
from fastapi import FastAPI, HTTPException, File, UploadFile, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from models import FactCheckRequest, FactCheckResult
from fact_checker import fact_check_text, extract_tweet_from_image, extract_youtube_from_image, extract_image_content, ALLOWED_MEDIA_TYPES
from url_fetcher import fetch_url_content

app = FastAPI(title="FactCheck API", version="0.1.0")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print(f"\n=== UNHANDLED EXCEPTION [{type(exc).__name__}] ===", flush=True)
    traceback.print_exc()
    print("=== END ===\n", flush=True)
    sys.stdout.flush()
    return JSONResponse(status_code=500, content={"detail": f"{type(exc).__name__}: {exc}"})

import os as _os
_dev_origins = ["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"]
_extra = [o.strip() for o in _os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
_allowed_origins = _dev_origins + _extra

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class UrlRequest(BaseModel):
    url: str
    language: str = "english"


class FetchedContent(BaseModel):
    platform: str
    url: str
    title: str | None
    author: str | None
    published_date: str | None
    text: str


def _sanitize_result(result: dict, platform: str | None = None, url: str | None = None,
                     title: str | None = None, author: str | None = None,
                     published_date: str | None = None) -> FactCheckResult:
    """
    Coerce/sanitize the raw dict from Claude into a valid FactCheckResult.
    Logs any validation errors with the raw data so we can debug.
    """
    # Ensure article_metadata exists and fill gaps from fetched content
    meta = result.get("article_metadata") or {}
    if isinstance(meta, dict):
        if url and not meta.get("url"):             meta["url"] = url
        if title and not meta.get("title"):         meta["title"] = title
        if author and not meta.get("author"):       meta["author"] = author
        if published_date and not meta.get("published_date"): meta["published_date"] = published_date
        if platform and not meta.get("content_type"):
            meta["content_type"] = "social-media" if platform in ("facebook", "twitter", "instagram") else "news"
        result["article_metadata"] = meta if any(meta.values()) else None

    # Clamp authenticity_score to valid range (math.isfinite guards against NaN/Inf)
    score = result.get("authenticity_score", 0.0)
    try:
        score_f = float(score) if score is not None else 0.0
        result["authenticity_score"] = max(0.0, min(1.0, score_f)) if math.isfinite(score_f) else 0.0
    except (TypeError, ValueError):
        result["authenticity_score"] = 0.0

    # Normalise verdict values to uppercase; map unknown values to UNVERIFIED
    _valid_verdicts = {"TRUE", "FALSE", "MISLEADING", "MIXED", "UNVERIFIED"}
    for field in ("overall_verdict",):
        v = result.get(field)
        if isinstance(v, str):
            v = v.upper()
            result[field] = v if v in _valid_verdicts else "UNVERIFIED"
    for claim in result.get("claims", []):
        v = claim.get("verdict")
        if isinstance(v, str):
            v = v.upper()
            claim["verdict"] = v if v in _valid_verdicts else "UNVERIFIED"

    # Strip unknown ResourceCategory values to "other"
    valid_categories = {"news", "academic", "government", "fact-check", "social-media", "other"}
    for r in result.get("searched_resources", []):
        if r.get("category") not in valid_categories:
            r["category"] = "other"

    # Coerce tweet_metadata stat fields to strings (Claude sometimes returns integers)
    tweet_meta = result.get("tweet_metadata")
    if isinstance(tweet_meta, dict):
        for field in ("likes", "retweets", "replies"):
            v = tweet_meta.get(field)
            if v is not None and not isinstance(v, str):
                tweet_meta[field] = str(v)
        tweet_meta["tweet_text"] = str(tweet_meta.get("tweet_text") or "")

    # Coerce youtube_metadata stat fields to strings
    yt_meta = result.get("youtube_metadata")
    if isinstance(yt_meta, dict):
        for field in ("view_count", "like_count"):
            v = yt_meta.get(field)
            if v is not None and not isinstance(v, str):
                yt_meta[field] = str(v)
        yt_meta["video_text"] = str(yt_meta.get("video_text") or yt_meta.get("video_title") or "")

    # Coerce image_metadata extracted_text to string
    img_meta = result.get("image_metadata")
    if isinstance(img_meta, dict):
        img_meta["extracted_text"] = str(img_meta.get("extracted_text") or "")

    try:
        return FactCheckResult.model_validate(result)
    except ValidationError as e:
        print("=== VALIDATION ERROR ===")
        print(e)
        print("=== RAW RESULT ===")
        try:
            print(json.dumps(result, indent=2, default=str)[:3000])
        except Exception:
            print(str(result)[:3000])
        raise


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/fact-check")
async def fact_check(request: FactCheckRequest):
    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    if len(text) > 5000:
        raise HTTPException(status_code=400, detail="Text too long (max 5000 characters)")
    try:
        result = await fact_check_text(text, language=request.language)
        dumped = _sanitize_result(result).model_dump(mode="json")
        body = json.dumps(dumped, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
        return Response(content=body.encode("utf-8"), media_type="application/json")
    except ValidationError as e:
        raise HTTPException(status_code=502, detail=f"Response validation error: {e.error_count()} field(s) invalid")
    except ValueError as e:
        traceback.print_exc()
        raise HTTPException(status_code=502, detail=f"Response parsing error: {e}")
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Fact check failed: {type(e).__name__}: {e}")


@app.post("/api/fetch-url", response_model=FetchedContent)
async def fetch_url(request: UrlRequest):
    url = request.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL cannot be empty")
    try:
        content = await asyncio.to_thread(fetch_url_content, url)
        return content
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to fetch URL: {e}")


@app.post("/api/fact-check-image")
async def fact_check_image(
    file: UploadFile = File(...),
    language: str = Form("english"),
):
    try:
        if file.content_type not in ALLOWED_MEDIA_TYPES:
            return JSONResponse(status_code=422, content={"detail": f"Unsupported image type '{file.content_type}'."})

        image_data = await file.read()
        if len(image_data) > 5 * 1024 * 1024:
            return JSONResponse(status_code=422, content={"detail": "Image too large (max 5 MB)"})

        tweet_data = await extract_tweet_from_image(image_data, file.content_type)
        print(f"[tweet_data] verified={tweet_data.get('verified')} text_len={len(str(tweet_data.get('tweet_text','')))} chars", flush=True)

        tweet_text = str(tweet_data.get("tweet_text") or "")
        username   = tweet_data.get("username", "")
        handle     = tweet_data.get("handle", "")
        verified   = tweet_data.get("verified", False)
        date       = tweet_data.get("date", "")
        author_line = ""
        if username or handle:
            parts = [p for p in [username, handle] if p]
            author_line = "Tweet by " + " ".join(parts)
            if verified:
                author_line += " (verified account)"
            if date:
                author_line += f" on {date}"
            author_line += ":\n\n"
        enriched_text = author_line + tweet_text
        result = await fact_check_text(enriched_text, language=language)
        print("[step1] fact_check_text done", flush=True)
        result["tweet_metadata"] = tweet_data
        print("[step2] tweet_metadata assigned", flush=True)
        sanitized = _sanitize_result(result)
        print("[step3] sanitize done", flush=True)
        dumped = sanitized.model_dump(mode="json")
        print("[step4] model_dump done", flush=True)
        # Serialize once with strict settings — catches NaN/Inf before sending
        body = json.dumps(dumped, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
        print(f"[step5] json.dumps done ({len(body.encode())} bytes)", flush=True)
        return Response(content=body.encode("utf-8"), media_type="application/json")

    except ValueError as e:
        msg = str(e)
        print(f"[user-error] {msg}", flush=True)
        if "not a tweet" in msg.lower():
            return JSONResponse(status_code=422, content={"detail": "This image doesn't appear to be a tweet screenshot. Please upload a screenshot of a tweet or X post."})
        return JSONResponse(status_code=422, content={"detail": msg})
    except BaseException as e:
        traceback.print_exc()
        print(f"[ERROR] {type(e).__name__}: {e}", flush=True)
        sys.stdout.flush()
        return JSONResponse(status_code=500, content={"detail": "Something went wrong while processing the image. Please try again."})


@app.post("/api/fact-check-youtube-image")
async def fact_check_youtube_image(
    file: UploadFile = File(...),
    language: str = Form("english"),
):
    try:
        if file.content_type not in ALLOWED_MEDIA_TYPES:
            return JSONResponse(status_code=422, content={"detail": f"Unsupported image type '{file.content_type}'."})

        image_data = await file.read()
        if len(image_data) > 5 * 1024 * 1024:
            return JSONResponse(status_code=422, content={"detail": "Image too large (max 5 MB)"})

        youtube_data = await extract_youtube_from_image(image_data, file.content_type)
        print(f"[youtube_data] channel={youtube_data.get('channel')} text_len={len(str(youtube_data.get('video_text','')))} chars", flush=True)

        video_text = str(youtube_data.get("video_text") or "")
        channel    = youtube_data.get("channel", "")
        yt_verified = youtube_data.get("verified", False)
        yt_author_line = ""
        if channel:
            yt_author_line = f"YouTube video by {channel}"
            if yt_verified:
                yt_author_line += " (verified channel)"
            yt_author_line += ":\n\n"
        enriched_video_text = yt_author_line + video_text
        result = await fact_check_text(enriched_video_text, language=language)
        result["youtube_metadata"] = youtube_data
        sanitized = _sanitize_result(result)
        dumped = sanitized.model_dump(mode="json")
        body = json.dumps(dumped, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
        return Response(content=body.encode("utf-8"), media_type="application/json")

    except ValueError as e:
        msg = str(e)
        print(f"[user-error] {msg}", flush=True)
        if "not a youtube" in msg.lower():
            return JSONResponse(status_code=422, content={"detail": "This image doesn't appear to be a YouTube screenshot. Please upload a screenshot of a YouTube video page."})
        return JSONResponse(status_code=422, content={"detail": msg})
    except BaseException as e:
        traceback.print_exc()
        print(f"[ERROR] {type(e).__name__}: {e}", flush=True)
        sys.stdout.flush()
        return JSONResponse(status_code=500, content={"detail": "Something went wrong while processing the image. Please try again."})


@app.post("/api/fact-check-generic-image")
async def fact_check_generic_image(
    file: UploadFile = File(...),
    language: str = Form("english"),
):
    try:
        if file.content_type not in ALLOWED_MEDIA_TYPES:
            return JSONResponse(status_code=422, content={"detail": f"Unsupported image type '{file.content_type}'."})

        image_data = await file.read()
        if len(image_data) > 5 * 1024 * 1024:
            return JSONResponse(status_code=422, content={"detail": "Image too large (max 5 MB)"})

        image_meta = await extract_image_content(image_data, file.content_type)
        print(f"[image_meta] type={image_meta.get('image_type')} platform={image_meta.get('source_platform')} text_len={len(image_meta.get('extracted_text', ''))} chars", flush=True)

        extracted_text = image_meta.get("extracted_text", "").strip()
        if not extracted_text:
            extracted_text = image_meta.get("content_summary") or "No readable text found in the image."

        result = await fact_check_text(extracted_text, language=language)
        result["image_metadata"] = image_meta
        sanitized = _sanitize_result(result)
        dumped = sanitized.model_dump(mode="json")
        body = json.dumps(dumped, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
        return Response(content=body.encode("utf-8"), media_type="application/json")

    except ValidationError as e:
        print(f"[validation-error] {e}", flush=True)
        raise HTTPException(status_code=502, detail=f"Response validation error: {e.error_count()} field(s) invalid")
    except ValueError as e:
        traceback.print_exc()
        raise HTTPException(status_code=502, detail=f"Response parsing error: {e}")
    except BaseException as e:
        traceback.print_exc()
        print(f"[ERROR] {type(e).__name__}: {e}", flush=True)
        sys.stdout.flush()
        raise HTTPException(status_code=500, detail=f"Image fact-check failed: {type(e).__name__}: {e}")


@app.post("/api/fact-check-url")
async def fact_check_url(request: UrlRequest):
    url = request.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL cannot be empty")
    try:
        content = await asyncio.to_thread(fetch_url_content, url)
        result = await fact_check_text(content["text"], language=request.language)
        sanitized = _sanitize_result(
            result,
            platform=content["platform"],
            url=content["url"],
            title=content.get("title"),
            author=content.get("author"),
            published_date=content.get("published_date"),
        )
        dumped = sanitized.model_dump(mode="json")
        body = json.dumps(dumped, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
        return Response(content=body.encode("utf-8"), media_type="application/json")
    except ValidationError as e:
        print(f"[validation-error] {e}", flush=True)
        raise HTTPException(status_code=502, detail=f"Response validation error: {e.error_count()} field(s) invalid")
    except ValueError as e:
        traceback.print_exc()
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        print(f"[ERROR] {type(e).__name__}: {e}", flush=True)
        raise HTTPException(status_code=500, detail=f"Fact check failed: {type(e).__name__}: {e}")
