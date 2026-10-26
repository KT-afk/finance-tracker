# Feature map

One file per user-facing feature. Each says how a user reaches it, how to drive it, and what proves it works.

| Feature           | File                               | Specs                              |
| ----------------- | ---------------------------------- | ---------------------------------- |
| Login and lockout | [login.md](login.md)               | `auth.spec.ts`, `security.spec.ts` |
| Dashboard         | [dashboard.md](dashboard.md)       | `dashboard.spec.ts`                |
| Transactions      | [transactions.md](transactions.md) | `transactions.spec.ts`             |
| Insights          | [insights.md](insights.md)         | `insights.spec.ts`                 |
| Ask               | [ask.md](ask.md)                   | `ask.spec.ts`                      |

Not mapped yet: Accounts (`accounts.spec.ts`), Owed, Upload (`upload-flow.spec.ts`).
