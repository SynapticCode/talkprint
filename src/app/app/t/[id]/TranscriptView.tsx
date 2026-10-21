"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  formatDuration,
  formatTimestamp,
  mergeSegments,
  safeFilename,
  speakerLabel,
  transcriptToSrt,
  transcriptToText,
} from "@/lib/format";
import type { Transcript } from "@/lib/types";

const SPEAKER_COLORS = ["text-red-400", "text-sky-400", "text-amber-300", "text-emerald-400", "text-fuchsia-400", "text-orange-300"];

function download(name: string, content: string, type = "text/plain") {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function TranscriptView({ transcript: t }: { transcript: Transcript }) {
  const router = useRouter();
  const [title, setTitle] = useState(t.title);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // While the Runpod job runs, ask the server to check it every 4 s; it saves the
  // transcript when the job is done, then the refresh shows it.
  useEffect(() => {
    if (t.status !== "processing") return;
    let stopped = false;
    const tick = async () => {
      await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: t.id, check: true }),
      }).catch(() => null);
      if (!stopped) router.refresh();
    };
    const timer = setInterval(tick, 4000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [t.status, t.id, router]);

  const merged = useMemo(() => mergeSegments(t.segments ?? []), [t.segments]);
  const speakers = useMemo(() => Array.from(new Set(merged.map((s) => s.speaker))), [merged]);
  const colorFor = (speaker: string) => SPEAKER_COLORS[speakers.indexOf(speaker) % SPEAKER_COLORS.length];

  async function retry() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: t.id }),
    }).catch(() => null);
    if (res && !res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? `Failed (${res.status})`);
    }
    setBusy(false);
    router.refresh();
  }

  async function saveTitle() {
    const next = title.trim();
    if (!next || next === t.title) {
      setTitle(t.title);
      setEditing(false);
      return;
    }
    const { error } = await createClient().from("transcripts").update({ title: next }).eq("id", t.id);
    if (error) setError(error.message);
    setEditing(false);
    router.refresh();
  }

  async function remove() {
    if (!window.confirm("Delete this transcript? This can't be undone.")) return;
    setBusy(true);
    const supabase = createClient();
    if (t.audio_path) await supabase.storage.from("audio").remove([t.audio_path]);
    const { error } = await supabase.from("transcripts").delete().eq("id", t.id);
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    router.push("/app");
    router.refresh();
  }

  async function copy() {
    await navigator.clipboard.writeText(transcriptToText(t.segments ?? []));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      <Link href="/app" className="text-sm text-muted hover:text-white">← All transcripts</Link>

      <div className="mt-4">
        {editing ? (
          <input
            autoFocus
            className="input text-lg font-bold"
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => e.key === "Enter" && saveTitle()}
          />
        ) : (
          <button onClick={() => setEditing(true)} className="text-left text-2xl font-black tracking-tight hover:text-neutral-300" title="Rename">
            {t.title}
          </button>
        )}
        <p className="mt-1 text-xs text-neutral-500">
          {new Date(t.created_at).toLocaleString()}
          {t.duration_seconds ? ` · ${formatDuration(t.duration_seconds)}` : ""}
          {speakers.length ? ` · ${speakers.length} speaker${speakers.length > 1 ? "s" : ""}` : ""}
        </p>
      </div>

      {t.status === "processing" && (
        <div className="card mt-6">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-accent rec-dot" />
            <p className="text-sm font-semibold">Transcribing…</p>
          </div>
          <p className="mt-2 text-sm text-muted">
            The first one after a quiet spell takes a few extra minutes to start. You can leave this page; it keeps going.
          </p>
        </div>
      )}

      {t.status === "error" && (
        <div className="card mt-6 border-red-900">
          <p className="text-sm font-semibold text-red-400">Transcription failed</p>
          <p className="mt-2 break-words text-sm text-muted">{t.error}</p>
          {t.audio_path && (
            <button onClick={retry} disabled={busy} className="btn-primary mt-4">
              {busy ? "Retrying…" : "Try again"}
            </button>
          )}
        </div>
      )}

      {t.status === "done" && (
        <>
          <div className="mt-6 flex flex-wrap gap-2">
            <button onClick={copy} className="btn">{copied ? "Copied" : "Copy text"}</button>
            <button onClick={() => download(`${safeFilename(t.title)}.txt`, transcriptToText(t.segments ?? []))} className="btn">
              Download .txt
            </button>
            <button onClick={() => download(`${safeFilename(t.title)}.srt`, transcriptToSrt(t.segments ?? []), "application/x-subrip")} className="btn">
              Download .srt
            </button>
          </div>

          {merged.length === 0 ? (
            <p className="mt-6 text-sm text-neutral-500">No speech was detected.</p>
          ) : (
            <article className="mt-6 space-y-5">
              {merged.map((s, i) => (
                <div key={i} className="grid grid-cols-[3.5rem_1fr] gap-3">
                  <span className="pt-0.5 font-mono text-xs text-neutral-500">{formatTimestamp(s.start)}</span>
                  <div>
                    <p className={`text-xs font-bold uppercase tracking-wider ${colorFor(s.speaker)}`}>{speakerLabel(s.speaker)}</p>
                    <p className="mt-1 leading-relaxed text-neutral-200">{s.text}</p>
                  </div>
                </div>
              ))}
            </article>
          )}
        </>
      )}

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      <div className="mt-12 border-t border-line pt-6">
        <button onClick={remove} disabled={busy} className="btn-danger">Delete transcript</button>
      </div>
    </div>
  );
}
