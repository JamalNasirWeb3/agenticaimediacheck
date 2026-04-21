"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { FactCheckResult, Verdict, ResourceCategory, ArticleMetadata, TweetMetadata } from "./types";
import { T, type Lang } from "./i18n";

const VERDICT_STYLES: Record<Verdict, { bg: string; text: string }> = {
  TRUE:       { bg: "bg-green-900",  text: "text-green-300"  },
  FALSE:      { bg: "bg-red-900",    text: "text-red-300"    },
  MISLEADING: { bg: "bg-yellow-900", text: "text-yellow-300" },
  MIXED:      { bg: "bg-orange-900", text: "text-orange-300" },
  UNVERIFIED: { bg: "bg-gray-700",   text: "text-gray-300"   },
};

const CATEGORY_STYLES: Record<ResourceCategory, { bg: string; text: string; label: string }> = {
  "news":         { bg: "bg-blue-900",   text: "text-blue-300",   label: "News"         },
  "academic":     { bg: "bg-indigo-900", text: "text-indigo-300", label: "Academic"     },
  "government":   { bg: "bg-teal-900",   text: "text-teal-300",   label: "Government"   },
  "fact-check":   { bg: "bg-green-900",  text: "text-green-300",  label: "Fact-Check"   },
  "social-media": { bg: "bg-pink-900",   text: "text-pink-300",   label: "Social Media" },
  "other":        { bg: "bg-gray-700",   text: "text-gray-300",   label: "Other"        },
};

function VerdictBadge({ verdict, lang, large }: { verdict: Verdict; lang: Lang; large?: boolean }) {
  const s = VERDICT_STYLES[verdict] ?? VERDICT_STYLES.UNVERIFIED;
  const label = T[lang].verdicts[verdict] ?? verdict;
  return (
    <span className={`inline-block rounded-full font-semibold ${s.bg} ${s.text} ${large ? "px-4 py-1.5 text-base" : "px-2.5 py-0.5 text-xs"}`}>
      {label}
    </span>
  );
}

function CategoryBadge({ category }: { category: ResourceCategory }) {
  const s = CATEGORY_STYLES[category] ?? CATEGORY_STYLES["other"];
  return (
    <span className={`inline-block rounded-full text-xs font-semibold px-2 py-0.5 ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-gray-700 rounded-full h-2.5">
        <div className={`${color} h-2.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-semibold text-gray-300 w-10 text-right">{pct}%</span>
    </div>
  );
}

function MetaRow({ label, value, link }: { label: string; value: string; link?: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-gray-500 w-28 shrink-0">{label}</span>
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline break-all">{value}</a>
      ) : (
        <span className="text-gray-200 break-all">{value}</span>
      )}
    </div>
  );
}

function ArticleMetadataCard({ meta, lang }: { meta: ArticleMetadata; lang: Lang }) {
  const t = T[lang];
  const hasAny = meta.title || meta.author || meta.published_date || meta.doi || meta.source || meta.url || meta.content_type;
  if (!hasAny) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
      <h2 className="text-lg font-semibold text-gray-200 mb-4">{t.articleDetails}</h2>
      <div className="space-y-2">
        {meta.content_type && (
          <div className="flex gap-2 text-sm items-center">
            <span className="text-gray-500 w-28 shrink-0">{t.metaType}</span>
            <span className="bg-gray-700 text-gray-300 text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize">{meta.content_type}</span>
          </div>
        )}
        {meta.title          && <MetaRow label={t.metaTitle}     value={meta.title} />}
        {meta.author         && <MetaRow label={t.metaAuthor}    value={meta.author} />}
        {meta.source         && <MetaRow label={t.metaSource}    value={meta.source} />}
        {meta.published_date && <MetaRow label={t.metaPublished} value={meta.published_date} />}
        {meta.doi && <MetaRow label={t.metaDoi} value={meta.doi} link={`https://doi.org/${meta.doi}`} />}
        {meta.url && <MetaRow label={t.metaUrl} value={meta.url} link={meta.url} />}
      </div>
    </div>
  );
}

