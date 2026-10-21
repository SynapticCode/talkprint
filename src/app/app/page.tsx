import Link from "next/link";
import { CaptureCard } from "@/components/CaptureCard";
import { createClient } from "@/lib/supabase/server";
import { syncTranscription } from "@/lib/transcription";
import { formatDuration } from "@/lib/format";
import type { Transcript } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AppHome() {
  const supabase = await createClient();

  // Finish any transcripts whose Runpod job completed while no one was watching.
  const { data: pending } = await supabase.from("transcripts").select("*").eq("status", "processing").returns<Transcript[]>();
  await Promise.all((pending ?? []).map((t) => syncTranscription(supabase, t).catch(() => null)));
  const { data: transcripts } = await supabase
    .from("transcripts")
    .select("id, title, status, duration_seconds, created_at, source")
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<Pick<Transcript, "id" | "title" | "status" | "duration_seconds" | "created_at" | "source">[]>();

  return (
    <div className="space-y-8">
      <CaptureCard />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">Transcripts</h2>
        {!transcripts?.length ? (
          <p className="text-sm text-neutral-500">Nothing yet. Record or upload something above.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {transcripts.map((t) => (
              <li key={t.id}>
                <Link href={`/app/t/${t.id}`} className="flex items-center justify-between gap-4 bg-panel px-4 py-3.5 hover:bg-neutral-900">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{t.title}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {new Date(t.created_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {t.duration_seconds ? ` · ${formatDuration(t.duration_seconds)}` : ""}
                      {t.source === "recording" ? " · recorded" : " · uploaded"}
                    </p>
                  </div>
                  <StatusPill status={t.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatusPill({ status }: { status: Transcript["status"] }) {
  if (status === "done") return null;
  const styles =
    status === "processing" ? "border-neutral-700 text-muted" : "border-red-900 text-red-400";
  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${styles}`}>
      {status === "processing" ? "Transcribing" : "Failed"}
    </span>
  );
}
