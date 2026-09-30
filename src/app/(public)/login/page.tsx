import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { openLoginEnabled } from "@/lib/auth/config";
import { getStaffSession } from "@/lib/auth/session";
import { dealership } from "@/lib/dealership";

export const metadata: Metadata = { title: "Sign in" };

const errors: Record<string, string> = {
  denied: "Sign-in was cancelled. Try again when you're ready.",
  expired: "Your session ended. Please sign in again.",
  not_allowed: "This Google account isn't on the staff list. Ask your manager to add you.",
  unverified: "Google hasn't verified this account's email address yet.",
  failed: "Sign-in didn't go through. Please try again.",
  config: "Sign-in isn't set up on this site yet. Let your administrator know.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (await getStaffSession()) redirect("/dashboard");
  const params = await searchParams;
  const open = openLoginEnabled();
  // "Session ended" isn't worth showing on a fresh visit to an open login.
  const errorKey = open && params.error === "expired" ? undefined : params.error;
  const error = errorKey ? errors[errorKey] ?? errors.failed : null;
  const signedOut = params.signed_out === "1";

  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section className="relative flex flex-col justify-between overflow-hidden bg-graphite px-8 py-10 text-white sm:px-12 lg:py-14">
        <div className="flex items-center gap-3">
          <span aria-hidden className="size-3 rounded-[3px] bg-signal" />
          <span className="text-lg font-semibold tracking-tight">AutoDash</span>
        </div>
        <div className="mt-16 lg:mt-0">
          <p className="text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">{dealership.name}</p>
          <p className="mt-4 max-w-sm text-white/70">Leads, conversations and appointments for the whole team.</p>
        </div>
        <div aria-hidden className="mt-12 h-1.5 w-full bg-[repeating-linear-gradient(90deg,var(--color-signal)_0_44px,transparent_44px_76px)] opacity-90" />
      </section>

      <section className="flex items-center justify-center px-6 py-14 sm:px-10">
        <div className="w-full max-w-sm">
          <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-muted">Sign in to your dealership account.</p>

          {signedOut && !error && (
            <p role="status" className="mt-6 rounded-md border border-line bg-white px-4 py-3 text-sm">You've signed out.</p>
          )}
          {error && (
            <p role="alert" className="mt-6 rounded-md border border-signal/25 bg-warn-soft px-4 py-3 text-sm text-ink">{error}</p>
          )}

          {open ? (
            <form action="/api/login" method="post" className="mt-8 space-y-5">
              <div>
                <label htmlFor="username" className="block text-sm font-semibold">Username</label>
                <input
                  id="username" name="username" type="text" autoComplete="username" autoCapitalize="words"
                  className="mt-1.5 h-12 w-full rounded-md border border-line bg-white px-3.5 text-[15px] outline-none transition-colors focus:border-graphite"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-semibold">Password</label>
                <input
                  id="password" name="password" type="password" autoComplete="current-password"
                  className="mt-1.5 h-12 w-full rounded-md border border-line bg-white px-3.5 text-[15px] outline-none transition-colors focus:border-graphite"
                />
              </div>
              <button type="submit" className="h-12 w-full rounded-md bg-signal px-5 font-semibold text-white transition-colors hover:bg-signal-dark">
                Sign in
              </button>
            </form>
          ) : (
            <a href="/api/google-login" className="mt-8 flex h-12 w-full items-center justify-center rounded-md bg-signal px-5 font-semibold text-white transition-colors hover:bg-signal-dark">
              Continue with Google
            </a>
          )}
        </div>
      </section>
    </main>
  );
}

export const maxDuration = 45;
