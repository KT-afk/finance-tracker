# 43: Money in three groups

**Priority:** P2

**Status:** done

Owner (2026-11-20): “separate investments and savings; total balance should have 3 breakdowns.” Answers: Trust, Wise, Chocolate are spending money (Chocolate pays transport and utilities); OCBC, DBS (and UOB's account) are savings; IBKR is investments, counted automatically from the monthly debits, and there was money in IBKR before December 2025.

- [x] `lib/balance-groups.ts`: the latest balance per account and type, grouped; cards count as owed in spending money; investments = put in (monthly IBKR debits + put in before) and the latest value given; accounts with no balance listed
- [x] Migration 0014: `investments` (IBKR: put in before, value, date)
- [x] `propose_balance` (a balance the owner tells, saved like a statement balance) and `propose_investment` (IBKR put in before / value), confirmed, logged, undoable; `balance_groups` tool
- [x] Accounts page: “Your money” with the three groups, each balance with its date
- [x] Tests: grouping, latest balance wins, IBKR debits counted (not Chocolate top-ups), told balances, IBKR updates, undo, refusals; agent tests; phone-width check

Not handled: undoing an undo of a told balance adds it again rather than removing it.

Review (2026-11-23), fixed: IBKR transfers counted from money going out only, so the count, first date and amount agree (a refund back isn't one); a card in credit adds to spending money instead of counting as owed; the page says “as of” or “recorded”, warns in words when cards owe more than the accounts hold, labels IBKR “put in” until a value is given, and uses headings for the three groups.

Known: undo of a told balance finds its row by save time (the log entry's own time); storing the row's id would be safer.
