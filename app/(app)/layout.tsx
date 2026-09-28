// Every page in this group requires a signed-in staff member. Checked on the server.
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import PerfReporter from "@/components/layout/PerfReporter";
import { startupReport } from "@/lib/db";
import { roleLabel } from "@/lib/auth/access";
import { getStaffSession } from "@/lib/auth/session";
import { dealership } from "@/lib/dealership";

// How long this server has been up and how many pages it has served (the first one is a "cold start").
const bootedAt = Date.now();
let served = 0;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login?error=expired");
  served++;
  // On a newly started server's first page, report how long reaching the database took (stopwatch detail).
  const startup = served <= 1 ? await startupReport().catch(() => null) : null;
  return (
    <>
    <PerfReporter serverHits={served} serverAgeS={Math.round((Date.now() - bootedAt) / 1000)}
      startup={startup ? JSON.stringify({ ...startup, startedAt: undefined }) : ""} />
    <AppShell dealershipName={dealership.name} staffName={staff.name} roleLabel={roleLabel[staff.role]}>
      {children}
    </AppShell>
    </>
  );
}