function TweetMetadataCard({ meta, lang }: { meta: TweetMetadata; lang: Lang }) {
  const t = T[lang];
  return (
    <div className="bg-gray-900 border border-blue-800 rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        <h2 className="text-lg font-semibold text-gray-200">{t.tweetDetails}</h2>
      </div>

      {/* Account row */}
      <div className="flex items-start gap-3 mb-4 pb-4 border-b border-gray-800">
        <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-gray-400 text-lg font-bold shrink-0">
          {meta.username?.[0]?.toUpperCase() ?? "?"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {meta.username && (
              <span className="font-semibold text-gray-100 text-sm">{meta.username}</span>
            )}
            {meta.verified === true && (
              <svg className="w-4 h-4 text-blue-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91C2.88 9.33 2 10.57 2 12s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91s2.52 1.26 3.91.8c.66 1.31 1.91 2.19 3.34 2.19s2.67-.88 3.33-2.19c1.4.46 2.91.2 3.92-.81s1.26-2.51.8-3.9C21.37 14.67 22.25 13.43 22.25 12zm-6.01-1.74l-3.5 4.5a.75.75 0 01-1.08.1l-2-1.75a.75.75 0 011.02-1.1l1.41 1.24 2.98-3.83a.75.75 0 011.17.94z" />
              </svg>
            )}
            {meta.handle && (
              <span className="text-gray-500 text-sm">{meta.handle}</span>
            )}
          </div>
          {meta.date && (
            <p className="text-xs text-gray-500 mt-0.5">{meta.date}</p>
          )}
        </div>
      </div>

      {/* Tweet text */}
      <p className="text-gray-200 text-sm leading-relaxed mb-4 whitespace-pre-wrap">{meta.tweet_text}</p>

      {/* Engagement stats */}
      {(meta.replies || meta.retweets || meta.likes) && (
        <div className="flex gap-5 text-xs text-gray-500 pt-3 border-t border-gray-800">
          {meta.replies  && <span><span className="text-gray-300 font-semibold">{meta.replies}</span> {t.tweetReplies}</span>}
          {meta.retweets && <span><span className="text-gray-300 font-semibold">{meta.retweets}</span> {t.tweetRetweets}</span>}
          {meta.likes    && <span><span className="text-gray-300 font-semibold">{meta.likes}</span> {t.tweetLikes}</span>}
        </div>
      )}
    </div>
  );
}

type Tab = "text" | "url" | "image";

export default function Home() {
  const [lang, setLang] = useState<Lang>("en");
  const [tab, setTab] = useState<Tab>("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FactCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const t = T[lang];
  const langName = lang === "en" ? "اردو" : "English";

  function toggleLang() {
    setLang(l => l === "en" ? "ur" : "en");
    setResult(null);
    setError(null);
  }

  function setImage(file: File) {
    setImageFile(file);
    setResult(null);
    setError(null);
    const url = URL.createObjectURL(file);
    setImagePreview(url);
  }

  // Clipboard paste for images
  useEffect(() => {
    if (tab !== "image") return;
    function onPaste(e: ClipboardEvent) {
      const item = Array.from(e.clipboardData?.items ?? []).find(i => i.type.startsWith("image/"));
      if (!item) return;
      const file = item.getAsFile();
      if (file) setImage(file);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [tab]);

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }
  function onDragLeave() { setIsDragging(false); }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) setImage(file);
  }
  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setImage(file);
  }

  async function handleTextSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    await runFactCheck(() =>
      fetch("/api/fact-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language: lang === "ur" ? "urdu" : "english" }),
      })
    );
  }

  async function handleUrlSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    await runFactCheck(() =>
      fetch("/api/fact-check-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, language: lang === "ur" ? "urdu" : "english" }),
      })
    );
  }

  async function handleImageSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!imageFile) return;
    const formData = new FormData();
    formData.append("file", imageFile);
    formData.append("language", lang === "ur" ? "urdu" : "english");
    await runFactCheck(() =>
      fetch("/api/fact-check-image", { method: "POST", body: formData })
    );
  }

  async function runFactCheck(fetcher: () => Promise<Response>) {
    setLoading(true);
    setResult(null);
    setError(null);
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

  const loadingMsg = tab === "url" ? t.loadingLink : tab === "image" ? t.loadingImage : t.loadingText;

  return (
    <div dir={t.dir} className={`min-h-screen ${lang === "ur" ? t.fontClass : ""}`}>
      <main className="max-w-3xl mx-auto px-4 py-12">

        {/* Header */}
        <div className="mb-10 text-center relative">
          <button
            onClick={toggleLang}
            className="absolute top-0 end-0 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-semibold rounded-lg border border-gray-600 transition"
          >
            {langName}
          </button>
          <h1 className="text-4xl font-bold text-white mb-2">
            {t.title} <span className="text-blue-400">{t.titleAccent}</span>
          </h1>
          <p className="text-gray-400 text-lg">{t.subtitle}</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-900 border border-gray-700 rounded-xl p-1 mb-6">
          {(["text", "url", "image"] as Tab[]).map((tb) => (
            <button
              key={tb}
              onClick={() => { setTab(tb); setResult(null); setError(null); }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
                tab === tb ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {tb === "text" ? t.tabText : tb === "url" ? t.tabLink : t.tabImage}
            </button>
          ))}
        </div>

        {/* Text input */}
        {tab === "text" && (
          <form onSubmit={handleTextSubmit} className="mb-8">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t.textPlaceholder}
              rows={6}
              maxLength={5000}
              className="w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-gray-100 placeholder-gray-500 resize-none focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
            />
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-gray-500">{text.length} / 5000</span>
              <button type="submit" disabled={loading || !text.trim()}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-xl transition">
                {loading ? t.btnAnalyzing : t.btnCheck}
              </button>
            </div>
          </form>
        )}

        {/* URL input */}
        {tab === "url" && (
          <form onSubmit={handleUrlSubmit} className="mb-8">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t.urlPlaceholder}
              className="w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
            />
            <p className="text-xs text-gray-500 mt-2">{t.urlNote}</p>
            <div className="flex justify-end mt-3">
              <button type="submit" disabled={loading || !url.trim()}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-xl transition">
                {loading ? t.btnFetching : t.btnCheckLink}
              </button>
            </div>
          </form>
        )}

        {/* Image input */}
        {tab === "image" && (
          <form onSubmit={handleImageSubmit} className="mb-8">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={onFileChange}
            />

            {imagePreview ? (
              <div className="relative mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreview}
                  alt="Tweet screenshot preview"
                  className="w-full max-h-96 object-contain rounded-xl border border-gray-700 bg-gray-900"
                />
                <button
                  type="button"
                  onClick={() => { setImageFile(null); setImagePreview(null); setResult(null); setError(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  className="absolute top-2 end-2 bg-gray-800/90 hover:bg-gray-700 text-gray-300 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-600 transition"
                >
                  {t.imageChange}
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={`w-full h-44 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed cursor-pointer transition ${
                  isDragging ? "border-blue-500 bg-blue-950/30" : "border-gray-700 bg-gray-900 hover:border-gray-500"
                }`}
              >
                <svg className="w-10 h-10 text-gray-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="text-gray-400 text-sm text-center px-4">{t.imageDropZone}</p>
                <p className="text-gray-600 text-xs">{t.imageHint}</p>
                <p className="text-gray-600 text-xs">Ctrl+V to paste from clipboard</p>
              </div>
            )}

            <div className="flex justify-end mt-3">
              <button type="submit" disabled={loading || !imageFile}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-xl transition">
                {loading ? t.btnAnalyzingImage : t.btnCheckImage}
              </button>
            </div>
          </form>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-16 text-gray-400">
            <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p>{loadingMsg}</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-900/40 border border-red-700 rounded-xl p-4 text-red-300">
            <strong>{t.errorLabel}:</strong> {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {result.tweet_metadata   && <TweetMetadataCard meta={result.tweet_metadata} lang={lang} />}
            {result.article_metadata && <ArticleMetadataCard meta={result.article_metadata} lang={lang} />}

            {/* Overall verdict */}
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-200">{t.overallVerdict}</h2>
                <VerdictBadge verdict={result.overall_verdict} lang={lang} large />
              </div>
              <p className="text-gray-300 mb-4">{result.summary}</p>
              <div>
                <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">{t.authenticityScore}</p>
                <ScoreBar score={result.authenticity_score} />
              </div>
            </div>

            {/* Claims */}
            {result.claims.length > 0 && (
              <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-gray-200 mb-4">{t.claimsAnalyzed(result.claims.length)}</h2>
                <div className="space-y-4">
                  {result.claims.map((claim, i) => (
                    <div key={i} className="border border-gray-800 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <p className="text-gray-200 font-medium flex-1">"{claim.claim}"</p>
                        <VerdictBadge verdict={claim.verdict} lang={lang} />
                      </div>
                      <p className="text-gray-400 text-sm mb-2">{claim.explanation}</p>
                      {claim.sources.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {claim.sources.map((src, j) => (
                            <span key={j} className="text-xs bg-gray-800 text-blue-400 px-2 py-0.5 rounded-full">{src}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Searched resources */}
            {result.searched_resources.length > 0 && resourcesByCategory && (
              <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-gray-200 mb-4">{t.sourcesSearched(result.searched_resources.length)}</h2>
                <div className="space-y-5">
                  {(Object.entries(resourcesByCategory) as [ResourceCategory, typeof result.searched_resources][])
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([category, resources]) => (
                      <div key={category}>
                        <div className="flex items-center gap-2 mb-2">
                          <CategoryBadge category={category} />
                          <span className="text-xs text-gray-500">{t.sources(resources.length)}</span>
                        </div>
                        <div className="space-y-1.5 ps-1">
                          {resources.map((r, i) => (
                            <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 group">
                              <span className="mt-1 shrink-0 w-1.5 h-1.5 rounded-full bg-gray-600 group-hover:bg-blue-400 transition" />
                              <span className="text-sm text-gray-400 group-hover:text-blue-400 underline-offset-2 group-hover:underline transition break-all">
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

            {/* Propaganda techniques */}
            {result.propaganda_techniques.length > 0 ? (
              <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-gray-200 mb-4">{t.propagandaTitle(result.propaganda_techniques.length)}</h2>
                <div className="space-y-3">
                  {result.propaganda_techniques.map((pt, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="mt-0.5 shrink-0 bg-purple-900 text-purple-300 text-xs font-semibold px-2.5 py-0.5 rounded-full h-fit">{pt.technique}</span>
                      <p className="text-gray-400 text-sm">{pt.explanation}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 text-sm text-gray-500 text-center">
                {t.noPropaganda}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
