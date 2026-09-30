// ADF (Auto-lead Data Format): the XML lead standard used by Edmunds, CarGurus, Autotrader and others.
// No project imports (unit tested directly).
import { normalizePhone } from "./contact.ts";
import { decodeEntities } from "./html.ts";

export function containsAdf(text: string) {
  return /<adf[\s>]/i.test(text);
}

function block(xml: string, name: string): string | null {
  const match = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return match ? match[1] : null;
}

function value(xml: string | null, name: string, attr?: string): string | null {
  if (!xml) return null;
  const pattern = new RegExp(`<${name}\\b([^>]*)>([\\s\\S]*?)</${name}>`, "gi");
  for (const match of xml.matchAll(pattern)) {
    if (attr && !match[1].includes(attr)) continue;
    const text = decodeEntities(match[2].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim();
    if (text) return text;
  }
  return null;
}

export type AdfLead = {
  name: string | null;
  phone: string | null;
  email: string | null;
  location: string | null;
  vehicle: string | null;
  vin: string | null;
  stock: string | null;
  type: string | null;
  comments: string | null;
  provider: string | null;
};

export function parseAdf(raw: string): AdfLead {
  const xml = raw.slice(raw.search(/<adf[\s>]/i));
  const contact = block(block(xml, "customer") ?? xml, "contact");
  const vehicle = block(xml, "vehicle");
  const first = value(contact, "name", 'part="first"');
  const last = value(contact, "name", 'part="last"');
  const full = value(contact, "name", 'part="full"') ?? value(contact, "name");
  const city = value(contact, "city");
  const region = value(contact, "regioncode");
  const car = [value(vehicle, "year"), value(vehicle, "make"), value(vehicle, "model")].filter(Boolean).join(" ");
  const comments = value(block(xml, "customer"), "comments");

  return {
    name: [first, last].filter(Boolean).join(" ") || full,
    phone: normalizePhone(value(contact, "phone")),
    email: value(contact, "email")?.toLowerCase() ?? null,
    location: city ? [city, region].filter(Boolean).join(", ") : null,
    vehicle: car || null,
    vin: value(vehicle, "vin"),
    stock: value(vehicle, "stock"),
    type: value(xml, "type"),
    comments: comments ? comments.replace(/\n{3,}/g, "\n\n").slice(0, 1500) : null,
    provider: value(block(xml, "provider"), "name") ?? value(xml, "service"),
  };
}
