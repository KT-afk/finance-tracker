# Chapter 1: How we work

## Tickets

A **ticket** is one small piece of work. Each ticket is a file in `.scratch/<feature>/issues/`. The big plan for a feature is its **spec**, in `.scratch/<feature>/spec.md`.

Each ticket has:

- **Status**: where it is. `needs-triage`, `ready-for-agent`, `ready-for-human` or `resolved`.
- **Blocked by**: other tickets that must be done first.
- **Priority** (for backlog tickets): how soon to do it.
- A checklist. The ticket is done when every box is true.

**Triage** means reading a ticket and deciding if it is clear enough to start. If it is, it becomes `ready-for-agent`.

## Building a ticket

1. Pick the first ticket that is ready and not blocked.
2. Write a test first. Watch it fail. (This is called **test-driven development**, or TDD.)
3. Write the code until the test passes.
4. Run the type check (`npm run typecheck`) often.
5. Commit. The pre-commit hook runs the type check and every test, so a commit that goes through has passed.
6. Review the work (see below).
7. Mark the ticket `resolved` and tick its boxes.

## Reviews

After each ticket we review it in two separate ways:

- **Standards**: does the code follow the rules in `AGENTS.md` and `GLOSSARY.md`, and is it clean?
- **Spec**: does the code do what the ticket and spec asked for?

We keep the two apart, so a good result in one does not hide a problem in the other.

## The backlog

Every review finding goes somewhere. Nothing stays only in chat.

- If a finding gives **wrong results** or breaks the ticket's own checklist, fix it now, in the same ticket.
- Otherwise, write a new **backlog ticket** for it. Group small clean-ups together.

Backlog tickets get a priority:

| Priority | Meaning                                                 | When to do it                  |
| -------- | ------------------------------------------------------- | ------------------------------ |
| P1       | Wrong numbers, a gap against the spec, or a safety risk | Before the next feature ticket |
| P2       | Needed, but waiting on other work                       | When it is unblocked           |
| P3       | Clean-up, no change in behaviour                        | When you next touch that code  |

The full rule is in `docs/agents/issue-tracker.md`.
