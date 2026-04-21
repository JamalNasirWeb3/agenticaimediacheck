# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An AI-powered fact-checking application. Given text or a URL, it:
1. Extracts verifiable claims
2. Searches the web via SerpAPI (up to 3 searches per request) to verify claims
3. Detects propaganda techniques
4. Returns a structured verdict with sources and an authenticity score

Supports English and Urdu (RTL) output. Planned future inputs: tweets/X posts, WhatsApp forwards, viral videos, audio.

## Commands

### Backend (FastAPI)
```bash
cd backend
python -m venv venv && venv/Scripts/activate   # Windows
pip install -r requirements.txt
uvicorn main:app --reload                        # http://localhost:8000
```
API docs: http://localhost:8000/docs

### Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev    # http://localhost:3000
```

## Architecture

### Tech Stack
| Layer | Technology |
|---|---|
| Frontend | Next.js 15, TypeScript, Tailwind CSS |
| Backend | FastAPI |
| LLM | Claude (`claude-sonnet-4-6`) via Anthropic SDK — agentic tool-use loop |
| Web Search | SerpAPI (Google engine, `MAX_SEARCHES=3`) |
| URL Fetching | `requests` + BeautifulSoup; SerpAPI fallback for Facebook/Instagram/Twitter |
| Future: Queue | Celery + Redis |
| Future: DB | PostgreSQL + pgvector |

### Request Flow
```
User (browser) → Next.js (proxies /api/*) → FastAPI → Claude (tool_use loop)
                                                          └── web_search tool → SerpAPI
```
Next.js proxies `/api/*` to `http://localhost:8000` via `next.config.ts` rewrites — no CORS issues in dev.

### Backend Structure
- `main.py` — FastAPI app, CORS, three routes, `_sanitize_result()` post-processes Claude's JSON
- `fact_checker.py` — Anthropic async client, agentic `tool_use` loop, `PROMPT_TEMPLATE`, `_run_serp_search()`, `_extract_json()`
- `models.py` — Pydantic models: `FactCheckRequest`, `FactCheckResult`, `Claim`, `PropagandaTechnique`, `ArticleMetadata`, `SearchedResource`
- `url_fetcher.py` — `fetch_url_content()`: direct HTTP fetch with BeautifulSoup OG-tag extraction; social platforms (Facebook, Instagram, Twitter) fall back to SerpAPI SERP scraping

### Agentic Loop (`fact_checker.py`)
`fact_check_text()` runs a `while True` loop calling `client.messages.create()` with a `web_search` tool definition. When `stop_reason == "tool_use"`, it executes the SerpAPI search and appends results to `messages`. Loop exits on `stop_reason == "end_turn"`. A DOI detected in input text triggers a pre-search before the main loop. `MAX_SEARCHES = 3` caps total SerpAPI calls.

### API Endpoints
| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/api/fact-check` | Fact-check raw text |
| POST | `/api/fetch-url` | Fetch and extract URL content only |
| POST | `/api/fact-check-url` | Fetch URL then fact-check its content |

### Frontend Structure
- `app/page.tsx` — entire UI: two tabs (text / URL), results rendering
- `app/i18n.ts` — all UI strings in English (`en`) and Urdu (`ur`); Urdu sets `dir: "rtl"` and `fontClass: "font-urdu"`
- `app/types.ts` — TypeScript types mirroring backend Pydantic models

### Key Data Model
```typescript
FactCheckResult {
  article_metadata?: { title, author, published_date, doi, source, url, content_type }
  claims: { claim, verdict, explanation, sources[] }[]
  propaganda_techniques: { technique, explanation }[]
  overall_verdict: "TRUE"|"FALSE"|"MISLEADING"|"MIXED"|"UNVERIFIED"
  summary: string
  authenticity_score: 0.0–1.0
  searched_resources: { title, url, category }[]  // deduped, added by fact_checker not Claude
}
```

`searched_resources` is assembled from SerpAPI results during the tool-use loop and injected into the result dict after Claude's final response — Claude does not produce this field.

`_sanitize_result()` in `main.py` coerces verdicts to uppercase, clamps `authenticity_score` to [0,1], fills `article_metadata` gaps from URL-fetched content, and strips unknown `ResourceCategory` values to `"other"`.

## Environment Variables
`backend/.env`:
```
ANTHROPIC_API_KEY=...
SERPAPI_KEY=...          # optional but required for web search and social platform fallback
```

If `SERPAPI_KEY` is missing or set to `your_serpapi_key_here`, searches return a graceful "unavailable" message and social platform URL fetching raises a `ValueError`.

## Two-Tier Product Plan
- **Current**: Claude Sonnet + SerpAPI, text and URL inputs, English/Urdu
- **Future (paid tier)**: Twitter API, multimedia inputs, PostgreSQL, Redis/Celery queue
