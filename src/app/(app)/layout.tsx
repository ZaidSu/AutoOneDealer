// The page frame (sidebar). Each page also checks the sign-in itself, and so do the file and export routes.
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { roleLabel } from "@/lib/auth/access";
import { requirePageStaff } from "@/lib/auth/guard";
import { PREVIEW_COOKIE, previewMode } from "@/lib/mode";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (previewMode()) {
    if (!(await cookies()).get(PREVIEW_COOKIE)) redirect("/login");
    return <AppShell name="Preview" roleLabel="Preview mode" preview>{children}</AppShell>;
  }
  const staff = await requirePageStaff();
  return <AppShell name={staff.name} roleLabel={roleLabel[staff.role]}>{children}</AppShell>;
}
