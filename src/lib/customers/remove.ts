// Removing a customer from AutoDash (spam, a test, a duplicate, someone who asked to be taken out).
// Their row, notes, history and summary are deleted, and their lead emails are marked "ignored" so a rebuild of the customer list
// can't bring them back and the email import doesn't read those emails again. If they write in again later with a NEW email,
// that new lead creates a fresh customer. What stays, on purpose: text opt-outs and consent records (legal proof), and the AI's
// sent-email history. Drafts waiting for approval are discarded.
import { readyDb } from "@/lib/db";

export type RemoveResult = { removed: boolean; name: string | null; leads: number; status: string | null };

export async function removeCustomer(key: string): Promise<RemoveResult> {
  const sql = await readyDb();
  if (!sql) throw new Error("no_db");
  return sql.begin(async (tx): Promise<RemoveResult> => {
    const [customer] = await tx`select key, name, status from customers where key = ${key} for update`;
    if (!customer) return { removed: false, name: null, leads: 0, status: null };
    const leads = await tx`update leads set ignored = true where customer_key = ${key} and not ignored returning message_id`;
    await tx`update ai_replies set status = 'discarded', error = 'The customer was removed' where customer_key = ${key} and status = 'draft'`;
    await tx`update sms_messages set status = 'discarded' where customer_key = ${key} and status = 'draft'`;
    await tx`delete from appointments where customer_key = ${key} and status = 'scheduled' and starts_at > now()`;
    await tx`delete from activities where customer_key = ${key}`;
    await tx`delete from customer_summaries where customer_key = ${key}`;
    await tx`delete from customers where key = ${key}`;
    return { removed: true, name: (customer.name as string) ?? null, leads: leads.length, status: customer.status as string };
  });
}
