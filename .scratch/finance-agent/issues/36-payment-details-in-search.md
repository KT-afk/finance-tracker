# 36: The agent couldn't say what a payment was

**Priority:** P2

**Status:** done

Seen live on 29 Oct 2026: asked what three $500 “Kt” payments in May were, the agent said all it had was the title “Kt”. The database holds more: each is “FAST PAYMENT via PayNow-Mobile to Kt OTHR-OTHR” from OCBC, and on each day $500 came into OCBC from Trust (“Credit Payment from Trust savings account”), which suggests money moved between the owner's accounts. Search only returned the short title.

- [x] Search results carry `bank` and `bank_text` (the bank's description, up to 120 characters)
- [x] `same_day_in` when the same amount came into another of the owner's accounts that day
- [x] Instructions: give bank and bank text when asked what a payment is; point out a same-day transfer in and offer Self Transfer
- [x] Search test for the “Kt” case
