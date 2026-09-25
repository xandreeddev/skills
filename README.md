# Agent skills by Xand Reed

Portable skills for turning engineering work into something easier to understand.

## Visual plan history

Turn a plan into an offline HTML guide, then keep meaningful revisions together
across planning sessions. See the current roadmap, earlier decisions, and what
changed without having to reconstruct a conversation.

```sh
npx skills add xandreeddev/skills --skill visual-plan-history
```

Target specific tools with `--agent codex cursor claude-code`. The skill follows
the [Agent Skills standard](https://agentskills.io/specification); other compatible
clients can install the skill directory too. It needs Node.js 22 or later to
capture and render history. Viewing a guide needs only a browser.

Ask your agent:

> Use visual-plan-history to turn this plan into a guide. Continue the existing
> export-search plan history if it already exists.

The agent keeps `.plans/<plan-slug>/history.json` and `guide.html` in your project.
Share just the HTML: it embeds all revisions, styling, and interaction, and makes
no network requests. History records meaningful plan revisions, not every chat
message. It is not an execution tracker or an automatic conversation recorder.

See [the skill](skills/visual-plan-history/SKILL.md), the
[snapshot format](skills/visual-plan-history/references/history-format.md), and the
[three-revision example](examples/export-search/guide.html) (download and open it).

## Working on this repository

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:browser
```

Development dependencies are locked; the installed skill's helper has no package
dependencies. Tests cover durable history, comparisons, offline browser behavior,
and installation into temporary Cursor, Claude Code, and Codex projects.

Use pull requests. `main` requires the `ci` check, an up-to-date branch, and resolved
conversations, including for admins. Squash-merge after checks pass.

MIT · Xand Reed
