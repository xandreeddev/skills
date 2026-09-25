---
name: visual-plan-history
description: Generate an offline HTML guide for a plan or feature, and preserve meaningful revisions across planning sessions. Use when someone wants to visualize a plan, make a roadmap easier to follow, revisit earlier decisions, or compare what changed and why. Keep one durable history per plan in the consuming project.
---

# Visual plan history

Make a plan easy to read without losing its history. Capture the current plan as
structured data plus its original text, then generate a standalone HTML guide.
This is a planning aid, not a task execution tracker.

## Find the right history

1. Inspect the current project for `.plans/*/history.json` and match the feature
   being discussed. Continue that plan's history across sessions. If several
   histories plausibly match, ask which one to continue.
2. For a new plan, choose a stable lowercase hyphenated slug and use
   `.plans/<slug>/`. Keep unrelated features in separate directories.
3. Read the latest snapshot before capturing an update. Preserve its plan ID,
   title, and stable phase, step, and decision IDs. A changed label is not a new
   entity. Never overwrite history to start a new session.

Respect the host's current mode and write permissions. If plan mode prohibits
artifact writes, prepare the capture and perform it when writes are permitted.
The skill is invoked by the agent when relevant; it does not install background
hooks or automatically record all conversations.

## Capture a meaningful revision

Read [the input format and recovery rules](references/history-format.md) before
constructing the snapshot. Use Node.js 22 or later; the helper needs no packages.

- Preserve the actual plan text in `sourceMarkdown`, including constraints,
  validation, rollout, and other details that may not fit the structured view.
  Do not paraphrase an existing source and call it the original. If no written
  plan exists, first write a faithful plan from the discussion, then capture it.
- Structure the goal, ordered phases, steps, dependencies, decisions with their
  rationale, and open questions. Do not invent commitments or execution status.
- Capture the initial plan and substantive changes to scope, order, dependencies,
  approach, decisions, or unresolved questions. Do not append snapshots for every
  chat message, progress update, or formatting-only edit.
- Put a short revision summary in `summary`. Record reasons for changed entities
  in `changeReasons` when supported by the conversation. Leave reasons absent
  when unknown; do not reconstruct fictional rationale or earlier sessions.
- Use `parentId: null` for the initial capture; otherwise use the latest snapshot
  ID. Re-read on a stale-parent error and reconcile the new input with that plan.

Write the input JSON to a temporary file, then invoke the helper by its **absolute
installed skill path**, with the consuming project as the working directory:

```sh
node <installed-skill>/scripts/plan-history.mjs add \
  --plan-dir .plans/<slug> --snapshot <temporary-snapshot.json>
```

The helper validates the input, appends an immutable snapshot, and rebuilds
`guide.html`. Identical content is a no-op. It reports the history and guide paths
as JSON. On a rendering failure, the captured history remains recoverable:

```sh
node <installed-skill>/scripts/plan-history.mjs render --plan-dir .plans/<slug>
```

## Hand off the guide

Check the helper's result. Link `guide.html` and briefly state whether a revision
was added or the existing guide was refreshed. Mention significant recorded
changes when useful. The latest plan opens first; the reader can select an older
revision, compare any two revisions, and read the exact captured source.

Keep both files with the consuming project. `history.json` is the durable source;
`guide.html` is rebuildable and embeds all revisions for offline sharing. Do not
commit, publish, upload, or execute a plan merely because you visualized it. Follow
the user's existing repository and sharing instructions. If sharing is requested,
remember that the HTML contains earlier revisions as well as the current plan.
