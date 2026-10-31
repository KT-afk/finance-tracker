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

Review (2026-10-31), fixed: trip writes put the change-log row first, on the same condition as the write, using the proposal's own row as the source (the first version keyed the log row on a timestamp, which could log a write that didn't happen); a payment can only be added to a trip that still exists, checked in the write; a trip change compares every field, name included; `trip_spending` returns `total_abroad`, `total_added` and `per_day_abroad`, names added payments that aren't spending, and no longer lists “added” as a country; the change log shows the trip's name (“Korea trip: …”); the spec lists trips as allowed changes.

Known: undoing a trip's creation keeps its added and left-out payments, so saving a trip with the same name again brings them back. No way to delete a trip except undo.

## Part two (2026-10-31)

- [x] Transactions page: a trip filter (in the URL, `?trip=korea`; shows the whole trip whatever the month) and a ✈ trip label on each payment that belongs to one
- [x] Monthly review: “Trips (in that total): Korea trip $1,560”
- [x] Tests: which trip each payment belongs to, the API filter, the review line; browser check at phone width

Not done: leaving trips out of the savings review's averages (ask if wanted).
