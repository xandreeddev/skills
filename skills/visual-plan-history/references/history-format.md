# Snapshot format and continuity

The installed helper uses only Node.js 22+ built-in modules. Resolve its path from
the installed skill directory, never from the skill author's repository.

## Input JSON

All fields shown below are required. Unknown fields are rejected.

```json
{
  "planId": "export-search",
  "title": "Export saved search results",
  "parentId": null,
  "summary": "Initial plan for exporting a saved search.",
  "goal": "Let analysts export their current search without losing its filters.",
  "sourceMarkdown": "# Export saved search results\n\nBuild a filtered CSV export, then verify the output.\n",
  "phases": [
    {
      "id": "delivery",
      "title": "Deliver the export",
      "summary": "Preserve the search and verify the file.",
      "steps": [
        { "id": "export", "title": "Build CSV export", "detail": "Reuse the active filters.", "dependsOn": [] },
        { "id": "verify", "title": "Verify export", "detail": "Check empty results, quoting, and retained filters.", "dependsOn": ["export"] }
      ]
    }
  ],
  "decisions": [
    { "id": "format", "title": "File format", "decision": "Start with CSV.", "rationale": "It matches the analyst workflow." }
  ],
  "openQuestions": ["What is the largest expected result set?"],
  "changeReasons": {}
}
```

- IDs use lowercase letters, digits, and single hyphens, up to 64 characters.
  Phase and decision IDs are unique within their lists; step IDs are unique across
  all phases. Retain IDs across revisions, including moves between phases.
- Arrays preserve order. Dependencies refer to step IDs in the same snapshot and
  must form a directed acyclic graph. Removed steps cannot remain dependencies.
- Strings are plain text. Markdown is preserved as text, never interpreted as
  HTML. `summary`, `goal`, source text, titles, questions, and reasons are nonempty.
  Phase summaries, step details, and decision rationale may be empty. Arrays may
  be empty. The helper does not infer missing decisions or steps.
- `changeReasons` maps an entity key to an evidenced explanation. Valid keys are
  `goal`, `roadmap` (ordering), `phase:<id>`, `step:<id>`, `decision:<id>`,
  `openQuestions`, and `sourceMarkdown`. Entity IDs must exist in the new or
  immediately previous revision, so removed items can receive reasons too.
  Example: `{"step:export": "A larger dataset requires an asynchronous job."}`.
- Rationale for a decision belongs in its `rationale`; why that decision changed
  belongs in `changeReasons["decision:<id>"]`. They answer different questions.
- `parentId` is `null` initially, then the latest stored ID such as
  `revision-0001`. The helper supplies new IDs and UTC capture timestamps.

## Durable source

`history.json` has `schemaVersion: 1`, `planId`, `title`, and a nonempty `snapshots`
array. Each snapshot contains the content fields above plus `id`, `parentId`,
and `capturedAt`. Plan identity is stored once at the top level. Do not edit old
snapshots or regenerate historical IDs. A new session appends to the same file.

Snapshots are immutable through the helper; the JSON is not cryptographically
tamper-proof. Normal project backup/version-control policies apply. When merging
independently edited histories, reconcile them explicitly instead of concatenating
arrays or silently replacing one side.

The helper suppresses identical content using the goal, source text, phases,
decisions, and open questions. Source CRLF/LF differences are ignored for this
comparison. Summary/reason-only changes do not create a revision. Other source
formatting changes count as different content, so the agent should filter cosmetic
changes before calling `add`. Identical retries are accepted even with an older
parent ID; changed content requires the latest parent.

## Commands and recovery

```sh
node /absolute/skill/path/scripts/plan-history.mjs add --plan-dir .plans/export-search --snapshot /tmp/snapshot.json
node /absolute/skill/path/scripts/plan-history.mjs render --plan-dir .plans/export-search
```

Paths may be absolute or relative to the current working directory. Success
prints one JSON object containing `action` (`added`, `unchanged`, or `rendered`),
`planId`, latest `revisionId`, and absolute `history` and `guide` paths. Errors
exit nonzero with a concise diagnostic.

Writes use an exclusive `.history.lock` and temporary-file rename. A malformed
history, conflicting writer, stale parent, invalid dependency, or changed plan
identity fails without replacing the existing source. If the process crashes,
confirm it has stopped before removing a leftover `.history.lock`; retry the
capture afterward. Temporary `.tmp` files from an interrupted process may also be
removed after confirming no writer is active. Atomic rename protects individual
files, not a two-file transaction: history is committed first, then HTML is
rendered from the latest history under a lock. If rendering fails, fix the cause
and run `render`; no recapture is required.

## Guide behavior

The guide includes every snapshot, inline styles, and inline script. It needs no
server, network, package installation, or browser storage. The latest revision is
selected initially. Timeline buttons change the selected plan and original text;
the comparison selectors can show any pair, including reversed comparisons.
Diffs identify added, removed, and changed entities. Nonadjacent comparisons list
recorded reasons from the intervening revisions and label their origin; absent
reasons are explicitly shown as unrecorded. The source diff preserves changes
outside the structured view.

Tab controls support arrow keys and Home/End; regular controls support native
keyboard navigation. Print captures the current view and expands its details.
Without JavaScript, the latest structured plan and all original source revisions
remain readable. Plan text is escaped; embedded JSON cannot close its script tag.
The generated Content Security Policy blocks external resources and connections.
