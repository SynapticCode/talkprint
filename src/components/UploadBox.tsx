"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { startTranscription } from "@/lib/startTranscription";

export function UploadBox() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<"idle" | "extracting" | "uploading">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function choose(f: File | undefined | null) {
    if (!f) return;
    if (f.size === 0) {
      setError("That file is empty.");
      setFile(null);
      return;
    }
    setError(null);
    setFile(f);
    setTitle(f.name.replace(/\.[^.]+$/, ""));
  }

  async function send() {
    if (!file) return;
    setError(null);
    setProgress(0);
    setPhase("extracting");
    try {
      // Only the sound is uploaded; the original file stays on this device.
      // Loaded on demand so the converter (~160 kB) is not part of every page load.
      const { extractAudio } = await import("@/lib/extractAudio");
      const audio = await extractAudio(file, setProgress);
      setPhase("uploading");
      const id = await startTranscription({ file: audio, title, source: "upload" });
      router.push(`/app/t/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("idle");
    }
  }

  const busy = phase !== "idle";

  return (
    <div className="space-y-4">
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          choose(e.dataTransfer.files?.[0]);
        }}
        className={`flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-10 text-center transition ${
          dragging ? "border-accent bg-red-950/20" : "border-line hover:border-neutral-500"
        }`}
      >
        <span className="text-sm font-semibold">{file ? file.name : "Drop an audio or video file, or click to choose"}</span>
        <span className="mt-1 text-xs text-neutral-500">
          {file
            ? `${(file.size / 1024 / 1024).toFixed(1)} MB · only the sound is uploaded`
            : "Any video or audio file · up to about 3.5 hours"}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,video/*,.mkv,.mka,.flac,.ogg,.opus"
        className="hidden"
        onChange={(e) => choose(e.target.files?.[0])}
      />

      {file && (
        <>
          <div>
            <label className="label" htmlFor="up-title">Title</label>
            <input id="up-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </div>
          <button onClick={send} disabled={busy} className="btn-primary w-full">
            {phase === "extracting"
              ? `Extracting audio… ${Math.round(progress * 100)}%`
              : phase === "uploading"
                ? "Uploading…"
                : "Transcribe"}
          </button>
          {phase === "extracting" && <p className="text-xs text-neutral-500">Keep this tab open until it finishes.</p>}
        </>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
