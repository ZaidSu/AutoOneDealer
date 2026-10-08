import Link from "next/link";
import RepAlertScan from "@/components/ai/RepAlertScan";
import type { RepAlert } from "@/lib/ai/rep-alerts";

const when = (ms: number) => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
const phone = (d: string | null) => (d && d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d ?? "no number");

/** Words for what Twilio says about a message. */
function outcome(a: RepAlert, live: string | null): { text: string; good: boolean } {
  if (!a.ok) return { text: `Not sent: ${a.error ?? "unknown reason"}`, good: false };
  const s = live ?? a.status ?? "";
  if (s === "delivered") return { text: "Delivered to the phone", good: true };
  if (s === "undelivered" || s === "failed") return { text: "The carrier didn't deliver it", good: false };
  if (s === "sent") return { text: "Sent, waiting for the phone to confirm", good: true };
  return { text: "Handed to the carrier", good: true };
}

/** The texts AutoDash sent to the dealership phone when a customer asked for a sales rep, newest first. */
export default function RepAlertLog({ alerts, live, canScan }: { alerts: RepAlert[]; live: Record<string, string>; canScan: boolean }) {
  return (
    <section className="panel p-5">
      <h2 className="text-[17px] font-semibold">Sales rep alerts sent to the dealership phone</h2>
      <p className="mt-1 text-sm text-muted">Whenever a customer needs a person (asks for a rep or a Carfax, talks numbers, wants to buy, or the AI can't answer), the text it sends shows here, with whether it reached the phone. The last 30 are kept.</p>
      {canScan && <RepAlertScan />}
      {alerts.length === 0 ? (
        <p className="mt-3 text-muted">None yet. Use “Send a test alert” above to see one.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {alerts.map((a) => {
            const o = outcome(a, a.sid ? live[a.sid] ?? null : null);
            return (
              <li key={`${a.at}-${a.sid ?? a.error}`} className="py-3">
                <p className="flex flex-wrap items-baseline gap-x-3 text-[15px]">
                  <span className="font-semibold">{a.kind === "test" ? "Test alert" : a.customerKey ? <Link className="underline" href={`/customers/${a.customerKey}`}>{a.customer ?? "Customer"}</Link> : a.customer ?? "Customer"}</span>
                  <span className="text-muted">{when(a.at)} · to {phone(a.to)}</span>
                  <span className={o.good ? "text-go" : "text-signal"}>{o.text}</span>
                </p>
                {a.body && <p className="mt-1 text-sm text-muted">{a.body}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
