import os
import re
import requests
from urllib.parse import urlparse, parse_qs, unquote
from bs4 import BeautifulSoup
from serpapi import GoogleSearch

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

FACEBOOK_DOMAINS  = ("facebook.com", "fb.com", "fb.me", "m.facebook.com")
TWITTER_DOMAINS   = ("twitter.com", "x.com", "t.co")
YOUTUBE_DOMAINS   = ("youtube.com", "youtu.be")
BLOCKED_PLATFORMS = ("facebook", "instagram", "twitter")


def detect_platform(url: str) -> str:
    u = url.lower()
    if any(d in u for d in FACEBOOK_DOMAINS):
        return "facebook"
    if any(d in u for d in TWITTER_DOMAINS):
        return "twitter"
    if "instagram.com" in u:
        return "instagram"
    if "youtube.com" in u or "youtu.be" in u:
        return "youtube"
    if "linkedin.com" in u:
        return "linkedin"
    return "web"


def _clean_facebook_url(url: str) -> tuple[str, str | None]:
    """
    Extract the real content URL and page name from a messy Facebook URL.
    Returns (canonical_url, page_name_or_none).
    """
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)

    # Extract share_url param if present
    share_url = qs.get("share_url", [None])[0]
    if share_url:
        share_url = unquote(share_url).split("#")[0].strip()

    # Extract page name from path: /pagename?... or /pagename/posts/...
    path_parts = [p for p in parsed.path.split("/") if p]
    page_name = path_parts[0] if path_parts else None

    # Skip generic path components
    if page_name in ("share", "reel", "video", "watch", "groups", "events", "pages"):
        page_name = None

    canonical = share_url or url.split("?")[0].split("#")[0]
    return canonical, page_name


def _og(soup: BeautifulSoup, prop: str) -> str:
    tag = soup.find("meta", property=prop) or soup.find("meta", attrs={"name": prop})
    return (tag.get("content") or "") if tag else ""


def _serp_search(query: str, serpapi_key: str, num: int = 5) -> list[dict]:
    data = GoogleSearch({"engine": "google", "q": query, "api_key": serpapi_key, "num": num}).get_dict()
    return data.get("organic_results", [])


def _fetch_via_serp(url: str, platform: str) -> dict:
    """
    Retrieve content via SerpAPI for blocked/paywalled URLs.
    Used for social platforms and any web URL that returns 4xx.
    """
    serpapi_key = os.getenv("SERPAPI_KEY", "")
    if not serpapi_key or serpapi_key == "your_serpapi_key_here":
        if platform == "web":
            raise ValueError(
                "This page blocked direct access (403/401). "
                "Add a SERPAPI_KEY to .env to enable fallback search."
            )
        raise ValueError(
            f"This {platform} link cannot be fetched directly (login required). "
            "Add a SERPAPI_KEY to .env to enable fallback search."
        )

    parts: list[str] = []
    title = ""

    if platform == "facebook":
        canonical_url, page_name = _clean_facebook_url(url)
        print(f"[facebook] canonical={canonical_url} page={page_name}")

        # Strategy 1: search for the canonical share URL
        for r in _serp_search(canonical_url, serpapi_key, num=5):
            if not title and r.get("title"):
                title = r["title"]
                parts.append(f"Title: {title}")
            if r.get("snippet"):
                parts.append(r["snippet"])

        # Strategy 2: if page name known, search site:facebook.com/<page>
        if not parts and page_name:
            for r in _serp_search(f'site:facebook.com/{page_name}', serpapi_key, num=5):
                if not title and r.get("title"):
                    title = r["title"]
                    parts.append(f"Title: {title}")
                if r.get("snippet"):
                    parts.append(r["snippet"])

        # Strategy 3: generic page search if we have a page name
        if not parts and page_name:
            for r in _serp_search(f'"{page_name}" facebook', serpapi_key, num=5):
                if r.get("snippet"):
                    parts.append(r["snippet"])

    else:
        # Twitter / Instagram
        for r in _serp_search(url, serpapi_key, num=5):
            if not title and r.get("title"):
                title = r["title"]
                parts.append(f"Title: {title}")
            if r.get("snippet"):
                parts.append(r["snippet"])

    text = "\n".join(parts).strip()
    if not text:
        if platform == "web":
            raise ValueError(
                "Could not retrieve content for this URL. "
                "The page may be paywalled, private, or not indexed by Google. "
                "Try pasting the article text directly in the 'Paste Text' tab."
            )
        raise ValueError(
            f"Could not retrieve content for this {platform} link. "
            "The post may be private, deleted, or not yet indexed by Google. "
            "Try pasting the post text directly in the 'Paste Text' tab."
        )

    return {
        "platform": platform,
        "url": url,
        "title": title or None,
        "author": None,
        "published_date": None,
        "text": f"[{platform.title()} post content retrieved via search]\n\n{text}",
    }


def _extract_youtube_id(url: str) -> str | None:
    parsed = urlparse(url)
    if any(d in parsed.netloc for d in ("youtu.be",)):
        return parsed.path.strip("/") or None
    return parse_qs(parsed.query).get("v", [None])[0]


