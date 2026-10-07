"use client";
import { useRouter } from "next/navigation";
import { PREVIEW_COOKIE } from "@/lib/preview/constants";

// Preview mode's sign-in: nothing is connected yet, so this just opens the app on this browser.
export default function PreviewSignIn({ google }: { google: React.ReactNode }) {
  const router = useRouter();
  return (
    <>
      <button type="button"
        onClick={() => {
          document.cookie = `${PREVIEW_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
          router.push("/invoices");
        }}
        className="flex h-[50px] w-full items-center justify-center gap-2.5 rounded-[10px] border border-[#cbd3de] bg-white text-base font-bold hover:border-ink hover:bg-paper">
        {google}
        Continue with Google
      </button>
      <p className="mt-4 rounded-lg border border-[#f0d9a8] bg-accent-soft px-3.5 py-3 text-[13px] text-[#6b4a00]">
        Preview mode: Google sign-in and the database aren&rsquo;t connected yet, so this opens the app on this browser only. What you enter stays on this device.
      </p>
    </>
  );
}
