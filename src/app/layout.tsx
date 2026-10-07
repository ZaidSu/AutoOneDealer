import type { Metadata, Viewport } from "next";
import { manrope } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Marketplace Wholesale LLC | Software Services", template: "%s | Marketplace Wholesale LLC" },
  description: "Marketplace Wholesale LLC builds custom software, AI email and text assistants, and websites for local businesses in the Dallas\u2013Fort Worth area.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#10233f" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={manrope.variable}>
      <body className="min-h-dvh font-sans text-[15px] leading-relaxed">{children}</body>
    </html>
  );
}
