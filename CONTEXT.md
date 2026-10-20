# Finance Tracker

A personal record of where one person's money goes across their Singapore bank accounts and wallets, built so that spending is captured without manual effort.

## Language

### Sources

**Payment Alert**:
A real-time notification a bank or wallet sends when money leaves an account. It is the live, effortless source of spending, but it does not cover every money movement.
_Avoid_: Email, notification, e-alert

**Statement**:
A bank's periodic export (CSV or PDF) of every movement on an account. It is the complete record, used to check and fill gaps in what Payment Alerts captured.
_Avoid_: Upload, CSV, bank file

**Statement Line**:
One row of a Statement.
_Avoid_: Row, entry

### Accounts

**Wallet**:
A stored-value account the owner holds outside a bank, such as PayLah. Treated as one of the owner's own accounts, with its own Payment Alerts.
_Avoid_: E-wallet, app

**Wallet Top-up**:
Moving the owner's money from a bank account or card into a Wallet. Never spending; spending is counted when the Wallet pays a Payee.
_Avoid_: Reload, load, wallet payment

**Self Transfer**:
Moving money between two of the owner's own accounts, including a PayNow transfer to the owner's own mobile number. Never spending, and never asked about. Decided by where the money went (one of the owner's own account numbers or PayNow proxies), never by the Payee's name, which banks mask in Payment Alerts.
_Avoid_: Internal transfer, transfer to self

### Records

**Transaction**:
One real-world movement of money. A single Transaction can be evidenced by a Payment Alert, a Statement Line, or both.
_Avoid_: Payment, entry, record

**Unlabelled Transaction**:
A Transaction whose category nobody has decided yet. It counts as spending until labelled, and is always reported separately. Distinct from "Others", which is a decision that it fits no category.
_Avoid_: Uncategorised, Others, pending

**Memo**:
Free text the owner wrote when making a payment (e.g. "bao and siew mai"). The main clue to what a payment was for. Bank placeholders and bare reference codes are not Memos.
_Avoid_: Description, reference, note

**Bank Description**:
The bank's full raw text for a Transaction, kept verbatim. It may contain a Memo, but is never treated as something the owner wrote.
_Avoid_: Description, narrative, details

**Reconciliation**:
Matching a Statement's lines against the Transactions already known from Payment Alerts, so that each real-world movement is counted once and anything the alerts missed is found. When both exist, the Payment Alert's details and the owner's category are kept; the Statement's amount is authoritative. A match is made automatically only when it is unambiguous; otherwise the owner is asked.
_Avoid_: Dedup, sync, import

**Confirmed Transaction**:
A Transaction known from a Payment Alert that a Statement Line has since matched.
_Avoid_: Verified, reconciled

**Rent**:
The owner's monthly payment for their home, made to the landlord in the first few days of the month. Recognised by the Memo saying so, never by the Payee, because the landlord is a Person. Only the owner's share counts.
_Avoid_: Housing, landlord payment

### Spending patterns

**Trip**:
A run of spending in one foreign currency on at least two days within a week. Every Transaction in the run belongs to the Trip, whatever its category. A lone foreign-currency payment (such as an overseas online order) is not a Trip.
_Avoid_: Travel, holiday, overseas spending

**Unusual Spending**:
A single payment that is large compared with what is normal for its category in the owner's own history. An Unlabelled Transaction to a Person is compared with the owner's usual payments to People until it is labelled. Still spending; reported by name so a high month is explained.
_Avoid_: Outlier, big purchase, anomaly

**Day-to-day Spending**:
Spending that is not Rent, not part of a Trip, and not Unusual Spending. The basis of the daily average.
_Avoid_: Regular spending, normal spending

### Payees

**Payee**:
Whoever received the money in an outgoing Transaction.
_Avoid_: Recipient, beneficiary, counterparty

**Person**:
A Payee reached through an individual's PayNow proxy (mobile number or NRIC). Decided by how the money was sent, never by the name or by what the payments were for. A Person never has a remembered category.
_Avoid_: Individual, friend, contact

**Merchant**:
A Payee reached through a business channel: NETS QR, PayNow to a UEN, or a card payment. Decided by how the money was sent, never by the name. A Wallet receiving a Wallet Top-up is not a Merchant.
_Avoid_: Business, shop, vendor

**Category Rule**:
A remembered category for a Merchant or for a Memo keyword, applied automatically to future Transactions. Never created for a Person. A rule created from an AI guess is shown to the owner on the day it is created.
_Avoid_: Keyword rule, mapping
