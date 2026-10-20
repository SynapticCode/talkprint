import { Wordmark } from "@/components/Wordmark";
import { GoogleSignInButton } from "./GoogleSignInButton";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <Wordmark size="lg" />
        <p className="mt-3 text-sm text-muted">Record. Transcribe. Know who said what.</p>

        <div className="card mt-10 text-left">
          <h1 className="text-lg font-bold">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Private and invite-only.</p>
          <div className="mt-6">
            <GoogleSignInButton />
          </div>
          {error && (
            <p className="mt-4 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              Sign-in didn&apos;t complete. Try again.
            </p>
          )}
        </div>

        <p className="mt-6 text-xs text-neutral-500">
          by <a className="hover:text-white" href="https://azaelmontejo.com">Azael Montejo Jr.</a>
        </p>
      </div>
    </main>
  );
}
