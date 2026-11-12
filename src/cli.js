#!/usr/bin/env node
"use strict";
// Usage: node src/cli.js --inbox samples/inbox --expected samples/expected.csv --out out [--today 2026-11-10]
const fs = require("fs");
const path = require("path");
const core = require("./core");
const { parseEml } = require("./eml");

function args(argv) {
  const a = { inbox: "samples/inbox", expected: "samples/expected.csv", out: "out", today: null };
  for (let i = 2; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, "");
    if (!(k in a) || argv[i + 1] === undefined) throw new Error("Unknown or incomplete option: " + argv[i]);
    a[k] = argv[i + 1];
  }
  return a;
}

function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some((v) => v.trim())) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}

function main() {
  const a = args(process.argv);
  const now = a.today ? new Date(a.today + "T09:00:00") : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("--today must look like 2026-11-10");

  const expected = parseCsv(fs.readFileSync(a.expected, "utf8")).slice(1).map((r) => ({
    vendor: r[0], match: r[1], owner: r[2], dueDay: Number(r[3]), active: String(r[4] || "yes").trim().toLowerCase() !== "no"
  }));
  const state = core.createState(expected);

  // Carry over what earlier runs logged and who was already reminded.
  const stateFile = path.join(a.out, "state.json");
  if (fs.existsSync(stateFile)) {
    const old = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    state.invoices = old.invoices.map((r) => ({ ...r, date: new Date(r.date), loggedAt: new Date(r.loggedAt) }));
    state.expected.forEach((e) => { const o = old.expected.find((x) => x.vendor === e.vendor); if (o && o.lastReminded) e.lastReminded = new Date(o.lastReminded); });
  }

  let logged = 0; const skipped = [];
  fs.readdirSync(a.inbox).filter((f) => f.toLowerCase().endsWith(".eml")).sort().forEach((f) => {
    const res = core.ingest(state, parseEml(fs.readFileSync(path.join(a.inbox, f), "utf8")), now);
    if (res.logged) logged++; else if (res.reason !== "Already logged") skipped.push(f + ": " + res.reason);
  });
  const reminders = core.chase(state, now);

  fs.mkdirSync(a.out, { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify({ invoices: state.invoices, expected: state.expected }, null, 2));
  fs.writeFileSync(path.join(a.out, "invoices.csv"), core.toCsv(state));
  fs.writeFileSync(path.join(a.out, "reminders.txt"), reminders.map((r) => "To: " + r.to + "\nSubject: " + r.subject + "\n\n" + r.body + "\n").join("\n-----\n\n"));

  console.log("Date used: " + now.toDateString());
  console.log("New invoices logged: " + logged + " (total " + state.invoices.length + ")");
  skipped.forEach((s) => console.log("Skipped " + s));
  state.expected.forEach((e) => console.log("  " + e.vendor + ": " + e.result));
  console.log("Reminders drafted: " + reminders.length + " (see " + path.join(a.out, "reminders.txt") + ")");
}

try { main(); } catch (err) { console.error("Error: " + err.message); process.exit(1); }
