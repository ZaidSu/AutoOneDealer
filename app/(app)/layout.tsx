// Every page in this group requires a signed-in staff member. Checked on the server.
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { roleLabel } from "@/lib/auth/access";
import { getStaffSession } from "@/lib/auth/session";
import { dealership } from "@/lib/dealership";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login?error=expired");
  return (
    <AppShell dealershipName={dealership.name} staffName={staff.name} roleLabel={roleLabel[staff.role]}>
      {children}
    </AppShell>
  );
}
