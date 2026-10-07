// Self-hosted font: no request to Google on page load.
import localFont from "next/font/local";

export const manrope = localFont({
  src: [
    { path: "../../node_modules/@fontsource/manrope/files/manrope-latin-400-normal.woff2", weight: "400" },
    { path: "../../node_modules/@fontsource/manrope/files/manrope-latin-500-normal.woff2", weight: "500" },
    { path: "../../node_modules/@fontsource/manrope/files/manrope-latin-600-normal.woff2", weight: "600" },
    { path: "../../node_modules/@fontsource/manrope/files/manrope-latin-700-normal.woff2", weight: "700" },
    { path: "../../node_modules/@fontsource/manrope/files/manrope-latin-800-normal.woff2", weight: "800" },
  ],
  variable: "--font-manrope",
  display: "swap",
});
