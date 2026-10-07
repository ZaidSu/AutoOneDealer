// The page frame (sidebar, layout). Static, so it loads instantly; who's signed in comes from /api/me.
// Each server page checks sign-in itself (lib/auth/guard.ts); the data endpoints check it too.
import AppShell from "@/components/layout/AppShell";
import PerfReporter from "@/components/layout/PerfReporter";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PerfReporter />
      <AppShell>{children}</AppShell>
    </>
  );
}
