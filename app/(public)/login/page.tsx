import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { dealership } from "@/lib/dealership";

export const metadata: Metadata = { title: "Sign in" };

const errors: Record<string, string> = {
  denied: "Sign-in was cancelled. Try again when you're ready.",
  expired: "That sign-in took too long or your session ended. Please sign in again.",
  not_allowed: "This Google account isn't on the staff list. Ask your manager to add you.",
  unverified: "Google hasn't verified this account's email address yet.",
  failed: "Google didn't complete the sign-in. Please try again.",
  config: "Sign-in isn't set up on this site yet. Let your administrator know.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (await getStaffSession()) redirect("/dashboard");
  const params = await searchParams;
  const error = params.error ? errors[params.error] ?? errors.failed : null;
  const signedOut = params.signed_out === "1";

  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Brand panel: the one bold moment in the app. */}
      <section className="relative flex flex-col justify-between overflow-hidden bg-graphite px-8 py-10 text-white sm:px-12 lg:py-14">
        <div className="flex items-center gap-3">
          <span aria-hidden className="size-3 rounded-[3px] bg-signal" />
          <span className="text-lg font-semibold tracking-tight">AutoDash</span>
        </div>
        <div className="mt-16 lg:mt-0">
          <p className="text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">{dealership.name}</p>
          <p className="mt-4 max-w-sm text-white/70">Leads, conversations and appointments for the whole team.</p>
        </div>
        {/* Lane marking */}
        <div
          aria-hidden
          className="mt-12 h-1.5 w-full bg-[repeating-linear-gradient(90deg,var(--color-signal)_0_44px,transparent_44px_76px)] opacity-90"
        />
      </section>

      <section className="flex items-center justify-center px-6 py-14 sm:px-10">
        <div className="w-full max-w-sm">
          <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-muted">Sign in with your work Google account.</p>

          {signedOut && !error && (
            <p role="status" className="mt-6 rounded-md border border-line bg-white px-4 py-3 text-sm">
              You've signed out.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-6 rounded-md border border-signal/25 bg-warn-soft px-4 py-3 text-sm text-ink">
              {error}
            </p>
          )}

          <a
            href="/api/google-login"
            className="mt-8 flex h-12 w-full items-center justify-center gap-3 rounded-md bg-signal px-5 font-semibold text-white transition-colors hover:bg-signal-dark"
          >
            <GoogleMark />
            Continue with Google
          </a>
          <p className="mt-6 text-sm text-muted">Only staff your manager has added can sign in.</p>
        </div>
      </section>
    </main>
  );
}

function GoogleMark() {
  return (
    <span aria-hidden className="grid size-6 place-items-center rounded-full bg-white">
      <svg viewBox="0 0 48 48" className="size-4">
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.4 5.7c4.3-4 6.9-9.9 6.9-17.2z" />
        <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
        <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.4 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
      </svg>
    </span>
  );
}
