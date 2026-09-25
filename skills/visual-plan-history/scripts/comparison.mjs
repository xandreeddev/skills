export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
export function entities(snapshot) {
  return new Map([
    ['goal', { title: 'Goal', text: snapshot.goal }],
    ['roadmap', { title: 'Roadmap order', text: snapshot.phases.map(phase => `${phase.id}: ${phase.steps.map(step => step.id).join(', ')}`).join('\n') }],
    ...snapshot.phases.flatMap(phase => [
      [`phase:${phase.id}`, { title: phase.title, text: phase.summary }],
      ...phase.steps.map(step => [`step:${step.id}`, { title: step.title, text: step.detail, phase: phase.id, dependsOn: step.dependsOn }]),
    ]),
    ...snapshot.decisions.map(decision => [`decision:${decision.id}`, { title: decision.title, text: decision.decision, rationale: decision.rationale }]),
    ['openQuestions', { title: 'Open questions', text: snapshot.openQuestions.join('\n') }],
    ['sourceMarkdown', { title: 'Original plan', text: snapshot.sourceMarkdown }],
  ]);
}

export function compareSnapshots(before, after) {
  const oldItems = entities(before); const newItems = entities(after);
  return [...new Set([...oldItems.keys(), ...newItems.keys()])].flatMap(key => {
    const oldValue = oldItems.get(key); const newValue = newItems.get(key);
    if (same(oldValue, newValue)) return [];
    return [{ key, kind: !oldValue ? 'added' : !newValue ? 'removed' : 'changed', title: (newValue ?? oldValue).title, before: oldValue ?? null, after: newValue ?? null }];
  });
}
