// Self-hosted fonts: no request to Google on page load. Barlow for text, Barlow Condensed for titles and numbers.
import localFont from "next/font/local";

export const barlow = localFont({
  src: [
    { path: "../../node_modules/@fontsource/barlow/files/barlow-latin-400-normal.woff2", weight: "400" },
    { path: "../../node_modules/@fontsource/barlow/files/barlow-latin-500-normal.woff2", weight: "500" },
    { path: "../../node_modules/@fontsource/barlow/files/barlow-latin-600-normal.woff2", weight: "600" },
    { path: "../../node_modules/@fontsource/barlow/files/barlow-latin-700-normal.woff2", weight: "700" },
  ],
  variable: "--font-barlow",
  display: "swap",
});

export const barlowCondensed = localFont({
  src: [{ path: "../../node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff2", weight: "600" }],
  variable: "--font-condensed",
  display: "swap",
});
