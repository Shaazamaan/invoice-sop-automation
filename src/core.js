/**
 * Invoice tracker core: log invoice emails, find missing invoices, draft reminders.
 * Plain JavaScript with no dependencies. Runs in Node (the CLI) and in the browser (the demo page).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.InvoiceCore = factory();
})(this, function () {
  "use strict";

  var MONEY = "(?:₹|Rs\\.?|INR|USD|\\$|€|£)\\s?[\\d,]+(?:\\.\\d{1,2})?";

  function extractInvoiceNumber(text) {
    var re = /\b(?:invoice|inv|bill)\s*(?:no\.?|number|num|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9\/-]{2,})/gi, m;
    while ((m = re.exec(String(text)))) { if (/\d/.test(m[1])) return m[1]; }
    return "";
  }

  function extractAmount(text) {
    var t = String(text);
    var total = new RegExp("(?<!sub[\\s-]?)\\b(?:grand total|total due|amount due|total amount|total)\\D{0,20}?(" + MONEY + ")", "i").exec(t);
    if (total) return total[1];
    var any = new RegExp(MONEY, "i").exec(t);
    return any ? any[0] : "";
  }

  function matchSender(from, match) {
    var f = String(from).toLowerCase();
    return String(match).toLowerCase().split(",").some(function (p) { p = p.trim(); return p && f.indexOf(p) !== -1; });
  }

  function isEmail(s) { return /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(String(s)); }
  function daysBetween(a, b) { return Math.floor((b.getTime() - a.getTime()) / 86400000); }

  /** expected: [{ vendor, match, owner, dueDay, active }] */
  function createState(expected) {
    return {
      invoices: [],
      log: [],
      expected: (expected || []).map(function (e) {
        return { vendor: String(e.vendor).trim(), match: String(e.match).trim(), owner: String(e.owner).trim(), dueDay: Number(e.dueDay), active: e.active !== false, lastReminded: e.lastReminded || null, result: "" };
      })
    };
  }

  /**
   * email: { id, from, subject, body, date: Date, attachments: [file names] }
   * Returns { logged: true, row } or { logged: false, reason }.
   */
  function ingest(state, email, now) {
    if (state.invoices.some(function (r) { return r.id === email.id; })) return { logged: false, reason: "Already logged" };
    var files = email.attachments || [];
    if (!files.length) return { logged: false, reason: "No attachment" };
    var text = email.subject + "\n" + email.body;
    if (!/invoice|bill|receipt/i.test(text + "\n" + files.join(" "))) return { logged: false, reason: "Does not look like an invoice" };
    var row = {
      id: email.id, loggedAt: now || new Date(), date: email.date, from: email.from, subject: email.subject,
      invoiceNo: extractInvoiceNumber(text), amount: extractAmount(text), attachments: files.slice(), status: "Needs approval"
    };
    state.invoices.push(row);
    return { logged: true, row: row };
  }

  function hasInvoiceThisMonth(state, match, now) {
    return state.invoices.some(function (r) {
      return r.date instanceof Date && r.date.getFullYear() === now.getFullYear() && r.date.getMonth() === now.getMonth() && matchSender(r.from, match);
    });
  }

  /** Updates each expected row's result and returns the reminders that are due now. */
  function chase(state, now, options) {
    var every = (options && options.remindEveryDays) || 3, out = [];
    state.expected.forEach(function (e) {
      if (!e.active) { e.result = "Paused"; return; }
      if (!isEmail(e.owner) || !(e.dueDay >= 1 && e.dueDay <= 31)) { e.result = "Check this row"; return; }
      if (hasInvoiceThisMonth(state, e.match, now)) { e.result = "Received"; return; }
      if (now.getDate() < e.dueDay) { e.result = "Not due yet"; return; }
      if (e.lastReminded && daysBetween(e.lastReminded, now) < every) { e.result = "Missing, reminded recently"; return; }
      var reminder = {
        at: now, vendor: e.vendor, to: e.owner, subject: "Missing invoice: " + e.vendor,
        body: "Hi,\n\nWe have not received this month's invoice from " + e.vendor + ". It was due by day " + e.dueDay +
          ".\n\nPlease ask the vendor to email it with the invoice attached, or forward it if you already have it.\n\nThis is an automated reminder from the invoice tracker."
      };
      e.lastReminded = now; e.result = "Missing, owner reminded";
      state.log.push(reminder); out.push(reminder);
    });
    return out;
  }

  /** Text from emails is untrusted. Stop spreadsheets from reading it as a formula. */
  function safeCell(v) {
    var s = String(v == null ? "" : v);
    return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  }

  function toCsv(state) {
    var q = function (v) { return '"' + safeCell(v).replace(/"/g, '""') + '"'; };
    var lines = [["Email date", "From", "Subject", "Invoice no (guess)", "Amount (guess)", "Attachments", "Status", "Message ID"].map(q).join(",")];
    state.invoices.forEach(function (r) {
      lines.push([r.date instanceof Date ? r.date.toISOString().slice(0, 10) : "", r.from, r.subject, r.invoiceNo, r.amount, r.attachments.join("; "), r.status, r.id].map(q).join(","));
    });
    return lines.join("\n") + "\n";
  }

  return { extractInvoiceNumber: extractInvoiceNumber, extractAmount: extractAmount, matchSender: matchSender, isEmail: isEmail, createState: createState, ingest: ingest, chase: chase, safeCell: safeCell, toCsv: toCsv };
});
