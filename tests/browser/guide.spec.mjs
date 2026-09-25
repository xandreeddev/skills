import { test, expect } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderHistory } from '../../skills/visual-plan-history/scripts/render.mjs';
import { nextHistory } from '../../skills/visual-plan-history/scripts/history.mjs';
import { exampleHistory, initialInput } from '../fixtures.mjs';

let directory;
let guideURL;
test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'plan-guide-browser-'));
  const file = join(directory, 'guide.html');
  await writeFile(file, await renderHistory(exampleHistory()));
  guideURL = pathToFileURL(file).href;
});
test.afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

test('offline guide opens latest, preserves originals, and compares any pair with labeled rationale', async ({ page, context }) => {
  const requests = []; const errors = [];
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await context.setOffline(true);
  await page.goto(guideURL);
  await expect(page.locator('[data-snapshot="2"]')).toBeVisible();
  await expect(page.locator('[data-snapshot="0"]')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Download retention' })).toBeVisible();
  await page.getByRole('tab', { name: 'Changes', exact: true }).click();
  await page.getByLabel('From', { exact: true }).selectOption('0');
  await expect(page.locator('[data-key="step:preview"] .tag')).toHaveText('removed');
  await expect(page.locator('[data-key="decision:delivery"] .reason')).toContainText('revision-0002: Dataset sizing');
  await expect(page.locator('[data-key="decision:retention"] .tag')).toHaveText('added');
  await page.getByLabel('From', { exact: true }).selectOption('2');
  await page.getByLabel('To', { exact: true }).selectOption('0');
  await expect(page.locator('[data-key="step:preview"] .tag')).toHaveText('added');
  await expect(page.locator('[data-key="decision:delivery"] .reason')).toContainText('revision-0002');
  await page.getByLabel('To', { exact: true }).selectOption('2');
  await expect(page.getByRole('status')).toHaveText('Choose two different revisions to see changes.');
  await page.locator('[data-revision="0"]').click();
  await page.getByRole('tab', { name: 'Original', exact: true }).click();
  await expect(page.locator('[data-original="0"]')).toHaveText(exampleHistory().snapshots[0].sourceMarkdown);
  await page.getByRole('tab', { name: 'Plan', exact: true }).click();
  await expect(page.getByText('Preview the export', { exact: true }).first()).toBeVisible();
  await page.locator('[data-snapshot="0"] .dependencies a').first().click();
  await expect(page).toHaveURL(/#revision-0001-step-contract$/);
  expect(requests).toEqual([]); expect(errors).toEqual([]);
});

test('keyboard navigation, narrow viewport, and printing retain a readable selected view', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(guideURL);
  const planTab = page.getByRole('tab', { name: 'Plan', exact: true });
  await planTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Changes', exact: true })).toBeFocused();
  await expect(page.locator('#view-changes')).toBeVisible();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Original', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(planTab).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/guide-mobile.png', fullPage: true });
  const detail = page.locator('[data-snapshot="2"] details').first();
  await detail.locator('summary').click();
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await expect(detail).toHaveAttribute('open', '');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.history')).toBeHidden();
  await expect(page.locator('[data-snapshot="2"]')).toBeVisible();
  await expect(page.locator('[data-snapshot="0"]')).toBeHidden();
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(detail).not.toHaveAttribute('open', '');
});

test('hostile source, title, decision, and reason remain text, including in comparison', async ({ page, context }) => {
  const attack = '</script><img src="https://example.invalid/leak" onerror="globalThis.pwned=true"><script>globalThis.pwned=true</script>';
  const input = initialInput(); input.title = attack; input.sourceMarkdown = attack; input.goal = attack;
  input.decisions[0].rationale = attack;
  let history = nextHistory(null, input).history;
  input.parentId = 'revision-0001'; input.goal = 'Changed safely'; input.changeReasons = { goal: attack };
  history = nextHistory(history, input).history;
  const file = join(directory, 'hostile.html'); await writeFile(file, await renderHistory(history));
  const requests = []; const errors = [];
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await context.setOffline(true);
  await page.goto(pathToFileURL(file).href);
  await expect(page.locator('h1')).toHaveText(attack);
  await expect(page.locator('img')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Changes', exact: true }).click();
  await expect(page.locator('[data-key="goal"] .reason')).toContainText(attack);
  expect(await page.evaluate(() => globalThis.pwned)).toBeUndefined();
  expect(requests).toEqual([]); expect(errors).toEqual([]);
});

test('latest plan and preserved source remain available without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, offline: true });
  const page = await context.newPage();
  await page.goto(guideURL);
  await expect(page.locator('[data-snapshot="2"]')).toBeVisible();
  await expect(page.locator('noscript details')).toHaveCount(3);
  await page.locator('noscript details').first().locator('summary').click();
  await expect(page.locator('noscript pre').first()).toHaveText(exampleHistory().snapshots[0].sourceMarkdown);
  await context.close();
});

test('desktop sample has no page overflow', async ({ page }) => {
  await page.goto(guideURL);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/guide-desktop.png', fullPage: true });
});
