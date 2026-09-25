import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialInput } from '../fixtures.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const installer = join(root, 'node_modules/skills/bin/cli.mjs');
for (const [agent, target] of [['codex', '.agents/skills'], ['cursor', '.agents/skills'], ['claude-code', '.claude/skills']]) {
  test(`installed ${agent} skill discovers and runs independently of its source repository`, async t => {
    const project = await mkdtemp(join(tmpdir(), `skills-${agent}-`));
    t.after(() => rm(project, { recursive: true, force: true }));
    execFileSync('git', ['init', '--quiet'], { cwd: project });
    const output = execFileSync(process.execPath, [installer, 'add', root, '--skill', 'visual-plan-history', '--agent', agent, '--yes', '--copy'], {
      cwd: project, encoding: 'utf8', env: { ...process.env, DISABLE_TELEMETRY: '1', NO_COLOR: '1' }, timeout: 60000,
    });
    assert.ok(output.includes('visual-plan-history'));
    const skill = join(project, target, 'visual-plan-history');
    assert.ok((await readFile(join(skill, 'SKILL.md'), 'utf8')).includes('name: visual-plan-history'));
    for (const resource of ['assets/guide.css', 'assets/guide.js', 'scripts/comparison.mjs', 'references/history-format.md']) assert.ok((await stat(join(skill, resource))).isFile());
    const snapshot = join(project, 'input.json');
    await writeFile(snapshot, JSON.stringify(initialInput()));
    const result = JSON.parse(execFileSync(process.execPath, [join(skill, 'scripts/plan-history.mjs'), 'add', '--plan-dir', '.plans/export-search', '--snapshot', snapshot], { cwd: project, encoding: 'utf8' }));
    assert.equal(result.action, 'added');
    assert.equal(JSON.parse(await readFile(result.history, 'utf8')).snapshots.length, 1);
    assert.ok((await readFile(result.guide, 'utf8')).includes('Export saved search results'));
  });
}
