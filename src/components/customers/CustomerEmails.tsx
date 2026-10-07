"use client";
// Emails to and from this customer, loaded from Gmail after the profile is on screen.
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/utils/format";

type Message = { id: string; subject: string; fromName: string; snippet: string; receivedAt: number };

export default function CustomerEmails({ customerKey, hasEmail }: { customerKey: string; hasEmail: boolean }) {
  const [state, setState] = useState<{ messages: Message[] } | "loading" | "error">(hasEmail ? "loading" : { messages: [] });
  useEffect(() => {
    if (!hasEmail) return;
    let alive = true;
    fetch(`/api/customers/${customerKey}/emails`).then((r) => r.json())
      .then((d) => alive && setState(Array.isArray(d.messages) ? { messages: d.messages } : "error"))
      .catch(() => alive && setState("error"));
    return () => { alive = false; };
  }, [customerKey, hasEmail]);

  if (state === "loading") return <p aria-busy className="mt-3 text-sm text-muted">Checking Gmail…</p>;
  if (state === "error") return <p className="mt-3 text-sm text-muted">Couldn&apos;t reach Gmail right now.</p>;
  if (state.messages.length === 0) return <p className="mt-3 text-sm text-muted">{hasEmail ? "No emails with this customer yet." : "No email address on file."}</p>;
  return (
    <ul className="card mt-3 divide-y divide-line overflow-hidden">
      {state.messages.map((m) => (
        <li key={m.id}>
          <Link href={`/inbox/${m.id}`} className="block px-4 py-3 hover:bg-paper">
            <span className="block truncate font-medium">{m.subject}</span>
            <span className="block text-sm text-muted">{formatDateTime(m.receivedAt)}</span>
            <span className="line-clamp-2 text-sm text-muted">{m.fromName}: {m.snippet}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
