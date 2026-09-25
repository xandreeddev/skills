import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { addSnapshot, atomicWrite, compareSnapshots, nextHistory, readHistory, validateHistory, withLock } from '../../skills/visual-plan-history/scripts/history.mjs';
import { renderHistory } from '../../skills/visual-plan-history/scripts/render.mjs';
import { exampleHistory, initialInput } from '../fixtures.mjs';

async function directory(t) {
  const path = await mkdtemp(join(tmpdir(), 'plan-history-test-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

test('appending preserves earlier snapshots, rejects stale changes, and deduplicates retries', () => {
  const input = initialInput();
  const first = nextHistory(null, input).history;
  const original = JSON.stringify(first);
  input.goal = 'A revised goal'; input.parentId = first.snapshots[0].id;
  const second = nextHistory(first, input).history;
  assert.equal(JSON.stringify(first), original);
  assert.deepEqual(second.snapshots[0], first.snapshots[0]);
  assert.equal(second.snapshots[1].parentId, first.snapshots[0].id);
  input.goal = 'Mutated input after append';
  assert.equal(second.snapshots[1].goal, 'A revised goal');
  assert.throws(() => nextHistory(second, input), /Stale parentId/);
  input.goal = 'A revised goal'; input.summary = 'Metadata-only change';
  input.changeReasons = { goal: 'Extra explanation' };
  assert.equal(nextHistory(second, input).added, false);
});

test('rejects malformed dependencies, duplicate IDs, unknown fields, and invalid reasons', () => {
  const cases = [
    [input => { input.phases[0].steps[0].dependsOn = ['missing']; }, /Unknown dependency/],
    [input => { input.phases[0].steps[0].dependsOn = ['validation']; }, /Dependency cycle/],
    [input => { input.phases[1].steps[0].id = 'contract'; }, /duplicate IDs/],
    [input => { input.phases[0].surprise = true; }, /unknown field/],
    [input => { input.changeReasons = { 'step:missing': 'Guess' }; }, /Unknown change reason/],
    [input => { input.planId = '../escape'; }, /hyphenated ID/],
  ];
  for (const [mutate, expected] of cases) {
    const input = initialInput(); mutate(input);
    assert.throws(() => nextHistory(null, input), expected);
  }
  const history = exampleHistory(); history.snapshots[1].parentId = null;
  assert.throws(() => validateHistory(history), /Broken parent chain/);
});

test('comparison finds additions, removals, moves, order, dependencies, and decisions', () => {
  const history = exampleHistory();
  const changes = compareSnapshots(history.snapshots[0], history.snapshots[2]);
  assert.equal(changes.find(change => change.key === 'step:preview').kind, 'removed');
  assert.equal(changes.find(change => change.key === 'decision:retention').kind, 'added');
  assert.equal(changes.find(change => change.key === 'decision:delivery').kind, 'changed');
  assert.ok(changes.some(change => change.key === 'roadmap'));
  assert.equal(compareSnapshots(history.snapshots[0], history.snapshots[0]).length, 0);
  const moved = structuredClone(history.snapshots[0]);
  moved.phases[0].steps.push(moved.phases[1].steps.pop());
  assert.ok(compareSnapshots(history.snapshots[0], moved).some(change => change.key === 'step:preview'));
  assert.equal(compareSnapshots(history.snapshots[2], history.snapshots[0]).find(change => change.key === 'step:preview').kind, 'added');
});

test('concurrent writers do not overwrite history and locks are released after failure', async t => {
  const path = await directory(t);
  let unlock;
  const held = new Promise(resolve => { unlock = resolve; });
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const writing = withLock(path, async () => { started(); await held; });
  await ready;
  await assert.rejects(addSnapshot(path, initialInput()), /locked by another operation/);
  unlock(); await writing;
  await assert.rejects(withLock(path, async () => { throw new Error('failed operation'); }), /failed operation/);
  await addSnapshot(path, initialInput());
  const input = initialInput(); input.parentId = 'revision-0001'; input.goal = 'Next';
  const outcomes = await Promise.allSettled([addSnapshot(path, input), addSnapshot(path, { ...input, goal: 'Competing' })]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await readHistory(path)).snapshots.length, 2);
  assert.ok(!(await readdir(path)).includes('.history.lock'));
});

test('corrupt history and identity conflicts leave existing bytes untouched; plans stay separate', async t => {
  const path = await directory(t);
  await writeFile(join(path, 'history.json'), '{corrupt');
  await assert.rejects(addSnapshot(path, initialInput()), SyntaxError);
  assert.equal(await readFile(join(path, 'history.json'), 'utf8'), '{corrupt');
  await rm(join(path, 'history.json'));
  await addSnapshot(path, initialInput());
  const original = await readFile(join(path, 'history.json'), 'utf8');
  await assert.rejects(addSnapshot(path, { ...initialInput(), planId: 'different' }), /Plan identity differs/);
  assert.equal(await readFile(join(path, 'history.json'), 'utf8'), original);
  const other = await directory(t);
  await addSnapshot(other, { ...initialInput(), planId: 'different' });
  assert.equal((await readHistory(path)).planId, 'export-search');
  assert.equal((await readHistory(other)).planId, 'different');
});

test('failed atomic replacement preserves the target and cleans temporary files', async t => {
  const path = await directory(t);
  // A directory is not a valid replacement target, so rename must fail safely.
  await assert.rejects(atomicWrite(path, 'replacement'));
  assert.deepEqual(await readdir(path), []);
  const parentFiles = await readdir(tmpdir());
  assert.ok(!parentFiles.some(name => name.startsWith(path.split('/').at(-1) + '.') && name.endsWith('.tmp')));
});

test('renderer escapes HTML and embedded JSON without changing source', async () => {
  const input = initialInput();
  input.title = '</title><script>globalThis.pwned=true</script>';
  input.sourceMarkdown = '</script><img src="https://example.invalid/pixel" onerror="globalThis.pwned=true">\u2028&';
  const history = nextHistory(null, input).history;
  const html = await renderHistory(history);
  assert.ok(!html.includes(input.sourceMarkdown));
  const data = html.match(/<script type="application\/json" id="plan-history">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(JSON.parse(data), history);
  assert.ok(html.includes('Content-Security-Policy'));
  assert.equal(html, await renderHistory(history));
});

test('CLI captures, re-renders, and rejects invalid arguments', async t => {
  const path = await directory(t);
  const inputPath = join(path, 'input.json');
  await writeFile(inputPath, JSON.stringify(initialInput()));
  const cli = fileURLToPath(new URL('../../skills/visual-plan-history/scripts/plan-history.mjs', import.meta.url));
  const run = (...args) => JSON.parse(execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8' }));
  const result = run('add', '--plan-dir', path, '--snapshot', inputPath);
  assert.equal(result.action, 'added');
  const before = await readFile(result.history, 'utf8');
  assert.equal(run('add', '--plan-dir', path, '--snapshot', inputPath).action, 'unchanged');
  await rm(result.guide);
  assert.equal(run('render', '--plan-dir', path).action, 'rendered');
  assert.equal(await readFile(result.history, 'utf8'), before);
  assert.ok((await readFile(result.guide, 'utf8')).startsWith('<!doctype html>'));
  assert.throws(() => execFileSync(process.execPath, [cli, 'render', '--no-such-option'], { stdio: 'pipe' }), /Invalid argument/);
});
