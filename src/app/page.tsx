import Link from "next/link";
import ContactForm from "@/components/site/ContactForm";
import SiteFooter from "@/components/site/SiteFooter";
import SiteHeader from "@/components/site/SiteHeader";
import { SITE } from "@/lib/legal/config";

const svg = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className: "size-[22px]" };

const SERVICES = [
  { title: "Custom business software", text: "Dashboards that pull your leads, customers, appointments and reports into one place your whole team can use.",
    icon: <svg {...svg}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 14h3M8 17h6" /></svg> },
  { title: "AI email and text assistants", text: "Fast, friendly replies to new customer inquiries, written in your voice and reviewed by your team before they go out.",
    icon: <svg {...svg}><path d="M4 5h16v11H9l-5 4z" /><path d="M9 10h.01M12 10h.01M15 10h.01" /></svg> },
  { title: "Websites", text: "Quick, mobile-friendly websites that explain what you do and make it easy for customers to reach you.",
    icon: <svg {...svg}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg> },
  { title: "Integrations and automation", text: "Connect the tools you already use, like Gmail, calendars and payments, and stop doing the same steps by hand.",
    icon: <svg {...svg}><path d="M13 3 4 14h7l-1 7 9-11h-7z" /></svg> },
];

const STEPS = [
  { title: "We listen", text: "A short call about how your business runs today and where time gets lost." },
  { title: "We build", text: "We build the first version quickly and adjust it with your team\u2019s feedback." },
  { title: "We launch", text: "We set it up, connect your accounts and show your team how to use it." },
  { title: "We stay", text: "Hosting, updates and support for one clear monthly price." },
];

const FLOW = [
  { title: "A customer reaches out", text: "By email or text, usually asking about a vehicle or an appointment." },
  { title: "The assistant drafts a reply", text: "Written in the business\u2019s voice, using only that business\u2019s information." },
  { title: "The team reviews it", text: "The business checks the draft before it goes out, unless it chooses automatic sending." },
  { title: "The customer stays in control", text: "Replying STOP ends text messages at any time." },
];

const DATA = [
  { title: "Who we text", text: "Only customers who contacted the business or agreed to be contacted, for things like answering a question about a vehicle or confirming an appointment." },
  { title: "Opting out", text: "Anyone can reply STOP at any time to stop text messages, or HELP for help. Message frequency varies, and message and data rates may apply." },
  { title: "Who owns the data", text: "Each business owns its customer information. We do not sell it, and mobile information is not shared with third parties or affiliates for marketing." },
];

const wrap = "mx-auto w-[min(1080px,100%-40px)]";
const sectionHead = (title: string, text: string) => (
  <div className="mb-10 max-w-[640px]">
    <h2 className="mb-2.5 text-[clamp(1.7rem,3.2vw,2.4rem)] font-extrabold leading-[1.15] tracking-tight">{title}</h2>
    <p className="text-muted">{text}</p>
  </div>
);

export default function HomePage() {
  return (
    <div className="bg-white text-[17px]">
      <SiteHeader />
      <main>
        <section className="bg-gradient-to-b from-paper to-white py-[72px] md:py-[88px]">
          <div className={`${wrap} grid items-center gap-9 lg:grid-cols-[1.2fr_0.9fr] lg:gap-14`}>
            <div>
              <h1 className="mb-[18px] text-[clamp(2.2rem,4.2vw,3.3rem)] font-extrabold leading-[1.08] tracking-[-0.03em]">
                Software that does the busywork{" "}
                <span className="bg-[linear-gradient(transparent_62%,rgba(242,165,65,0.45)_62%)]">for local businesses</span>
              </h1>
              <p className="mb-7 max-w-[56ch] text-[1.2rem] text-muted">
                We build custom dashboards, AI assistants that answer customer emails and texts, and clean websites, so your team spends its time with customers instead of inboxes.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/#contact" className="inline-flex items-center rounded-[10px] bg-ink px-[22px] py-[13px] font-bold text-white hover:bg-ink-2">Talk to us</Link>
                <Link href="/#services" className="inline-flex items-center rounded-[10px] border border-line bg-white px-[22px] py-[13px] font-bold hover:border-ink">See what we do</Link>
              </div>
              <ul className="mt-10 flex flex-wrap gap-x-7 gap-y-2.5 text-[15px] font-semibold text-ink-2">
                {["Based in Dallas\u2013Fort Worth", "Built for your business, not off the shelf", "Clear monthly pricing"].map((f) => (
                  <li key={f} className="flex items-center gap-2.5"><span aria-hidden className="size-2 rounded-[2px] bg-accent" />{f}</li>
                ))}
              </ul>
            </div>
            <aside aria-label="How a customer message is handled" className="card !p-[26px] shadow-[0_18px_40px_-22px_rgba(16,35,63,0.35)]">
              <h2 className="mb-[18px] !text-[1.05rem]">How a customer message is handled</h2>
              <ol className="grid gap-[18px]">
                {FLOW.map((s, i) => (
                  <li key={s.title} className="grid grid-cols-[30px_1fr] gap-x-3.5">
                    <span className="row-span-2 grid size-[30px] place-items-center rounded-full bg-accent-soft text-sm font-extrabold text-accent-ink">{i + 1}</span>
                    <strong className="text-[15.5px]">{s.title}</strong>
                    <span className="text-[15px] leading-snug text-muted">{s.text}</span>
                  </li>
                ))}
              </ol>
            </aside>
          </div>
        </section>

        <section id="services" className="py-20">
          <div className={wrap}>
            {sectionHead("What we do", "One partner for the software your business runs on, from the first sketch to keeping it running.")}
            <div className="grid gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
              {SERVICES.map((s) => (
                <article key={s.title} className="card !p-6">
                  <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent-ink">{s.icon}</span>
                  <h3 className="mb-1.5 mt-3.5 text-[1.15rem] font-bold">{s.title}</h3>
                  <p className="text-base text-muted">{s.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="bg-paper py-20">
          <div className={wrap}>
            {sectionHead("How we work", "Simple, and you always know what\u2019s happening and what it costs.")}
            <ol className="grid gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="border-t-[3px] border-ink pt-4">
                  <span className="font-extrabold text-accent-ink">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="my-1.5 text-[1.1rem] font-bold">{s.title}</h3>
                  <p className="text-base text-muted">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="data" className="py-20">
          <div className={wrap}>
            {sectionHead("Your data and text messages", "Plain answers about who we message, who owns the information, and how people can opt out.")}
            <div className="grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
              {DATA.map((d) => (
                <article key={d.title} className="card !p-6">
                  <h3 className="mb-1.5 text-[1.15rem] font-bold">{d.title}</h3>
                  <p className="text-base text-muted">{d.text}</p>
                </article>
              ))}
            </div>
            <p className="mt-7 text-muted">
              Read the full <Link href="/privacy" className="underline">Privacy Policy</Link>, <Link href="/terms" className="underline">Terms of Service</Link> and <Link href="/terms#sms" className="underline">SMS Terms</Link>.
            </p>
          </div>
        </section>

        <section id="contact" className="pb-20">
          <div className={`${wrap} grid items-start gap-8 md:grid-cols-[1fr_1.2fr]`}>
            <div>
              {sectionHead("Contact us", "Tell us a little about your business and what you\u2019d like to fix. We usually reply within one business day.")}
              <dl className="-mt-4 grid gap-3.5">
                <div><dt className="text-sm font-semibold text-muted">Email</dt><dd className="font-bold"><a href={`mailto:${SITE.email}`} className="underline">{SITE.email}</a></dd></div>
                <div><dt className="text-sm font-semibold text-muted">Location</dt><dd className="font-bold">{SITE.location}</dd></div>
                <div><dt className="text-sm font-semibold text-muted">Hours</dt><dd className="font-bold">{SITE.hours}</dd></div>
              </dl>
            </div>
            <ContactForm email={SITE.email} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
