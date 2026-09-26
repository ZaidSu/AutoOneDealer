import Link from "next/link";

// Shown when a page needs the inbox but it isn't available.
export default function GmailState({ status }: { status: "not_connected" | "error" }) {
  const notConnected = status === "not_connected";
  return (
    <section className="max-w-2xl rounded-lg border border-line bg-white p-6">
      <h2 className="text-lg font-semibold">{notConnected ? "Connect the dealership inbox" : "Can't read the inbox right now"}</h2>
      <p className="mt-1 text-muted">
        {notConnected
          ? "This page reads from the dealership Gmail. An owner or manager can connect it in Settings. For now, the connection is saved in the browser that connected it."
          : "Google stopped accepting the inbox connection, or Gmail didn't respond. Reconnecting usually fixes it."}
      </p>
      <Link href="/settings" className="mt-4 inline-flex h-10 items-center rounded-md bg-signal px-4 font-semibold text-white hover:bg-signal-dark">
        {notConnected ? "Go to Settings" : "Reconnect in Settings"}
      </Link>
    </section>
  );
}
