import test from "node:test";
import assert from "node:assert/strict";

import { evaluateZeitfenster } from "../src/lib/wettkampfZeitfenster.js";

const NOW = Date.parse("2026-08-30T12:00:00.000Z");

test("nicht gesetzte oder unvollständige Zeitfenster sind geschlossen", () => {
  assert.deepEqual(evaluateZeitfenster(undefined, NOW), { code: "not_set", offen: false });
  assert.deepEqual(evaluateZeitfenster({ start: "2026-08-30T11:00:00.000Z" }, NOW), { code: "not_set", offen: false });
  assert.deepEqual(evaluateZeitfenster({ ende: "2026-08-30T13:00:00.000Z" }, NOW), { code: "not_set", offen: false });
});

test("ungültige Zeitfenster werden nicht geöffnet", () => {
  assert.deepEqual(
    evaluateZeitfenster({ start: "ungültig", ende: "2026-08-30T13:00:00.000Z" }, NOW),
    { code: "invalid", offen: false },
  );
  assert.deepEqual(
    evaluateZeitfenster({ start: "2026-08-30T13:00:00.000Z", ende: "2026-08-30T12:00:00.000Z" }, NOW),
    { code: "invalid", offen: false },
  );
});

test("zukünftige und beendete Wettkämpfe bleiben geschlossen", () => {
  assert.deepEqual(
    evaluateZeitfenster({ start: "2026-08-30T13:00:00.000Z", ende: "2026-08-30T14:00:00.000Z" }, NOW),
    { code: "upcoming", offen: false },
  );
  assert.deepEqual(
    evaluateZeitfenster({ start: "2026-08-30T10:00:00.000Z", ende: "2026-08-30T11:00:00.000Z" }, NOW),
    { code: "closed", offen: false },
  );
});

test("nur das aktuelle Zeitfenster ist offen, einschließlich der Randzeitpunkte", () => {
  const item = { start: "2026-08-30T11:00:00.000Z", ende: "2026-08-30T13:00:00.000Z" };
  assert.deepEqual(evaluateZeitfenster(item, NOW), { code: "open", offen: true });
  assert.deepEqual(evaluateZeitfenster(item, Date.parse(item.start)), { code: "open", offen: true });
  assert.deepEqual(evaluateZeitfenster(item, Date.parse(item.ende)), { code: "open", offen: true });
});

test("aus neun Wettkämpfen wird genau der offene ausgewählt", () => {
  const zeitfenster = Array.from({ length: 9 }, (_, index) => ({
    wettkampf: index + 1,
    start: index === 4 ? "2026-08-30T11:00:00.000Z" : "2026-08-29T11:00:00.000Z",
    ende: index === 4 ? "2026-08-30T13:00:00.000Z" : "2026-08-29T13:00:00.000Z",
  }));

  const offeneWettkaempfe = zeitfenster.filter((item) => evaluateZeitfenster(item, NOW).offen);
  assert.deepEqual(offeneWettkaempfe.map((item) => item.wettkampf), [5]);
});
