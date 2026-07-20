"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { ReviewComment } from "@/lib/editor-types";

type ReviewPayload = {
  name: string;
  aspect: string;
  comments: ReviewComment[];
  duration: number;
  previewUrl: string | null;
  previewSource?: "export" | "asset" | null;
  projectId?: string;
  markers: { id: string; t: number; label: string }[];
};

export default function ReviewPage() {
  const params = useParams();
  const token = String(params?.token || "");
  const [data, setData] = useState<ReviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("Reviewer");
  const [t, setT] = useState(0);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/review/${encodeURIComponent(token)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Not found");
      setData(body as ReviewPayload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/review/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t, text, author }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed");
      setData((prev) =>
        prev ? { ...prev, comments: body.comments as ReviewComment[] } : prev,
      );
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comment failed");
    } finally {
      setSending(false);
    }
  }

  async function requestApproval(c: ReviewComment) {
    if (!data?.projectId) {
      setMsg("Missing project id");
      return;
    }
    setMsg("");
    try {
      const res = await fetch("/api/cloud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request",
          projectId: data.projectId,
          commentId: c.id,
          title: `Review @ ${c.t.toFixed(1)}s`,
          note: c.text,
          author: c.author || author,
          role: "reviewer",
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Request failed");
      setMsg("Approval requested — editor will see it in Growth Hub → Cloud");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Request failed");
    }
  }

  if (error && !data) {
    return (
      <main className="cc-review-page">
        <p className="cc-lib-hint">{error}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="cc-review-page">
        <p className="cc-lib-hint">Loading review…</p>
      </main>
    );
  }

  return (
    <main className="cc-review-page">
      <header className="cc-review-head">
        <p className="brand">
          Clip<em>pers</em> Review
        </p>
        <h1>{data.name}</h1>
        <p className="cc-lib-hint">Read-only · leave timestamped comments</p>
        {data.previewSource === "export" && (
          <p className="cc-copied">Showing latest export</p>
        )}
      </header>

      <div className="cc-review-layout">
        <div className="cc-review-media">
          {data.previewUrl ? (
            <video
              src={data.previewUrl}
              controls
              playsInline
              onTimeUpdate={(e) => setT((e.target as HTMLVideoElement).currentTime)}
            />
          ) : (
            <p className="cc-lib-hint">No preview media in this project yet.</p>
          )}
        </div>

        <aside className="cc-review-side">
          <form className="cc-review-form" onSubmit={submitComment}>
            <label>
              Author
              <input value={author} onChange={(e) => setAuthor(e.target.value)} />
            </label>
            <label>
              At {t.toFixed(1)}s
              <input
                type="number"
                step="0.1"
                min={0}
                value={Number(t.toFixed(1))}
                onChange={(e) => setT(Number(e.target.value) || 0)}
              />
            </label>
            <label>
              Comment
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                placeholder="Feedback at this moment…"
              />
            </label>
            <button type="submit" className="btn primary" disabled={sending}>
              {sending ? "Sending…" : "Add comment"}
            </button>
          </form>
          {msg && <p className="cc-copied">{msg}</p>}

          <ul className="cc-review-comments">
            {(data.comments || [])
              .slice()
              .sort((a, b) => a.t - b.t)
              .map((c) => (
                <li key={c.id}>
                  <strong>
                    {c.author} · {c.t.toFixed(1)}s
                  </strong>
                  <p>{c.text}</p>
                  <button
                    type="button"
                    className="cc-hook-chip"
                    onClick={() => void requestApproval(c)}
                  >
                    Request approval
                  </button>
                </li>
              ))}
            {!data.comments?.length && (
              <li className="cc-lib-hint">No comments yet.</li>
            )}
          </ul>
        </aside>
      </div>
    </main>
  );
}
