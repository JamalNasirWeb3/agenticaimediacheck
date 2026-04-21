i want to develop a fact check app. 
Primarily it  analysis the given text and finds its relevance/ authenticity  in news , also detects propganda techniques used in 
later on this will 
checks a tweet(x) post,  forwarded whatasapp messages, viral videos , audios , with its source, and authenticity. 

it is AI(LLM) powered app, where LLM plays centeral role to validate and fact check. 

in fact it is LLM-centered fact-checking system where the model extracts claims, plans verification steps, gathers evidence from trusted sources, compares findings, and then produces a grounded verdict with citations



Tech stack 

Frontend: Next.js
Backend: FastAPI
LLM orchestration: OpenAI Agents SDK or LangGraph, Anthropic/ claude agent
Retrieval/search: SerpAPI for web discovery, plus direct official-source fetchers
Database: PostgreSQL
Queue: Celery / Redis for deeper checks
Vector store: pgvector or FAISS
Extraction/parsing: newspaper-style article extraction + HTML cleaning
Observability: structured logs per claim and per evidence source


Note 
start with 
free tier 
 this will be  a free tier , where user can validate contents of  pasted text  using  LLM gemini . the LLM verifies the content using web/ internet  sources 

 in next phase 
 paid  tier
 api from twitter and anthropic as LLM 

 