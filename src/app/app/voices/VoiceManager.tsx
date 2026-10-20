"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { VoiceProfile } from "@/lib/types";

// OpenAI accepts reference clips of 2-10 seconds. Aim for ~8, stop at 9.5.
const MIN_SECONDS = 3;
const AUTO_STOP_SECONDS = 9.5;
const MAX_VOICES = 4;

export function VoiceManager({ initialVoices }: { initialVoices: VoiceProfile[] }) {
  const router = useRouter();
  const [voices, setVoices] = useState(initialVoices);
  const [name, setName] = useState("");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [clip, setClip] = useState<{ blob: Blob; url: string; seconds: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => setVoices(initialVoices), [initialVoices]);
  useEffect(() => () => stopStream(), []);

  function stopStream() {
    if (tickRef.current) clearInterval(tickRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }

  async function startSample() {
    setError(null);
    setClip(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        const seconds = (performance.now() - startRef.current) / 1000;
        stopStream();
        setRecording(false);
        if (seconds < MIN_SECONDS) {
          setError(`That was ${seconds.toFixed(1)} s. Record at least ${MIN_SECONDS} seconds.`);
          return;
        }
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        setClip({ blob, url: URL.createObjectURL(blob), seconds });
      };
      rec.start();
      recRef.current = rec;
      startRef.current = performance.now();
      setElapsed(0);
      setRecording(true);
      tickRef.current = setInterval(() => {
        const s = (performance.now() - startRef.current) / 1000;
        setElapsed(s);
        if (s >= AUTO_STOP_SECONDS) recRef.current?.state === "recording" && recRef.current.stop();
      }, 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      stopStream();
    }
  }

  function stopSample() {
    if (recRef.current?.state === "recording") recRef.current.stop();
  }

  async function save() {
    if (!clip || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Signed out. Sign in again.");
      const ext = clip.blob.type.includes("mp4") ? "m4a" : "webm";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("voice-samples").upload(path, clip.blob, { contentType: clip.blob.type });
      if (upErr) throw new Error(upErr.message);
      const { error: insErr } = await supabase
        .from("voice_profiles")
        .insert({ name: name.trim(), storage_path: path, duration_seconds: Math.round(clip.seconds * 10) / 10 });
      if (insErr) {
        await supabase.storage.from("voice-samples").remove([path]);
        throw new Error(insErr.message);
      }
      URL.revokeObjectURL(clip.url);
      setClip(null);
      setName("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function play(v: VoiceProfile) {
    const { data, error } = await createClient().storage.from("voice-samples").createSignedUrl(v.storage_path, 60);
    if (error || !data) return setError(error?.message ?? "Couldn't load sample");
    audioRef.current?.pause();
    const audio = new Audio(data.signedUrl);
    audioRef.current = audio;
    setPlaying(v.id);
    audio.onended = () => setPlaying(null);
    audio.play().catch(() => setPlaying(null));
  }

  async function remove(v: VoiceProfile) {
    if (!window.confirm(`Delete ${v.name}'s voice sample?`)) return;
    const supabase = createClient();
    await supabase.storage.from("voice-samples").remove([v.storage_path]);
    const { error } = await supabase.from("voice_profiles").delete().eq("id", v.id);
    if (error) return setError(error.message);
    router.refresh();
  }

  const full = voices.length >= MAX_VOICES;

  return (
    <div className="space-y-6">
      <ul className="space-y-2">
        {voices.map((v) => (
          <li key={v.id} className="card flex items-center justify-between gap-3 py-4">
            <div>
              <p className="font-semibold">{v.name}</p>
              <p className="text-xs text-neutral-500">{v.duration_seconds ? `${v.duration_seconds}s sample` : "sample"}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => play(v)} className="btn">{playing === v.id ? "Playing…" : "Play"}</button>
              <button onClick={() => remove(v)} className="btn-danger">Delete</button>
            </div>
          </li>
        ))}
        {!voices.length && <p className="text-sm text-neutral-500">No voices saved yet. Start with your own.</p>}
      </ul>

      {full ? (
        <p className="text-sm text-muted">You have 4 voices, the most OpenAI accepts. Delete one to add another.</p>
      ) : (
        <section className="card space-y-4">
          <h2 className="font-bold">Add a voice</h2>
          <div>
            <label className="label" htmlFor="voice-name">Name</label>
            <input
              id="voice-name"
              className="input"
              placeholder={voices.length ? "e.g. Jordan" : "e.g. Ozzie"}
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <p className="text-sm text-muted">
            Record about 8 seconds of that person talking normally, in a quiet spot. It stops on its own at 9 seconds.
          </p>

          {!recording && !clip && (
            <button onClick={startSample} className="btn-primary">Record sample</button>
          )}

          {recording && (
            <div className="space-y-3">
              <div className="h-2 overflow-hidden rounded-full bg-line">
                <div className="h-full bg-accent transition-[width]" style={{ width: `${Math.min(100, (elapsed / AUTO_STOP_SECONDS) * 100)}%` }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm tabular-nums">{elapsed.toFixed(1)} s</span>
                <button onClick={stopSample} disabled={elapsed < MIN_SECONDS} className="btn">Stop</button>
              </div>
            </div>
          )}

          {clip && (
            <div className="space-y-3">
              <audio src={clip.url} controls className="w-full" />
              <div className="flex gap-3">
                <button onClick={save} disabled={busy || !name.trim()} className="btn-primary flex-1">
                  {busy ? "Saving…" : name.trim() ? `Save as ${name.trim()}` : "Enter a name to save"}
                </button>
                <button onClick={() => setClip(null)} disabled={busy} className="btn">Redo</button>
              </div>
            </div>
          )}
        </section>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
