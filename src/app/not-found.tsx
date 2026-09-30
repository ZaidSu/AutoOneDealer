import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="max-w-sm text-center">
        <h1 className="text-2xl font-semibold">This page doesn't exist</h1>
        <p className="mt-2 text-muted">The link may be old or mistyped.</p>
        <Link href="/dashboard" className="mt-6 inline-block font-semibold text-signal hover:underline">
          Go to the dashboard
        </Link>
      </div>
    </main>
  );
}
