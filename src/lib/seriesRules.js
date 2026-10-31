export const isStudentClass = category => ['schüler', 'schueler', 'student'].includes(String(category || '').trim().toLowerCase());
export function seriesTotals(row, category) {
  const values = Array.from({ length: 6 }, (_, i) => Number(row[`s${i + 1}`] || 0));
  const student = isStudentClass(category);
  const ll = values.slice(0, student ? 4 : 3).reduce((a, b) => a + b, 0);
  const sl = student ? 0 : values.slice(3).reduce((a, b) => a + b, 0);
  return { ll, sl, gesamt: ll + sl };
}

// Display labels only; storage keys s1-s6 stay stable for existing results.
export function seriesLabel(index, category, english = false) {
  const slow = isStudentClass(category) || index < 3;
  return `${english ? (slow ? 'Slow' : 'Fast') : (slow ? 'LL' : 'SL')} ${slow ? index + 1 : index - 2}`;
}
export function seriesColumns(category) {
  return Array.from({ length: isStudentClass(category) ? 4 : 6 }, (_, i) => ({ key: `s${i+1}`, label: seriesLabel(i, category) }));
}
