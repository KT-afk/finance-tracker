# 41: Bank promotions counted as emails it couldn't read

**Priority:** P2

**Status:** done

Owner asked (2026-11-04): “Why are there bank emails it can't read?” Of the five unread emails (checked read-only on live data), four were promotions from the alert addresses (Trust “Start investing with zero commission”, “Invest once. Earn Linkpoints”, “Lock it today”; OCBC “Deepavali e-Packets”), and one was a real overseas Trust card payment, whose email gives no SGD amount.

- [x] An email from a bank's alert address that no parser reads and that has no amount with cents is “ignored: no amount, so not a payment”, never surfaced
- [x] The 10pm message gives overseas card payments their own line: “1 overseas card payment not counted yet: the SGD amount comes with the statement”
- [x] Tests: the three real promotions, an unknown email with an amount still surfaced, the 10pm warnings
