"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import type { FactCheckResult, Verdict, ResourceCategory, ArticleMetadata, TweetMetadata, YoutubeMetadata, ImageMetadata } from "./types";
import { T, type Lang } from "./i18n";

// ─── Verdict config ───────────────────────────────────────────────────────────
const VERDICT_CONFIG: Record<Verdict, {
  pill: string; banner: string; border: string; icon: string; label: string;
}> = {
  TRUE:       { pill: "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40", banner: "from-emerald-950/80 to-slate-900", border: "border-emerald-600/50", icon: "✓", label: "TRUE" },
  FALSE:      { pill: "bg-red-500/20 text-red-300 ring-1 ring-red-500/40",             banner: "from-red-950/80 to-slate-900",     border: "border-red-600/50",     icon: "✗", label: "FALSE" },
  MISLEADING: { pill: "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40",       banner: "from-amber-950/80 to-slate-900",  border: "border-amber-600/50",   icon: "⚠", label: "MISLEADING" },
  MIXED:      { pill: "bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/40",    banner: "from-orange-950/80 to-slate-900", border: "border-orange-600/50",  icon: "~", label: "MIXED" },
  UNVERIFIED: { pill: "bg-slate-500/20 text-slate-300 ring-1 ring-slate-500/40",       banner: "from-slate-800/80 to-slate-900",  border: "border-slate-600/50",   icon: "?", label: "UNVERIFIED" },
};

const CATEGORY_CONFIG: Record<ResourceCategory, { pill: string; label: string }> = {
  "news":         { pill: "bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30",         label: "News"         },
  "academic":     { pill: "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30",label: "Academic"     },
  "government":   { pill: "bg-teal-500/15 text-teal-300 ring-1 ring-teal-500/30",      label: "Government"   },
  "fact-check":   { pill: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30", label: "Fact-Check" },
  "social-media": { pill: "bg-pink-500/15 text-pink-300 ring-1 ring-pink-500/30",      label: "Social Media" },
  "other":        { pill: "bg-slate-500/15 text-slate-400 ring-1 ring-slate-500/30",   label: "Other"        },
};

// ─── Small reusable components ────────────────────────────────────────────────
function VerdictPill({ verdict, lang, large }: { verdict: Verdict; lang: Lang; large?: boolean }) {
  const cfg = VERDICT_CONFIG[verdict] ?? VERDICT_CONFIG.UNVERIFIED;
  const label = T[lang].verdicts[verdict] ?? verdict;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold ${cfg.pill} ${large ? "px-4 py-1.5 text-sm" : "px-2.5 py-0.5 text-xs"}`}>
      <span>{cfg.icon}</span>{label}
    </span>
  );
}

function CategoryPill({ category }: { category: ResourceCategory }) {
  const cfg = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG["other"];
  return (
    <span className={`inline-block rounded-full text-xs font-semibold px-2.5 py-0.5 ${cfg.pill}`}>
      {cfg.label}
    </span>
  );
}

function AuthenticityMeter({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";
  const label = pct >= 70 ? "High credibility" : pct >= 40 ? "Questionable" : "Low credibility";
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-baseline">
        <span className="text-xs text-slate-500 uppercase tracking-widest font-medium">Authenticity Score</span>
        <span className="text-2xl font-bold text-white">{pct}<span className="text-sm text-slate-400 font-normal">%</span></span>
      </div>
      <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden">
        <div className={`absolute inset-y-0 left-0 ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

function MetaRow({ label, value, link }: { label: string; value: string; link?: string }) {
  return (
    <div className="flex gap-3 text-sm py-1.5 border-b border-slate-800/60 last:border-0">
      <span className="text-slate-500 w-28 shrink-0 text-xs uppercase tracking-wide mt-0.5">{label}</span>
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline break-all transition">{value}</a>
      ) : (
        <span className="text-slate-200 break-all">{value}</span>
      )}
    </div>
  );
}

function ArticleMetadataCard({ meta, lang }: { meta: ArticleMetadata; lang: Lang }) {
  const t = T[lang];
  const hasAny = meta.title || meta.author || meta.published_date || meta.doi || meta.source || meta.url || meta.content_type;
  if (!hasAny) return null;
  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5 space-y-1">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">{t.articleDetails}</h2>
        {meta.content_type && (
          <span className="bg-slate-700/60 text-slate-300 text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize">{meta.content_type}</span>
        )}
      </div>
      {meta.title          && <MetaRow label={t.metaTitle}     value={meta.title} />}
      {meta.author         && <MetaRow label={t.metaAuthor}    value={meta.author} />}
      {meta.source         && <MetaRow label={t.metaSource}    value={meta.source} />}
      {meta.published_date && <MetaRow label={t.metaPublished} value={meta.published_date} />}
      {meta.doi && <MetaRow label={t.metaDoi} value={meta.doi} link={`https://doi.org/${meta.doi}`} />}
      {meta.url && <MetaRow label={t.metaUrl} value={meta.url} link={meta.url} />}
    </div>
  );
}

