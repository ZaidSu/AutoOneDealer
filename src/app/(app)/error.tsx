"use client";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card max-w-xl">
      <h2>Something went wrong loading this page</h2>
      <p className="mt-2 text-muted">Your data is safe. Try again, and if it keeps happening check the Vercel logs.</p>
      <button type="button" onClick={reset} className="btn btn-primary mt-4">Try again</button>
    </div>
  );
}
