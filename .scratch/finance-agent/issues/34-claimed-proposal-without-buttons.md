# 34: The agent said it proposed a change but nothing was proposed

**Priority:** P1

**Status:** done

Seen live on 29 Oct 2026, 09:44 (Ask anything): “Hmm, but the 3k should be split by 1.5k and 1.5k with my wife.” The answer said “I've proposed that your wife owes $1,500 of the $3,000 CHEW NGENG HIANG payment… Just tap to confirm or reject”, but no buttons came. The live database has no proposal from that day, and the payment has no share, so nothing was stored. The payment itself is a valid bank payment, so the tool would have accepted it with the right id: most likely the agent called `propose_share` with a made-up id and was refused, or never called it. Tool calls aren't recorded, so which one can't be told.

- [x] An answer that claims a proposal (“I've proposed”, “tap to confirm”, “confirm or reject”…) when none was stored this turn ends with a notice: nothing was proposed, there are no buttons, nothing changed, with the refusal reason when a `propose_` tool refused
- [x] Instructions: say “proposed” only when a `propose_` tool returned it in this answer; otherwise say what went wrong
- [x] Refused proposals are logged (`console.warn`) for the server logs
- [x] Agent tests: a claim with no tool call, a claim after a refusal, and a real proposal with no notice