function TweetMetadataCard({ meta, lang }: { meta: TweetMetadata; lang: Lang }) {
  const t = T[lang];
  return (
    <div className="bg-slate-900 border border-sky-800/40 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <svg className="w-4 h-4 text-sky-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">{t.tweetDetails}</h2>
      </div>
      <div className="flex items-start gap-3 mb-4 pb-4 border-b border-slate-800">
        <div className="w-10 h-10 rounded-full bg-sky-900/40 border border-sky-800/50 flex items-center justify-center text-sky-300 text-lg font-bold shrink-0">
          {meta.username?.[0]?.toUpperCase() ?? "?"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {meta.username && <span className="font-semibold text-white text-sm">{meta.username}</span>}
            {meta.verified === true && (
              <svg className="w-4 h-4 text-sky-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91C2.88 9.33 2 10.57 2 12s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91s2.52 1.26 3.91.8c.66 1.31 1.91 2.19 3.34 2.19s2.67-.88 3.33-2.19c1.4.46 2.91.2 3.92-.81s1.26-2.51.8-3.9C21.37 14.67 22.25 13.43 22.25 12zm-6.01-1.74l-3.5 4.5a.75.75 0 01-1.08.1l-2-1.75a.75.75 0 011.02-1.1l1.41 1.24 2.98-3.83a.75.75 0 011.17.94z" />
              </svg>
            )}
            {meta.handle && <span className="text-slate-500 text-sm">{meta.handle}</span>}
          </div>
          {meta.date && <p className="text-xs text-slate-500 mt-0.5">{meta.date}</p>}
        </div>
      </div>
      <p className="text-slate-200 text-sm leading-relaxed mb-4 whitespace-pre-wrap">{meta.tweet_text}</p>
      {(meta.replies || meta.retweets || meta.likes) && (
        <div className="flex gap-5 text-xs text-slate-500 pt-3 border-t border-slate-800">
          {meta.replies  && <span><span className="text-slate-300 font-semibold">{meta.replies}</span> {t.tweetReplies}</span>}
          {meta.retweets && <span><span className="text-slate-300 font-semibold">{meta.retweets}</span> {t.tweetRetweets}</span>}
          {meta.likes    && <span><span className="text-slate-300 font-semibold">{meta.likes}</span> {t.tweetLikes}</span>}
        </div>
      )}
    </div>
  );
}

function YoutubeMetadataCard({ meta, lang }: { meta: YoutubeMetadata; lang: Lang }) {
  const t = T[lang];
  return (
    <div className="bg-slate-900 border border-red-800/40 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <svg className="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="currentColor">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">{t.youtubeDetails}</h2>
      </div>
      <div className="flex items-start gap-3 mb-4 pb-4 border-b border-slate-800">
        <div className="w-10 h-10 rounded-full bg-red-950/60 border border-red-800/50 flex items-center justify-center text-red-300 text-lg font-bold shrink-0">
          {meta.channel?.[0]?.toUpperCase() ?? "Y"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {meta.channel && <span className="font-semibold text-white text-sm">{meta.channel}</span>}
            {meta.verified === true && (
              <svg className="w-4 h-4 text-slate-300 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91C2.88 9.33 2 10.57 2 12s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91s2.52 1.26 3.91.8c.66 1.31 1.91 2.19 3.34 2.19s2.67-.88 3.33-2.19c1.4.46 2.91.2 3.92-.81s1.26-2.51.8-3.9C21.37 14.67 22.25 13.43 22.25 12zm-6.01-1.74l-3.5 4.5a.75.75 0 01-1.08.1l-2-1.75a.75.75 0 011.02-1.1l1.41 1.24 2.98-3.83a.75.75 0 011.17.94z" />
              </svg>
            )}
          </div>
          {meta.published_date && <p className="text-xs text-slate-500 mt-0.5">{meta.published_date}</p>}
        </div>
      </div>
      {meta.video_title && <p className="text-white text-sm font-semibold leading-snug mb-3">{meta.video_title}</p>}
      {meta.description  && <p className="text-slate-400 text-xs leading-relaxed mb-4 line-clamp-3">{meta.description}</p>}
      {(meta.view_count || meta.like_count) && (
        <div className="flex gap-5 text-xs text-slate-500 pt-3 border-t border-slate-800">
          {meta.view_count && <span><span className="text-slate-300 font-semibold">{meta.view_count}</span> {t.youtubeViews}</span>}
          {meta.like_count && <span><span className="text-slate-300 font-semibold">{meta.like_count}</span> {t.youtubeLikes}</span>}
        </div>
      )}
    </div>
  );
}

const IMAGE_TYPE_LABELS: Record<string, string> = {
  "news-screenshot":   "News Screenshot",
  "whatsapp-forward":  "WhatsApp Forward",
  "meme":              "Meme",
  "infographic":       "Infographic",
  "document":          "Document",
  "social-media-post": "Social Media Post",
  "sms-screenshot":    "SMS Screenshot",
  "email-screenshot":  "Email Screenshot",
  "headline":          "Headline",
  "photo-with-text":   "Photo with Text",
  "other":             "Image",
};

function ImageMetadataCard({ meta, lang }: { meta: ImageMetadata; lang: Lang }) {
  const t = T[lang];
  const typeLabel = meta.image_type ? (IMAGE_TYPE_LABELS[meta.image_type] ?? meta.image_type) : null;
  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">{t.imageDetails}</h2>
        {typeLabel && (
          <span className="bg-slate-700/60 text-slate-300 text-xs font-semibold px-2.5 py-0.5 rounded-full">{typeLabel}</span>
        )}
      </div>

      {meta.source_platform && (
        <div className="flex gap-3 text-sm py-2 border-b border-slate-800/60">
          <span className="text-slate-500 w-28 shrink-0 text-xs uppercase tracking-wide mt-0.5">Source</span>
          <span className="text-slate-200">{meta.source_platform}</span>
        </div>
      )}

      {meta.headline && (
        <div className="py-3 border-b border-slate-800/60">
          <p className="text-slate-500 text-xs uppercase tracking-wide mb-1.5">Headline / Claim</p>
          <p className="text-white font-semibold text-sm leading-snug">{meta.headline}</p>
        </div>
      )}

      {meta.content_summary && (
        <p className="text-slate-400 text-sm mt-3 leading-relaxed">{meta.content_summary}</p>
      )}
    </div>
  );
}

// ─── Tab icons ────────────────────────────────────────────────────────────────
function IconText() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}
function IconLink() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
}
function IconX() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
function IconYoutube() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}
function IconImage() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  );
}

