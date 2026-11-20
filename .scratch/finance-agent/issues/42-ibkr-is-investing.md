# 42: IBKR is investing, not a card payment

**Priority:** P2

**Status:** done

Owner (2026-11-20): “I have an automated $500 that goes to IBKR.” The monthly OCBC debit to Interactive Brokers was sorted as “Credit Card Payment” by a built-in rule, and the OCBC alert for it was named “Chocolate top-up”. Both kept it out of spending, but the names were wrong.

- [x] Built-in rule: “COLLECTION/TRANSFER … Interactive” is a Self Transfer (the owner's own investment account)
- [x] OCBC direct-debit alerts are named “Direct debit (Chocolate or IBKR)”, since the alert doesn't say which, and stay a Self Transfer
- [x] Done in the live data at the owner's request, through confirmed proposals: rule “interactive br” → Self Transfer (#14), 28 May payment → Self Transfer (#15), memory about the monthly $500 to IBKR (#16)
- [x] `categorize-strict` test gets its own database; `run-tests.sh` clears the live settings (lesson 32)

Note: the 28 May payment was never counted as spending (the built-in rule wins over a stored category); the earlier advice that May was $500 too high was wrong.
