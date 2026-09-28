"use client";
// Gmail's unread count loads after the page, so the Dashboard never waits on Gmail.
import { useEffect, useState } from "react";

export default function UnreadCount() {
  const [value, setValue] = useState<string>("…");
  useEffect(() => {
    let alive = true;
    fetch("/api/inbox/unread").then((r) => r.json()).then((d) => {
      if (alive) setValue(typeof d.unread === "number" ? (d.unread >= 1000 ? "999+" : d.unread.toLocaleString()) : "—");
    }).catch(() => alive && setValue("—"));
    return () => { alive = false; };
  }, []);
  return <>{value}</>;
}
