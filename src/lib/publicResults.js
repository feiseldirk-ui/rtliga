const WK_MIN = 1;
const WK_MAX = 9;

function toInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

export function normalizePublicResults(rows = []) {
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row) => ({
      saison: String(row?.saison || ""),
      wettkampf: toInteger(row?.wettkampf),
      geschlossen_am: row?.geschlossen_am || null,
      verein: String(row?.verein || ""),
      vorname: String(row?.vorname || ""),
      nachname: String(row?.nachname || ""),
      altersklasse: String(row?.altersklasse || "Ohne Altersklasse"),
      s1: toInteger(row?.s1),
      s2: toInteger(row?.s2),
      s3: toInteger(row?.s3),
      s4: toInteger(row?.s4),
      s5: toInteger(row?.s5),
      s6: toInteger(row?.s6),
      ll: toInteger(row?.ll),
      sl: toInteger(row?.sl),
      gesamt: toInteger(row?.gesamt),
      status: String(row?.status || ""),
    }))
    .filter(
      (row) =>
        row.wettkampf >= WK_MIN &&
        row.wettkampf <= WK_MAX &&
        row.vorname.trim() &&
        row.nachname.trim(),
    );
}

export function getPublicRoundNumbers(rows = []) {
  return [...new Set(rows.map((row) => Number(row.wettkampf)).filter(Number.isFinite))].sort(
    (a, b) => a - b,
  );
}

export function getPublicSeason(rows = [], fallback = new Date().getFullYear()) {
  return String(rows.find((row) => row?.saison)?.saison || fallback);
}

export function getRoundClosedAt(rows = [], roundNumber) {
  return rows.find((row) => Number(row.wettkampf) === Number(roundNumber))?.geschlossen_am || null;
}
