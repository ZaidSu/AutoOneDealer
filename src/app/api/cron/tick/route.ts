// The timer: cron-job.org calls this every 5 minutes, day and night, so AutoDash keeps working when nobody has it
// open. It pulls new lead emails into the database, then (during AI hours) has the AI write draft replies.
// Protected by CRON_SECRET: the caller must send it as ?key=... or "Authorization: Bearer ...".
import { timingSafeEqual } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { checkCustomerReplies, draftFollowups } from "@/lib/ai/followups";
import { runAlerts } from "@/lib/ai/alerts";
import { sendDigestIfDue } from "@/lib/ai/digest";
import { draftNewReplies } from "@/lib/ai/replies";
import { setSetting } from "@/lib/db/data";
import { chargeDueBillsByCard, collectOpenBills, ensureInvoice } from "@/lib/billing";
import { withGmail } from "@/lib/gmail";
import { syncLeads } from "@/lib/leads/sync";
import { enrichInventory, seedInventoryOnce, syncInventory } from "@/lib/inventory/store";
import { syncReviews } from "@/lib/reviews/store";
import { sendPurchaseFollowups } from "@/lib/sms";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function allowed(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < 16) return false;
  const given = req.nextUrl.searchParams.get("key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ ok: false, message: "Set CRON_SECRET in Vercel first." }, { status: 503 });
  if (!allowed(req)) return NextResponse.json({ ok: false, message: "Wrong or missing key." }, { status: 401 });
  const started = Date.now();
  const report: Record<string, unknown> = {};
  try {
    const sync = await withGmail((gmail) => syncLeads(gmail, { timeLimitMs: 20_000 }), undefined, "background");
    report.leads = sync.status === "ok" ? ("busy" in sync.data ? "already updating" : { added: sync.data.added ?? 0, total: sync.data.saved }) : sync.status === "error" ? sync.message : "Gmail isn't connected";
  } catch (error) {
    report.leads = `failed: ${error instanceof Error ? error.message : "unknown"}`;
  }
  // The update emails come right after the lead import and BEFORE the slow AI-writing steps below. Those can take most of this
  // run's 60 seconds, and a timer run that is cut off never reaches anything after them (which is why updates went missing).
  try {
    const digest = await sendDigestIfDue();
    report.digest = digest.sent ? digest.reason : `not sent: ${digest.reason}`;
  } catch (error) {
    report.digest = `failed: ${error instanceof Error ? error.message : "unknown"}`;
  }
  try {
    const extra = await runAlerts();
    if (Object.keys(extra).length) report.alerts = extra;
  } catch (error) {
    report.alerts = `failed: ${error instanceof Error ? error.message : "unknown"}`;
  }
  // Copy the website's inventory into the database. Runs after the timer has answered, so a slow website can't hold up
  // or break the rest of the timer. The result shows on the Inventory page.
  after(async () => {
    try { await syncReviews().catch(() => undefined); } catch { /* reviews can wait */ }
    try { await seedInventoryOnce().catch(() => undefined); await syncInventory(); } catch (error) { console.error("[autodash:inventory] sync failed:", error instanceof Error ? error.message : error); }
    // A few cars per run get their VIN and photos from their own page (only if there's time left in this run).
    try { await enrichInventory({ max: 3, deadline: started + 55_000 }); } catch (error) { console.error("[autodash:inventory] VIN/photo read failed:", error instanceof Error ? error.message : error); }
  });
  try {
    // Customers who wrote back by email (answered in the same thread).
    const replies = await withGmail((gmail) => checkCustomerReplies(gmail), undefined, "background");
    report.customerReplies = replies.status === "ok" ? replies.data : replies.status === "error" ? replies.message : "Gmail isn't connected";
    report.followups = await draftFollowups({ max: 3 });
  } catch (error) {
    report.customerReplies = `failed: ${error instanceof Error ? error.message : "unknown"}`;
  }
  try {
    report.ai = await draftNewReplies({ max: 4 });
  } catch (error) {
    report.ai = `failed: ${error instanceof Error ? error.message : "unknown"}`;
  }
  try {
    report.purchaseFollowups = await sendPurchaseFollowups({ max: 3 });
  } catch (error) {
    report.purchaseFollowups = `failed: ${error instanceof Error ? error.message : "unknown"}`;
  }
  try {
    const bill = await ensureInvoice(undefined, { onlyIfStarted: true });
    // With a bank account connected, new bills are scheduled for collection on their due date.
    const collecting = bill ? await collectOpenBills() : 0;
    // With card autopay on, bills are charged on their due date.
    const charged = bill ? await chargeDueBillsByCard() : 0;
    if (charged) report.autopay = `charged ${charged}`;
    report.billing = bill ? `${bill.number} ${bill.status}${collecting ? ", bank collection started" : ""}` : "not started (the developer creates the first bill)";
  } catch (error) {
    report.billing = `failed: ${error instanceof Error ? error.message : "unknown"}`;
  }
  await setSetting("last_timer_run", String(Date.now())).catch(() => undefined);
  await setSetting("last_timer_report", JSON.stringify({ at: Date.now(), leads: report.leads ?? null, ai: report.ai ?? null })).catch(() => undefined);
  console.log("[autodash:cron]", JSON.stringify(report));
  return NextResponse.json({ ok: true, ms: Date.now() - started, ...report });
}
