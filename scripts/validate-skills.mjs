import assert from 'node:assert/strict';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skills = await readdir(join(root, 'skills'), { withFileTypes: true });
for (const directory of skills.filter(entry => entry.isDirectory())) {
  const skillRoot = join(root, 'skills', directory.name);
  const source = await readFile(join(skillRoot, 'SKILL.md'), 'utf8');
  const match = source.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, `${directory.name}: missing YAML frontmatter`);
  const metadata = parse(match[1], { uniqueKeys: true });
  assert.equal(metadata.name, directory.name);
  assert.match(metadata.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.ok(metadata.name.length <= 64);
  assert.ok(typeof metadata.description === 'string' && metadata.description.length > 0 && metadata.description.length <= 1024);
  assert.ok(source.split('\n').length < 500, 'Keep skill instructions concise');
  for (const [, path] of source.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
    if (/^https?:/.test(path)) continue;
    assert.ok((await stat(join(skillRoot, path))).isFile(), `Missing reference: ${path}`);
  }
  const interfaceData = parse(await readFile(join(skillRoot, 'agents/openai.yaml'), 'utf8')).interface;
  assert.ok(interfaceData.short_description.length >= 25 && interfaceData.short_description.length <= 64);
  assert.ok(interfaceData.default_prompt.includes(`$${metadata.name}`));
  assert.equal(await realpath(join(root, '.agents/skills', directory.name)), await realpath(skillRoot));
  assert.equal(await realpath(join(root, '.claude/skills', directory.name)), await realpath(skillRoot));
  for (const file of ['scripts/plan-history.mjs', 'scripts/history.mjs', 'scripts/comparison.mjs', 'scripts/render.mjs', 'assets/guide.css', 'assets/guide.js']) {
    assert.ok((await stat(join(skillRoot, file))).isFile(), `Missing installed resource: ${file}`);
  }
  console.log(`Validated ${metadata.name}`);
}
assert.equal(await realpath(join(root, 'CLAUDE.md')), await realpath(join(root, 'AGENTS.md')));
