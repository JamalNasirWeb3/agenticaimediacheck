import os
import sys
import json
import math
import re
import base64
import asyncio
from datetime import date as _date
import anthropic
from serpapi import GoogleSearch
from dotenv import load_dotenv

load_dotenv()

_api_key = os.getenv("ANTHROPIC_API_KEY")
if not _api_key:
    raise RuntimeError("ANTHROPIC_API_KEY is not set in backend/.env")

client = anthropic.AsyncAnthropic(api_key=_api_key)

MAX_SEARCHES = 5

TOOLS = [
    {
        "name": "web_search",
        "description": (
            "Search the web for current news and information to verify a specific claim. "
            "Returns titles, URLs, and snippets from top results. Use focused queries."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "A focused search query to verify a specific claim",
                }
            },
            "required": ["query"],
        },
    }
]

PROMPT_TEMPLATE = """You are an expert fact-checker and media literacy analyst.

Today's date is {today}. Use this when assessing whether dates in the content are past, present, or future.

IMPORTANT: Write ALL text fields in the JSON (summary, explanations, technique descriptions) in {language}. Only the JSON keys and enum values (TRUE/FALSE/MISLEADING etc.) must remain in English.

Analyze the following text:
1. First, extract any article metadata present in the text (title, author, date, DOI, publication, URL, content type)
2. Use web_search (max {max_searches} times) to verify the most critical claims. Search strategy:
   - For statements by named officials or public figures: include their full name and title in the query (e.g. "Iranian Foreign Minister Abbas Araghchi Pakistan visit")
   - For events: include the country, event type, and year
   - For social media posts: search for news coverage of the claim, not the post itself
   - Prefer specific queries over generic ones — named entities + date outperform vague topic searches
3. Extract up to 5 key verifiable claims and assess each
4. Detect propaganda techniques (e.g., fear-mongering, false dichotomy, bandwagon, cherry-picking, ad hominem, straw man, appeal to emotion, false urgency)
5. Produce an overall authenticity verdict

Respond ONLY with a single valid JSON object — no markdown, no text outside JSON. Keep text fields concise (1-2 sentences):

{{
  "article_metadata": {{
    "title": "article title or null",
    "author": "author name(s) or null",
    "published_date": "YYYY-MM-DD or free text date or null",
    "doi": "10.xxxx/xxxxx or null",
    "source": "publication or outlet name or null",
    "url": "URL if present in text or null",
    "content_type": "news" | "opinion" | "research" | "social-media" | "other" | null
  }},
  "claims": [
    {{
      "claim": "exact verifiable claim",
      "verdict": "TRUE" | "FALSE" | "MISLEADING" | "UNVERIFIED",
      "explanation": "1-2 sentence evidence-based explanation",
      "sources": ["source name or URL"]
    }}
  ],
  "propaganda_techniques": [
    {{
      "technique": "technique name",
      "explanation": "1 sentence on how it appears"
    }}
  ],
  "overall_verdict": "TRUE" | "FALSE" | "MISLEADING" | "MIXED" | "UNVERIFIED",
  "summary": "2 sentence summary",
  "authenticity_score": 0.0
}}

authenticity_score: 0.0 (fabricated) to 1.0 (fully verified). Be concise.

Text to analyze:
---
{text}
---"""

DOI_REGEX = re.compile(r'\b(10\.\d{4,9}/[^\s"\'<>]+)\b')


def _extract_doi(text: str) -> str | None:
    match = DOI_REGEX.search(text)
    return match.group(1) if match else None


def _categorize_url(url: str) -> str:
    u = url.lower()
    if any(d in u for d in ["snopes", "politifact", "factcheck", "fullfact", "boomlive", "altnews", "vishvasnews", "factly"]):
        return "fact-check"
    if any(d in u for d in ["bbc", "reuters", "aljazeera", "cnn", "guardian", "nytimes", "apnews", "ndtv", "thehindu", "dawn.com", "geo.tv", "thenews", "express.pk"]):
        return "news"
    if any(d in u for d in [".edu", ".ac.", "scholar.google", "pubmed", "jstor", "researchgate"]):
        return "academic"
    if any(d in u for d in [".gov", "un.org", "who.int", "parliament", "senate", "congress"]):
        return "government"
    if any(d in u for d in ["twitter.com", "x.com", "facebook.com", "instagram.com", "reddit.com", "youtube.com"]):
        return "social-media"
    return "other"


def _run_serp_search(query: str) -> tuple[str, list]:
    serpapi_key = os.getenv("SERPAPI_KEY")
    if not serpapi_key or serpapi_key == "your_serpapi_key_here":
        return "Search unavailable (SERPAPI_KEY not configured).", []

    params = {"engine": "google", "q": query, "api_key": serpapi_key, "num": 3}
    data = GoogleSearch(params).get_dict()
    organic = data.get("organic_results", [])

    resources, lines = [], []
    for r in organic[:3]:
        title = r.get("title", "")
        url = r.get("link", "")
        snippet = r.get("snippet", "")
        lines.append(f"- {title}\n  URL: {url}\n  {snippet}")
        if url:
            resources.append({"title": title, "url": url, "category": _categorize_url(url)})

    return "\n".join(lines) or "No results found.", resources


