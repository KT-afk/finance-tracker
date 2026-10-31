# 40: Cash payments from chat

**Priority:** P2

**Status:** done

Owner request (2026-10-31): “So I can't tell it I spent 1k cash in Korea?” Cash had to be added by hand on the Transactions page.

- [x] `propose_cash_payment`: date, amount (more than 0, up to $10,000), a spending category, a short description, optionally a saved trip; confirmed with a button
- [x] On confirm: a hand-entered payment with no bank (`off_bank`, `manual:` hash), and its place in the trip, with the change-log row, in one batch on one condition
- [x] Undo removes it (and its trip mark) only while it is unchanged and nobody split it; undoing that puts it back
- [x] Instructions: cash or other spending no statement shows; never card or bank payments; an ATM withdrawal isn't spending
- [x] Tests: proposal text, nothing before confirm, the payment and trip total after, second tap, log wording, undo and redo, undo refused after a split, refusals; agent tests
