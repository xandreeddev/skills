import { readFile } from 'node:fs/promises';
import { validateHistory } from './history.mjs';

const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const jsonForHTML = value => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
const date = value => new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value));

function plan(snapshot, index) {
  const stepTitles = new Map(snapshot.phases.flatMap(phase => phase.steps.map(step => [step.id, step.title])));
  return `<article class="snapshot" data-snapshot="${index}"${snapshot.latest ? '' : ' hidden'}>
    <div class="section-heading"><span class="eyebrow">The objective</span><span class="tag">${snapshot.latest ? 'Latest revision' : 'Earlier revision'} · ${index + 1}</span></div>
    <h2 class="goal">${escape(snapshot.goal)}</h2>
    <p class="lead">${escape(snapshot.summary)}</p>
    <div class="metrics"><span><strong>${snapshot.phases.length}</strong> phases</span><span><strong>${stepTitles.size}</strong> steps</span><span><strong>${snapshot.decisions.length}</strong> decisions</span></div>
    <h2>Roadmap</h2>
    <nav class="roadmap" aria-label="Revision ${index + 1} phases">${snapshot.phases.map((phase, number) => `<a href="#${snapshot.id}-${phase.id}"><span>${String(number + 1).padStart(2, '0')}</span>${escape(phase.title)}</a>`).join('')}</nav>
    ${snapshot.phases.map((phase, number) => `<section class="phase" id="${snapshot.id}-${phase.id}"><div class="phase-number">${String(number + 1).padStart(2, '0')}</div><div class="phase-body"><h3>${escape(phase.title)}</h3><p>${escape(phase.summary)}</p><div class="steps">${phase.steps.map(step => `<details class="step" id="${snapshot.id}-step-${step.id}" open><summary>${escape(step.title)}</summary><div class="step-body"><p>${escape(step.detail)}</p>${step.dependsOn.length ? `<div class="dependencies"><span>Depends on</span>${step.dependsOn.map(dependency => `<a href="#${snapshot.id}-step-${dependency}">${escape(stepTitles.get(dependency))}</a>`).join('')}</div>` : '<span class="muted small">No prerequisites</span>'}</div></details>`).join('')}</div></div></section>`).join('')}
    <section class="decisions"><h2>Decisions &amp; rationale</h2>${snapshot.decisions.length ? snapshot.decisions.map(decision => `<article class="decision"><h3>${escape(decision.title)}</h3><p>${escape(decision.decision)}</p><p class="reason"><strong>Why</strong> ${escape(decision.rationale || 'No rationale recorded.')}</p></article>`).join('') : '<p class="muted">No decisions recorded.</p>'}</section>
    <section class="questions"><h2>Open questions</h2>${snapshot.openQuestions.length ? `<ul>${snapshot.openQuestions.map(question => `<li>${escape(question)}</li>`).join('')}</ul>` : '<p class="muted">No open questions recorded.</p>'}</section>
  </article>`;
}

export async function renderHistory(history) {
  validateHistory(history);
  const [css, comparison, client] = await Promise.all([
    readFile(new URL('../assets/guide.css', import.meta.url), 'utf8'),
    readFile(new URL('./comparison.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../assets/guide.js', import.meta.url), 'utf8'),
  ]);
  const latest = history.snapshots.length - 1;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
<meta name="color-scheme" content="light"><title>${escape(history.title)} · Plan history</title><style>${css}</style></head>
<body><a class="skip-link" href="#main">Skip to plan</a>
<header class="page-header"><div><span class="eyebrow">A plan, with its history</span><h1>${escape(history.title)}</h1><p class="muted">${history.snapshots.length} revision${history.snapshots.length === 1 ? '' : 's'} · Last captured ${date(history.snapshots[latest].capturedAt)} · Offline guide</p></div><button class="print-button" type="button">Print this view</button></header>
<div class="layout"><aside class="history"><h2>Plan history</h2><p class="small muted">Choose a revision to explore.</p><ol>${history.snapshots.map((snapshot, index) => `<li><button type="button" class="revision" data-revision="${index}" aria-pressed="${index === latest}"><span class="revision-top">Revision ${index + 1}${index === latest ? '<span class="latest-dot" aria-label="Latest"></span>' : ''}</span><time datetime="${escape(snapshot.capturedAt)}">${date(snapshot.capturedAt)}</time><span>${escape(snapshot.summary)}</span></button></li>`).join('')}</ol><p class="history-note">A record of the plan and its reasoning.<br>Steps are planned, not marked as completed.</p></aside>
<main id="main" tabindex="-1"><div class="view-controls" role="tablist" aria-label="Guide views"><button id="tab-plan" type="button" role="tab" aria-selected="true" aria-controls="view-plan">Plan</button><button id="tab-changes" type="button" role="tab" aria-selected="false" aria-controls="view-changes" tabindex="-1">Changes</button><button id="tab-original" type="button" role="tab" aria-selected="false" aria-controls="view-original" tabindex="-1">Original</button></div><p id="selection-status" class="sr-only" aria-live="polite">Revision ${latest + 1} selected</p>
<section id="view-plan" role="tabpanel" aria-labelledby="tab-plan">${history.snapshots.map((snapshot, index) => plan({ ...snapshot, latest: index === latest }, index)).join('')}</section>
<section id="view-changes" role="tabpanel" aria-labelledby="tab-changes" hidden><div class="section-heading"><span class="eyebrow">What changed, and why</span></div><h2>Compare revisions</h2><div class="compare-controls"><div class="compare-field"><label for="compare-from">From</label><select id="compare-from">${history.snapshots.map((snapshot, index) => `<option value="${index}"${index === Math.max(0, latest - 1) ? ' selected' : ''}>Revision ${index + 1}</option>`).join('')}</select></div><span aria-hidden="true">→</span><div class="compare-field"><label for="compare-to">To</label><select id="compare-to">${history.snapshots.map((snapshot, index) => `<option value="${index}"${index === latest ? ' selected' : ''}>Revision ${index + 1}</option>`).join('')}</select></div></div><p class="muted small">For wider or reversed comparisons, reasons retain the revision where they were recorded.</p><p id="comparison-status" role="status"></p><div id="comparison"></div></section>
<section id="view-original" role="tabpanel" aria-labelledby="tab-original" hidden><span class="eyebrow">Preserved as written</span><h2>Original plan</h2><p class="muted">The source text captured for the selected revision.</p>${history.snapshots.map((snapshot, index) => `<pre class="original" data-original="${index}"${index === latest ? '' : ' hidden'}>
${escape(snapshot.sourceMarkdown)}</pre>`).join('')}</section>
<noscript><p>JavaScript is disabled. The latest plan is shown above. Every captured source is preserved below.</p>${history.snapshots.map((snapshot, index) => `<details><summary>Revision ${index + 1}: ${escape(snapshot.summary)}</summary><pre class="original">
${escape(snapshot.sourceMarkdown)}</pre></details>`).join('')}</noscript>
</main></div><footer>Visual plan history · Standalone, portable, and preserved.</footer>
<script type="application/json" id="plan-history">${jsonForHTML(history)}</script><script>(() => { 'use strict';\n${comparison.replace(/^export /gm, '')}\n${client}\n})();</script></body></html>\n`;
}
