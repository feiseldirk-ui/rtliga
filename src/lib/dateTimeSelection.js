export const pad2 = number => String(number).padStart(2, "0");
export const dateKey = (year, month, day) => `${year}-${pad2(month + 1)}-${pad2(day)}`;

export function calendarCells(year, month) {
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  return [...Array(offset).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)];
}

export function selectionError(date, hour, minute, originalRevision, currentRevision) {
  if (originalRevision !== currentRevision) return "Der Wert wurde inzwischen geändert. Bitte abbrechen und die Auswahl erneut öffnen.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}$/.test(hour) || !/^\d{2}$/.test(minute)) {
    return "Bitte Datum, Stunde und Minute auswählen.";
  }
  const [year, month, day] = date.split("-").map(Number);
  const h = Number(hour), m = Number(minute);
  const value = new Date(year, month - 1, day, h, m);
  if (year < 1000 || year > 9999 || value.getFullYear() !== year || value.getMonth() !== month - 1 || value.getDate() !== day || h > 23 || m > 59) {
    return "Bitte ein gültiges Datum und eine gültige Uhrzeit auswählen.";
  }
  if (value.getHours() !== h || value.getMinutes() !== m) return "Diese Ortszeit existiert wegen der Zeitumstellung nicht. Bitte eine andere Uhrzeit wählen.";
  return "";
}
