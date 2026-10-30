# 38: The agent couldn't see money coming in

**Priority:** P2

**Status:** done

Seen live on 30 Oct 2026: asked whether UOB paid back two interest charges, the agent said “there's no record of a refund”. UOB refunded both (“CR INTEREST” $46.85 and $29.11 on 4 Jul 2026), but search only returned payments, so the agent couldn't find them, or offer to recategorise them.

- [x] `search_transactions` takes `money_in: true` to find refunds, interest, salary and transfers in
- [x] Instructions: check for a refund with `money_in` before saying there is none
- [x] Search test; checked read-only on live data: the two UOB refunds come back
