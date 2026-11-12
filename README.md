# Invoice and reimbursement SOP, with a tracker that logs invoices and chases missing ones

**[Try the live demo](https://shaazamaan.github.io/invoice-sop-automation/)**: deliver a sample invoice email, watch it get logged, then run the morning check that chases a missing invoice. Nothing to install.

## What is here

| Part | What it is |
| --- | --- |
| **[SOP.md](SOP.md)** | A one-page procedure: intake, approval, payment, reconciliation, follow-up |
| **[Live demo](https://shaazamaan.github.io/invoice-sop-automation/)** | The tracker running in the browser on sample emails |
| **[src/core.js](src/core.js)** | The tracker logic: log invoice emails, find missing ones, draft reminders |
| **[src/cli.js](src/cli.js)** | A command-line tool that runs the same logic over a folder of saved emails |
| **[connectors/google-apps-script](connectors/google-apps-script/Code.gs)** | An optional script that connects the same rules to a live Gmail inbox and a Google Sheet |

## What the tracker does

1. **Logs invoice emails.** An email with an attachment that mentions an invoice, bill or receipt becomes one row: date, sender, a guess at the invoice number and amount, attachment names, and the status *Needs approval*. The same email is never logged twice. Emails with no attachment are skipped, with the reason shown.
2. **Chases missing invoices.** You list the invoices you expect each month: vendor, the sender's email or domain, the owner, and the day of the month it is due. If the due day passes and nothing has arrived from that sender this month, the tracker drafts a reminder to the owner. It waits 3 days before reminding the same owner again.

## Run it on your own machine

Needs Node.js 18 or later. No packages to install.

```bash
node src/cli.js --today 2026-11-10
```

This reads the sample emails in `samples/inbox`, checks them against `samples/expected.csv`, and writes three files to `out/`: `invoices.csv` (the log), `reminders.txt` (the drafted reminders) and `state.json` (so the next run does not double-log or nag). Output from the sample run:

```
New invoices logged: 1 (total 1)
Skipped 02-question-no-attachment.eml: No attachment
  Northgate Cloud: Received
  Meridian Legal Services: Missing, owner reminded
  Atlas Office Supplies: Not due yet
Reminders drafted: 1 (see out/reminders.txt)
```

To use your own data, save invoice emails as `.eml` files into a folder and pass `--inbox your-folder --expected your-list.csv`.

## Tests

```bash
npm test
```

Thirteen tests. They cover invoice number and amount parsing, logging each email once, skipping non-invoices, chasing only what is missing and due, not reminding too often, month boundaries, reading a real `.eml` file, a full command-line run, and the Google script against a stand-in for Gmail and Sheets.

## Limits

- The tracker reads the email subject and body, not the PDF. The invoice number and amount are a first guess, checked at approval.
- It expects one invoice per vendor per month.
- The demo page and the command-line tool draft reminders; they do not send email. Sending needs a mail connection, which is what the Google script adds.
- The Gmail search is broad on purpose (invoice, bill or receipt in the subject), so personal receipts in the same inbox get logged too. A dedicated finance inbox avoids that.
- The Google script was run in a live Google account on 12 Nov 2026: it logged a sample invoice email into the sheet and wrote a dry-run reminder for a missing invoice. Sending real reminder emails (`SEND_REMINDERS: true`) has not been switched on.
- The `.eml` reader handles typical invoice emails. A production mailbox would need a full mail-parsing library.
- All vendors, people and amounts in the samples are made up.
