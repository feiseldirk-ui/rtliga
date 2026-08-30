import test from "node:test";
import assert from "node:assert/strict";

import {
  getPublicRoundNumbers,
  getPublicSeason,
  normalizePublicResults,
} from "../src/lib/publicResults.js";
import { groupOverallResults } from "../src/lib/resultsProcessing.js";

test("öffentliche Ergebnisdaten werden normalisiert und unbrauchbare Zeilen verworfen", () => {
  const rows = normalizePublicResults([
    { saison: 2026, wettkampf: "2", vorname: "Anna", nachname: "Test", gesamt: "510" },
    { saison: 2026, wettkampf: 12, vorname: "Falsch", nachname: "Runde" },
    { saison: 2026, wettkampf: 3, vorname: "", nachname: "Ohne Vorname" },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].wettkampf, 2);
  assert.equal(rows[0].gesamt, 510);
  assert.equal(rows[0].altersklasse, "Ohne Altersklasse");
});

test("geschlossene Runden werden eindeutig und aufsteigend aufgelistet", () => {
  const rows = [{ wettkampf: 5 }, { wettkampf: 2 }, { wettkampf: 5 }, { wettkampf: 1 }];
  assert.deepEqual(getPublicRoundNumbers(rows), [1, 2, 5]);
});

test("Gesamtrangliste wertet ausschließlich übergebene geschlossene Runden", () => {
  const rows = [
    { saison: "2026", wettkampf: 1, vorname: "Anna", nachname: "Test", altersklasse: "Damen", verein: "SV A", gesamt: 500 },
    { saison: "2026", wettkampf: 2, vorname: "Anna", nachname: "Test", altersklasse: "Damen", verein: "SV A", gesamt: 510 },
    { saison: "2026", wettkampf: 9, vorname: "Anna", nachname: "Test", altersklasse: "Damen", verein: "SV A", gesamt: 600 },
  ];
  const grouped = groupOverallResults(rows, [1, 2], { includeClub: true });

  assert.equal(grouped.Damen[0].gesamt, 1010);
  assert.equal(grouped.Damen[0].punkte.WK9, "");
  assert.equal(getPublicSeason(rows, 2025), "2026");
});
