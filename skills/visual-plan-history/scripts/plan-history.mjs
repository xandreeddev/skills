#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { addSnapshot, atomicWrite, readHistory, withLock } from './history.mjs';
import { renderHistory } from './render.mjs';

const usage = `Usage:
  node plan-history.mjs add --plan-dir .plans/<slug> --snapshot <snapshot.json>
  node plan-history.mjs render --plan-dir .plans/<slug>

add appends a meaningful snapshot and rebuilds guide.html.
render rebuilds guide.html without changing history.json.
See ../references/history-format.md for snapshot input and continuity rules.`;

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help' || command === '-h') { console.log(usage); return; }
  if (!['add', 'render'].includes(command)) throw new Error(`Unknown command: ${command}\n${usage}`);
  const options = new Map();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]; const value = args[i + 1];
    if (!['--plan-dir', ...(command === 'add' ? ['--snapshot'] : [])].includes(key) || !value || value.startsWith('--') || options.has(key)) throw new Error(`Invalid argument: ${key}\n${usage}`);
    options.set(key, value);
  }
  if (!options.has('--plan-dir') || (command === 'add' && !options.has('--snapshot'))) throw new Error(usage);
  const directory = resolve(options.get('--plan-dir'));
  const result = command === 'add'
    ? await addSnapshot(directory, JSON.parse(await readFile(resolve(options.get('--snapshot')), 'utf8')))
    : null;
  // Re-read under the render lock so another capture cannot make this guide stale.
  const history = await withLock(directory, async () => {
    const current = await readHistory(directory);
    await atomicWrite(join(directory, 'guide.html'), await renderHistory(current));
    return current;
  });
  console.log(JSON.stringify({
    action: result ? result.added ? 'added' : 'unchanged' : 'rendered',
    planId: history.planId, revisionId: history.snapshots.at(-1).id,
    history: join(directory, 'history.json'), guide: join(directory, 'guide.html'),
  }));
}

main().catch(error => { console.error(`plan-history: ${error.message}`); process.exitCode = 1; });
