"use client";
// Shows the last data this browser saw instantly (even after a refresh), then quietly checks the server for
// anything newer and swaps it in. Anything staff change calls notifyChanged(), so every open page refreshes.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const PREFIX = "ad:v1:";
const memory = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();
const lastLoad = new Map<string, number>();
const CHANGED = "autodash:changed";

export function notifyChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGED));
}

export function clearSavedData() {
  memory.clear();
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("ad:")) localStorage.removeItem(k);
  } catch { /* storage unavailable */ }
}

function readSaved<T>(url: string): T | undefined {
  if (memory.has(url)) return memory.get(url) as T;
  try {
    const raw = localStorage.getItem(PREFIX + url);
    if (raw) { const value = JSON.parse(raw) as T; memory.set(url, value); return value; }
  } catch { /* ignore */ }
  return undefined;
}

function save(url: string, value: unknown) {
  memory.set(url, value);
  try { localStorage.setItem(PREFIX + url, JSON.stringify(value)); }
  catch { clearSavedData(); memory.set(url, value); } // storage full: start fresh
}

/** Fetch once even if several parts of the page ask at the same time. */
function fetchJson(url: string): Promise<unknown> {
  const existing = inflight.get(url);
  if (existing) return existing;
  const p = fetch(url, { cache: "no-store", credentials: "same-origin" })
    .then(async (r) => {
      if (r.status === 401) {
        clearSavedData();
        window.location.href = "/login?error=expired";
        throw new Error("signed out");
      }
      const body = await r.json().catch(() => null);
      if (!r.ok) throw new Error(body?.error || `The server answered ${r.status}`);
      save(url, body);
      lastLoad.set(url, Date.now());
      return body;
    })
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

/** Load data for a page into the browser's saved copy ahead of time (e.g. on hover). */
export function preloadData(url: string) {
  if (Date.now() - (lastLoad.get(url) ?? 0) > 15_000) void fetchJson(url).catch(() => undefined);
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function useLive<T>(url: string, { every = 60_000 } = {}) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const current = useRef(url);
  current.current = url;

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const value = (await fetchJson(url)) as T;
      if (current.current === url) { setData(value); setError(null); }
    } catch (e) {
      if (current.current === url) setError(e instanceof Error ? e.message : "Couldn't reach the server");
    } finally {
      if (current.current === url) setRefreshing(false);
    }
  }, [url]);

  // Before the first paint: show the saved copy, then check for newer data.
  useIsoLayoutEffect(() => {
    setData(readSaved<T>(url));
    void load();
  }, [url, load]);

  useEffect(() => {
    const onChanged = () => void load();
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - (lastLoad.get(url) ?? 0) > 10_000) void load();
    };
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, every);
    window.addEventListener(CHANGED, onChanged);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener(CHANGED, onChanged);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [url, load, every]);

  return { data, error, refreshing, reload: load };
}
