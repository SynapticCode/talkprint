import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="text-5xl font-black">404</p>
      <p className="mt-2 text-sm text-muted">That page doesn&apos;t exist, or it isn&apos;t yours.</p>
      <Link href="/app" className="btn mt-6">Back to Talkprint</Link>
    </main>
  );
}
