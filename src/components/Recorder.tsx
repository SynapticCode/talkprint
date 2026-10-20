"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { defaultTitle, startTranscription, MAX_AUDIO_BYTES } from "@/lib/startTranscription";
import { formatTimestamp } from "@/lib/format";

// 32 kbps Opus: ~1 h 45 min fits under OpenAI's 25 MB file limit.
const BITRATE = 32_000;
const MAX_SECONDS = 100 * 60;

type Phase = "idle" | "recording" | "paused" | "review" | "sending";

function pickMimeType(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t));
}

export function Recorder() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [bytes, setBytes] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => () => cleanup(), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase === "recording" && (seconds >= MAX_SECONDS || bytes >= MAX_AUDIO_BYTES * 0.97)) stop();
  }, [seconds, bytes, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  function cleanup() {
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: BITRATE });
      chunksRef.current = [];
      setBytes(0);
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
          setBytes((b) => b + e.data.size);
        }
      };
      rec.onstop = () => {
        const out = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        setBlob(out);
        setUrl(URL.createObjectURL(out));
        setTitle(defaultTitle("Recording"));
        setPhase("review");
        cleanup();
      };
      rec.start(1000);
      recorderRef.current = rec;
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      setPhase("recording");

      // Keep the phone screen awake so Android doesn't cut the mic.
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request("screen").catch(() => null);
      }
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in the browser's site settings and try again."
          : `Couldn't start recording: ${e instanceof Error ? e.message : String(e)}`,
      );
      cleanup();
      setPhase("idle");
    }
  }

  function pause() {
    recorderRef.current?.pause();
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase("paused");
  }

  function resume() {
    recorderRef.current?.resume();
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    setPhase("recording");
  }

  function stop() {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stop();
  }

  function discard() {
    if (url) URL.revokeObjectURL(url);
    setBlob(null);
    setUrl(null);
    setSeconds(0);
    setBytes(0);
    setPhase("idle");
  }

  async function send() {
    if (!blob) return;
    setPhase("sending");
    setError(null);
    try {
      const id = await startTranscription({ file: blob, title, source: "recording" });
      router.push(`/app/t/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("review");
    }
  }

  const mb = (bytes / 1024 / 1024).toFixed(1);

  return (
    <div>
      {phase === "idle" && (
        <div className="flex flex-col items-center py-6">
          <button
            onClick={start}
            className="flex h-24 w-24 items-center justify-center rounded-full bg-accent shadow-lg shadow-red-950/50 transition hover:bg-accent-hover"
            aria-label="Start recording"
          >
            <span className="h-8 w-8 rounded-full bg-white" />
          </button>
          <p className="mt-4 text-sm text-muted">Tap to record. Keep this tab open while recording.</p>
        </div>
      )}

      {(phase === "recording" || phase === "paused") && (
        <div className="flex flex-col items-center py-6">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className={`h-2.5 w-2.5 rounded-full bg-accent ${phase === "recording" ? "rec-dot" : ""}`} />
            {phase === "recording" ? "Recording" : "Paused"}
          </div>
          <p className="mt-2 font-mono text-5xl font-bold tabular-nums">{formatTimestamp(seconds)}</p>
          <p className="mt-2 text-xs text-neutral-500">{mb} MB of 25 MB</p>
          <div className="mt-6 flex gap-3">
            {phase === "recording" ? (
              <button onClick={pause} className="btn">Pause</button>
            ) : (
              <button onClick={resume} className="btn">Resume</button>
            )}
            <button onClick={stop} className="btn-primary">Stop</button>
          </div>
        </div>
      )}

      {(phase === "review" || phase === "sending") && url && (
        <div className="space-y-4">
          <audio src={url} controls className="w-full" />
          <div>
            <label className="label" htmlFor="rec-title">Title</label>
            <input id="rec-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </div>
          <div className="flex gap-3">
            <button onClick={send} disabled={phase === "sending"} className="btn-primary flex-1">
              {phase === "sending" ? "Uploading…" : "Transcribe"}
            </button>
            <button onClick={discard} disabled={phase === "sending"} className="btn">Discard</button>
          </div>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
    </div>
  );
}
