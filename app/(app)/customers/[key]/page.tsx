import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import GmailState from "@/components/gmail/GmailState";
import Badge from "@/components/leads/Badge";
import { groupCustomers, parseCustomerKey } from "@/lib/customers";
import { displayName, formatDateTime, formatMoney, formatPhone } from "@/lib/format";
import { fetchManyLeads, mapLimit, withGmail } from "@/lib/gmail";

export const metadata: Metadata = { title: "Customer" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function CustomerPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const identity = parseCustomerKey(key);
  if (!identity) notFound();

  // Search the whole inbox for this person, not just recent leads.
  const search =
    "phone" in identity
      ? (() => {
          const p = identity.phone;
          return `("${p}" OR "${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}" OR "(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}" OR "${p.slice(0, 3)}.${p.slice(3, 6)}.${p.slice(6)}")`;
        })()
      : `"${identity.email}"`;

  const result = await withGmail(async (gmail) => {
    const { leads } = await fetchManyLeads(gmail, { extra: search, limit: 100 });
    const customer =
      groupCustomers(leads).find((c) =>
        "phone" in identity ? c.phones.includes(identity.phone) : c.emails.includes(identity.email),
      ) ?? null;
    // Direct emails with the customer (replies, questions), when we know their address.
    const emails = customer?.emails ?? ("email" in identity ? [identity.email] : []);
    const conversation = emails.length
      ? await mapLimit(await gmail.listIds(emails.map((e) => `from:${e} OR to:${e}`).join(" OR "), 20), 10, (id) => gmail.summary(id))
      : [];
    return { customer, conversation };
  });

  if (result.status !== "ok") return <GmailState {...result} />;
  const { customer, conversation } = result.data;
  if (!customer) notFound();

  return (
    <article className="max-w-4xl">
      <Link href="/customers" className="text-sm font-semibold text-muted hover:text-ink">← All customers</Link>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight">{displayName(customer.name)}</h1>
        {customer.hasApplication && <Badge tone="application">Credit application received</Badge>}
      </div>

      <section aria-label="Contact details" className="mt-5 grid gap-x-8 gap-y-2 rounded-lg border border-line bg-white p-5 text-[15px] sm:grid-cols-2">
        <Detail label="Phone">
          {customer.phones.map((p) => <a key={p} href={`tel:${p}`} className="block hover:text-signal hover:underline">{formatPhone(p)}</a>)}
          {!customer.phones.length && "Not provided"}
        </Detail>
        <Detail label="Email">
          {customer.emails.map((e) => <a key={e} href={`mailto:${e}`} className="block break-all hover:underline">{e}</a>)}
          {!customer.emails.length && "Not provided"}
        </Detail>
        <Detail label="Location">{customer.location ?? "Not provided"}</Detail>
        <Detail label="Came from">{customer.sources.join(", ")}</Detail>
        <Detail label="Interested in">{customer.vehicles.join(", ") || "No vehicle mentioned"}</Detail>
        <Detail label="First contact">{formatDateTime(customer.firstSeen)}</Detail>
      </section>

      <section aria-labelledby="history" className="mt-8">
        <h2 id="history" className="text-lg font-semibold">Leads and applications ({customer.leads.length})</h2>
        <ol className="mt-3 space-y-3">
          {customer.leads.map((lead) => (
            <li key={lead.messageId} className="rounded-lg border border-line bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={lead.kind}>{lead.kind === "application" ? "Credit application" : lead.type}</Badge>
                <Badge tone="neutral">{lead.provider}</Badge>
                <span className="text-sm text-muted">{formatDateTime(lead.receivedAt)}</span>
                <Link href={`/inbox/${lead.messageId}`} className="ml-auto text-sm font-semibold text-signal hover:underline">Open email</Link>
              </div>
              <p className="mt-2 text-[15px]">
                {lead.kind === "application"
                  ? [lead.loanAmount !== null && `Loan amount ${formatMoney(lead.loanAmount)}`, lead.downPayment !== null && `down payment ${formatMoney(lead.downPayment)}`].filter(Boolean).join(", ") || "Application details are in the original email."
                  : lead.vehicle ?? "No vehicle mentioned"}
              </p>
              {lead.comments && lead.kind !== "application" && (
                <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-muted">{lead.comments}</p>
              )}
            </li>
          ))}
        </ol>
      </section>

      {conversation.length > 0 && (
        <section aria-labelledby="conversation" className="mt-8">
          <h2 id="conversation" className="text-lg font-semibold">Emails with this customer</h2>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
            {conversation.sort((a, b) => b.receivedAt - a.receivedAt).map((m) => (
              <li key={m.id}>
                <Link href={`/inbox/${m.id}`} className="block px-4 py-3 hover:bg-paper">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{m.subject}</span>
                    <span className="text-sm text-muted">{formatDateTime(m.receivedAt)}</span>
                  </div>
                  <p className="truncate text-sm text-muted">{m.fromName}: {m.snippet}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-8 text-sm text-muted">Notes, status and assigning a salesperson will be added here once the shared database is connected.</p>
    </article>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-4">
      <span className="text-muted">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}
