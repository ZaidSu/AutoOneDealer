// Local performance testing only: ~7,000 leads across ~5,000 customers over 12 months.
import { db } from "../../lib/db/index";
import { customerKey } from "../../lib/customers";
const sql = db()!;
await sql`delete from leads`;
const providers = ["Cars.com", "Cars.com", "Cars.com", "CarsForSale", "Edmunds", "CarGurus", "NCU (myncu.com)"];
const cars = ["2014 Cadillac CTS", "2019 Toyota Camry", "2018 Honda Civic", "2020 Ford F-150", "2017 BMW 3 Series", "2021 Nissan Altima"];
const states = ["Dallas, TX", "Plano, TX", "Garland, TX", "Shreveport, LA", "Tulsa, OK", "Frisco, TX", "Houston, TX"];
const rows = [];
for (let i = 0; i < 7000; i++) {
  const person = Math.floor(Math.random() * 5000);
  const phone = String(4690000000 + person);
  const app = Math.random() < 0.15;
  const lead = { phone, email: null };
  rows.push({
    message_id: `seed${i}`, received_at: new Date(Date.now() - Math.random() * 365 * 86400000), subject: app ? "New Loan App" : "Lead",
    kind: app ? "application" : "inquiry", provider: providers[i % providers.length], type: app ? "Credit application" : "Phone call",
    name: `Customer ${person}`, phone, location: states[person % states.length], vehicle: cars[i % cars.length],
    comments: "This is a notification that you received a consumer phone call via Cars.com website or app. ".repeat(3),
    loan_amount: app ? 12000 + (i % 20) * 1000 : null, customer_key: customerKey(lead),
  });
}
for (let i = 0; i < rows.length; i += 1000) await sql`insert into leads ${sql(rows.slice(i, i + 1000))}`;
console.log("seeded", rows.length);
await sql.end();
