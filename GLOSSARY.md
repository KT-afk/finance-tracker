# Finance Tracker

A personal finance tracker for one owner in Singapore: it records what the owner spends, what others owe them, and helps them stay in control of their spending.

## Language

### Spending

**Spending**:
The owner's own share of their outgoing payments: the amount paid minus the shares other people should cover.
_Avoid_: Expenses, net spend

**Gross spending**:
The full amount of outgoing payments, before taking out other people's shares.
_Avoid_: Total spend, raw spending

**Share**:
The part of an outgoing payment that another person should cover. It counts as theirs from the moment the owner pays, whether or not it has been repaid, until the owner forgives it.
_Avoid_: Split, portion

**Forgiven share**:
A share the owner decided not to collect; it becomes the owner's spending again.
_Avoid_: Written off, waived

**Budget**:
The owner's monthly spending limit for one category, measured on spending. Unspent amounts do not carry over to the next month.
_Avoid_: Cap, allowance

### Finance agent

**Finance agent**:
The assistant that answers the owner's questions about their money and can make changes on their behalf.
_Avoid_: Bot, AI, assistant

**Change log**:
The permanent record of every change the finance agent made to the owner's data: what changed, from what to what, when, and which request caused it. Any entry can be undone, and the undo is itself recorded.
_Avoid_: Audit trail, history

**Memory**:
A fact about the owner that the finance agent keeps and uses when answering, such as an expected recurring payment. The agent may suggest one, but only the owner's confirmation saves it.
_Avoid_: Notes, preferences

**Topic**:
One of the two conversations in the owner's Telegram group: Daily insights or Ask anything.
_Avoid_: Channel, thread, chat
