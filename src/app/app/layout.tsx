import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/Wordmark";
import { createClient } from "@/lib/supabase/server";
import { formatDuration } from "@/lib/format";

export const dynamic = "force-dynamic";

// The allow-list gate for every page under /app.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: allowed } = await supabase.rpc("is_allowed");

  if (allowed !== true) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="card w-full max-w-sm text-center">
          <Wordmark />
          <h1 className="mt-6 text-lg font-bold">Access pending</h1>
          <p className="mt-2 text-sm text-muted">
            <span className="text-white">{user.email}</span> isn&apos;t on the invite list yet.
          </p>
          <form action="/auth/signout" method="post" className="mt-6">
            <button className="btn w-full">Sign out</button>
          </form>
        </div>
      </main>
    );
  }

  const { data: usedSeconds } = await supabase.rpc("monthly_usage_seconds");

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16">
      <header className="flex items-center justify-between gap-3 py-5">
        <Link href="/app" aria-label="Talkprint home">
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/app" className="rounded-lg px-3 py-2 text-muted hover:text-white">
            Record
          </Link>
          <Link href="/app/voices" className="rounded-lg px-3 py-2 text-muted hover:text-white">
            Voices
          </Link>
          <form action="/auth/signout" method="post">
            <button className="rounded-lg px-3 py-2 text-muted hover:text-white">Sign out</button>
          </form>
        </nav>
      </header>
      <p className="-mt-2 mb-6 text-xs text-neutral-500">
        {formatDuration(Number(usedSeconds ?? 0))} transcribed this month
      </p>
      {children}
    </div>
  );
}
