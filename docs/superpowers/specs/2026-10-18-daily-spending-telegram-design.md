# Daily Spending Message — Design

Date: 2026-10-18 (brainstormed), updated 2026-10-21 (grilled)
Glossary: terms in **bold** follow `CONTEXT.md`. Read it first.

## Status and handoff

- **Design:** brainstormed and grilled with the owner. All decisions below are agreed unless marked "(My call)", which the owner has not specifically confirmed.
- **Not yet done:** the owner's final approval of this document. Then a build plan (`superpowers:writing-plans`), then subagent-driven build.
- **Open items, in order:**
  1. **UOB card purchase alerts.** The owner has not yet found an email for an individual purchase on their UOB credit card (only the bill-payment alert, below). They need to check their inbox, and if none exist, turn on email alerts for every card purchase ($0 limit) in the UOB app. Without these, card spending is invisible until month-end. Do not build the UOB card parser before a real sample exists.
  2. **Confirm `TURSO_DATABASE_URL`** is set in the Vercel project (the owner's work laptop blocks the Vercel CLI; check from the dashboard).
  3. **Owner's own numbers** for Self Transfer detection: PayNow mobile and account endings. These go in an environment variable, never in this public repo.
- **The repo is public.** Never commit real account numbers, phone numbers, names, reference numbers, or `.env.local` contents. Test fixtures use made-up values in the real formats.

## Why

The owner only learns what they spent after the month ends, when they upload Statements. By then it is too late to change anything. They want to see the month building up while it happens, so they can act mid-month.

Success: every evening the owner gets one Telegram message that tells them how today went and whether the month is on track, without them doing anything.

## Three projects, in order

Each is useful on its own and each depends on the one before.

1. **Cloud (mostly done already).** The app is already on Vercel: GitHub shows Production deployments of `main` on every push. Because Vercel does not keep files the app writes, the live database must be a cloud one (Turso via `TURSO_DATABASE_URL`); see open item 2. The old plan `docs/superpowers/plans/2026-06-22-vercel-turso-deploy.md` is superseded. What is left:
   - Gap found: the schema on main has tables and columns (for example `owed_entries`, `owed_rules`) that no file in `drizzle/` creates; the last migration is `0003_balance_account_type.sql`. Production presumably got them another way (for example `drizzle-kit push`). Before Project 2 adds schema changes, bring `drizzle/` back in line with the live database so migrations are reliable.
   - Merging to `main` deploys to production immediately. Schema migrations must be applied to the cloud database before (or as part of) the deploy that needs them, and the database backed up first. (My call.)
   - The 10pm job runs in the same Vercel project, so it uses the same database.
   - The local `finance.db` in the repo is stale demo data (25 rows, ending June 2026), not the owner's data.
2. **Spending rules, Payment Alerts and Reconciliation.** One set of spending rules for the whole app; read the banks' Payment Alert emails into Transactions every day; make Statement uploads reconcile against them instead of duplicating them.
3. **Daily Telegram message.** Send the 10pm summary.

## Goals

- Spending is in the database within a day of happening, with no manual step.
- Month-end Statement uploads never create a second copy of a Transaction already known from a Payment Alert.
- A 10pm Telegram message with spending since last night, the month so far, a daily average, the pace against salary, and Rent, Trips and Unusual Spending called out.
- The dashboard, insights and the message always agree on what was spent.

## Non-goals

- Fixing categories or anything else from Telegram. The bot only sends. Fixes happen in the app.
- Real-time alerts. One message a day.
- A budget. The only ceiling is salary.
- Banks or wallets other than OCBC and UOB for Payment Alerts in this round (owner's decision). Statements for all banks keep working as today.
- A backup alert if the daily job itself fails to run. Silence is the signal.

## Anti-goals (failure even if it technically works)

- Duplicate Transactions after a Statement upload. The owner explicitly needs to trust this.
- Totals that quietly understate spending, for example by dropping **Unlabelled Transactions** or failed email reads.
- A cheerful message ("Today: $0") when the bot simply could not see the spending.
- A daily average that looks alarming every early month because of Rent, or that one Trip or big dinner skews for weeks.
- The message and the dashboard showing different totals for the same month.
- Exposing the database or app without the existing `APP_PASSWORD` protection.

## Spending rules (whole app)

Agreed in the grilling. These apply to the dashboard, insights, and the message alike. The dashboard and insights change to match before the message is built.

1. **Self Transfer** never counts. Recognised by where the money went: one of the owner's own account numbers or their own PayNow mobile, never by name (alerts mask names, e.g. the owner appeared as a masked name in a UOB alert). Today the app matches names (`FINANCE_SELF_TRANSFER_NAMES` in `lib/cash-flow.ts`); keep that for Statements and add number-based matching.
2. **A payment to a Person with no category** is an **Unlabelled Transaction**. It counts as spending immediately and is shown on its own "Unlabelled" line until the owner labels it in the app. Today such payments default to "Transfer" and drop out of spending (`lib/cash-flow.ts`); that changes. The dashboard's "Transfers to review" becomes the Unlabelled list.
3. **Rent** is recognised by its Memo ("rent", "rental", "lease"; the existing `RENT_PAYMENT_PATTERN` in `lib/cash-flow.ts`). The owner already writes this in the PayNow description. No Category Rule is created for the landlord (a Person never gets one). Forgotten memo → Unlabelled.
4. Split payments, including Rent, count only the owner's share, using the owed-money feature (`lib/owed.ts` adds `owedShare`, which `classifyCashFlow` already applies). (My call, following how spending works on main.)
5. **Trip:** spending in one foreign currency on at least 2 days within a week. Every Transaction in the run belongs to the Trip, whatever its category. A lone foreign-currency payment (an overseas online order) is ordinary spending.
6. **Unusual Spending:** a single payment large compared with what is normal for its category in the owner's history. An Unlabelled payment to a Person is compared with the owner's usual payments to People until labelled. Detection method is the builder's call.
7. **Day-to-day Spending:** everything that is spending and not Rent, Trip, or Unusual. The daily average uses only this.
8. Otherwise "spending" follows the existing rule: categories in `EXCLUDED_FROM_SPEND` (`lib/schema.ts`) are not spending. **Wallet Top-ups** are not spending. Card bill payments (alert sample below) are "Credit Card Payment" and never spending: the card's purchases are the spending.

## Project 2: Payment Alerts and Reconciliation

### Reading Payment Alerts

- Source: the OCBC and UOB Payment Alert emails in the owner's inbox.
- Inbox: Outlook (owner's answer, "for now", so keep the mail-reading part swappable). Microsoft has retired password-based IMAP for Outlook.com, so expect OAuth (for example Microsoft Graph with a refresh token).
- A scheduled cloud job reads new alert emails once a day, shortly before the 10pm message. (My call.)
- Alert formats seen so far (samples from the owner; digits and names below are replaced with placeholders):
  - **OCBC PayNow to a Person:** "The following PayNow transfer has been made to {MASKED NAME} using his/her Mobile (+******NNNN)", then labelled lines: `Date : 17 Oct 2026`, `Time : 12:02 PM SGT`, `Amount : SGD 0.30`, `From your account : 360 Account (-NNNNNN)`, `Description : chicken raw` (a Memo), `Reference number : …`.
  - **OCBC NETS QR to a Merchant:** "The following NETS QR payment has been made:", same fields plus `To : THE COFFEE EDITION`, `NETS merchant ID`, `NETS Stan ID`. Time format differs (`01:48pm SGT`).
  - **UOB PayNow to a Person (bank account):** one sentence, "You made a PayNow transfer of SGD 200.00 to {MASKED NAME} (Mobile ending NNNN) on your a/c ending NNNN at 5:33PM SGT, 18 Sep 26." No Memo. (This sample was a Self Transfer to the owner's own mobile.)
  - **UOB card bill payment (bank account):** sender `unialerts@uobgroup.com`, subject "UOB Personal Internet Banking Notification Alerts". "You made/scheduled a bill payment(s) of SGD 357.76 to UOB Cards on your a/c ending NNNN at 3:23PM SGT, 13 Sep 26. Bill ref: ending NNNN." → Credit Card Payment, never spending.
  - **Not yet seen:** UOB card purchase alert (open item 1), OCBC card alert, PayNow to a UEN.
- Any OCBC/UOB email in a format not yet seen is recorded as unread and surfaced, never dropped.
- Each alert becomes a Transaction carrying the alert's Payee, Memo where present, amount (and foreign amount/currency where present), account, date and time. The full alert text is kept as the **Bank Description**.
- New Transactions are categorised the same way uploads are today (Category Rules, then AI). A Category Rule created from an AI guess is shown to the owner on the day it is created; the daily message is the place for this.
- Each email is processed at most once, even if the job runs twice.

### Unlabelled vs Others

`CONTEXT.md` distinguishes an **Unlabelled Transaction** (no one has decided its category) from "Others" (a decision that it fits nowhere). The code today defaults every new Transaction to "Others" (`lib/parsers/normalizer.ts`), so the two are indistinguishable. Introduce a real unlabelled state.

### Reconciliation

Today, uploads de-duplicate only by an exact hash of date + bank text + amount + bank (`computeHash` in `lib/parsers/normalizer.ts`). An alert and its Statement Line have different text, so this will not catch them. The existing `lib/parsers/reconcile.ts` only checks a Statement's lines sum to its own opening/closing figures; it is not Reconciliation in the `CONTEXT.md` sense.

When a Statement is uploaded, each Statement Line is matched against Transactions known from Payment Alerts:

1. **SGD payments:** candidate = same account, exact same amount, date within a short window (cards post a day or two late).
2. **Foreign-currency payments:** candidate = same card, same foreign amount if the Statement shows it, otherwise SGD amount within about 3% (conversion and fees), date within a few days.
3. **Exactly one candidate:** merge. Keep the alert's details and the owner's category; the Statement's SGD amount is authoritative. The Transaction becomes a **Confirmed Transaction**.
4. **More than one candidate, or a near miss:** ask the owner in the upload confirm step. Nothing is inserted for that line until they answer.
5. **No candidate:** insert as new. These are movements the alerts missed.
6. Safety net: after reconciliation, the account's saved Transactions for the Statement period must sum to the Statement's own expected net (extending the existing check). A mismatch is a visible warning.
7. Re-uploading the same Statement stays safe.

Exact windows and near-miss rules are the builder's call, from real samples. Build and test against real-format alerts and Statements before running on live data.

## Project 3: Daily Telegram message

### When

- Every day at 10pm Singapore time.
- The per-day part covers **since last night** (10pm to 10pm), so nothing is missed or double-counted between messages.
- Month so far, average and pace use each Transaction's real calendar date, matching the dashboard and Statements. A payment at 11:30pm on 31 Oct appears in the 1 Nov message as "since last night" but counts towards October.

### What it says

Example (illustrative numbers):

```
Since last night: $154
Went on: Food $142 · Transport $12
  ⚠ $128 at Burnt Ends: unusual for Food (normally ~$15)

Oct so far: $2,134 (rent $1,200 · unusual $128 · day-to-day $806)
Avg/day (day-to-day): $52 → on pace for $2,940 of $4,500 salary
Unlabelled: 3 payments, $41 → [link]
```

Rules:

1. **Since last night:** total and a breakdown by category.
2. **Month so far:** total, with Rent, each Trip, and Unusual Spending as separate lines.
3. **Average per day:** Day-to-day Spending only.
4. **Pace:** Rent + Trips + Unusual so far + (average per day × days in the month), compared with salary. Pace includes everything, because salary must cover everything.
5. **Unusual Spending** is called out by Payee and amount. An Unlabelled one says so and links to sort it.
6. **Unlabelled spending** counts in every total and is also its own line.
7. **Salary:** from the database, not a setting (owner's answer). Most recent salary credit (an "Income" Transaction; `SALARY_INCOME_PATTERN` exists in `lib/cash-flow.ts`); until this month's has landed, use last month's. Not yet checked against real data.
8. Links go to the relevant app page (e.g. the Unlabelled list).
9. Amounts use `Intl.NumberFormat` for SGD.

### When the bot can't see spending

Agreed in the grilling. The message still goes out and leads with the problem:

- **Can't read email** (e.g. Outlook sign-in expired) → "⚠ Couldn't read your email since {day}, numbers are incomplete" with a link to sign in again.
- **Alerts it couldn't read** → "⚠ N bank emails I couldn't read" with a link; those payments are added once the reader is fixed.
- **A bank gone quiet** (no alerts for several days where there are usually some) → "No OCBC alerts since {day}, is e-Alerts still on?"
- **Job didn't run** → no message. No backup alerting.

### Delivery

- Telegram Bot API, send-only. No webhook.
- Sends to the owner's chat only.

## Constraints

- Stack stays as is: Next.js 16, Drizzle, libSQL/Turso, existing `APP_PASSWORD` auth.
- Secrets (Telegram bot token, email credentials, Turso token, owner's own account numbers) live in Vercel environment variables, never in the repo.
- Build with subagents (`superpowers:subagent-driven-development`); each branch is tested by a separate agent before merging. Merging to `main` deploys to production.

## Left to the builder

- How the job is scheduled (e.g. Vercel Cron) and protected from public triggering.
- Outlook access mechanism, and how "processed once" is keyed.
- Matching windows and near-miss rules for Reconciliation.
- Unusual Spending detection method and how much history it needs; how "a bank gone quiet" is judged.
- Schema changes for unlabelled state, alert provenance, foreign amounts, and Confirmed Transactions.
