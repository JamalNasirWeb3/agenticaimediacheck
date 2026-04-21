from pydantic import BaseModel, Field
from typing import List, Optional
from enum import Enum


class Verdict(str, Enum):
    TRUE = "TRUE"
    FALSE = "FALSE"
    MISLEADING = "MISLEADING"
    UNVERIFIED = "UNVERIFIED"
    MIXED = "MIXED"


class ResourceCategory(str, Enum):
    NEWS = "news"
    ACADEMIC = "academic"
    GOVERNMENT = "government"
    FACT_CHECK = "fact-check"
    SOCIAL_MEDIA = "social-media"
    OTHER = "other"


class ArticleMetadata(BaseModel):
    title: Optional[str] = None
    author: Optional[str] = None
    published_date: Optional[str] = None       # ISO date string or free text
    doi: Optional[str] = None                  # e.g. 10.1000/xyz123
    source: Optional[str] = None               # publication / outlet name
    url: Optional[str] = None
    content_type: Optional[str] = None         # news | opinion | research | social-media | other


class SearchedResource(BaseModel):
    title: str
    url: str
    category: ResourceCategory = ResourceCategory.OTHER


class Claim(BaseModel):
    claim: str
    verdict: Verdict
    explanation: str
    sources: List[str] = []


class PropagandaTechnique(BaseModel):
    technique: str
    explanation: str


class TweetMetadata(BaseModel):
    username: Optional[str] = None       # display name
    handle: Optional[str] = None         # @handle
    verified: Optional[bool] = None      # blue/gold checkmark
    date: Optional[str] = None           # as shown in screenshot
    tweet_text: str                      # full tweet content
    likes: Optional[str] = None
    retweets: Optional[str] = None
    replies: Optional[str] = None


class FactCheckResult(BaseModel):
    article_metadata: Optional[ArticleMetadata] = None
    tweet_metadata: Optional[TweetMetadata] = None
    claims: List[Claim]
    propaganda_techniques: List[PropagandaTechnique]
    overall_verdict: Verdict
    summary: str
    authenticity_score: float = Field(ge=0.0, le=1.0)
    searched_resources: List[SearchedResource] = []


class FactCheckRequest(BaseModel):
    text: str
    language: str = "english"  # "english" | "urdu"
