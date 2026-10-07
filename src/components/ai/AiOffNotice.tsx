import Link from "next/link";

/** Shown at the top of a page when the AI is switched off for that channel. */
export default function AiOffNotice({ channel }: { channel: "email" | "text" }) {
  const what = channel === "email" ? "emails" : "texts";
  return (
    <p role="status" className="mb-6 rounded-xl border border-lane/40 bg-[#fdf6e3] px-4 py-3 text-[15px]">
      The AI is <b>off</b> for {what}, so it isn&apos;t writing or sending anything by itself.{" "}
      <Link href={`/ai/${channel === "email" ? "emails" : "texts"}/settings`} className="font-semibold text-signal underline">Turn it on in settings</Link>.
    </p>
  );
}
