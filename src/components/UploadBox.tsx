"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { startTranscription, validateAudioFile, SUPPORTED_EXTENSIONS } from "@/lib/startTranscription";

export function UploadBox() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function choose(f: File | undefined | null) {
    if (!f) return;
    const problem = validateAudioFile(f, f.name);
    setError(problem);
    setFile(problem ? null : f);
    if (!problem) setTitle(f.name.replace(/\.[^.]+$/, ""));
  }

  async function send() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const id = await startTranscription({ file, filename: file.name, title, source: "upload" });
      router.push(`/app/t/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
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
            ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
            : `${SUPPORTED_EXTENSIONS.join(", ")} · up to 25 MB`}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(",") + ",audio/*,video/mp4,video/webm"}
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
            {busy ? "Uploading…" : "Transcribe"}
          </button>
        </>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