def _extract_json(raw: str) -> dict:
    # 1. Raw string is pure JSON
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    # 2. JSON inside markdown fences
    match = re.search(r"```(?:json)?\s*(\{)", raw, re.DOTALL)
    if match:
        try:
            obj, _ = json.JSONDecoder().raw_decode(raw, match.start(1))
            return obj
        except json.JSONDecodeError:
            pass
    # 3. First { in the string — stop at the end of the valid object, not the last }
    idx = raw.find("{")
    if idx != -1:
        try:
            obj, _ = json.JSONDecoder().raw_decode(raw, idx)
            return obj
        except json.JSONDecodeError:
            pass
    raise ValueError(f"Could not extract JSON from response: {raw[:300]}")


YOUTUBE_EXTRACTION_PROMPT = """You are analyzing a screenshot of a YouTube video page. Extract every visible piece of information.

Respond ONLY with a single valid JSON object — no markdown, no text outside JSON:

{
  "video_title": "full video title as shown",
  "channel": "channel name as shown",
  "verified": true or false (true if checkmark is visible next to channel name, false otherwise),
  "view_count": "view count as shown (e.g. '1.2M views') or null if not visible",
  "like_count": "like count as shown (e.g. '45K') or null if not visible",
  "published_date": "upload date as shown (e.g. '2 years ago' or 'Apr 15, 2023') or null if not visible",
  "description": "visible description text or null if not visible",
  "video_text": "combine the video title with any visible description, captions, or on-screen text into one string for fact-checking"
}

If this is not a YouTube video screenshot, respond with: {"error": "Not a YouTube screenshot"}"""

TWEET_EXTRACTION_PROMPT = """You are analyzing a screenshot of a tweet. Extract every visible piece of information.

Respond ONLY with a single valid JSON object — no markdown, no text outside JSON:

{
  "username": "display name as shown",
  "handle": "@handle (include the @ symbol)",
  "verified": true or false (true if blue or gold checkmark is visible, false otherwise),
  "date": "date/time exactly as shown in the tweet",
  "tweet_text": "complete tweet text including hashtags, mentions, and links",
  "likes": "like count as shown (e.g. '1.2K') or null if not visible",
  "retweets": "retweet count as shown or null if not visible",
  "replies": "reply count as shown or null if not visible"
}

If this is not a tweet/X post screenshot, respond with: {"error": "Not a tweet image"}"""

IMAGE_EXTRACTION_PROMPT = """You are analyzing an image. It may be any type: a news article screenshot, WhatsApp forward, meme, infographic, document scan, social media post, SMS screenshot, email, or any other visual content.

Extract all information that could be fact-checked.

Respond ONLY with a single valid JSON object — no markdown, no text outside JSON:

{
  "image_type": "news-screenshot" or "whatsapp-forward" or "meme" or "infographic" or "document" or "social-media-post" or "sms-screenshot" or "email-screenshot" or "headline" or "photo-with-text" or "other",
  "source_platform": "platform, app, or publication visible in the image (e.g. 'WhatsApp', 'BBC News', 'Facebook') — or null if not identifiable",
  "headline": "the main headline, title, or primary claim shown — or null if not present",
  "extracted_text": "ALL visible text from the image in reading order. Include headlines, body text, captions, labels, usernames, dates, hashtags, URLs, statistics — everything readable. If no text is visible, use an empty string.",
  "content_summary": "1-2 sentences describing what this image shows and what claims or information it contains"
}"""

ALLOWED_MEDIA_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


async def extract_tweet_from_image(image_data: bytes, media_type: str) -> dict:
    if media_type not in ALLOWED_MEDIA_TYPES:
        raise ValueError(f"Unsupported image type: {media_type}")

    image_b64 = base64.standard_b64encode(image_data).decode("utf-8")

    response = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": media_type, "data": image_b64},
                },
                {"type": "text", "text": TWEET_EXTRACTION_PROMPT},
            ],
        }],
    )

    u = response.usage
    print(f"[vision] input={u.input_tokens} | output={u.output_tokens} | total={u.input_tokens + u.output_tokens}", flush=True)

    raw = next((b.text for b in response.content if hasattr(b, "text")), "")
    result = _extract_json(raw)

    if "error" in result:
        raise ValueError(result["error"])
    if not result.get("tweet_text", "").strip():
        raise ValueError("Could not extract tweet text from the image")

    # Coerce verified to bool in case Claude returned a string
    v = result.get("verified")
    if isinstance(v, str):
        result["verified"] = v.lower() == "true"

    return result