type Tab = "text" | "url" | "image" | "youtube" | "photo";

const TAB_META: Record<Tab, { icon: React.ReactNode; accentFocus: string }> = {
  text:    { icon: <IconText />,    accentFocus: "focus:border-blue-500 focus:ring-blue-500/20"   },
  url:     { icon: <IconLink />,    accentFocus: "focus:border-blue-500 focus:ring-blue-500/20"   },
  image:   { icon: <IconX />,       accentFocus: "focus:border-sky-500 focus:ring-sky-500/20"    },
  youtube: { icon: <IconYoutube />, accentFocus: "focus:border-red-500 focus:ring-red-500/20"    },
  photo:   { icon: <IconImage />,   accentFocus: "focus:border-violet-500 focus:ring-violet-500/20" },
};

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Home() {
  const [lang, setLang]                 = useState<Lang>("en");
  const [tab, setTab]                   = useState<Tab>("text");
  const [text, setText]                 = useState("");
  const [url, setUrl]                   = useState("");
  const [imageFile, setImageFile]       = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [youtubeFile, setYoutubeFile]   = useState<File | null>(null);
  const [youtubePreview, setYoutubePreview] = useState<string | null>(null);
  const [tweetMode, setTweetMode]       = useState<"screenshot" | "url">("screenshot");
  const [tweetUrl, setTweetUrl]         = useState("");
  const [youtubeMode, setYoutubeMode]   = useState<"screenshot" | "url">("screenshot");
  const [youtubeUrl, setYoutubeUrl]     = useState("");
  const [isDragging, setIsDragging]     = useState(false);
  const [loading, setLoading]           = useState(false);
  const [result, setResult]             = useState<FactCheckResult | null>(null);
  const [error, setError]               = useState<string | null>(null);

  const [photoFile, setPhotoFile]       = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [cropSrc, setCropSrc]             = useState<string | null>(null);
  const [cropOrigFile, setCropOrigFile]   = useState<File | null>(null);
  const [cropTarget, setCropTarget]       = useState<"image" | "youtube" | "photo" | null>(null);
  const [crop, setCrop]                   = useState<Crop | undefined>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | undefined>();
  const cropImgRef = useRef<HTMLImageElement>(null);

  const fileInputRef    = useRef<HTMLInputElement>(null);
  const youtubeInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef   = useRef<HTMLInputElement>(null);
  const t = T[lang];
  const langName = lang === "en" ? "اردو" : "English";

  function toggleLang() { setLang(l => l === "en" ? "ur" : "en"); setResult(null); setError(null); }

  function setImage(file: File) {
    setImageFile(file); setResult(null); setError(null);
    setImagePreview(URL.createObjectURL(file));
  }
  function setYoutubeImage(file: File) {
    setYoutubeFile(file); setResult(null); setError(null);
    setYoutubePreview(URL.createObjectURL(file));
  }

  function setPhoto(file: File) {
    setPhotoFile(file); setResult(null); setError(null);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function openCrop(file: File, target: "image" | "youtube" | "photo") {
    setCropSrc(URL.createObjectURL(file));
    setCropOrigFile(file);
    setCropTarget(target);
    setCrop(undefined);
    setCompletedCrop(undefined);
  }

  function closeCrop() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null); setCropOrigFile(null); setCropTarget(null);
  }

  function skipCrop() {
    if (cropOrigFile && cropTarget) {
      if (cropTarget === "image") setImage(cropOrigFile);
      else if (cropTarget === "youtube") setYoutubeImage(cropOrigFile);
      else setPhoto(cropOrigFile);
    }
    closeCrop();
  }

  async function getCroppedFile(image: HTMLImageElement, px: PixelCrop): Promise<File> {
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    const canvas = document.createElement("canvas");
    canvas.width  = Math.floor(px.width  * scaleX);
    canvas.height = Math.floor(px.height * scaleY);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image,
      Math.floor(px.x * scaleX), Math.floor(px.y * scaleY),
      Math.floor(px.width * scaleX), Math.floor(px.height * scaleY),
      0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) =>
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error("Crop failed")); return; }
        resolve(new File([blob], "cropped.png", { type: "image/png" }));
      }, "image/png"),
    );
  }

  async function applyCrop() {
    if (!completedCrop?.width || !completedCrop?.height || !cropImgRef.current || !cropTarget) return;
    try {
      const file = await getCroppedFile(cropImgRef.current, completedCrop);
      if (cropTarget === "image") setImage(file);
      else if (cropTarget === "youtube") setYoutubeImage(file);
      else setPhoto(file);
    } catch { /* ignore */ }
    closeCrop();
  }

  useEffect(() => {
    if (tab !== "image" && tab !== "youtube" && tab !== "photo") return;
    function onPaste(e: ClipboardEvent) {
      const item = Array.from(e.clipboardData?.items ?? []).find(i => i.type.startsWith("image/"));
      if (!item) return;
      const file = item.getAsFile();
      if (!file) return;
      if (tab === "image") openCrop(file, "image");
      else if (tab === "youtube") openCrop(file, "youtube");
      else openCrop(file, "photo");
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [tab]);

  function onDragOver(e: React.DragEvent)  { e.preventDefault(); setIsDragging(true); }
  function onDragLeave()                   { setIsDragging(false); }
  function onDrop(e: React.DragEvent)      { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f?.type.startsWith("image/")) openCrop(f, "image"); }
  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) { const f = e.target.files?.[0]; if (f) openCrop(f, "image"); }

  async function handleTextSubmit(e: React.FormEvent) {
    e.preventDefault(); if (!text.trim()) return;
    await runFactCheck(() => fetch("/api/fact-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, language: lang === "ur" ? "urdu" : "english" }) }));
  }
  async function handleUrlSubmit(e: React.FormEvent) {
    e.preventDefault(); if (!url.trim()) return;
    await runFactCheck(() => fetch("/api/fact-check-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, language: lang === "ur" ? "urdu" : "english" }) }));
  }
  async function handleTweetUrlSubmit(e: React.FormEvent) {
    e.preventDefault(); if (!tweetUrl.trim()) return;
    await runFactCheck(() => fetch("/api/fact-check-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: tweetUrl, language: lang === "ur" ? "urdu" : "english" }) }));
  }
  async function handleImageSubmit(e: React.FormEvent) {
    e.preventDefault(); if (!imageFile) return;
    const fd = new FormData(); fd.append("file", imageFile); fd.append("language", lang === "ur" ? "urdu" : "english");
    await runFactCheck(() => fetch("/api/fact-check-image", { method: "POST", body: fd }));
  }
  async function handleYoutubeSubmit(e: React.FormEvent) {
    e.preventDefault(); if (!youtubeFile) return;
    const fd = new FormData(); fd.append("file", youtubeFile); fd.append("language", lang === "ur" ? "urdu" : "english");
    await runFactCheck(() => fetch("/api/fact-check-youtube-image", { method: "POST", body: fd }));
  }
  async function handlePhotoSubmit(e: React.FormEvent) {
    e.preventDefault(); if (!photoFile) return;
    const fd = new FormData(); fd.append("file", photoFile); fd.append("language", lang === "ur" ? "urdu" : "english");
    await runFactCheck(() => fetch("/api/fact-check-generic-image", { method: "POST", body: fd }));
  }

  async function handleYoutubeUrlSubmit(e: React.FormEvent) {
    e.preventDefault(); if (!youtubeUrl.trim()) return;
    await runFactCheck(() => fetch("/api/fact-check-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: youtubeUrl, language: lang === "ur" ? "urdu" : "english" }) }));
  }

  async function runFactCheck(fetcher: () => Promise<Response>) {
    setLoading(true); setResult(null); setError(null);
    try {
      const res = await fetcher();
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
        throw new Error(detail || `Server error ${res.status}`);
      }
      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  const resourcesByCategory = result?.searched_resources.reduce((acc, r) => {
    (acc[r.category] ??= []).push(r);
    return acc;
  }, {} as Record<string, typeof result.searched_resources>);

  const loadingMsg = tab === "url" ? t.loadingLink
    : tab === "image" ? (tweetMode === "url" ? t.loadingTweetUrl : t.loadingImage)
    : tab === "youtube" ? (youtubeMode === "url" ? t.loadingYoutubeUrl : t.loadingYoutube)
    : tab === "photo" ? t.loadingPhoto
    : t.loadingText;

  const verdictCfg = result ? (VERDICT_CONFIG[result.overall_verdict] ?? VERDICT_CONFIG.UNVERIFIED) : null;

  return (
    <div dir={t.dir} className={`min-h-screen bg-slate-950 ${lang === "ur" ? t.fontClass : ""}`}>

      {/* ── Topbar ──────────────────────────────────────────────────────── */}
      <header className="border-b border-slate-800/60 bg-slate-950/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo mark */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-900/40">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <span className="font-bold text-white tracking-tight">Fact Check <span className="text-blue-400">AI</span></span>
          </div>
          {/* Right side */}
          <div className="flex items-center gap-3">
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Powered by Claude AI
            </span>
            <button onClick={toggleLang} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700/60 transition">
              {langName}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10">

        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold px-3 py-1 rounded-full mb-4">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
            AI-Powered Verification
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-3 leading-tight">
            Verify News, Articles<br className="hidden sm:block" /> & Social Media Claims
          </h1>
          <p className="text-slate-400 text-base max-w-xl mx-auto">
            Paste any article, news story, or social post. Our AI searches the web, verifies each claim, and delivers an evidence-backed verdict.
          </p>
        </div>

        {/* ── Feature chips ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {[
            { icon: "📰", label: "News Articles" },
            { icon: "🔗", label: "Web Links" },
            { icon: "🐦", label: "Social Posts" },
            { icon: "▶", label: "YouTube" },
            { icon: "📖", label: "Research Papers" },
            { icon: "💬", label: "WhatsApp Forwards" },
          ].map(c => (
            <span key={c.label} className="inline-flex items-center gap-1.5 bg-slate-800/60 border border-slate-700/40 text-slate-400 text-xs px-3 py-1 rounded-full">
              <span>{c.icon}</span>{c.label}
            </span>
          ))}
        </div>

        {/* ── Input card ────────────────────────────────────────────────── */}
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl shadow-xl shadow-black/30 mb-8 overflow-hidden">

          {/* Tab bar */}
          <div className="flex border-b border-slate-800">
            {(["text", "url", "image", "youtube", "photo"] as Tab[]).map((tb) => {
              const isActive = tab === tb;
              const activeColor = tb === "photo" ? "border-violet-500 text-violet-400 bg-violet-500/5"
                : tb === "youtube" ? "border-red-500 text-red-400 bg-red-500/5"
                : "border-blue-500 text-blue-400 bg-blue-500/5";
              const tabLabel = tb === "text" ? t.tabText : tb === "url" ? t.tabLink
                : tb === "image" ? t.tabImage : tb === "youtube" ? t.tabYoutube : t.tabPhoto;
              return (
                <button
                  key={tb}
                  onClick={() => { setTab(tb); setResult(null); setError(null); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold transition border-b-2 ${
                    isActive ? activeColor : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/40"
                  }`}
                >
                  {TAB_META[tb].icon}
                  <span className="hidden sm:inline">{tabLabel}</span>
                </button>
              );
            })}
          </div>

          {/* Input body */}
          <div className="p-5">

            {/* Text tab */}
            {tab === "text" && (
              <form onSubmit={handleTextSubmit}>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t.textPlaceholder}
                  rows={7}
                  maxLength={5000}
                  className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 text-slate-100 placeholder-slate-500 resize-none focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition text-sm"
                />
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-slate-600">{text.length} / 5000</span>
                  <button type="submit" disabled={loading || !text.trim()}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold rounded-xl transition shadow-lg shadow-blue-900/30">
                    {loading ? t.btnAnalyzing : t.btnCheck}
                  </button>
                </div>
              </form>
            )}

            {/* URL tab */}
            {tab === "url" && (
              <form onSubmit={handleUrlSubmit}>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 start-3.5 flex items-center pointer-events-none text-slate-500">
                      <IconLink />
                    </div>
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder={t.urlPlaceholder}
                      className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl ps-10 pe-4 py-3.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition text-sm"
                    />
                  </div>
                  <button type="submit" disabled={loading || !url.trim()}
                    className="px-5 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold rounded-xl transition shrink-0 shadow-lg shadow-blue-900/30">
                    {loading ? t.btnFetching : t.btnCheckLink}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-2.5 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {t.urlNote}
                </p>
              </form>
            )}

            {/* Tweet / X tab */}
            {tab === "image" && (
              <div>
                {/* Sub-toggle */}
                <div className="flex gap-1 bg-slate-800/60 rounded-lg p-1 mb-4">
                  {(["screenshot", "url"] as const).map((mode) => (
                    <button key={mode} type="button"
                      onClick={() => { setTweetMode(mode); setResult(null); setError(null); }}
                      className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition ${
                        tweetMode === mode ? "bg-sky-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
                      }`}>
                      {mode === "screenshot" ? t.tweetModeScreenshot : t.tweetModeUrl}
                    </button>
                  ))}
                </div>

                {tweetMode === "screenshot" && (
                  <form onSubmit={handleImageSubmit}>
                    <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={onFileChange} />
                    {imagePreview ? (
                      <div className="relative mb-4">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imagePreview} alt="Tweet screenshot preview" className="w-full max-h-80 object-contain rounded-xl border border-slate-700 bg-slate-800" />
                        <button type="button"
                          onClick={() => { setImageFile(null); setImagePreview(null); setResult(null); setError(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                          className="absolute top-2 end-2 bg-slate-800/90 hover:bg-slate-700 text-slate-300 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-600 transition">
                          {t.imageChange}
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                        className={`w-full h-44 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed cursor-pointer transition ${
                          isDragging ? "border-sky-500 bg-sky-950/20" : "border-slate-700 bg-slate-800/30 hover:border-slate-600 hover:bg-slate-800/50"
                        }`}
                      >
                        <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                          </svg>
                        </div>
                        <p className="text-slate-300 text-sm font-medium">{t.imageDropZone}</p>
                        <p className="text-slate-500 text-xs">{t.imageHint} · Ctrl+V to paste</p>
                      </div>
                    )}
                    <div className="flex justify-end mt-3">
                      <button type="submit" disabled={loading || !imageFile}
                        className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold rounded-xl transition shadow-lg shadow-sky-900/30">
                        {loading ? t.btnAnalyzingImage : t.btnCheckImage}
                      </button>
                    </div>
                  </form>
                )}

                {tweetMode === "url" && (
                  <form onSubmit={handleTweetUrlSubmit}>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <div className="absolute inset-y-0 start-3.5 flex items-center pointer-events-none text-sky-400">
                          <IconX />
                        </div>
                        <input type="url" value={tweetUrl} onChange={(e) => setTweetUrl(e.target.value)}
                          placeholder={t.tweetUrlPlaceholder}
                          className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl ps-10 pe-4 py-3.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 transition text-sm" />
                      </div>
                      <button type="submit" disabled={loading || !tweetUrl.trim()}
                        className="px-5 py-3 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold rounded-xl transition shrink-0">
                        {loading ? t.btnFetching : t.btnCheckTweetUrl}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">{t.tweetUrlNote}</p>
                  </form>
                )}
              </div>
            )}

            {/* YouTube tab */}
            {tab === "youtube" && (
              <div>
                {/* Sub-toggle */}
                <div className="flex gap-1 bg-slate-800/60 rounded-lg p-1 mb-4">
                  {(["screenshot", "url"] as const).map((mode) => (
                    <button key={mode} type="button"
                      onClick={() => { setYoutubeMode(mode); setResult(null); setError(null); }}
                      className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition ${
                        youtubeMode === mode ? "bg-red-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
                      }`}>
                      {mode === "screenshot" ? t.youtubeModeScreenshot : t.youtubeModeUrl}
                    </button>
                  ))}
                </div>

                {youtubeMode === "screenshot" && (
                  <form onSubmit={handleYoutubeSubmit}>
                    <input ref={youtubeInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) openCrop(f, "youtube"); }} />
                    {youtubePreview ? (
                      <div className="relative mb-4">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={youtubePreview} alt="YouTube screenshot preview" className="w-full max-h-80 object-contain rounded-xl border border-slate-700 bg-slate-800" />
                        <button type="button"
                          onClick={() => { setYoutubeFile(null); setYoutubePreview(null); setResult(null); setError(null); if (youtubeInputRef.current) youtubeInputRef.current.value = ""; }}
                          className="absolute top-2 end-2 bg-slate-800/90 hover:bg-slate-700 text-slate-300 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-600 transition">
                          {t.youtubeChange}
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => youtubeInputRef.current?.click()}
                        onDragOver={onDragOver} onDragLeave={onDragLeave}
                        onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f?.type.startsWith("image/")) openCrop(f, "youtube"); }}
                        className={`w-full h-44 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed cursor-pointer transition ${
                          isDragging ? "border-red-500 bg-red-950/20" : "border-slate-700 bg-slate-800/30 hover:border-slate-600 hover:bg-slate-800/50"
                        }`}
                      >
                        <div className="w-12 h-12 rounded-full bg-red-950/40 border border-red-800/40 flex items-center justify-center text-red-500">
                          <IconYoutube />
                        </div>
                        <p className="text-slate-300 text-sm font-medium">{t.youtubeDropZone}</p>
                        <p className="text-slate-500 text-xs">{t.youtubeHint} · Ctrl+V to paste</p>
                      </div>
                    )}
                    <div className="flex justify-end mt-3">
                      <button type="submit" disabled={loading || !youtubeFile}
                        className="px-6 py-2.5 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold rounded-xl transition">
                        {loading ? t.btnAnalyzingYoutube : t.btnCheckYoutube}
                      </button>
                    </div>
                  </form>
                )}

                {youtubeMode === "url" && (
                  <form onSubmit={handleYoutubeUrlSubmit}>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <div className="absolute inset-y-0 start-3.5 flex items-center pointer-events-none text-red-500">
                          <IconYoutube />
                        </div>
                        <input type="url" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)}
                          placeholder={t.youtubeUrlPlaceholder}
                          className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl ps-10 pe-4 py-3.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition text-sm" />
                      </div>
                      <button type="submit" disabled={loading || !youtubeUrl.trim()}
                        className="px-5 py-3 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold rounded-xl transition shrink-0">
                        {loading ? t.btnFetching : t.btnCheckYoutubeUrl}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">{t.youtubeUrlNote}</p>
                  </form>
                )}
              </div>
            )}

            {/* ── Photo / generic image tab ── */}
            {tab === "photo" && (
              <form onSubmit={handlePhotoSubmit}>
                <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) openCrop(f, "photo"); }} />

                {photoPreview ? (
                  <div className="relative mb-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoPreview} alt="Image preview" className="w-full max-h-80 object-contain rounded-xl border border-slate-700 bg-slate-800" />
                    <button type="button"
                      onClick={() => { setPhotoFile(null); setPhotoPreview(null); setResult(null); setError(null); if (photoInputRef.current) photoInputRef.current.value = ""; }}
                      className="absolute top-2 end-2 bg-slate-800/90 hover:bg-slate-700 text-slate-300 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-600 transition">
                      {t.photoChange}
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => photoInputRef.current?.click()}
                    onDragOver={onDragOver} onDragLeave={onDragLeave}
                    onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f?.type.startsWith("image/")) openCrop(f, "photo"); }}
                    className={`w-full h-52 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed cursor-pointer transition ${
                      isDragging ? "border-violet-500 bg-violet-950/20" : "border-slate-700 bg-slate-800/30 hover:border-slate-600 hover:bg-slate-800/50"
                    }`}
                  >
                    <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400">
                      <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                      </svg>
                    </div>
                    <div className="text-center px-4">
                      <p className="text-slate-200 text-sm font-semibold mb-1">{t.photoDropZone}</p>
                      <p className="text-slate-500 text-xs">{t.photoHint} · Ctrl+V to paste</p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-1.5 px-6">
                      {["📰 News", "💬 WhatsApp", "😂 Meme", "📊 Infographic", "📄 Document"].map(label => (
                        <span key={label} className="text-xs bg-slate-800 border border-slate-700 text-slate-400 px-2 py-0.5 rounded-full">{label}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end mt-3">
                  <button type="submit" disabled={loading || !photoFile}
                    className="px-6 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold rounded-xl transition shadow-lg shadow-violet-900/30">
                    {loading ? t.btnAnalyzingPhoto : t.btnCheckPhoto}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* ── Loading ───────────────────────────────────────────────────── */}
        {loading && (
          <div className="text-center py-16">
            <div className="inline-flex flex-col items-center gap-4">
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 rounded-full border-4 border-slate-800" />
                <div className="absolute inset-0 rounded-full border-4 border-t-blue-500 animate-spin" />
              </div>
              <div>
                <p className="text-white font-semibold mb-1">Analyzing…</p>
                <p className="text-slate-400 text-sm">{loadingMsg}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Error ─────────────────────────────────────────────────────── */}
        {error && (
          <div className="bg-red-950/40 border border-red-800/50 rounded-xl p-4 flex gap-3 items-start">
            <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div className="flex-1">
              <p className="text-red-300 font-semibold text-sm">{t.errorLabel}</p>
              <p className="text-red-400 text-sm mt-0.5">{error}</p>
              {error.includes("doesn't appear to be") && (tab === "youtube" || tab === "image") && (
                <button
                  onClick={() => {
                    const file = tab === "youtube" ? youtubeFile : imageFile;
                    if (file) { setPhoto(file); setTab("photo"); }
                    setError(null);
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-violet-300 bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 rounded-lg transition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                  Try as Generic Image instead →
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Results ───────────────────────────────────────────────────── */}
        {result && verdictCfg && (
          <div className="space-y-5">

            {/* Metadata cards */}
            {result.image_metadata   && <ImageMetadataCard meta={result.image_metadata} lang={lang} />}
            {result.tweet_metadata   && <TweetMetadataCard meta={result.tweet_metadata} lang={lang} />}
            {result.youtube_metadata && <YoutubeMetadataCard meta={result.youtube_metadata} lang={lang} />}
            {result.article_metadata && <ArticleMetadataCard meta={result.article_metadata} lang={lang} />}

            {/* ── Verdict banner ── */}
            <div className={`rounded-2xl border ${verdictCfg.border} bg-gradient-to-br ${verdictCfg.banner} overflow-hidden`}>
              <div className="p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-widest font-medium mb-1">{t.overallVerdict}</p>
                    <div className="flex items-center gap-3">
                      <VerdictPill verdict={result.overall_verdict} lang={lang} large />
                    </div>
                  </div>
                  <div className="text-right shrink-0 min-w-[140px]">
                    <AuthenticityMeter score={result.authenticity_score} />
                  </div>
                </div>
                <p className="text-slate-300 text-sm leading-relaxed">{result.summary}</p>
              </div>
            </div>

            {/* ── Claims ── */}
            {result.claims.length > 0 && (
              <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-800">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">{t.claimsAnalyzed(result.claims.length)}</h2>
                </div>
                <div className="divide-y divide-slate-800">
                  {result.claims.map((claim, i) => (
                    <div key={i} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <span className="text-xs text-slate-600 font-mono mt-0.5 shrink-0">#{i + 1}</span>
                          <p className="text-slate-200 text-sm font-medium leading-snug">"{claim.claim}"</p>
                        </div>
                        <VerdictPill verdict={claim.verdict} lang={lang} />
                      </div>
                      <p className="text-slate-400 text-sm ps-6 mb-2">{claim.explanation}</p>
                      {claim.sources.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 ps-6">
                          {claim.sources.map((src, j) => (
                            <span key={j} className="text-xs bg-slate-800 text-slate-400 border border-slate-700/50 px-2 py-0.5 rounded-full">{src}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Sources searched ── */}
            {result.searched_resources.length > 0 && resourcesByCategory && (
              <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-800">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">{t.sourcesSearched(result.searched_resources.length)}</h2>
                </div>
                <div className="p-5 space-y-5">
                  {(Object.entries(resourcesByCategory) as [ResourceCategory, typeof result.searched_resources][])
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([category, resources]) => (
                      <div key={category}>
                        <div className="flex items-center gap-2 mb-2">
                          <CategoryPill category={category} />
                          <span className="text-xs text-slate-600">{t.sources(resources.length)}</span>
                        </div>
                        <div className="space-y-1.5 ps-1">
                          {resources.map((r, i) => (
                            <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                              className="flex items-start gap-2.5 group py-0.5">
                              <span className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-blue-400 transition" />
                              <span className="text-sm text-slate-400 group-hover:text-blue-400 group-hover:underline underline-offset-2 transition break-all leading-snug">
                                {r.title || r.url}
                              </span>
                            </a>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* ── Propaganda techniques ── */}
            {result.propaganda_techniques.length > 0 ? (
              <div className="bg-slate-900 border border-violet-800/30 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-800">
                  <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <h2 className="text-sm font-semibold text-violet-300 uppercase tracking-wide">{t.propagandaTitle(result.propaganda_techniques.length)}</h2>
                </div>
                <div className="p-5 space-y-3">
                  {result.propaganda_techniques.map((pt, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="shrink-0 bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30 text-xs font-semibold px-2.5 py-0.5 rounded-full h-fit">{pt.technique}</span>
                      <p className="text-slate-400 text-sm leading-relaxed">{pt.explanation}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-700/50 rounded-xl px-5 py-4 flex items-center gap-2.5 text-sm text-slate-500">
                <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {t.noPropaganda}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Crop modal ────────────────────────────────────────────────────── */}
      {cropSrc && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <h2 className="text-sm font-semibold text-white">Crop Image</h2>
              <button onClick={skipCrop} className="text-slate-400 hover:text-white transition text-xs px-2 py-1 rounded hover:bg-slate-800">✕</button>
            </div>
            <div className="p-4 overflow-auto flex items-center justify-center bg-slate-950" style={{ maxHeight: "65vh" }}>
              <ReactCrop crop={crop} onChange={c => setCrop(c)} onComplete={c => setCompletedCrop(c)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img ref={cropImgRef} src={cropSrc} alt="Crop" style={{ maxWidth: "100%", maxHeight: "60vh", objectFit: "contain" }} />
              </ReactCrop>
            </div>
            <div className="flex items-center justify-between px-5 py-4 border-t border-slate-800 gap-3">
              <p className="text-xs text-slate-500">Click and drag to select the area you want to keep</p>
              <div className="flex gap-2 shrink-0">
                <button onClick={skipCrop}
                  className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 transition">
                  Use Full Image
                </button>
                <button onClick={applyCrop} disabled={!completedCrop?.width}
                  className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-xl transition">
                  Crop & Use
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800/60 mt-12">
        <div className="max-w-4xl mx-auto px-4 py-8 space-y-3 text-xs text-slate-500">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <span className="font-semibold text-slate-400 uppercase tracking-wide">Fact Check AI — Educational Use Disclaimer</span>
          </div>
          <p>
            Fact Check AI is a free public media literacy tool developed for educational purposes to help citizens
            identify misinformation, fabricated content, and biased reporting.
          </p>
          <p>
            <span className="text-slate-400 font-medium">AI-Generated Analysis Disclosure:</span> All analysis is
            generated automatically by third-party AI language models (primarily Anthropic). The developer, Jamal Abdul Nasir
            and his team have no involvement in producing or reviewing individual outputs. Results may contain errors or
            inaccuracies and do not represent the views of any individual, political party, or institution.
          </p>
          <p>All analysis is a starting point for critical thinking only — not a definitive legal, editorial, or journalistic verdict. Always verify from multiple trusted sources.</p>
        </div>
      </footer>
    </div>
  );
}
