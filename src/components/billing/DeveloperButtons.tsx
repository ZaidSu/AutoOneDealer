"use client";
import { useState, useTransition } from "react";
import { createInvoiceNowAction, openCardPortalAction, disconnectBankAction, retryBankPaymentAction, turnOffCardAutopayAction, voidInvoiceAction } from "@/app/actions";

export function CreateBillButton() {
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <span className="flex items-center gap-3">
      <button type="button" className="btn btn-primary" disabled={pending}
        onClick={() => start(async () => { const r = await createInvoiceNowAction(); setMsg(r.ok ? r.message ?? "" : r.error); })}>
        {pending ? "Creating…" : "Create this month's bill"}
      </button>
      {msg && <span role="status" className="text-sm text-muted">{msg}</span>}
    </span>
  );
}

export function VoidBillButton({ id }: { id: number }) {
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <span className="ml-auto flex items-center gap-3">
      {msg && <span role="status" className="text-sm text-muted">{msg}</span>}
      <button type="button" className="btn btn-sm text-signal" disabled={pending}
        onClick={() => { if (window.confirm("Cancel this unpaid bill? You can create it again with the current prices.")) start(async () => { const r = await voidInvoiceAction(id); setMsg(r.ok ? r.message ?? "" : r.error); }); }}>
        Cancel bill
      </button>
    </span>
  );
}

export function DisconnectBankButton() {
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <span className="flex flex-wrap items-center gap-3">
      <button type="button" className="btn btn-sm" disabled={pending}
        onClick={() => { if (window.confirm("Disconnect the bank account? Future bills won't be paid automatically.")) start(async () => { const r = await disconnectBankAction(); setMsg(r.ok ? r.message ?? "" : r.error); }); }}>
        Disconnect bank account
      </button>
      {msg && <span role="status" className="text-sm text-muted">{msg}</span>}
    </span>
  );
}

export function RetryBankButton({ id }: { id: number }) {
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <span className="flex flex-wrap items-center gap-3">
      <button type="button" className="btn btn-red" disabled={pending} onClick={() => start(async () => { const r = await retryBankPaymentAction(id); setMsg(r.ok ? r.message ?? "" : r.error); })}>
        {pending ? "Starting…" : "Pay from connected bank"}
      </button>
      {msg && <span role="status" className="text-sm text-muted">{msg}</span>}
    </span>
  );
}

export function TurnOffAutopayButton() {
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <span className="flex flex-wrap items-center gap-3">
      <button type="button" className="btn btn-sm" disabled={pending}
        onClick={() => { if (window.confirm("Turn off autopay? You'll need to pay each bill yourself.")) start(async () => { const r = await turnOffCardAutopayAction(); setMsg(r.ok ? r.message ?? "" : r.error); }); }}>
        Turn off autopay
      </button>
      {msg && <span role="status" className="text-sm text-muted">{msg}</span>}
    </span>
  );
}

/** The owner changes the saved card on Stripe's own page. */
export function ManageCardButton() {
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <span className="flex flex-wrap items-center gap-3">
      <button type="button" className="btn btn-sm" disabled={pending}
        onClick={() => start(async () => { const r = await openCardPortalAction(); if (r.ok && r.message) window.location.href = r.message; else setMsg(r.ok ? "" : r.error); })}>
        {pending ? "Opening…" : "Change card on Stripe"}
      </button>
      {msg && <span role="alert" className="text-sm text-signal">{msg}</span>}
    </span>
  );
}
