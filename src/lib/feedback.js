export const FEEDBACK_BUCKET = "feedback-screenshots";
export const MAX_FEEDBACK_SCREENSHOT_BYTES = 8 * 1024 * 1024;
export const FEEDBACK_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export const FEEDBACK_STATUS = ["neu", "in_pruefung", "vorgesehen", "erledigt", "abgelehnt"];
export const FEEDBACK_PRIORITIES = ["normal", "hoch", "dringend"];

export const FEEDBACK_AREA_OPTIONS = [
  "Vereinsbereich allgemein",
  "Teilnehmer",
  "Ergebnisse erfassen",
  "Meine Ergebnisse",
  "Rundenprotokolle",
  "Rangliste / Gesamtergebnisse",
  "WK-Zeitfenster",
  "Anmeldung und Sitzung",
  "Sonstiger Bereich",
];

export const FEEDBACK_STATUS_LABELS = {
  neu: "Neu",
  in_pruefung: "In Prüfung",
  vorgesehen: "Vorgesehen",
  erledigt: "Erledigt",
  abgelehnt: "Abgelehnt",
};

export const FEEDBACK_PRIORITY_LABELS = {
  normal: "Normal",
  hoch: "Hoch",
  dringend: "Dringend",
};

function cleanText(value) {
  return String(value || "").trim();
}

function extensionFor(file) {
  const mimeType = String(file?.type || "").toLowerCase();
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/jpeg") return "jpg";

  const extension = String(file?.name || "").split(".").pop()?.toLowerCase();
  return ["png", "jpg", "jpeg", "webp"].includes(extension) ? extension.replace("jpeg", "jpg") : "png";
}

export function validateFeedbackDraft({ title, description, screenshot }) {
  const cleanedTitle = cleanText(title);
  const cleanedDescription = cleanText(description);

  if (cleanedTitle.length < 3) return "Bitte eine kurze, aussagekräftige Überschrift eingeben.";
  if (cleanedTitle.length > 120) return "Die Überschrift darf höchstens 120 Zeichen enthalten.";
  if (cleanedDescription.length < 10) return "Bitte den Fehler oder Hinweis etwas genauer beschreiben.";
  if (cleanedDescription.length > 4000) return "Die Beschreibung darf höchstens 4.000 Zeichen enthalten.";

  if (screenshot && !FEEDBACK_IMAGE_TYPES.includes(String(screenshot.type || "").toLowerCase())) {
    return "Als Screenshot sind nur PNG, JPG oder WebP erlaubt.";
  }
  if (screenshot && Number(screenshot.size || 0) > MAX_FEEDBACK_SCREENSHOT_BYTES) {
    return "Der Screenshot darf höchstens 8 MB groß sein.";
  }

  return "";
}

export function createFeedbackStoragePath(userId, feedbackId, file) {
  const safeUserId = cleanText(userId);
  const safeFeedbackId = cleanText(feedbackId);
  if (!safeUserId || !safeFeedbackId) throw new Error("Feedback-Pfad kann nicht erstellt werden.");
  return `${safeUserId}/${safeFeedbackId}.${extensionFor(file)}`;
}

export function formatFeedbackForHandoff(feedback) {
  const createdAt = feedback?.created_at
    ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(feedback.created_at))
    : "unbekannt";
  const clubName = feedback?.vereine?.vereinsname || feedback?.verein_name || "unbekannt";
  const screenshot = feedback?.screenshot_path ? "vorhanden und separat beizufügen" : "nicht vorhanden";

  return [
    "RTLiga Meldung zur Prüfung und möglichen Anpassung",
    "",
    `Meldungs-ID: ${feedback?.id || "unbekannt"}`,
    `Eingegangen: ${createdAt}`,
    `Verein: ${clubName}`,
    `Art: ${feedback?.category || "unbekannt"}`,
    `Priorität: ${FEEDBACK_PRIORITY_LABELS[feedback?.priority] || feedback?.priority || "Normal"}`,
    `Bereich: ${feedback?.area || "nicht angegeben"}`,
    `Überschrift: ${feedback?.title || ""}`,
    "",
    "Beschreibung:",
    feedback?.description || "",
    "",
    `Screenshot: ${screenshot}`,
    `Seite: ${feedback?.page_url || "nicht angegeben"}`,
    `Gerät und Browser: ${feedback?.user_agent || "nicht angegeben"}`,
    `App-Version: ${feedback?.app_version || "nicht angegeben"}`,
    "",
    "Adminnotiz:",
    feedback?.admin_note || "Keine Adminnotiz.",
    "",
    "Bitte zuerst Ursache und Auswirkungen prüfen. Noch nichts veröffentlichen oder an der Datenbank ändern, bevor die vorgeschlagene Lösung und der Testumfang abgestimmt sind.",
  ].join("\n");
}
