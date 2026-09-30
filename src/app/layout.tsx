import type { Metadata, Viewport } from "next";
import { barlow, barlowCondensed } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AutoDash", template: "%s · AutoDash" },
  description: "Dealership leads, conversations and appointments in one place.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#17191d" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <body className="min-h-dvh font-sans text-[15px] leading-relaxed">{children}</body>
    </html>
  );
}
