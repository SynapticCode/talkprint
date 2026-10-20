import type { Segment } from "@/lib/types";

// OpenAI speech-to-text with speaker labels.
// Docs: https://developers.openai.com/api/docs/guides/speech-to-text
// - 25 MB per file; mp3, mp4, mpeg, mpga, m4a, wav, webm
// - chunking_strategy is required for audio longer than 30 s
// - up to 4 known speakers, each reference clip 2-10 s, sent as data URLs
// Called with fetch + FormData (not the SDK) so the array fields go out as
// known_speaker_names[] / known_speaker_references[] exactly as documented.

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const SUPPORTED_EXTENSIONS = ["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm"] as const;

export type KnownSpeaker = { name: string; dataUrl: string };

export type TranscriptionResult = {
  text: string;
  segments: Segment[];
  durationSeconds: number;
};

export async function transcribeWithSpeakers(
  audio: Blob,
  filename: string,
  knownSpeakers: KnownSpeaker[],
): Promise<TranscriptionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set on the server.");
  if (audio.size > MAX_AUDIO_BYTES) throw new Error("Audio is larger than 25 MB.");

  const model = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-transcribe-diarize";

  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", model);
  form.append("response_format", "diarized_json");
  form.append("chunking_strategy", "auto");
  for (const s of knownSpeakers.slice(0, 4)) {
    form.append("known_speaker_names[]", s.name);
    form.append("known_speaker_references[]", s.dataUrl);
  }

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    let message = body;
    try {
      message = JSON.parse(body)?.error?.message ?? body;
    } catch {
      // keep raw body
    }
    throw new Error(`OpenAI ${res.status}: ${message}`.slice(0, 500));
  }

  const data = (await res.json()) as {
    text?: string;
    duration?: number;
    segments?: Array<{ speaker?: string; start?: number; end?: number; text?: string }>;
  };

  const segments: Segment[] = (data.segments ?? [])
    .filter((s) => typeof s.text === "string" && s.text.trim().length > 0)
    .map((s) => ({
      speaker: String(s.speaker ?? "A"),
      start: Number(s.start ?? 0),
      end: Number(s.end ?? s.start ?? 0),
      text: String(s.text).trim(),
    }));

  const durationSeconds =
    typeof data.duration === "number" ? data.duration : segments.reduce((max, s) => Math.max(max, s.end), 0);

  return {
    text: data.text ?? segments.map((s) => s.text).join(" "),
    segments,
    durationSeconds,
  };
}

export async function blobToDataUrl(blob: Blob, fallbackType = "audio/webm"): Promise<string> {
  const buf = Buffer.from(await blob.arrayBuffer());
  const type = blob.type || fallbackType;
  return `data:${type};base64,${buf.toString("base64")}`;
}

export function extensionOf(path: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(path);
  return m ? m[1].toLowerCase() : "";
}
