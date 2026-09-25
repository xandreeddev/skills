import { nextHistory } from '../skills/visual-plan-history/scripts/history.mjs';

export function initialInput() {
  return {
    planId: 'export-search', title: 'Export saved search results', parentId: null,
    summary: 'Start with a direct CSV download for the active search.',
    goal: 'Let analysts export a saved search without losing its filters.',
    sourceMarkdown: '# Export saved search results\n\n## Goal\nLet analysts export a saved search without losing its filters.\n\n## Plan\n1. Define the export contract and preserve active filters.\n2. Build a direct CSV download.\n3. Show a preview before downloading.\n4. Verify filters, quoting, and empty results.\n\n## Decision\nUse a direct response to keep the first release small.\n\n## Open question\nWhat is the largest expected result set?\n',
    phases: [
      { id: 'design', title: 'Define the contract', summary: 'Agree on what is exported and how filters carry through.', steps: [
        { id: 'contract', title: 'Specify the export contract', detail: 'Preserve the current query and filters. Document CSV columns and their order.', dependsOn: [] },
      ] },
      { id: 'build', title: 'Build the export', summary: 'Make the saved search useful outside the application.', steps: [
        { id: 'export', title: 'Build a direct CSV download', detail: 'Stream the current search results into a CSV response.', dependsOn: ['contract'] },
        { id: 'preview', title: 'Preview the export', detail: 'Show a sample of the first rows before downloading.', dependsOn: ['export'] },
      ] },
      { id: 'verify', title: 'Verify the result', summary: 'Make sure the file represents the search the analyst chose.', steps: [
        { id: 'validation', title: 'Verify filters and CSV output', detail: 'Cover active filters, empty results, escaping, and column order.', dependsOn: ['export', 'preview'] },
      ] },
    ],
    decisions: [{ id: 'delivery', title: 'Delivery model', decision: 'Return CSV directly from the export request.', rationale: 'A direct response keeps the first release small.' }],
    openQuestions: ['What is the largest expected result set?'], changeReasons: {},
  };
}

export function exampleHistory() {
  let input = initialInput();
  let history = nextHistory(null, input, '2026-09-01T09:00:00.000Z').history;
  input = structuredClone(input);
  input.parentId = history.snapshots.at(-1).id;
  input.summary = 'Use a background export after learning that searches can exceed 100,000 rows.';
  input.phases[1].steps[0].title = 'Generate exports in a background job';
  input.phases[1].steps[0].detail = 'Queue the filtered query, generate CSV in a worker, and provide a download when ready.';
  input.decisions[0].decision = 'Generate CSV asynchronously and provide a temporary download.';
  input.decisions[0].rationale = 'Large searches exceed the request timeout; background work avoids interrupting the analyst.';
  input.openQuestions = ['How long should completed downloads remain available?'];
  input.sourceMarkdown = '# Export saved search results\n\n## Goal\nLet analysts export a saved search without losing its filters.\n\n## Plan\n1. Define the export contract and preserve active filters.\n2. Queue a background job that writes CSV and provides a download when ready.\n3. Show a preview before downloading.\n4. Verify filters, quoting, empty results, and column order.\n\n## Decision\nGenerate CSV asynchronously: searches can exceed 100,000 rows and time out a direct response.\n\n## Open question\nHow long should completed downloads remain available?\n';
  input.changeReasons = { 'step:export': 'Large searches can exceed the request timeout.', 'decision:delivery': 'Dataset sizing showed more than 100,000 rows in some searches.', openQuestions: 'Dataset size is known; retention is still undecided.', sourceMarkdown: 'Record the background-job approach and updated retention question.' };
  history = nextHistory(history, input, '2026-09-04T11:30:00.000Z').history;
  input = structuredClone(input);
  input.parentId = history.snapshots.at(-1).id;
  input.summary = 'Narrow the first release: remove preview and define a 24-hour download window.';
  input.phases[1].steps.pop();
  input.phases[2].steps[0].dependsOn = ['export'];
  input.phases[2].steps[0].detail = 'Cover active filters, empty results, escaping, column order, retries, and expiration after 24 hours.';
  input.decisions.push({ id: 'retention', title: 'Download retention', decision: 'Keep completed downloads for 24 hours.', rationale: 'A day gives analysts time to retrieve the file while limiting stored exports.' });
  input.openQuestions = [];
  input.sourceMarkdown = '# Export saved search results\n\n## Goal\nLet analysts export a saved search without losing its filters.\n\n## Plan\n1. Define the export contract and preserve active filters.\n2. Queue a background job that writes CSV and provides a download when ready.\n3. Verify filters, quoting, empty results, retries, and expiration after 24 hours.\n\n## Decisions\n- Generate CSV asynchronously because large searches can time out a direct response.\n- Keep completed downloads for 24 hours.\n- Defer preview to keep the first release focused on reliable delivery.\n\n## Open questions\nNone recorded.\n';
  input.changeReasons = { 'step:preview': 'Preview does not help validate reliable delivery; defer it beyond the first release.', 'step:validation': 'Remove the preview prerequisite and cover job retries and expiration.', 'decision:retention': 'A 24-hour window balances retrieval time and stored export volume.', roadmap: 'Remove the deferred preview step.', openQuestions: 'The retention decision resolves the remaining question.', sourceMarkdown: 'Preserve the narrowed first-release scope and retention decision.' };
  return nextHistory(history, input, '2026-09-08T14:15:00.000Z').history;
}
