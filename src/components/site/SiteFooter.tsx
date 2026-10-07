import Link from "next/link";
import { SITE } from "@/lib/legal/config";

export default function SiteFooter() {
  const link = "text-[#c9d2de] hover:text-white hover:underline";
  return (
    <footer className="bg-ink py-12 text-[15px] text-[#c9d2de]">
      <div className="mx-auto grid w-[min(1080px,100%-40px)] gap-7 md:grid-cols-[2fr_1fr_1fr]">
        <div>
          <strong className="text-white">{SITE.company}</strong>
          <p className="mt-1">Custom software, AI assistants and websites for local businesses. Based in the Dallas&ndash;Fort Worth area, Texas.</p>
        </div>
        <div>
          <strong className="text-white">Company</strong>
          <ul className="mt-2 grid gap-1.5">
            <li><Link href="/#services" className={link}>Services</Link></li>
            <li><Link href="/#contact" className={link}>Contact</Link></li>
            <li><Link href="/login" className={link}>Sign in</Link></li>
          </ul>
        </div>
        <div>
          <strong className="text-white">Legal</strong>
          <ul className="mt-2 grid gap-1.5">
            <li><Link href="/privacy" className={link}>Privacy Policy</Link></li>
            <li><Link href="/terms" className={link}>Terms of Service</Link></li>
            <li><Link href="/terms#sms" className={link}>SMS Terms</Link></li>
          </ul>
        </div>
        <p className="border-t border-[#24395a] pt-5 text-[13px] text-[#94a3b8] md:col-span-3">
          &copy; {new Date().getFullYear()} {SITE.company}. All rights reserved. Contact: <a href={`mailto:${SITE.email}`} className={link}>{SITE.email}</a>
        </p>
      </div>
    </footer>
  );
}
