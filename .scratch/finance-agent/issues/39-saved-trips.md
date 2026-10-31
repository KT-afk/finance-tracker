# 39: Saved trips

**Priority:** P2

**Status:** done (part one)

Owner request (2026-10-31): continue with trips after the small version (ticket 37). Their Korea trip had a $1,000 cash entry and flights paid from Singapore that the abroad-only lookup can't see.

- [x] Migration 0013: `trips` (name, dates, country) and `trip_payments` (a payment added to or left out of a trip)
- [x] `propose_trip` saves a trip or changes its dates; `propose_trip_payment` adds or leaves out one payment; both confirmed with buttons, logged, undoable (including undoing an undo)
- [x] `trip_spending` takes a saved trip's name: payments abroad between its dates, minus those left out, plus those added (any date, cash entries included)
- [x] Saved trips are listed with every question, so “how much did Korea cost?” needs no dates
- [x] Tests: proposing, confirming, totals with added and left-out payments, refusals, log wording, undo

Part two (not started): a trip label and filter on the Transactions page; trips shown apart in monthly reviews and optionally left out of the savings review's averages.
