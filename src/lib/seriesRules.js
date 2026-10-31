export const isStudentClass = category => ['schüler', 'schueler', 'student'].includes(String(category || '').trim().toLowerCase());
export function seriesTotals(row, category) {
  const values = Array.from({ length: 6 }, (_, i) => Number(row[`s${i + 1}`] || 0));
  const student = isStudentClass(category);
  const ll = values.slice(0, student ? 4 : 3).reduce((a, b) => a + b, 0);
  const sl = student ? 0 : values.slice(3).reduce((a, b) => a + b, 0);
  return { ll, sl, gesamt: ll + sl };
}
