import { NextResponse, type NextRequest } from "next/server";
import { requireAllowedUser } from "@/lib/supabase/server";
import { blobToDataUrl, extensionOf, transcribeWithSpeakers, type KnownSpeaker } from "@/lib/transcribe";
import type { Transcript, VoiceProfile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// An hour of audio can take a couple of minutes at OpenAI. 300 s is the Hobby ceiling.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const auth = await requireAllowedUser();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { supabase, user } = auth;

  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const id = body?.id;
  if (!id || typeof id !== "string") return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // RLS limits this to the caller's own rows.
  const { data: row, error: rowError } = await supabase
    .from("transcripts")
    .select("*")
    .eq("id", id)
    .single<Transcript>();
  if (rowError || !row) return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
  if (!row.audio_path) return NextResponse.json({ error: "No audio attached to this transcript" }, { status: 409 });
  if (!row.audio_path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Audio path does not belong to you" }, { status: 403 });
  }

  await supabase.from("transcripts").update({ status: "processing", error: null }).eq("id", id);

  try {
    const { data: audio, error: dlError } = await supabase.storage.from("audio").download(row.audio_path);
    if (dlError || !audio) throw new Error(`Could not read the uploaded audio: ${dlError?.message ?? "missing"}`);

    // Voice samples so the transcript uses real names instead of Speaker A/B.
    const { data: voices } = await supabase
      .from("voice_profiles")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(4)
      .returns<VoiceProfile[]>();

    const knownSpeakers: KnownSpeaker[] = [];
    for (const v of voices ?? []) {
      const { data: clip } = await supabase.storage.from("voice-samples").download(v.storage_path);
      if (clip) knownSpeakers.push({ name: v.name, dataUrl: await blobToDataUrl(clip) });
    }

    const filename = `audio.${extensionOf(row.audio_path) || "webm"}`;
    const result = await transcribeWithSpeakers(audio, filename, knownSpeakers);

    const { error: saveError } = await supabase
      .from("transcripts")
      .update({
        status: "done",
        text: result.text,
        segments: result.segments,
        duration_seconds: result.durationSeconds,
        completed_at: new Date().toISOString(),
        audio_path: null,
        error: null,
      })
      .eq("id", id);
    if (saveError) throw new Error(`Transcribed, but saving failed: ${saveError.message}`);

    // Keep transcripts, not audio: the free plan has 1 GB of storage.
    await supabase.storage.from("audio").remove([row.audio_path]);

    return NextResponse.json({ ok: true, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Audio stays in storage so "Try again" works.
    await supabase.from("transcripts").update({ status: "error", error: message }).eq("id", id);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
