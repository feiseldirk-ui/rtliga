import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWkCalendar,
  getValidWkTimeWindows,
  getWkCalendarFileName,
  normalizeWkTimeWindows,
} from "../src/lib/wkCalendarExport.js";

test("WK-Zeitfenster werden normalisiert, sortiert und auf WK1 bis WK9 begrenzt", () => {
  const rows = normalizeWkTimeWindows([
    { saison: 2026, wettkampf: "9", start: "2026-07-01T14:00:00.000Z", ende: "2026-09-03T14:00:00.000Z" },
    { saison: 2026, wettkampf: 2, start_at: "2026-01-30T16:05:00.000Z", end_at: "2026-01-30T16:06:00.000Z" },
    { saison: 2026, wettkampf: 10, start: "2026-01-01", ende: "2026-01-02" },
  ]);

  assert.deepEqual(rows.map((row) => row.wettkampf), [2, 9]);
  assert.equal(rows[0].start, "2026-01-30T16:05:00.000Z");
  assert.equal(rows[0].ende, "2026-01-30T16:06:00.000Z");
});

test("nur vollständig gültige Zeitfenster werden für den Kalender verwendet", () => {
  const rows = getValidWkTimeWindows([
    { wettkampf: 1, start: "2026-01-08T15:08:00.000Z", ende: "2026-01-10T15:08:00.000Z" },
    { wettkampf: 2, start: "ungültig", ende: "2026-01-30T16:06:00.000Z" },
    { wettkampf: 3, start: "2026-02-01T12:00:00.000Z", ende: "2026-01-01T12:00:00.000Z" },
    { wettkampf: 4, start: null, ende: null },
  ]);

  assert.deepEqual(rows.map((row) => row.wettkampf), [1]);
});

test("ICS-Datei enthält für jedes gültige WK genau einen Termin", () => {
  const calendar = buildWkCalendar(
    [
      { wettkampf: 1, start: "2026-01-08T15:08:00.000Z", ende: "2026-01-10T15:08:00.000Z" },
      { wettkampf: 9, start: "2026-07-01T14:00:00.000Z", ende: "2026-09-03T14:00:00.000Z" },
      { wettkampf: 6, start: "2026-04-01T14:00:00.000Z", ende: "2026-02-09T15:01:00.000Z" },
    ],
    {
      season: 2026,
      generatedAt: "2026-08-31T10:11:12.000Z",
      sourceUrl: "https://example.test/rtliga/",
    },
  );

  assert.equal((calendar.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(calendar, /DTSTAMP:20260831T101112Z\r\n/);
  assert.match(calendar, /DTSTART:20260108T150800Z\r\n/);
  assert.match(calendar, /DTEND:20260110T150800Z\r\n/);
  assert.match(calendar, /SUMMARY:RTLiga WK9 - Zeitfenster\r\n/);
  assert.match(calendar, /URL:https:\/\/example\.test\/rtliga\/\r\n/);
  assert.ok(calendar.endsWith("END:VCALENDAR\r\n"));
});

test("Kalenderdateiname enthält die Saison und die Endung .ics", () => {
  assert.equal(getWkCalendarFileName(2026), "RTLiga_WK-Zeitfenster_2026.ics");
});
