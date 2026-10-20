"use client";

import { useState } from "react";
import { Recorder } from "@/components/Recorder";
import { UploadBox } from "@/components/UploadBox";

export function CaptureCard() {
  const [tab, setTab] = useState<"record" | "upload">("record");

  return (
    <section className="card">
      <div className="mb-5 inline-flex rounded-xl border border-line p-1 text-sm">
        {(["record", "upload"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-1.5 font-semibold capitalize transition ${
              tab === t ? "bg-white text-neutral-900" : "text-muted hover:text-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "record" ? <Recorder /> : <UploadBox />}
    </section>
  );
}
