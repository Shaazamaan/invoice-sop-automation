/**
 * Invoice log and chaser for Google Sheets + Gmail.
 *
 * logInvoices()  - finds invoice emails with attachments and logs each one as a row.
 * chaseMissing() - reminds the owner when an expected invoice has not arrived by its due day.
 * setup()        - creates the sheets and installs the hourly and daily triggers.
 *
 * Bound to a Google Sheet: Extensions > Apps Script, paste this file, run setup().
 */

var CONFIG = {
  // Gmail search for invoice emails. Adjust the words to match how your vendors write.
  QUERY: 'has:attachment newer_than:14d {subject:invoice subject:bill subject:receipt filename:invoice}',
  MAX_THREADS: 50,
  // false = reminders are only written to the "Reminder log" sheet (dry run).
  // Set to true when you are ready for real emails to go to owners.
  SEND_REMINDERS: false,
  REMIND_EVERY_DAYS: 3,
  SHEETS: { INVOICES: 'Invoices', EXPECTED: 'Expected', LOG: 'Reminder log' }
};

var HEADERS = {
  INVOICES: ['Logged at', 'Email date', 'From', 'Subject', 'Invoice no (guess)', 'Amount (guess)', 'Attachments', 'Email link', 'Message ID', 'Status', 'Notes'],
  EXPECTED: ['Vendor', 'Sender match (email or domain)', 'Owner email', 'Due day of month', 'Active (yes/no)', 'Last reminded', 'Last result'],
  LOG: ['When', 'Vendor', 'Owner', 'Mode', 'Message']
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Invoices')
    .addItem('Set up sheets and triggers', 'setup')
    .addItem('Log invoice emails now', 'logInvoices')
    .addItem('Chase missing invoices now', 'chaseMissing')
    .addToUi();
}

function setup() {
  var sheets = ensureSheets_(SpreadsheetApp.getActiveSpreadsheet());
  if (sheets.expected.getLastRow() === 1) {
    sheets.expected.appendRow(['Example Vendor Pvt Ltd', 'billing@example.com', Session.getActiveUser().getEmail(), 5, 'yes', '', '']);
  }
  installTriggers_();
}

function installTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === 'logInvoices' || fn === 'chaseMissing') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('logInvoices').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('chaseMissing').timeBased().everyDays(1).atHour(9).create();
}

function ensureSheets_(ss) {
  function get(name, headers) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) { sh.appendRow(headers); sh.setFrozenRows(1); }
    return sh;
  }
  return {
    invoices: get(CONFIG.SHEETS.INVOICES, HEADERS.INVOICES),
    expected: get(CONFIG.SHEETS.EXPECTED, HEADERS.EXPECTED),
    log: get(CONFIG.SHEETS.LOG, HEADERS.LOG)
  };
}

/** Logs every new invoice email (one row per message). Safe to run repeatedly. */
function logInvoices() {
  var sheets = ensureSheets_(SpreadsheetApp.getActiveSpreadsheet());
  var seen = {};
  sheets.invoices.getDataRange().getValues().slice(1).forEach(function (r) { seen[r[8]] = true; });
  var added = 0;
  GmailApp.search(CONFIG.QUERY, 0, CONFIG.MAX_THREADS).forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      var id = msg.getId();
      if (seen[id]) return;
      var files = msg.getAttachments({ includeInlineImages: false });
      if (!files.length) return;
      var text = msg.getSubject() + '\n' + msg.getPlainBody();
      sheets.invoices.appendRow([
        new Date(), msg.getDate(), safeCell(msg.getFrom()), safeCell(msg.getSubject()),
        safeCell(extractInvoiceNumber(text)), safeCell(extractAmount(text)),
        safeCell(files.map(function (f) { return f.getName(); }).join(', ')),
        'https://mail.google.com/mail/u/0/#all/' + id, id, 'Needs approval', ''
      ]);
      seen[id] = true;
      added++;
    });
  });
  return added;
}

