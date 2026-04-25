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


class YoutubeMetadata(BaseModel):
    video_title: Optional[str] = None
    channel: Optional[str] = None
    verified: Optional[bool] = None      # channel checkmark
    view_count: Optional[str] = None
    like_count: Optional[str] = None
    published_date: Optional[str] = None
    description: Optional[str] = None
    video_text: str                      # main content to fact-check


class ImageMetadata(BaseModel):
    image_type: Optional[str] = None       # e.g. "news-screenshot", "whatsapp-forward", "meme"
    source_platform: Optional[str] = None  # e.g. "WhatsApp", "BBC News"
    headline: Optional[str] = None         # main headline/title/claim if visible
    extracted_text: str = ""               # all visible text combined
    content_summary: Optional[str] = None  # 1-2 sentence description


class FactCheckResult(BaseModel):
    article_metadata: Optional[ArticleMetadata] = None
    tweet_metadata: Optional[TweetMetadata] = None
    youtube_metadata: Optional[YoutubeMetadata] = None
    image_metadata: Optional[ImageMetadata] = None
    claims: List[Claim]
    propaganda_techniques: List[PropagandaTechnique]
    overall_verdict: Verdict
    summary: str
    authenticity_score: float = Field(ge=0.0, le=1.0)
    searched_resources: List[SearchedResource] = []


class FactCheckRequest(BaseModel):
    text: str
    language: str = "english"  # "english" | "urdu"
