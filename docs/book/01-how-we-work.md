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

## Skills from pstack

On 2026-10-25 we added four skills from [pstack](https://github.com/backnotprop/pstack) (commit `18b6c36`). A **skill** is a set of written instructions an agent follows. These four run only when you type their command.

| Command                        | What it does                                                                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/create-verification-skill`   | Builds a `verify-` skill that starts the real app, uses it like a person would, and saves proof that a feature works.                                     |
| `/maintain-verification-skill` | Checks that the `verify-` skill still matches the app, and fixes it when the app has changed.                                                             |
| `/correct`                     | Finds mistakes agents keep repeating and makes them impossible: first with structure, then types or lint, then tests, and docs last.                      |
| `/reflect`                     | After a long piece of work, looks back over the chat and suggests edits to skills so the next agent does better. Nothing is changed until you approve it. |

We did not add the rest of pstack. Its main mode overlaps with the skills we already use, it prefers working without a plan, and some of its skills need other AI models.

### Our changes to pstack

- **Codex reviews.** All three `/reflect` reviewers run on Codex, so they see the work through a different model. `/correct`, `/create-verification-skill` and `/maintain-verification-skill` ask Codex to review their changes before they commit or open a pull request.
- **Low effort.** Codex and the subagents use low reasoning effort, not the upstream "xhigh". Ask for more when a review needs it.
- **This repo's setup.** Backlog goes to `.scratch/`, checks run in the pre-commit hook (there is no CI), and the verification skill must follow lessons 1, 2 and 9 in chapter 3.

`/correct` and chapter 3 work together. Chapter 3 records a lesson in words. `/correct` turns the lesson into a check that fails, so words are not the only guard. The guard from ticket 22 is an example.
