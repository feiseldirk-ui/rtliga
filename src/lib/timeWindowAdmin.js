export function windowSnapshot(row) {
  return row?.id == null ? null : { id: row.id, start: row.start, ende: row.ende };
}
export function toLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function validateWindow(draft, rows) {
  if (!draft.start || !draft.ende) return "Bitte Beginn und Ende vollständig angeben.";
  const start = new Date(draft.start).getTime(), end = new Date(draft.ende).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "Datum oder Uhrzeit ist ungültig.";
  if (toLocalInput(draft.start) !== draft.start || toLocalInput(draft.ende) !== draft.ende) {
    return "Diese Ortszeit existiert wegen der Zeitumstellung nicht. Bitte eine andere Uhrzeit wählen.";
  }
  if (start >= end) return "Das Ende muss nach dem Beginn liegen.";
  const conflicts = rows.filter(row => {
    if (Number(row.wettkampf) === Number(draft.wettkampf) || !row.start || !row.ende) return false;
    const a = new Date(row.start).getTime(), b = new Date(row.ende).getTime();
    return Number.isFinite(a) && Number.isFinite(b) && start <= b && end >= a;
  });
  return conflicts.length ? "Überschneidung mit " + conflicts.map(row => "WK" + row.wettkampf).join(", ") +
    ". Pro Saison darf nur ein WK gleichzeitig offen sein. Zwischen den Fenstern mindestens eine Minute Abstand lassen." : "";
}
export const initialWindowState = { rows: [], drafts: {}, feedback: {}, loading: true, loadError: "", pending: null };
export function windowReducer(state, action) {
  switch (action.type) {
    case "load": return { ...state, loading: true, loadError: "" };
    case "loaded": return { ...state, rows: action.rows, loading: false, loadError: "" };
    case "load-error": return { ...state, loading: false, loadError: action.message };
    case "edit": {
      const row = state.rows.find(item => Number(item.wettkampf) === action.wk);
      const draft = state.drafts[action.wk] || {
        wettkampf: action.wk, start: toLocalInput(row?.start), ende: toLocalInput(row?.ende), expected: windowSnapshot(row),
      };
      return { ...state, drafts: { ...state.drafts, [action.wk]: { ...draft, [action.field]: action.value } },
        feedback: { ...state.feedback, [action.wk]: null } };
    }
    case "discard": {
      const drafts = { ...state.drafts }; delete drafts[action.wk];
      return { ...state, drafts, feedback: { ...state.feedback, [action.wk]: { tone: "info", text: "Änderungen verworfen. Gespeicherter Stand übernommen." } } };
    }
    case "pending": return { ...state, pending: action.wk, feedback: { ...state.feedback, [action.wk]: { tone: "info", text: "Wird gespeichert …" } } };
    case "error": return { ...state, pending: null, feedback: { ...state.feedback, [action.wk]: { tone: "error", text: action.message } } };
    case "saved": {
      const drafts = { ...state.drafts }; delete drafts[action.wk];
      const rows = state.rows.filter(row => Number(row.wettkampf) !== action.wk);
      if (action.row) rows.push(action.row);
      return { ...state, rows, drafts, pending: null, feedback: { ...state.feedback, [action.wk]: { tone: "success", text: action.message } } };
    }
    default: return state;
  }
}
