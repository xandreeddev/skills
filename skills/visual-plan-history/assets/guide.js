const history = JSON.parse(document.getElementById('plan-history').textContent);
const tabs = [...document.querySelectorAll('[role="tab"]')];
const fromSelect = document.getElementById('compare-from');
const toSelect = document.getElementById('compare-to');

function activateTab(tab) {
  for (const item of tabs) {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
  }
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activateTab(tab));
  tab.addEventListener('keydown', event => {
    const next = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault(); activateTab(tabs[next]); tabs[next].focus();
  });
});

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function describe(value) {
  if (!value) return 'Not present in this revision.';
  return [value.title, value.text, value.phase ? `Phase: ${value.phase}` : '', value.dependsOn ? `Depends on: ${value.dependsOn.join(', ') || 'none'}` : '', value.rationale ? `Rationale: ${value.rationale}` : ''].filter(Boolean).join('\n\n');
}
function renderComparison() {
  const from = Number(fromSelect.value); const to = Number(toSelect.value);
  const differences = compareSnapshots(history.snapshots[from], history.snapshots[to]);
  const container = document.getElementById('comparison');
  container.replaceChildren();
  document.getElementById('comparison-status').textContent = from === to ? 'Choose two different revisions to see changes.' : differences.length ? `${differences.length} changed items · Revision ${from + 1} → Revision ${to + 1}` : 'These revisions have the same plan content.';
  for (const change of differences) {
    const card = element('article', undefined, `diff ${change.kind}`);
    card.dataset.key = change.key;
    const heading = element('div', undefined, 'section-heading');
    heading.append(element('h3', change.title), element('span', change.kind, 'tag'));
    card.append(heading);
    const columns = element('div', undefined, 'diff-columns');
    for (const [label, value] of [[`Revision ${from + 1}`, change.before], [`Revision ${to + 1}`, change.after]]) {
      const column = element('div');
      column.append(element('h4', label), element('pre', describe(value)));
      columns.append(column);
    }
    if (['sourceMarkdown', 'roadmap'].includes(change.key)) {
      const details = element('details'); details.append(element('summary', 'Show before and after'), columns); card.append(details);
    } else card.append(columns);
    const reasons = history.snapshots.slice(Math.min(from, to) + 1, Math.max(from, to) + 1).flatMap(snapshot => Object.hasOwn(snapshot.changeReasons, change.key) ? [`${snapshot.id}: ${snapshot.changeReasons[change.key]}`] : []);
    card.append(element('p', reasons.length ? `Recorded rationale\n${reasons.join('\n')}` : 'No change rationale recorded for this item.', 'reason'));
    container.append(card);
  }
}
fromSelect.addEventListener('change', renderComparison);
toSelect.addEventListener('change', renderComparison);
for (const button of document.querySelectorAll('[data-revision]')) {
  button.addEventListener('click', () => {
    const selected = Number(button.dataset.revision);
    for (const item of document.querySelectorAll('[data-revision]')) item.setAttribute('aria-pressed', String(item === button));
    for (const article of document.querySelectorAll('[data-snapshot]')) article.hidden = Number(article.dataset.snapshot) !== selected;
    for (const original of document.querySelectorAll('[data-original]')) original.hidden = Number(original.dataset.original) !== selected;
    fromSelect.value = String(Math.max(0, selected - 1)); toSelect.value = String(selected);
    document.getElementById('selection-status').textContent = `Revision ${selected + 1} selected`;
    renderComparison();
  });
}
document.querySelector('.print-button').addEventListener('click', () => window.print());
let closedDetails = [];
window.addEventListener('beforeprint', () => {
  closedDetails = [...document.querySelectorAll('details:not([open])')];
  closedDetails.forEach(details => { details.open = true; });
});
window.addEventListener('afterprint', () => {
  closedDetails.forEach(details => { details.open = false; });
});
renderComparison();
