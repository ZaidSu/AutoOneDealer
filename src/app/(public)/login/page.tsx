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
    <main className="flex min-h-dvh flex-col bg-paper">
      <header className="flex items-center gap-2.5 px-6 py-5 sm:px-10">
        <span aria-hidden className="size-2.5 rounded-[2px] bg-signal" />
        <span className="font-condensed text-[22px] font-semibold leading-none tracking-wide">AutoDash</span>
      </header>

      <div className="mx-auto grid w-full max-w-5xl flex-1 content-center items-center gap-10 px-6 pb-16 sm:px-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-20">
        <section>
          <h1 className="font-condensed text-5xl font-semibold leading-[0.95] tracking-[0.01em] sm:text-6xl lg:text-7xl">{dealership.name}</h1>
          <div aria-hidden className="lane mt-6 w-[152px] rounded-full" />
          <p className="mt-6 max-w-md text-lg text-muted">Leads, customers and appointments for the whole team, in one place.</p>
        </section>

        <section aria-labelledby="signin" className="rounded-2xl border border-line bg-white p-7 shadow-[0_1px_2px_rgba(26,31,41,0.05),0_12px_32px_-12px_rgba(26,31,41,0.12)] sm:p-8">
          <h2 id="signin" className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-muted">Welcome back. Sign in to see today&apos;s leads.</p>

          {signedOut && !error && (
            <p role="status" className="mt-5 rounded-lg bg-go-soft px-4 py-3 text-sm text-go">You&apos;ve signed out.</p>
          )}
          {error && (
            <p role="alert" className="mt-5 rounded-lg bg-warn-soft px-4 py-3 text-sm text-ink">{error}</p>
          )}

          {open ? (
            <form action="/api/login" method="post" className="mt-6 space-y-4">
              <label className="field">Your name
                <input id="username" name="username" type="text" autoComplete="username" autoCapitalize="words" className="input h-12" />
              </label>
              <label className="field">Password
                <input id="password" name="password" type="password" autoComplete="current-password" className="input h-12" />
              </label>
              <button type="submit" className="btn btn-red h-12 w-full text-base">Sign in</button>
            </form>
          ) : (
            <a href="/api/google-login" className="btn btn-red mt-6 h-12 w-full text-base">Continue with Google</a>
          )}
        </section>
      </div>
      <footer className="flex flex-wrap gap-x-5 gap-y-1 px-6 pb-6 text-sm text-muted sm:px-10">
        <a href="/privacy" className="hover:text-ink">Privacy</a><a href="/sms-terms" className="hover:text-ink">Text terms</a><a href="/email-terms" className="hover:text-ink">Email terms</a><a href="/terms" className="hover:text-ink">Service agreement</a>
      </footer>
    </main>
  );
}

export const maxDuration = 45;
