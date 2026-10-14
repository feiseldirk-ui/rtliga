import test from "node:test";
import assert from "node:assert/strict";

import {
  createFeedbackStoragePath,
  formatFeedbackForHandoff,
  validateFeedbackDraft,
} from "../src/lib/feedback.js";

test("feedback validation accepts a useful report", () => {
  assert.equal(validateFeedbackDraft({
    title: "Speichern nicht möglich",
    description: "Beim Speichern erscheint eine Fehlermeldung.",
    screenshot: { type: "image/png", size: 1024 },
  }), "");
});

test("feedback validation rejects unsupported or oversized screenshots", () => {
  assert.match(validateFeedbackDraft({
    title: "Fehler beim Speichern",
    description: "Eine ausreichend lange Beschreibung.",
    screenshot: { type: "application/pdf", size: 1024 },
  }), /PNG, JPG oder WebP/);

  assert.match(validateFeedbackDraft({
    title: "Fehler beim Speichern",
    description: "Eine ausreichend lange Beschreibung.",
    screenshot: { type: "image/png", size: 9 * 1024 * 1024 },
  }), /8 MB/);
});

test("feedback screenshot paths are isolated by user and report id", () => {
  assert.equal(
    createFeedbackStoragePath("user-1", "report-1", { type: "image/jpeg", name: "Bild.jpeg" }),
    "user-1/report-1.jpg",
  );
});

test("handoff text contains the report and warns against unapproved changes", () => {
  const text = formatFeedbackForHandoff({
    id: "abc",
    category: "fehler",
    priority: "hoch",
    area: "Erfassen",
    title: "Speichern nicht möglich",
    description: "Fehler erscheint nach dem Tippen auf Speichern.",
    screenshot_path: "user/abc.png",
    vereine: { vereinsname: "Testverein" },
  });

  assert.match(text, /Testverein/);
  assert.match(text, /Screenshot: vorhanden/);
  assert.match(text, /Noch nichts veröffentlichen/);
});
