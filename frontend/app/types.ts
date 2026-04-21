export type Verdict = "TRUE" | "FALSE" | "MISLEADING" | "UNVERIFIED" | "MIXED";
export type ResourceCategory = "news" | "academic" | "government" | "fact-check" | "social-media" | "other";
export type ContentType = "news" | "opinion" | "research" | "social-media" | "other";

export interface ArticleMetadata {
  title: string | null;
  author: string | null;
  published_date: string | null;
  doi: string | null;
  source: string | null;
  url: string | null;
  content_type: ContentType | null;
}

export interface Claim {
  claim: string;
  verdict: Verdict;
  explanation: string;
  sources: string[];
}

export interface PropagandaTechnique {
  technique: string;
  explanation: string;
}

export interface SearchedResource {
  title: string;
  url: string;
  category: ResourceCategory;
}

export interface TweetMetadata {
  username: string | null;
  handle: string | null;
  verified: boolean | null;
  date: string | null;
  tweet_text: string;
  likes: string | null;
  retweets: string | null;
  replies: string | null;
}

export interface FactCheckResult {
  article_metadata: ArticleMetadata | null;
  tweet_metadata: TweetMetadata | null;
  claims: Claim[];
  propaganda_techniques: PropagandaTechnique[];
  overall_verdict: Verdict;
  summary: string;
  authenticity_score: number;
  searched_resources: SearchedResource[];
}
