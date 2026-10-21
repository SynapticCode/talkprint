import type { SupabaseClient } from "@supabase/supabase-js";
import type { Segment, Transcript, VoiceProfile } from "@/lib/types";

// Server-side glue between Supabase and the Runpod Serverless worker in /worker.
// Jobs are submitted with /run and checked with /status, so no request has to
// outlive Vercel's 300 s function limit. Runpod keeps a /run result for 30 minutes
// after it finishes; if it has expired by the time anyone checks, the job is
// submitted again (the audio is only deleted once a transcript is saved).

const RUNPOD_API = "https://api.runpod.ai/v2";
// Signed URLs outlive a long queue + cold start + a multi-hour file.
const SIGNED_URL_SECONDS = 6 * 60 * 60;
const MAX_VOICES = 4;

type WorkerOutput = {
  text?: string;
  duration?: number;
  segments?: Array<{ speaker?: string; start?: number; end?: number; text?: string }>;
  error?: string;
};

type RunpodStatus = {
  id?: string;
  status?: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED" | "TIMED_OUT";
  output?: WorkerOutput;
  error?: string;
};

function runpodConfig() {
  const apiKey = process.env.RUNPOD_API_KEY;
  const endpointId = process.env.RUNPOD_ENDPOINT_ID;
  if (!apiKey || !endpointId) throw new Error("RUNPOD_API_KEY or RUNPOD_ENDPOINT_ID is not set on the server.");
  return { apiKey, endpointId };
}

async function runpod(path: string, init?: RequestInit): Promise<Response> {
  const { apiKey, endpointId } = runpodConfig();
  return fetch(`${RUNPOD_API}/${endpointId}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
}

async function signedUrl(supabase: SupabaseClient, bucket: string, path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) throw new Error(`Could not read ${bucket}/${path}: ${error?.message ?? "missing"}`);
  return data.signedUrl;
}

/** Sign the audio and voice samples, submit a Runpod job, and remember its id on the row. */
export async function submitTranscription(supabase: SupabaseClient, row: Transcript): Promise<void> {
  if (!row.audio_path) throw new Error("No audio attached to this transcript");

  const audioUrl = await signedUrl(supabase, "audio", row.audio_path);

  // Voice samples so the transcript uses real names instead of Speaker A/B.
  const { data: voices } = await supabase
    .from("voice_profiles")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(MAX_VOICES)
    .returns<VoiceProfile[]>();
  const voiceInputs = [];
  for (const v of voices ?? []) {
    voiceInputs.push({ name: v.name, url: await signedUrl(supabase, "voice-samples", v.storage_path) });
  }

  const res = await runpod("/run", {
    method: "POST",
    body: JSON.stringify({ input: { audio_url: audioUrl, voices: voiceInputs } }),
  });
  const body = (await res.json().catch(() => ({}))) as RunpodStatus;
  if (!res.ok || !body.id) throw new Error(`Runpod ${res.status}: ${body.error ?? "no job id returned"}`.slice(0, 500));

  const { error } = await supabase
    .from("transcripts")
    .update({ status: "processing", error: null, job_id: body.id })
    .eq("id", row.id);
  if (error) throw new Error(`Submitted, but saving the job id failed: ${error.message}`);
}

/**
 * Check a processing transcript's Runpod job. Saves the result (and deletes the
 * audio) when it is done, marks the row failed when the job failed, and
 * resubmits when Runpod no longer has the result. Returns the resulting status.
 */
export async function syncTranscription(supabase: SupabaseClient, row: Transcript): Promise<Transcript["status"]> {
  if (row.status !== "processing") return row.status;
  if (!row.job_id) {
    await submitTranscription(supabase, row);
    return "processing";
  }

  const res = await runpod(`/status/${row.job_id}`);
  if (res.status === 404) {
    await submitTranscription(supabase, row);
    return "processing";
  }
  const job = (await res.json().catch(() => ({}))) as RunpodStatus;
  if (!res.ok) throw new Error(`Runpod ${res.status}: ${job.error ?? "status check failed"}`.slice(0, 500));

  if (job.status === "IN_QUEUE" || job.status === "IN_PROGRESS") return "processing";

  const output = job.output;
  if (job.status !== "COMPLETED" || !output || output.error) {
    const message = output?.error ?? job.error ?? `Runpod job ${job.status ?? "ended without a status"}`;
    await supabase
      .from("transcripts")
      .update({ status: "error", error: String(message).slice(0, 1000), job_id: null })
      .eq("id", row.id);
    return "error";
  }

  const segments: Segment[] = (output.segments ?? [])
    .filter((s) => typeof s.text === "string" && s.text.trim().length > 0)
    .map((s) => ({
      speaker: String(s.speaker ?? "A"),
      start: Number(s.start ?? 0),
      end: Number(s.end ?? s.start ?? 0),
      text: String(s.text).trim(),
    }));
  const durationSeconds =
    typeof output.duration === "number" ? output.duration : segments.reduce((max, s) => Math.max(max, s.end), 0);

  const { error: saveError } = await supabase
    .from("transcripts")
    .update({
      status: "done",
      text: output.text ?? segments.map((s) => s.text).join(" "),
      segments,
      duration_seconds: durationSeconds,
      completed_at: new Date().toISOString(),
      audio_path: null,
      job_id: null,
      error: null,
    })
    .eq("id", row.id);
  if (saveError) throw new Error(`Transcribed, but saving failed: ${saveError.message}`);

  // Keep transcripts, not audio: the free plan has 1 GB of storage.
  if (row.audio_path) await supabase.storage.from("audio").remove([row.audio_path]);
  return "done";
}
