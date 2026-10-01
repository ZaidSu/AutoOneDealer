import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Legal", robots: { index: true, follow: true } };

export default function LegalIndex() {
  return (
    <LegalPage title="Legal">
      <ul className="mt-6 space-y-3 text-lg">
        <li><Link className="font-semibold text-signal hover:underline" href="/privacy">Privacy Policy</Link> <span className="text-muted">for customers who text or email us</span></li>
        <li><Link className="font-semibold text-signal hover:underline" href="/sms-terms">Text Message Terms</Link> <span className="text-muted">how our texting works, STOP and HELP</span></li>
        <li><Link className="font-semibold text-signal hover:underline" href="/email-terms">Email Terms</Link> <span className="text-muted">how our emails work and how to unsubscribe</span></li>
        <li><Link className="font-semibold text-signal hover:underline" href="/terms">AutoDash Service Agreement</Link> <span className="text-muted">between the dealership and its software provider, including billing</span></li>
      </ul>
    </LegalPage>
  );
}
