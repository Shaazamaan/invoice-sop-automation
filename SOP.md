# SOP: Invoices and reimbursements

**Purpose.** Every vendor invoice and employee reimbursement is collected, approved, paid and matched to the bank statement, with nothing lost in an inbox.

**Applies to.** All vendor payments, employee reimbursements and vendor refunds. Items in [square brackets] are set by the company.

**Roles.** *Owner*: the person who ordered the service or spent the money. *Approver*: [budget holder]. *Finance ops*: runs this process and the tracker.

| Step | What happens | Who | By when |
| --- | --- | --- | --- |
| **1. Intake** | Vendors email invoices, with the file attached, to [finance inbox]. Employees submit reimbursements with the receipt, date, amount and purpose. The tracker logs each invoice email as a row with status *Needs approval*. | Vendor, employee | Reimbursements within [30] days of spending |
| **2. Approval** | Check the invoice against what was ordered: vendor, amount, period, tax details. The approver marks it *Approved* or *Query*. No approval, no payment. Amounts above [limit] need a second approver. | Owner, approver | Within [2] working days |
| **3. Payment** | Pay approved items in the [weekly] payment run. Record the payment date and bank reference on the row and set status to *Paid*. Tell the vendor or employee. | Finance ops | Next payment run |
| **4. Reconciliation** | Match every bank debit to a *Paid* row, and every *Paid* row to a bank debit. Investigate anything unmatched: duplicates, wrong amounts, payments with no invoice. | Finance ops | [Weekly], and at month end |
| **5. Follow-up** | Chase what is missing: expected invoices that have not arrived by their due day, queries with no reply, and refunds that are owed. Log each chase and its date. | Finance ops, owner | Every [3] days until closed |

**Rules.**
1. One row per invoice. The row is the record: status, approver, payment reference.
2. No receipt, no reimbursement. A photo of the receipt is acceptable.
3. Never pay from an email alone when bank details have changed. Confirm the change by phone on a known number first.
4. Refunds are tracked like invoices in reverse: log the amount owed, the date promised and each chase until the money arrives.
5. Escalate to [finance lead] when an item is unapproved after [5] working days, or a refund is overdue by [14] days.

**Automation.** A Google Apps Script logs invoice emails into the tracker sheet every hour, and each morning reminds the owner about any expected invoice that has not arrived. It reads the email text only, so the invoice number and amount it records are a first guess to be checked at approval.

**Month-end check.** All rows *Paid* or explained. Bank statement fully matched. Open refunds listed with their next chase date.
