import { canonical, entities } from './comparison.mjs';
export { compareSnapshots } from './comparison.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const contentKeys = ['summary', 'goal', 'sourceMarkdown', 'phases', 'decisions', 'openQuestions', 'changeReasons'];
const fail = message => { throw new Error(message); };
const object = (value, name) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name} must be an object`);
};
const keys = (value, allowed, name) => {
  object(value, name);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`${name}: unknown field ${key}`);
};
const text = (value, name, empty = false) => {
  if (typeof value !== 'string' || (!empty && !value.trim())) fail(`${name} must be ${empty ? 'a string' : 'a non-empty string'}`);
};
const list = (value, name) => { if (!Array.isArray(value)) fail(`${name} must be an array`); };
const id = (value, name) => {
  if (typeof value !== 'string' || value.length > 64 || !idPattern.test(value)) fail(`${name} must be a lowercase hyphenated ID of at most 64 characters`);
};
function unique(items, name) {
  if (new Set(items).size !== items.length) fail(`${name} contains duplicate IDs`);
}

export function validateContent(value) {
  for (const key of ['summary', 'goal', 'sourceMarkdown']) text(value[key], key);
  list(value.phases, 'phases');
  list(value.decisions, 'decisions');
  list(value.openQuestions, 'openQuestions');
  value.openQuestions.forEach(question => text(question, 'open question'));
  object(value.changeReasons, 'changeReasons');
  for (const reason of Object.values(value.changeReasons)) text(reason, 'change reason');
  const steps = [];
  for (const phase of value.phases) {
    keys(phase, ['id', 'title', 'summary', 'steps'], 'phase');
    id(phase.id, 'phase.id'); text(phase.title, 'phase.title'); text(phase.summary, 'phase.summary', true);
    list(phase.steps, 'phase.steps');
    for (const step of phase.steps) {
      keys(step, ['id', 'title', 'detail', 'dependsOn'], 'step');
      id(step.id, 'step.id'); text(step.title, 'step.title'); text(step.detail, 'step.detail', true);
      list(step.dependsOn, 'step.dependsOn');
      step.dependsOn.forEach(dependency => id(dependency, 'dependency'));
      unique(step.dependsOn, 'step.dependsOn');
      steps.push(step);
    }
  }
  unique(value.phases.map(phase => phase.id), 'phases');
  unique(steps.map(step => step.id), 'steps');
  const byId = new Map(steps.map(step => [step.id, step]));
  const visiting = new Set();
  const visited = new Set();
  function visit(stepId) {
    if (!byId.has(stepId)) fail(`Unknown dependency: ${stepId}`);
    if (visiting.has(stepId)) fail(`Dependency cycle at ${stepId}`);
    if (visited.has(stepId)) return;
    visiting.add(stepId);
    byId.get(stepId).dependsOn.forEach(visit);
    visiting.delete(stepId); visited.add(stepId);
  }
  steps.forEach(step => visit(step.id));
  for (const decision of value.decisions) {
    keys(decision, ['id', 'title', 'decision', 'rationale'], 'decision');
    id(decision.id, 'decision.id'); text(decision.title, 'decision.title');
    text(decision.decision, 'decision.decision'); text(decision.rationale, 'decision.rationale', true);
  }
  unique(value.decisions.map(decision => decision.id), 'decisions');
}

export function validateInput(value) {
  keys(value, ['planId', 'title', 'parentId', ...contentKeys], 'snapshot input');
  id(value.planId, 'planId'); text(value.title, 'title');
  if (value.parentId !== null) id(value.parentId, 'parentId');
  validateContent(value);
  return value;
}

export function validateHistory(history) {
  keys(history, ['schemaVersion', 'planId', 'title', 'snapshots'], 'history');
  if (history.schemaVersion !== 1) fail(`Unsupported history schemaVersion: ${history.schemaVersion}`);
  id(history.planId, 'planId'); text(history.title, 'title'); list(history.snapshots, 'snapshots');
  if (!history.snapshots.length) fail('History must contain at least one snapshot');
  const seen = new Set();
  let parentId = null;
  for (const snapshot of history.snapshots) {
    keys(snapshot, ['id', 'parentId', 'capturedAt', ...contentKeys], 'snapshot');
    id(snapshot.id, 'snapshot.id');
    if (seen.has(snapshot.id)) fail(`Duplicate snapshot ID: ${snapshot.id}`);
    if (snapshot.parentId !== parentId) fail(`Broken parent chain at ${snapshot.id}`);
    if (typeof snapshot.capturedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(snapshot.capturedAt) || Number.isNaN(Date.parse(snapshot.capturedAt)) || new Date(snapshot.capturedAt).toISOString() !== snapshot.capturedAt) fail('capturedAt must be a UTC ISO timestamp with milliseconds');
    validateContent(snapshot);
    validateReasons(snapshot, history.snapshots.find(item => item.id === parentId));
    seen.add(snapshot.id); parentId = snapshot.id;
  }
  return history;
}

function contentFingerprint(value) {
  return createHash('sha256').update(JSON.stringify(canonical({
    goal: value.goal, sourceMarkdown: value.sourceMarkdown.replace(/\r\n/g, '\n'),
    phases: value.phases, decisions: value.decisions, openQuestions: value.openQuestions,
  }))).digest('hex');
}

function validateReasons(snapshot, previous) {
  const known = new Set([...entities(snapshot).keys(), ...(previous ? entities(previous).keys() : [])]);
  for (const key of Object.keys(snapshot.changeReasons)) if (!known.has(key)) fail(`Unknown change reason target: ${key}`);
}

export function nextHistory(existing, input, capturedAt = new Date().toISOString()) {
  validateInput(input);
  if (existing) validateHistory(existing);
  if (existing && (existing.planId !== input.planId || existing.title !== input.title)) fail('Plan identity differs; use the existing planId and title, or a separate plan directory');
  const latest = existing?.snapshots.at(-1);
  // Identical retries do not create revisions, even if their original parent is now stale.
  if (latest && contentFingerprint(latest) === contentFingerprint(input)) return { history: existing, added: false };
  if (input.parentId !== (latest?.id ?? null)) fail(`Stale parentId: expected ${latest?.id ?? 'null'}. Read the current history before retrying`);
  const snapshot = {
    id: `revision-${String((existing?.snapshots.length ?? 0) + 1).padStart(4, '0')}`,
    parentId: input.parentId, capturedAt,
    ...Object.fromEntries(contentKeys.map(key => [key, structuredClone(input[key])])),
  };
  const history = { schemaVersion: 1, planId: input.planId, title: input.title, snapshots: [...(existing?.snapshots ?? []), snapshot] };
  validateHistory(history);
  return { history, added: true };
}

export async function readHistory(directory) {
  const file = join(directory, 'history.json');
  return validateHistory(JSON.parse(await readFile(file, 'utf8')));
}

export async function atomicWrite(file, content) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try { await handle.writeFile(content); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, file);
  } finally { await rm(temporary, { force: true }); }
}

export async function withLock(directory, operation) {
  await mkdir(directory, { recursive: true });
  const lockFile = join(directory, '.history.lock');
  const handle = await open(lockFile, 'wx', 0o600).catch(error => {
    if (error.code === 'EEXIST') fail('History is locked by another operation. Retry later; if a process crashed, confirm it has stopped before removing .history.lock');
    throw error;
  });
  try { return await operation(); }
  finally { await handle.close(); await rm(lockFile); }
}

export async function addSnapshot(directory, input) {
  validateInput(input);
  return withLock(directory, async () => {
    let previous;
    try { previous = await readHistory(directory); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const result = nextHistory(previous, input);
    if (result.added) await atomicWrite(join(directory, 'history.json'), `${JSON.stringify(result.history, null, 2)}\n`);
    return result;
  });
}
