export function gesamtTop6(teilnehmer) {
  const werte = [
    teilnehmer.wk1,
    teilnehmer.wk2,
    teilnehmer.wk3,
    teilnehmer.wk4,
    teilnehmer.wk5,
    teilnehmer.wk6,
    teilnehmer.wk7,
    teilnehmer.wk8,
    teilnehmer.wk9,
  ]
    .map(Number)
    .filter((w) => !isNaN(w) && w > 0);

  const top6 = werte.sort((a, b) => b - a).slice(0, 6);
  return top6.reduce((sum, val) => sum + val, 0);
}
