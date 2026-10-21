"use client";

import { createClient } from "@/lib/supabase/client";

// Supabase Free plan's max file size. 32 kbps Opus is ~14 MB/hour, so ~3.5 hours.
export const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

function extensionFor(file: Blob): string {
  const type = file.type.toLowerCase();
  if (type.includes("mp4") || type.includes("m4a") || type.includes("aac")) return "m4a";
  if (type.includes("ogg")) return "ogg";
  return "webm";
}

export function validateAudioFile(file: Blob): string | null {
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_AUDIO_BYTES) {
    return `The audio is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 50 MB (about 3.5 hours).`;
  }
  return null;
}

/**
 * Upload straight from the browser to Supabase Storage (skips Vercel's 4.5 MB
 * request limit), create the transcript row, then kick off the server job.
 * Returns the transcript id; the transcript page polls for the result.
 */
export async function startTranscription(opts: {
  file: Blob;
  title: string;
  source: "recording" | "upload";
}): Promise<string> {
  const problem = validateAudioFile(opts.file);
  if (problem) throw new Error(problem);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You're signed out. Sign in again.");

  const id = crypto.randomUUID();
  const path = `${user.id}/${id}.${extensionFor(opts.file)}`;

  const { error: upErr } = await supabase.storage.from("audio").upload(path, opts.file, {
    contentType: opts.file.type || "application/octet-stream",
    upsert: false,
  });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

  const { error: insErr } = await supabase.from("transcripts").insert({
    id,
    title: opts.title.trim() || "Untitled recording",
    source: opts.source,
    status: "processing",
    audio_path: path,
  });
  if (insErr) {
    await supabase.storage.from("audio").remove([path]);
    throw new Error(`Could not save: ${insErr.message}`);
  }

  // Fire and forget: the server finishes even if this page navigates away.
  void fetch("/api/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  }).catch(() => {});

  return id;
}

export function defaultTitle(prefix: string): string {
  const now = new Date();
  return `${prefix} ${now.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}
