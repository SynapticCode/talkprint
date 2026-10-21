import { NextResponse, type NextRequest } from "next/server";
import { requireAllowedUser } from "@/lib/supabase/server";
import { submitTranscription, syncTranscription } from "@/lib/transcription";
import type { Transcript } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadOwnTranscript(request: NextRequest) {
  const auth = await requireAllowedUser();
  if (!auth.ok) return { response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  const { supabase, user } = auth;

  const body = (await request.json().catch(() => null)) as { id?: string; check?: boolean } | null;
  const id = body?.id;
  if (!id || typeof id !== "string") return { response: NextResponse.json({ error: "Missing id" }, { status: 400 }) };

  // RLS limits this to the caller's own rows.
  const { data: row, error } = await supabase.from("transcripts").select("*").eq("id", id).single<Transcript>();
  if (error || !row) return { response: NextResponse.json({ error: "Transcript not found" }, { status: 404 }) };
  if (row.audio_path && !row.audio_path.startsWith(`${user.id}/`)) {
    return { response: NextResponse.json({ error: "Audio path does not belong to you" }, { status: 403 }) };
  }
  return { supabase, row, check: body?.check === true };
}

/**
 * POST {id}              submit (or resubmit) the transcript's audio to the Runpod worker
 * POST {id, check: true} check the running job; saves the result when it is done
 */
export async function POST(request: NextRequest) {
  const loaded = await loadOwnTranscript(request);
  if ("response" in loaded) return loaded.response;
  const { supabase, row, check } = loaded;

  try {
    if (check) {
      const status = await syncTranscription(supabase, row);
      return NextResponse.json({ ok: true, id: row.id, status });
    }
    if (!row.audio_path) return NextResponse.json({ error: "No audio attached to this transcript" }, { status: 409 });
    await submitTranscription(supabase, row);
    return NextResponse.json({ ok: true, id: row.id, status: "processing" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A failed status check leaves the job running; the next poll tries again.
    // A failed submit marks the row; audio stays in storage so "Try again" works.
    if (!check) {
      await supabase.from("transcripts").update({ status: "error", error: message, job_id: null }).eq("id", row.id);
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
