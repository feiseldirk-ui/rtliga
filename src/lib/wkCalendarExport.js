const WK_MIN = 1;
const WK_MAX = 9;

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function escapeCalendarText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function formatUtc(date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function normalizeWkTimeWindows(rows = []) {
  if (!Array.isArray(rows)) return [];

  const byRound = new Map();
  rows.forEach((row) => {
    const wettkampf = Number(row?.wettkampf);
    if (!Number.isInteger(wettkampf) || wettkampf < WK_MIN || wettkampf > WK_MAX) return;

    byRound.set(wettkampf, {
      saison: row?.saison == null ? "" : String(row.saison),
      wettkampf,
      start: row?.start ?? row?.start_at ?? null,
      ende: row?.ende ?? row?.end_at ?? null,
    });
  });

  return [...byRound.values()].sort((a, b) => a.wettkampf - b.wettkampf);
}

export function isValidWkTimeWindow(item) {
  const start = toDate(item?.start);
  const ende = toDate(item?.ende);
  return !!start && !!ende && start.getTime() < ende.getTime();
}

export function getValidWkTimeWindows(rows = []) {
  return normalizeWkTimeWindows(rows).filter(isValidWkTimeWindow);
}

export function buildWkCalendar(rows = [], options = {}) {
  const season = String(options.season || new Date().getFullYear());
  const generatedAt = toDate(options.generatedAt) || new Date();
  const sourceUrl = options.sourceUrl || "https://feiseldirk-ui.github.io/rtliga/";
  const validWindows = getValidWkTimeWindows(rows);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RTLiga//WK-Zeitfenster//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeCalendarText(`RTLiga WK-Zeitfenster ${season}`)}`,
  ];

  validWindows.forEach((item) => {
    const start = toDate(item.start);
    const ende = toDate(item.ende);
    const wk = item.wettkampf;

    lines.push(
      "BEGIN:VEVENT",
      `UID:rtliga-${escapeCalendarText(season)}-wk${wk}@feiseldirk-ui.github.io`,
      `DTSTAMP:${formatUtc(generatedAt)}`,
      `DTSTART:${formatUtc(start)}`,
      `DTEND:${formatUtc(ende)}`,
      `SUMMARY:${escapeCalendarText(`RTLiga WK${wk} - Zeitfenster`)}`,
      `DESCRIPTION:${escapeCalendarText("Zeitraum für die Ergebniserfassung der RTLiga.")}`,
      `URL:${escapeCalendarText(sourceUrl)}`,
      "END:VEVENT",
    );
  });

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

export function getWkCalendarFileName(season = new Date().getFullYear()) {
  const safeSeason = String(season).replace(/[^0-9A-Za-z_-]/g, "") || String(new Date().getFullYear());
  return `RTLiga_WK-Zeitfenster_${safeSeason}.ics`;
}

export function downloadWkCalendar(rows = [], options = {}) {
  const validWindows = getValidWkTimeWindows(rows);
  if (!validWindows.length) return { count: 0, fileName: "" };

  const fileName = getWkCalendarFileName(options.season);
  const calendar = buildWkCalendar(validWindows, options);
  const blob = new Blob([calendar], { type: "text/calendar;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);

  return { count: validWindows.length, fileName };
}
