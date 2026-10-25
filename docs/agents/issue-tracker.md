# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## Review findings go to the backlog

After `/code-review` (or any review) on a ticket, every finding not fixed in that ticket becomes a backlog ticket. Don't leave them only in chat.

1. Fix in the ticket itself anything that gives wrong results or breaks the ticket's own acceptance criteria.
2. For each remaining finding, add a ticket in the same feature's `issues/` folder with the next free number. Group small clean-ups in the same area into one ticket.
3. Give each a `**Priority:**` line (scale below), a `**Blocked by:**` line and a `**Status:**` line: `ready-for-agent` if it's fully specified, else `needs-triage`.
4. Commit the new tickets with the work they came from, or straight after it.

### Priority

- `P1`: wrong numbers or a gap against the spec. Do before the next feature ticket.
- `P2`: needed, but waits on other work or doesn't affect answers yet.
- `P3`: clean-up with no change in behaviour. Do when touching that code.

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.
