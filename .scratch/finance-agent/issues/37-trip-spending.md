# 37: Trip spending (small version)

**Priority:** P2

**Status:** done

Owner request (2026-10-30): “How much would you say I paid in Korea?” The agent searched the word “Korea” and found nothing, because bank text says “SEOUL KR”. The owner chose the small version of trips first.

- [x] `trip_spending` tool: payments abroad between two dates (a country code other than SG at the end of the bank text, also when the bank adds the local amount after it, or a foreign currency), optional country; the owner's share and gross, per day, by category, by country, first and last payment, the 5 biggest
- [x] At most 3 months; strict input
- [x] Instructions: use the country code, not a name search; trip dates from memories, else ask; say flights, hotels paid from Singapore and cash aren't included; offer to remember the trip's dates as a memory
- [x] Database test and agent tests; checked read-only on live data: Korea, 26 Apr to 15 May 2026, 87 payments, $2,519.84

Later (the bigger version): named trips stored in the database, adding or removing payments (flights, hotels), a label on the Transactions page, and trips set apart in reviews and the savings review.