async def extract_youtube_from_image(image_data: bytes, media_type: str) -> dict:
    if media_type not in ALLOWED_MEDIA_TYPES:
        raise ValueError(f"Unsupported image type: {media_type}")

    image_b64 = base64.standard_b64encode(image_data).decode("utf-8")

    response = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": media_type, "data": image_b64},
                },
                {"type": "text", "text": YOUTUBE_EXTRACTION_PROMPT},
            ],
        }],
    )

    u = response.usage
    print(f"[vision-youtube] input={u.input_tokens} | output={u.output_tokens} | total={u.input_tokens + u.output_tokens}", flush=True)

    raw = next((b.text for b in response.content if hasattr(b, "text")), "")
    result = _extract_json(raw)

    if "error" in result:
        raise ValueError(result["error"])

    title = result.get("video_title", "").strip()
    text_content = result.get("video_text", "").strip()
    if not title and not text_content:
        raise ValueError("Could not extract video content from the image")

    if not text_content:
        result["video_text"] = title

    v = result.get("verified")
    if isinstance(v, str):
        result["verified"] = v.lower() == "true"

    return result


async def extract_image_content(image_data: bytes, media_type: str) -> dict:
    if media_type not in ALLOWED_MEDIA_TYPES:
        raise ValueError(f"Unsupported image type: {media_type}")

    image_b64 = base64.standard_b64encode(image_data).decode("utf-8")

    response = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": media_type, "data": image_b64},
                },
                {"type": "text", "text": IMAGE_EXTRACTION_PROMPT},
            ],
        }],
    )

    u = response.usage
    print(f"[vision-image] input={u.input_tokens} | output={u.output_tokens} | total={u.input_tokens + u.output_tokens}", flush=True)

    raw = next((b.text for b in response.content if hasattr(b, "text")), "")
    result = _extract_json(raw)

    result["extracted_text"] = str(result.get("extracted_text") or "")
    return result


async def fact_check_text(text: str, language: str = "english") -> dict:
    prompt = PROMPT_TEMPLATE.format(text=text, max_searches=MAX_SEARCHES, language=language, today=_date.today().isoformat())
    messages = [{"role": "user", "content": prompt}]
    all_resources: list[dict] = []
    search_count = 0
    total_in = total_out = 0

    # If a DOI is in the text, pre-search it to verify the article exists
    doi = _extract_doi(text)
    if doi:
        print(f"[doi detected] {doi} — pre-searching")
        doi_text, doi_resources = await asyncio.to_thread(_run_serp_search, f'DOI "{doi}"')
        all_resources.extend(doi_resources)
        search_count += 1  # counts against MAX_SEARCHES

    while True:
        response = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=8096,
            tools=TOOLS,
            messages=messages,
        )

        u = response.usage
        total_in += u.input_tokens
        total_out += u.output_tokens
        print(f"[tokens] input={u.input_tokens:,} | output={u.output_tokens:,} | turn_total={u.input_tokens + u.output_tokens:,} | cumulative={total_in + total_out:,}", flush=True)

        if response.stop_reason == "tool_use":
            tool_results = []
            for block in response.content:
                if block.type == "tool_use" and block.name == "web_search":
                    if search_count < MAX_SEARCHES:
                        query = block.input.get("query", "")
                        print(f"[search #{search_count + 1}] {query}", flush=True)
                        result_text, resources = await asyncio.to_thread(_run_serp_search, query)
                        all_resources.extend(resources)
                        search_count += 1
                    else:
                        # Search limit reached — return empty result so model writes final answer
                        print(f"[search limit reached] skipping: {block.input.get('query', '')}", flush=True)
                        result_text = "Search limit reached. Use what you have gathered so far."

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result_text,
                    })

            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": tool_results})

        else:
            raw = next(
                (block.text for block in reversed(response.content) if hasattr(block, "text")),
                "",
            )
            print(f"[raw response preview] {raw[:200]}", flush=True)
            print(f"[fact-check total] input={total_in:,} | output={total_out:,} | grand_total={total_in + total_out:,}", flush=True)

            # Try to extract JSON; if Claude returned prose, ask it to output only JSON
            try:
                result = _extract_json(raw)
            except ValueError:
                print("[json-retry] Claude returned prose — requesting JSON-only response", flush=True)
                messages.append({"role": "assistant", "content": response.content})
                messages.append({"role": "user", "content": "Output ONLY the JSON object — no explanatory text, no markdown fences."})
                retry_resp = await client.messages.create(
                    model="claude-sonnet-4-6",
                    max_tokens=8096,
                    tools=TOOLS,
                    messages=messages,
                )
                u2 = retry_resp.usage
                total_in += u2.input_tokens
                total_out += u2.output_tokens
                print(f"[json-retry tokens] input={u2.input_tokens:,} | output={u2.output_tokens:,} | grand_total={total_in + total_out:,}", flush=True)
                raw = next(
                    (block.text for block in reversed(retry_resp.content) if hasattr(block, "text")),
                    "",
                )
                result = _extract_json(raw)

            # Deduplicate resources by URL
            seen: set[str] = set()
            deduped = []
            for r in all_resources:
                if r["url"] not in seen:
                    seen.add(r["url"])
                    deduped.append(r)
            result["searched_resources"] = deduped

            # Ensure article_metadata exists even if Claude omitted it
            result.setdefault("article_metadata", None)
            return result
