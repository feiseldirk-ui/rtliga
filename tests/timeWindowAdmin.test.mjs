import test from 'node:test';
import assert from 'node:assert/strict';
import { initialWindowState, toLocalInput, validateWindow, windowReducer as reduce, windowSnapshot } from '../src/lib/timeWindowAdmin.js';
const row = { id: 57, wettkampf: 1, saison: '2026', start: '2026-09-01T08:00:00Z', ende: '2026-09-01T10:00:00Z' };
const loaded = () => reduce(initialWindowState, { type: 'loaded', rows: [row] });
const edit = state => reduce(state, { type: 'edit', wk: 1, field: 'start', value: '2026-09-02T10:00' });
test('Entwurf behält die echte Datensatz-ID', () => {
  assert.deepEqual(edit(loaded()).drafts[1].expected, windowSnapshot(row));
  assert.equal(windowSnapshot(undefined), null);
});
test('Hintergrundladen überschreibt Entwurf und Konfliktstand nicht', () => {
  const state = edit(loaded());
  const next = reduce(state, { type: 'loaded', rows: [{ ...row, start: '2026-09-03T08:00:00Z' }] });
  assert.deepEqual(next.drafts, state.drafts);
  assert.notDeepEqual(next.rows, state.rows);
});
test('Fehler erhalten Entwurf und bestätigte Werte', () => {
  const state = edit(loaded());
  for (const type of ['load-error', 'error']) {
    const next = reduce(state, { type, wk: 1, message: 'Testfehler' });
    assert.deepEqual(next.rows, state.rows);
    assert.deepEqual(next.drafts, state.drafts);
  }
});
test('Verwerfen übernimmt den zuletzt geladenen Stand', () => {
  const state = reduce(edit(loaded()), { type: 'discard', wk: 1 });
  assert.equal(state.drafts[1], undefined);
  assert.deepEqual(state.rows, [row]);
});
test('Speichern/Entfernen betrifft nur den gewählten WK', () => {
  let state = edit(loaded());
  state = reduce(state, { type: 'edit', wk: 2, field: 'start', value: '2026-10-01T10:00' });
  const saved = { ...row, start: '2026-09-02T08:00:00Z', ende: '2026-09-02T10:00:00Z' };
  state = reduce(state, { type: 'saved', wk: 1, row: saved, message: 'Bestätigt' });
  assert.deepEqual(state.rows, [saved]);
  assert.equal(state.drafts[1], undefined);
  assert.ok(state.drafts[2]);
  assert.equal(state.feedback[1].tone, 'success');
  state = reduce(state, { type: 'saved', wk: 1, row: null, message: 'Entfernt' });
  assert.deepEqual(state.rows, []);
  assert.equal(reduce(state, { type: 'edit', wk: 1, field: 'start', value: '2026-10-01T10:00' }).drafts[1].expected, null);
});
test('Zeitangaben und inklusive Grenzüberlappungen werden geprüft', () => {
  const draft = { wettkampf: 2, start: toLocalInput(row.start), ende: toLocalInput(row.ende) };
  assert.match(validateWindow(draft, [row]), /Überschneidung mit WK1/);
  assert.match(validateWindow({ ...draft, start: '', ende: '' }, []), /vollständig/);
  assert.match(validateWindow({ ...draft, ende: draft.start }, []), /nach dem Beginn/);
  assert.equal(validateWindow({ ...draft, wettkampf: 1 }, [row]), '');
  const touching = { ...draft, start: toLocalInput(row.ende), ende: toLocalInput('2026-09-01T12:00:00Z') };
  assert.match(validateWindow(touching, [row]), /Überschneidung/);
  assert.equal(validateWindow({ ...touching, start: toLocalInput('2026-09-01T10:01:00Z') }, [row]), '');
});
test('Beginn und Ende gemeinsam verschieben', () => {
  let state = edit(loaded());
  state = reduce(state, { type: 'edit', wk: 1, field: 'ende', value: '2026-09-02T12:00' });
  assert.equal(validateWindow(state.drafts[1], state.rows), '');
});
