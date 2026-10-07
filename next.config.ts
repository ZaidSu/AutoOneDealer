import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Invoice, receipt and certificate uploads go through server actions. Vercel allows about 4.5 MB per request.
    serverActions: { bodySizeLimit: "4.5mb" },
  },
  // Old pages that are now part of Invoices.
  async redirects() {
    return ["/sales", "/purchases", "/quick-add", "/ledger"].map((source) => ({ source, destination: "/invoices", permanent: false }));
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
