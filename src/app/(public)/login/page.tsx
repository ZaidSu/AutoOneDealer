import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import PreviewSignIn from "@/components/preview/PreviewSignIn";
import { missingConfig } from "@/lib/auth/config";
import { getStaffSession } from "@/lib/auth/session";
import { PREVIEW_COOKIE, previewMode } from "@/lib/mode";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };
export const maxDuration = 45;

const errors: Record<string, string> = {
  denied: "Sign-in was cancelled. Try again when you\u2019re ready.",
  expired: "Your session ended. Please sign in again.",
  not_allowed: "This Google account isn\u2019t on the approved list. Ask the owner to add it.",
  unverified: "Google hasn\u2019t verified this account\u2019s email address yet.",
  failed: "Sign-in didn\u2019t go through. Please try again.",
  config: "Sign-in isn\u2019t set up on this site yet.",
};

const GOOGLE_ICON = (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
    <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3.1-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
  </svg>
);

const FEATURES = [
  "Every deal by quarter, like your spreadsheet",
  "Invoices, contractors and what you're owed",
  "Tax totals you can download for filing",
];
// A small line graph with a circle on each point, like the Analytics page.
const POINTS: [number, number][] = [[0, 128], [70, 112], [140, 120], [210, 84], [280, 96], [350, 58], [420, 70], [490, 26]];

function LineArt() {
  const line = POINTS.map(([x, y]) => `${x + 20},${y}`).join(" ");
  return (
    <svg viewBox="0 0 530 160" role="presentation" aria-hidden className="h-auto w-full max-w-[540px]">
      {[40, 84, 128].map((y) => <line key={y} x1="20" x2="510" y1={y} y2={y} stroke="rgba(255,255,255,0.12)" />)}
      <polyline points={`${line} 510,150 20,150`} fill="rgba(242,165,65,0.10)" stroke="none" />
      <polyline className="login-line" points={line} fill="none" stroke="#f2a541" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {POINTS.map(([x, y], i) => <circle key={i} className="login-dot" style={{ animationDelay: `${0.5 + i * 0.12}s` }} cx={x + 20} cy={y} r="5.5" fill="#10233f" stroke="#f2a541" strokeWidth="3" />)}
    </svg>
  );
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const preview = previewMode();
  if (preview ? (await cookies()).get(PREVIEW_COOKIE) : await getStaffSession()) redirect("/invoices");
  const params = await searchParams;
  const missing = preview ? [] : missingConfig();
  const error = params.error ? errors[params.error] ?? errors.failed : null;
  const signedOut = params.signed_out === "1";

  return (
    <main className="grid min-h-dvh bg-white lg:grid-cols-[1.05fr_1fr]">
      <section className="flex flex-col justify-between gap-10 bg-ink px-7 py-8 text-white sm:px-14 lg:py-10">
        <Link href="/" className="flex items-center gap-2.5 font-extrabold tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="size-[34px]" />
          Marketplace Wholesale
        </Link>
        <div>
          <h2 className="max-w-[16ch] text-[clamp(1.75rem,3.4vw,2.6rem)] font-extrabold leading-[1.1] tracking-tight">Know what every item earns, all year.</h2>
          <ul className="mt-6 grid gap-3">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-3 text-[15.5px] text-side-ink">
                <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent text-ink"><svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span>
                {f}
              </li>
            ))}
          </ul>
        </div>
        <div className="hidden lg:block"><LineArt /></div>
      </section>

      <section className="relative grid place-items-center px-6 py-16">
        <Link href="/" className="absolute left-7 top-6 text-sm font-semibold text-muted hover:text-ink hover:underline">&larr; Back to website</Link>
        <div className="w-full max-w-[400px] rounded-2xl border border-line bg-white p-8 shadow-[0_1px_2px_rgba(16,35,63,0.05),0_18px_40px_-18px_rgba(16,35,63,0.22)]">
          <h1 className="text-[2rem] font-extrabold tracking-tight">Welcome back</h1>
          <p className="mb-6 mt-1.5 text-muted">Sign in with the Google account that has been approved for this workspace.</p>

          {signedOut && !error && <p role="status" className="mb-4 rounded-lg bg-go-soft px-4 py-3 text-sm text-go">You&rsquo;ve signed out.</p>}
          {error && <p role="alert" className="mb-4 rounded-lg bg-bad-soft px-4 py-3 text-sm text-ink">{error}</p>}

          {preview ? (
            <PreviewSignIn google={GOOGLE_ICON} />
          ) : (
            <a href="/api/google-login" className="flex h-[50px] w-full items-center justify-center gap-2.5 rounded-[10px] border border-[#cbd3de] bg-white text-base font-bold hover:border-ink hover:bg-paper">
              {GOOGLE_ICON}
              Continue with Google
            </a>
          )}

          {missing.length > 0 && (
            <p className="mt-4 rounded-lg border border-[#f0d9a8] bg-accent-soft px-3.5 py-3 text-[13px] text-[#6b4a00]">
              Google sign-in isn&rsquo;t set up yet. Missing settings: {missing.join(", ")}. See the README.
            </p>
          )}
          <p className="mt-5 text-[12.5px] text-muted">
            By signing in you agree to our <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}
