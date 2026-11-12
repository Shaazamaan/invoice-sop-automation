"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// A minimal in-memory stand-in for the Google services the script uses.
function makeWorld(messages) {
  const sheets = {};
  const makeSheet = () => {
    const rows = [];
    return {
      rows,
      getLastRow: () => rows.length,
      appendRow: (r) => { rows.push(r.slice()); },
      setFrozenRows: () => {},
      getDataRange: () => ({ getValues: () => rows.map((r) => r.slice()) }),
      getRange: (r, c) => ({ setValue: (v) => { while (rows[r - 1].length < c) rows[r - 1].push(""); rows[r - 1][c - 1] = v; } }),
    };
  };
  const ss = { getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => (sheets[n] = makeSheet()) };
  const sent = [];
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    GmailApp: { search: () => [{ getMessages: () => messages }] },
    MailApp: { sendEmail: (to, subject, body) => sent.push({ to, subject, body }) },
    Date, Math, String, Number, RegExp,
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "connectors", "google-apps-script", "Code.gs"), "utf8"), ctx);
  return { ctx, sheets, sent };
}

const msg = (id, from, subject, body, date, files = ["invoice.pdf"]) => ({
  getId: () => id, getFrom: () => from, getSubject: () => subject, getPlainBody: () => body, getDate: () => date,
  getAttachments: () => files.map((n) => ({ getName: () => n })),
});

const NOV10 = new Date(2026, 10, 10, 9, 0);

test("extracts invoice number and amount from email text", () => {
  const { ctx } = makeWorld([]);
  assert.equal(ctx.extractInvoiceNumber("Invoice No: INV-2026/114 attached"), "INV-2026/114");
  assert.equal(ctx.extractInvoiceNumber("Your invoice is attached"), "");
  assert.equal(ctx.extractAmount("Subtotal ₹1,000.00\nGrand Total: ₹1,180.00"), "₹1,180.00");
  assert.equal(ctx.extractAmount("Sub-total: ₹900\nTotal: ₹1,062"), "₹1,062");
  assert.equal(ctx.extractAmount("Please pay Rs. 4500 by Friday"), "Rs. 4500");
  assert.equal(ctx.extractAmount("no money here"), "");
});

test("logs each invoice email once, skips emails without attachments", () => {
  const messages = [
    msg("m1", "Acme Billing <billing@acme.in>", "Invoice INV-101", "Total: ₹2,360.00", new Date(2026, 10, 3)),
    msg("m2", "someone@acme.in", "Re: invoice", "thanks", new Date(2026, 10, 4), []),
  ];
  const { ctx, sheets } = makeWorld(messages);
  assert.equal(ctx.logInvoices(), 1);
  assert.equal(ctx.logInvoices(), 0); // second run adds nothing
  const rows = sheets.Invoices.rows;
  assert.equal(rows.length, 2); // header + one invoice
  assert.equal(rows[1][4], "INV-101");
  assert.equal(rows[1][5], "₹2,360.00");
  assert.equal(rows[1][9], "Needs approval");
});

test("email text that looks like a formula is neutralised", () => {
  const { ctx, sheets } = makeWorld([msg("m9", "x@evil.test", "=HYPERLINK(\"http://bad\")", "invoice", new Date(2026, 10, 3))]);
  ctx.logInvoices();
  assert.equal(sheets.Invoices.rows[1][3].charAt(0), "'");
});

test("chases only vendors whose invoice is missing and due", () => {
  const { ctx, sheets, sent } = makeWorld([msg("m1", "billing@acme.in", "Invoice INV-101", "Total ₹100", new Date(2026, 10, 3))]);
  ctx.logInvoices();
  sheets.Expected.appendRow(["Acme", "acme.in", "owner1@example.com", 5, "yes", "", ""]);        // received
  sheets.Expected.appendRow(["Cloud Host", "cloudhost.com", "owner2@example.com", 5, "yes", "", ""]); // missing, due
  sheets.Expected.appendRow(["Late Co", "lateco.com", "owner3@example.com", 25, "yes", "", ""]);   // not due yet
  sheets.Expected.appendRow(["Paused", "paused.com", "owner4@example.com", 1, "no", "", ""]);      // inactive
  ctx.CONFIG.SEND_REMINDERS = true;
  assert.equal(ctx.chaseMissing(NOV10), 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "owner2@example.com");
  assert.match(sent[0].subject, /Cloud Host/);
  assert.equal(sheets.Expected.rows[1][6], "Received this month");
  assert.equal(sheets.Expected.rows[3][6], "Not due yet");
  // Running again the next day does not send a second reminder.
  assert.equal(ctx.chaseMissing(new Date(2026, 10, 11, 9, 0)), 0);
  assert.equal(sent.length, 1);
  // After the wait period it reminds again.
  assert.equal(ctx.chaseMissing(new Date(2026, 10, 13, 9, 0)), 1);
  assert.equal(sent.length, 2);
});

test("dry run logs the reminder and sends no email", () => {
  const { ctx, sheets, sent } = makeWorld([]);
  ctx.logInvoices();
  sheets.Expected.appendRow(["Cloud Host", "cloudhost.com", "owner2@example.com", 5, "yes", "", ""]);
  assert.equal(ctx.chaseMissing(NOV10), 1);
  assert.equal(sent.length, 0);
  assert.match(sheets["Reminder log"].rows[1][3], /Dry run/);
});

test("a bad owner email is flagged, not emailed", () => {
  const { ctx, sheets, sent } = makeWorld([]);
  ctx.logInvoices();
  sheets.Expected.appendRow(["Cloud Host", "cloudhost.com", "not-an-email", 5, "yes", "", ""]);
  ctx.CONFIG.SEND_REMINDERS = true;
  assert.equal(ctx.chaseMissing(NOV10), 0);
  assert.equal(sent.length, 0);
  assert.match(sheets.Expected.rows[1][6], /Check this row/);
});
