"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const core = require("../src/core");
const { parseEml } = require("../src/eml");

const EXPECTED = [
  { vendor: "Acme", match: "acme.example", owner: "o1@co.example", dueDay: 5 },
  { vendor: "Cloud Host", match: "cloudhost.example", owner: "o2@co.example", dueDay: 5 },
  { vendor: "Late Co", match: "lateco.example", owner: "o3@co.example", dueDay: 25 },
];
const mail = (id, from, subject, body, day, files = ["invoice.pdf"]) => ({ id, from, subject, body, date: new Date(2026, 10, day), attachments: files });
const D = (day) => new Date(2026, 10, day, 9);

test("parses invoice number and amount, ignoring the subtotal", () => {
  assert.equal(core.extractInvoiceNumber("Invoice No: INV-2026/114 attached"), "INV-2026/114");
  assert.equal(core.extractInvoiceNumber("Your invoice is attached"), "");
  assert.equal(core.extractAmount("Subtotal ₹1,000.00\nGrand Total: ₹1,180.00"), "₹1,180.00");
  assert.equal(core.extractAmount("Sub-total: ₹900\nTotal: ₹1,062"), "₹1,062");
  assert.equal(core.extractAmount("nothing"), "");
});

test("logs an invoice once and skips non-invoices", () => {
  const s = core.createState(EXPECTED);
  assert.equal(core.ingest(s, mail("a", "billing@acme.example", "Invoice INV-1", "Total ₹100", 3)).logged, true);
  assert.equal(core.ingest(s, mail("a", "billing@acme.example", "Invoice INV-1", "Total ₹100", 3)).reason, "Already logged");
  assert.equal(core.ingest(s, mail("b", "x@acme.example", "Re: invoice", "hi", 3, [])).reason, "No attachment");
  assert.equal(core.ingest(s, mail("c", "x@acme.example", "Team photo", "see pic", 3, ["photo.jpg"])).reason, "Does not look like an invoice");
  assert.equal(s.invoices.length, 1);
  assert.equal(s.invoices[0].status, "Needs approval");
});

test("chases only what is missing and due, and does not nag", () => {
  const s = core.createState(EXPECTED);
  core.ingest(s, mail("a", "billing@acme.example", "Invoice INV-1", "Total ₹100", 3));
  const first = core.chase(s, D(10));
  assert.deepEqual(first.map((r) => r.to), ["o2@co.example"]);
  assert.deepEqual(s.expected.map((e) => e.result), ["Received", "Missing, owner reminded", "Not due yet"]);
  assert.equal(core.chase(s, D(11)).length, 0);
  assert.equal(core.chase(s, D(13)).length, 1);
  core.ingest(s, mail("d", "ar@cloudhost.example", "Invoice CH-9", "Total ₹50", 14));
  assert.equal(core.chase(s, D(16)).length, 0);
  assert.equal(s.expected[1].result, "Received");
});

test("last month's invoice does not count for this month", () => {
  const s = core.createState(EXPECTED);
  core.ingest(s, { id: "old", from: "billing@acme.example", subject: "Invoice INV-0", body: "", date: new Date(2026, 9, 3), attachments: ["i.pdf"] });
  assert.deepEqual(core.chase(s, D(10)).map((r) => r.vendor), ["Acme", "Cloud Host"]);
});

test("bad rows are flagged and never emailed; CSV neutralises formulas", () => {
  const s = core.createState([{ vendor: "X", match: "x.example", owner: "not-an-email", dueDay: 5 }]);
  assert.equal(core.chase(s, D(10)).length, 0);
  assert.equal(s.expected[0].result, "Check this row");
  core.ingest(s, mail("f", "evil@x.example", '=HYPERLINK("http://bad")', "invoice", 3));
  assert.match(core.toCsv(s), /"'=HYPERLINK/);
});

test("reads a real .eml file: headers, body and attachment name", () => {
  const e = parseEml(fs.readFileSync(path.join(__dirname, "..", "samples", "inbox", "01-kochi-cloud-invoice.eml"), "utf8"));
  assert.equal(e.id, "<inv-1042@kochicloud.example>");
  assert.match(e.from, /billing@kochicloud\.example/);
  assert.deepEqual(e.attachments, ["INV-1042.pdf"]);
  assert.equal(core.extractAmount(e.subject + "\n" + e.body), "₹11,800.00");
});

test("command-line run logs the sample inbox and drafts one reminder", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "inv-"));
  const run = () => execFileSync("node", [path.join(__dirname, "..", "src", "cli.js"), "--today", "2026-11-10", "--out", out], { cwd: path.join(__dirname, ".."), encoding: "utf8" });
  const first = run();
  assert.match(first, /New invoices logged: 1/);
  assert.match(first, /Backwater Courier: Missing, owner reminded/);
  assert.match(fs.readFileSync(path.join(out, "reminders.txt"), "utf8"), /To: arjun@yourcompany\.example/);
  assert.match(run(), /New invoices logged: 0 \(total 1\)/); // second run does not double-log
});
