import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";

export default async function Home() {
  redirect((await getStaffSession()) ? "/home" : "/login");
}

export const maxDuration = 45;
