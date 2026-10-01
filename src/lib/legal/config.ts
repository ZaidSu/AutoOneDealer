// Who's who in the legal pages. Change these in Vercel (all optional) instead of editing the pages.
// Pure, no project imports.
export const LEGAL = {
  /** The dealership: the sender of the texts and emails. */
  dealer: process.env.DEALERSHIP_NAME || "Auto One Motors",
  dealerLegal: process.env.DEALER_LEGAL_NAME || "Auto One Motors LLC",
  address: process.env.DEALER_ADDRESS || "3929 Forest Ln, Garland, TX 75042",
  phone: process.env.DEALER_PHONE || "(469) 888-0803",
  email: process.env.DEALER_EMAIL || "txautoone@gmail.com",
  website: "autoonemotorstx.com",
  /** Whoever provides and bills for AutoDash. */
  provider: process.env.PROVIDER_NAME || "High Level Technologies",
  providerEmail: process.env.PROVIDER_EMAIL || "",
  /** Bump the version when the Service Agreement changes in a way that needs the owner to accept it again. */
  agreementVersion: "2026-10-01-2",
  updated: "October 1, 2026",
  state: "Texas",
  county: "Dallas County, Texas",
};

/** The footer added to every AI email, so each one says who sent it and how to stop. */
export const EMAIL_FOOTER = `--\n${LEGAL.dealer} | ${LEGAL.address} | ${LEGAL.phone}\nDon't want emails from us? Just reply "unsubscribe" and we'll stop.`;
