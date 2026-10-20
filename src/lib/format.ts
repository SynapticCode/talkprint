import type { Segment } from "@/lib/types";

/** 3725 -> "1h 2m"; 95 -> "1m 35s" */
export function formatDuration(totalSeconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(totalSeconds ?? 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/** 75.4 -> "01:15"; 3725 -> "1:02:05" */
export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** OpenAI labels unknown voices "A", "B", ... and known voices by the name we sent. */
export function speakerLabel(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "Speaker";
  if (/^[A-Z]$/.test(s)) return `Speaker ${s}`;
  return s;
}

/** Merge back-to-back segments from the same speaker into one paragraph. */
export function mergeSegments(segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const seg of segments) {
    const prev = out[out.length - 1];
    if (prev && prev.speaker === seg.speaker && seg.start - prev.end < 2) {
      prev.end = seg.end;
      prev.text = `${prev.text} ${seg.text}`.replace(/\s+/g, " ").trim();
    } else {
      out.push({ ...seg, text: seg.text.trim() });
    }
  }
  return out;
}

export function transcriptToText(segments: Segment[]): string {
  return mergeSegments(segments)
    .map((s) => `[${formatTimestamp(s.start)}] ${speakerLabel(s.speaker)}: ${s.text}`)
    .join("\n\n");
}

function srtTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

export function transcriptToSrt(segments: Segment[]): string {
  return segments
    .map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${speakerLabel(s.speaker)}: ${s.text.trim()}\n`)
    .join("\n");
}

export function safeFilename(title: string): string {
  return (title || "transcript").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 80) || "transcript";
}
