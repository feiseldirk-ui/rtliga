import test from "node:test";
import assert from "node:assert/strict";

import { createAppIconSvg, getBrandYear } from "../src/lib/branding.js";

test("Branding derives the displayed year from the supplied date", () => {
  assert.equal(getBrandYear(new Date("2026-12-31T12:00:00Z")), 2026);
  assert.equal(getBrandYear(new Date("2027-01-01T12:00:00Z")), 2027);
});

test("App icon contains the requested season year and no Vite mark", () => {
  const icon = createAppIconSvg(2027);
  assert.match(icon, />2027<\/text>/);
  assert.match(icon, /Online-Liga/);
  assert.match(icon, /Laufende Scheibe/);
  assert.doesNotMatch(icon, /vite/i);
});
