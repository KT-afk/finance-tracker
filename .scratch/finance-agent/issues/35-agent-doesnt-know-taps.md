# 35: The agent doesn't know a button was tapped

**Priority:** P1

**Status:** done

Seen live on 29 Oct 2026. The owner tapped ✅ on “Share: Yoon Thiri owes $1,500 of CHEW NGENG HIANG $3,000 on 1 May 2026” at 09:55 (change #4; the share is in the live database and May's spending is $6,815.07). Afterwards the agent said both “proposals” were still waiting (there was only one), repeated the old May breakdown ($8,315.07) from the conversation instead of looking it up, and answered a typed “Confirm” with “tap the button”. Button taps never reach the conversation history, so the agent couldn't know.

- [x] Every question carries the proposals from the last 24 hours (at most 10) with their current status, which overrides the conversation
- [x] Instructions: numbers asked again are looked up again; a typed “confirm” gets “already confirmed” or “tap ✅ under it”
- [x] If the list can't be loaded, the agent is told the state is unknown
- [x] Tests: the list (window, order, status) and what the agent is sent
