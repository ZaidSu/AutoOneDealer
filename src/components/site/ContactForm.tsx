"use client";
// Opens the visitor's own email app with their message filled in. No server or database involved.
import { useState } from "react";
import Link from "next/link";

const TOPICS = ["Custom business software", "AI email and text assistants", "A website", "Integrations and automation", "Something else"];

export default function ContactForm({ email }: { email: string }) {
  const [status, setStatus] = useState("");

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const get = (k: string) => String(d.get(k) ?? "").trim();
    const subject = `Website inquiry from ${get("name")}${get("company") ? ` (${get("company")})` : ""}`;
    const body = [`Name: ${get("name")}`, `Business: ${get("company") || "-"}`, `Email: ${get("email")}`, `Phone: ${get("phone") || "-"}`, `Interested in: ${get("topic")}`, "", get("message")].join("\n");
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setStatus(`Your email app should open with your message ready to send. If it doesn\u2019t, email us directly at ${email}.`);
  }

  return (
    <form onSubmit={submit} className="card grid gap-3.5 !p-7">
      <div className="grid gap-3.5 sm:grid-cols-2">
        <label className="field !text-[15px]">Your name<input name="name" required autoComplete="name" className="input" /></label>
        <label className="field !text-[15px]">Business name<input name="company" autoComplete="organization" className="input" /></label>
      </div>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <label className="field !text-[15px]">Email<input name="email" type="email" required autoComplete="email" className="input" /></label>
        <label className="field !text-[15px]">Phone (optional)<input name="phone" type="tel" autoComplete="tel" className="input" /></label>
      </div>
      <label className="field !text-[15px]">I&apos;m interested in
        <select name="topic" className="input">{TOPICS.map((t) => <option key={t}>{t}</option>)}</select>
      </label>
      <label className="field !text-[15px]">Message<textarea name="message" rows={4} required className="input" /></label>
      <button type="submit" className="btn btn-primary !h-12">Send message</button>
      {status && <p role="status" className="font-semibold text-go">{status}</p>}
      <p className="text-sm text-muted">
        By contacting us you agree to our <Link href="/privacy" className="underline">Privacy Policy</Link> and <Link href="/terms" className="underline">Terms of Service</Link>. We only use your details to reply to you.
      </p>
    </form>
  );
}
