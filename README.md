# Invoice and reimbursement SOP, with a Gmail-to-Sheets automation

Two parts:

- **[SOP.md](SOP.md)**: a one-page procedure for collecting invoices and reimbursements: intake, approval, payment, reconciliation and follow-up.
- **[Code.gs](Code.gs)**: a Google Apps Script that logs emailed invoices into a Google Sheet and reminds owners about missing ones.

## What the automation does

1. **Logs invoice emails.** Every hour it searches Gmail for emails with an attachment and "invoice", "bill" or "receipt" in the subject. Each one becomes a row in the **Invoices** sheet: date, sender, subject, a guess at the invoice number and amount, attachment names, a link back to the email, and the status *Needs approval*. An email is never logged twice.
2. **Chases missing invoices.** The **Expected** sheet lists the invoices you expect every month: vendor, the sender's email or domain, the owner and the day of the month it is due. Each morning the script checks whether that invoice has arrived this month. If it is past the due day and nothing has arrived, the owner gets a reminder, repeated every 3 days until it arrives.
3. **Keeps a record.** Every reminder is written to the **Reminder log** sheet.

Reminders start in **dry-run mode**: they are written to the log and no email is sent. Set `SEND_REMINDERS: true` in `Code.gs` when you want real emails to go out.

## Set it up (about 5 minutes)

1. Create a new Google Sheet.
2. Open **Extensions > Apps Script**, delete the sample code and paste in `Code.gs`. Save.
3. Choose the `setup` function and press **Run**. Google asks you to approve access to Gmail and Sheets for your own account.
4. In the sheet, open the **Expected** tab and replace the example row with a vendor you expect an invoice from.
5. Reload the sheet. An **Invoices** menu appears, so you can run either step by hand.

## 60-second demo script

1. Send yourself an email with the subject "Invoice INV-1042 from Sample Vendor", the line "Total: ₹11,800.00" and any PDF attached.
2. In the sheet, choose **Invoices > Log invoice emails now**. The row appears with the invoice number and amount filled in.
3. In **Expected**, add a vendor that has sent nothing, with a due day that has already passed.
4. Choose **Invoices > Chase missing invoices now**. The row shows "Missing" and the reminder appears in **Reminder log**.
5. Set `SEND_REMINDERS: true`, clear the "Last reminded" cell and run it again to show the real reminder email arriving.

## Tests

```bash
node --test test/logic.test.js
```

Six tests run the script against a stand-in for Gmail and Sheets. They cover number and amount parsing, logging each email once, skipping emails without attachments, chasing only invoices that are missing and due, not repeating a reminder too soon, dry-run mode, and bad owner emails.

## Limits

- The script reads the email subject and body, not the PDF. The invoice number and amount are a first guess and are checked at approval.
- It expects one invoice per vendor per month. Vendors who bill weekly or irregularly need a different rule.
- It only sees the Gmail account it runs in, so invoices must reach that inbox.
- The tests use a stand-in for Google's services. The demo recording is the proof of it running in a real account.