/** Reminds owners about expected invoices that have not arrived this month. */
function chaseMissing(now) {
  now = now instanceof Date ? now : new Date();
  var sheets = ensureSheets_(SpreadsheetApp.getActiveSpreadsheet());
  var invoices = sheets.invoices.getDataRange().getValues().slice(1);
  var expected = sheets.expected.getDataRange().getValues();
  var reminded = 0;
  for (var i = 1; i < expected.length; i++) {
    var row = expected[i], vendor = String(row[0]).trim(), match = String(row[1]).trim(), owner = String(row[2]).trim();
    var dueDay = Number(row[3]), active = String(row[4]).trim().toLowerCase() !== 'no';
    if (!vendor || !match || !active) continue;
    var result;
    if (!isEmail(owner) || !(dueDay >= 1 && dueDay <= 31)) {
      result = 'Check this row: owner email or due day is not valid';
    } else if (hasInvoiceThisMonth(invoices, match, now)) {
      result = 'Received this month';
    } else if (now.getDate() < dueDay) {
      result = 'Not due yet';
    } else if (row[5] instanceof Date && daysBetween(row[5], now) < CONFIG.REMIND_EVERY_DAYS) {
      result = 'Missing, reminded recently';
    } else {
      var subject = 'Missing invoice: ' + vendor;
      var body = 'Hi,\n\nWe have not received this month\'s invoice from ' + vendor + '. It was due by day ' + dueDay +
        '.\n\nPlease ask the vendor to email it with the invoice attached, or forward it if you already have it.\n\nThis is an automated reminder from the invoice tracker.';
      if (CONFIG.SEND_REMINDERS) MailApp.sendEmail(owner, subject, body);
      sheets.log.appendRow([now, safeCell(vendor), safeCell(owner), CONFIG.SEND_REMINDERS ? 'Email sent' : 'Dry run, no email sent', subject]);
      sheets.expected.getRange(i + 1, 6).setValue(now);
      result = CONFIG.SEND_REMINDERS ? 'Missing, owner reminded' : 'Missing, dry run logged';
      reminded++;
    }
    sheets.expected.getRange(i + 1, 7).setValue(result);
  }
  return reminded;
}

// ---- Pure helpers (no Google services), covered by test/logic.test.js ----

function extractInvoiceNumber(text) {
  var re = /\b(?:invoice|inv|bill)\b\s*(?:no\.?|number|num|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9\/-]{2,23})(?![A-Za-z0-9\/-])/gi, m;
  while ((m = re.exec(String(text)))) { if (/\d/.test(m[1])) return m[1]; }
  return '';
}

function extractAmount(text) {
  var money = '(?:₹|Rs\\.?|INR|USD|\\$|€|£)\\s?[\\d,]+(?:\\.\\d{1,2})?';
  var t = String(text);
  var total = new RegExp('(?<!sub[\\s-]?)\\b(?:grand total|total due|amount due|total amount|total)\\D{0,20}?(' + money + ')', 'i').exec(t);
  if (total) return total[1];
  var any = new RegExp(money, 'i').exec(t);
  return any ? any[0] : '';
}

function matchSender(from, match) {
  var f = String(from).toLowerCase();
  return String(match).toLowerCase().split(',').some(function (p) { p = p.trim(); return p && f.indexOf(p) !== -1; });
}

function hasInvoiceThisMonth(invoiceRows, match, now) {
  return invoiceRows.some(function (r) {
    var d = r[1];
    return d instanceof Date && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && matchSender(r[2], match);
  });
}

function daysBetween(a, b) { return Math.floor((b.getTime() - a.getTime()) / 86400000); }

function isEmail(s) { return /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(String(s)); }

/** Email text is untrusted. Stop Sheets from treating it as a formula. */
function safeCell(v) {
  var s = String(v == null ? '' : v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}
