import assert from "node:assert/strict";
import { test } from "node:test";
import { parseInvoiceLines } from "../../src/lib/invoice-parse.ts";

// The printed lines of a purchase order whose UPC is split in two (9 digits in the row, 3 on the line under it), over two pages.
const PO = [
  "BWWI", "Purchase Order",
  "VENDOR  SHIP TO  PO NO. 8355", "marketplace wholesale llc  BWWI  DATE 06/25/2026",
  "PRODUCT  DESCRIPTION  UPC  QTY  PRICE  TOTAL",
  "Streaming:B09B93Z  Amazon Echo Dot 5th Gen 2022- Smart  840080527  2  37.00  74.00",
  "DG4  Speaker with Alexa Deep Sea Blue  079",
  "MFHP4LL/A  Apple - AirPods Pro 3, Wireless Active  195950543  1  167.00  167.00",
  "Noise Cancelling Earbuds with Heart  698",
  "Rate Sensing Feature - White",
  "ALL SALES ARE FINAL", "Page 1 of 2",
  "Laptops:FA607NUQ-  ASUS TUF Gaming A16 Gaming Laptop,  199291406  4  809.00  3,236.00",
  "WS73  16” WUXGA 144Hz Display, AMD  667",
  "Wi-Fi 6, 3 Months of Microsoft 365",
  "SUBTOTAL  3,477.00", "TOTAL  3,477.00", "Approved By", "Date", "Page 2 of 2",
];

test("a purchase order is read: number, date, customer, items with the last 4 of the UPC, and the total", () => {
  const p = parseInvoiceLines(PO);
  assert.equal(p.kind, "po");
  assert.equal(p.invoiceNo, "8355");
  assert.equal(p.date, "2026-06-25");
  assert.equal(p.customer, "BWWI");
  assert.equal(p.total, 3477);
  assert.deepEqual(p.lines.map((l) => [l.qty, l.price, l.upc]), [[2, 37, "7079"], [1, 167, "3698"], [4, 809, "6667"]]);
});

test("a purchase order without a UPC column still reads its items", () => {
  const p = parseInvoiceLines([
    "BWWI", "Purchase Order", "VENDOR  SHIP TO  P.O. NO. 8046", "marketplace wholesale llc  BWWI  DATE 02/04/2026",
    "PRODUCT  DESCRIPTION  QTY  PRICE  TOTAL",
    "model:MXP93LL/A  Apple AirPods 4 with Active Noise  8  123.00  984.00", "Cancellation",
    "TOTAL  $984.00",
  ]);
  assert.equal(p.invoiceNo, "8046");
  assert.deepEqual(p.lines.map((l) => [l.qty, l.price, l.upc]), [[8, 123, ""]]);
  assert.equal(p.total, 984);
});
