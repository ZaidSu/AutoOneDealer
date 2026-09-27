// Keeps saved leads fresh without making anyone wait: after a page is sent, check Gmail for new leads.
import { after } from "next/server";
import { withGmail } from "@/lib/gmail";
import { getGmailConnection } from "@/lib/gmail/connection";
import { getSyncState, syncLeads } from "./sync";

const MIN_GAP_MS = 2 * 60 * 1000; // at most one background check every 2 minutes

export async function syncInBackground() {
  // Request-bound values have to be read now; the work itself runs after the response.
  const connection = await getGmailConnection().catch(() => null);
  if (!connection) return;
  after(async () => {
    try {
      const state = await getSyncState();
      if (state && Date.now() - state.lastRun < MIN_GAP_MS && state.remaining === 0) return;
      await withGmail((gmail) => syncLeads(gmail, { budget: 150 }), connection);
    } catch (error) {
      console.error("Background lead sync failed:", error instanceof Error ? error.message : "unknown");
    }
  });
}
