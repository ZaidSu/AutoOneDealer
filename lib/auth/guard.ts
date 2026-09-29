// Server pages call this first: no valid sign-in, no page (the page frame itself no longer checks).
import { redirect } from "next/navigation";
import { getStaffSession } from "./session";

export async function requirePageStaff() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login?error=expired");
  return staff;
}
