## Context

The app uses Next.js App Router with client components, Tailwind CSS, shadcn/ui cards, and Recharts. The Ask page (`app/ask/page.tsx`) is a 261-line client component with three stacked Card sections. The dashboard (`app/page.tsx`) fetches from `/api/dashboard` and renders the InsightCard above a spend total card, category bars, and recent transactions. The insight API (`app/api/insight/route.ts`) currently queries only the current month + 3-month totals for trend.

## Goals / Non-Goals

**Goals:**
- Ask page feels like a real chat: input at bottom, thread grows upward, no separate "answer" section
- Memory section minimised — collapsed by default, accessible but not prominent
- Dashboard spend total gains a MoM delta so the number has immediate context
- AI insight covers 6 months and is prompted to surface cross-time patterns
- No visual regressions on Transactions, Upload, or Insights pages

**Non-Goals:**
- Streaming responses (still plain JSON)
- Animated message transitions (keep it simple)
- Redesigning the Insights page charts
- Any backend changes beyond dashboard API delta field and insight data window

## Decisions

### Chat layout: scroll container + pinned input
The Ask page becomes:
```
┌─ /ask ──────────────────────────┐
│  thread (flex-col-reverse,      │
│  overflow-y-auto, flex-1)       │
│                                 │
│    ┌──────────────────────┐     │
│    │ AI bubble (left)     │     │
│    └──────────────────────┘     │
│              ┌───────────────┐  │
│              │ You (right)   │  │
│              └───────────────┘  │
│    ┌──────────────────────┐     │
│    │ AI bubble + chart    │     │
│    └──────────────────────┘     │
│                                 │
├─────────────────────────────────┤
│ memory pill (collapsed)  [chip] │
│ [textarea          ] [Ask]      │
└─────────────────────────────────┘
```

`flex-col-reverse` on the thread container means new messages are added at the bottom of the DOM but visually appear at the bottom of the viewport without manual scroll management. History and current conversation merge into one thread — no separate history section.

### Memory UI
Collapsed to a small `"What I remember (N)"` chip above the input. Clicking expands an inline list with delete buttons. No longer a full card — it's plumbing.

### Dashboard MoM delta
`/api/dashboard` adds two fields: `momDelta` (absolute SGD change) and `momDeltaPct` (percentage). Computed by querying prior month total with same bank filter. The spend total card renders a coloured delta line: green if negative (spent less), red if positive (spent more), zinc if no prior data.

```
$3,240
↑ $420 vs February (+18%)   ← red
```

### AI insight — 6-month window
`/api/insight` builds a 6-month summary (current + 5 prior months) and passes all 6 to Claude. System prompt updated:
- Primary directive: find cross-time patterns, not just current-month anomalies
- "If something stands out across multiple months, lead with that"
- Current month is called out only if it meaningfully differs from the pattern

### Insight card position on dashboard
Keep it below the spend total — it reads as "here's what that number means in context." Order:
1. Spend total + MoM delta
2. AI insight (now broader)
3. Category bars
4. Recent transactions

## Risks / Trade-offs

- **`flex-col-reverse` and initial scroll**: on first load with long history the user sees the bottom of the thread (most recent), which is correct. The empty state (no history) needs an explicit placeholder so the page doesn't look broken.
- **6-month insight latency**: same Sonnet call, slightly larger prompt (~30% more tokens). Should still be under 5s.
- **MoM delta with bank filter**: prior month total must use the same bank filter as current month, otherwise the delta is misleading. Dashboard API already has bank filter plumbing so this is straightforward.