def _fetch_youtube(url: str) -> dict:
    """
    Fetch YouTube video info without the YouTube Data API.
    1. oEmbed (always works, gives title + channel)
    2. Direct page fetch for og:description (works on most IPs)
    3. SerpAPI title-based search as last resort
    """
    title = channel = description = ""

    # oEmbed — public endpoint, no auth, works from cloud servers
    try:
        r = requests.get(
            f"https://www.youtube.com/oembed?url={url}&format=json",
            headers=HEADERS, timeout=10,
        )
        if r.status_code == 200:
            d = r.json()
            title   = d.get("title", "")
            channel = d.get("author_name", "")
    except Exception:
        pass

    # Direct page fetch for description (may fail on cloud IPs)
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code == 200:
            soup = BeautifulSoup(r.text, "html.parser")
            if not title:
                title = _og(soup, "og:title")
            description = _og(soup, "og:description")
            if not channel:
                channel = _og(soup, "og:site_name")
    except Exception:
        pass

    # SerpAPI fallback using the video title as a search query
    if not description:
        serpapi_key = os.getenv("SERPAPI_KEY", "")
        if serpapi_key and serpapi_key != "your_serpapi_key_here":
            query = f'"{title}" youtube' if title else url
            for r in _serp_search(query, serpapi_key, num=5):
                snippet = r.get("snippet", "")
                if snippet:
                    description = snippet
                    if not title:
                        title = r.get("title", "")
                    break

    if not title and not description:
        raise ValueError(
            "Could not retrieve content for this YouTube video. "
            "Try pasting the video title or description in the 'Paste Text' tab."
        )

    parts = []
    if title:       parts.append(f"Title: {title}")
    if channel:     parts.append(f"Channel: {channel}")
    if description: parts.append(f"\nDescription: {description}")

    return {
        "platform": "youtube",
        "url": url,
        "title": title or None,
        "author": channel or None,
        "published_date": None,
        "text": "\n".join(parts),
    }


def fetch_url_content(url: str) -> dict:
    """
    Fetch a public URL and extract readable content + metadata.
    Social platforms fall back to SerpAPI when they block direct access.
    """
    platform = detect_platform(url)

    if platform == "youtube":
        return _fetch_youtube(url)

    if platform in BLOCKED_PLATFORMS:
        # Best-effort direct fetch (mobile Facebook)
        try:
            fetch_url = url.replace("www.facebook.com", "m.facebook.com") if platform == "facebook" else url
            resp = requests.get(fetch_url, headers=HEADERS, timeout=12, allow_redirects=True)
            if resp.status_code == 200:
                soup = BeautifulSoup(resp.text, "html.parser")
                title       = _og(soup, "og:title") or (soup.title.string.strip() if soup.title else "")
                description = _og(soup, "og:description")
                author      = _og(soup, "article:author") or _og(soup, "og:site_name")
                published   = _og(soup, "article:published_time")

                parts = []
                if title:       parts.append(f"Title: {title}")
                if author:      parts.append(f"Author/Source: {author}")
                if published:   parts.append(f"Published: {published}")
                if description: parts.append(f"\n{description}")
                text = "\n".join(parts).strip()
                if text:
                    return {
                        "platform": platform,
                        "url": url,
                        "title": title or None,
                        "author": author or None,
                        "published_date": published or None,
                        "text": text,
                    }
        except Exception:
            pass

        return _fetch_via_serp(url, platform)

    # Standard web / news article fetch
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15, allow_redirects=True)
        resp.raise_for_status()
    except requests.HTTPError as e:
        # Paywalled / bot-blocked pages: fall back to SerpAPI
        status = e.response.status_code if e.response is not None else 0
        if status in (401, 403, 429):
            print(f"[url-fetch] {status} from {url} — falling back to SerpAPI", flush=True)
            return _fetch_via_serp(url, "web")
        raise ValueError(f"Could not fetch URL: {e}")
    except requests.RequestException as e:
        raise ValueError(f"Could not fetch URL: {e}")

    soup = BeautifulSoup(resp.text, "html.parser")
    title       = _og(soup, "og:title") or (soup.title.string.strip() if soup.title else "")
    description = _og(soup, "og:description")
    author      = _og(soup, "article:author") or _og(soup, "og:site_name")
    published   = _og(soup, "article:published_time") or _og(soup, "og:updated_time")

    body_text = ""
    for tag in soup.find_all(["article", "main"]):
        body_text = tag.get_text(separator=" ", strip=True)
        if len(body_text) > 200:
            break

    parts = []
    if title:       parts.append(f"Title: {title}")
    if author:      parts.append(f"Author/Source: {author}")
    if published:   parts.append(f"Published: {published}")
    if description: parts.append(f"\n{description}")
    if body_text and len(body_text) > len(description):
        parts.append(f"\n{body_text[:3000]}")

    extracted_text = "\n".join(parts).strip()
    if not extracted_text:
        raise ValueError(
            "Could not extract readable content from this URL. "
            "The page may require login or block automated access."
        )

    return {
        "platform": platform,
        "url": url,
        "title": title or None,
        "author": author or None,
        "published_date": published or None,
        "text": extracted_text,
    }
