const WK_ANZAHL = 9;

function parseNumber(text, key) {
  const match = String(text || "").match(new RegExp(`${key}=(\\d+)`, "i"));
  return match?.[1] ? Number(match[1]) : 0;
}

function getSeries(entry) {
  return Array.from({ length: 6 }, (_, index) => {
    const key = `s${index + 1}`;
    if (entry?.[key] != null) {
      return Number(entry[key] || 0);
    }
    return parseNumber(entry?.ergebnis, `S${index + 1}`);
  });
}

export function getEntryTotals(entry) {
  const ll = entry.ll != null ? Number(entry.ll || 0) : parseNumber(entry.ergebnis, "LL");
  const sl = entry.sl != null ? Number(entry.sl || 0) : parseNumber(entry.ergebnis, "SL");
  const gesamt =
    entry.gesamt != null ? Number(entry.gesamt || 0) : Number(ll + sl || parseNumber(entry.ergebnis, "Gesamt"));

  return { ll, sl, gesamt };
}

export function groupResultsForRound(entries = [], roundNumber, { includeClub = true } = {}) {
  const grouped = {};

  entries
    .filter((entry) => Number(entry.wettkampf) === Number(roundNumber))
    .forEach((entry) => {
      const klasse = entry.altersklasse || "Ohne Altersklasse";
      if (!grouped[klasse]) grouped[klasse] = [];
      const totals = getEntryTotals(entry);
      grouped[klasse].push({
        vorname: entry.vorname,
        nachname: entry.nachname,
        verein: includeClub ? entry.verein || "" : undefined,
        ll: totals.ll,
        sl: totals.sl,
        gesamt: totals.gesamt,
      });
    });

  Object.keys(grouped).forEach((klasse) => {
    grouped[klasse].sort((a, b) => {
      if (b.gesamt !== a.gesamt) return b.gesamt - a.gesamt;
      if (b.ll !== a.ll) return b.ll - a.ll;
      return `${a.nachname} ${a.vorname}`.localeCompare(`${b.nachname} ${b.vorname}`, "de");
    });
  });

  return grouped;
}

export function groupRoundProtocolDetailed(entries = [], roundNumber, { includeClub = true } = {}) {
  const grouped = {};

  entries
    .filter((entry) => Number(entry.wettkampf) === Number(roundNumber))
    .forEach((entry) => {
      const klasse = entry.altersklasse || "Ohne Altersklasse";
      if (!grouped[klasse]) grouped[klasse] = [];
      const totals = getEntryTotals(entry);
      const series = getSeries(entry);
      grouped[klasse].push({
        vorname: entry.vorname,
        nachname: entry.nachname,
        verein: includeClub ? entry.verein || "" : undefined,
        s1: series[0],
        s2: series[1],
        s3: series[2],
        s4: series[3],
        s5: series[4],
        s6: series[5],
        ll: totals.ll,
        sl: totals.sl,
        gesamt: totals.gesamt,
      });
    });

  Object.keys(grouped).forEach((klasse) => {
    grouped[klasse].sort((a, b) => {
      if (b.gesamt !== a.gesamt) return b.gesamt - a.gesamt;
      if (b.ll !== a.ll) return b.ll - a.ll;
      return `${a.nachname} ${a.vorname}`.localeCompare(`${b.nachname} ${b.vorname}`, "de");
    });
  });

  return grouped;
}

export function groupOverallResults(entries = [], closedRounds = [], { includeClub = true } = {}) {
  const closedSet = new Set((closedRounds || []).map((wk) => Number(wk)));
  const groupedMap = {};

  entries
    .filter((entry) => closedSet.has(Number(entry.wettkampf)))
    .forEach((entry) => {
      const key = `${entry.vorname}|${entry.nachname}|${entry.altersklasse}|${entry.verein || ""}`;
      if (!groupedMap[key]) {
        groupedMap[key] = {
          vorname: entry.vorname,
          nachname: entry.nachname,
          verein: includeClub ? entry.verein || "" : undefined,
          altersklasse: entry.altersklasse || "Ohne Altersklasse",
          punkte: Object.fromEntries(Array.from({ length: WK_ANZAHL }, (_, i) => [`WK${i + 1}`, ""])),
          gesamt: 0,
          besteWks: [],
        };
      }
      const totals = getEntryTotals(entry);
      groupedMap[key].punkte[`WK${Number(entry.wettkampf)}`] = totals.gesamt || "";
    });

  const byClass = {};
  Object.values(groupedMap).forEach((person) => {
    const entries = Object.entries(person.punkte)
      .filter(([wk, val]) => closedSet.has(Number(wk.replace("WK", ""))) && Number(val) > 0)
      .sort(([, a], [, b]) => Number(b) - Number(a));

    person.besteWks = entries.slice(0, 6).map(([wk]) => wk);
    person.gesamt = entries.slice(0, 6).reduce((sum, [, val]) => sum + Number(val || 0), 0);

    if (!byClass[person.altersklasse]) byClass[person.altersklasse] = [];
    byClass[person.altersklasse].push(person);
  });

  Object.keys(byClass).forEach((klasse) => {
    byClass[klasse].sort((a, b) => {
      if (b.gesamt !== a.gesamt) return b.gesamt - a.gesamt;
      return `${a.nachname} ${a.vorname}`.localeCompare(`${b.nachname} ${b.vorname}`, "de");
    });
  });

  return byClass;
}
