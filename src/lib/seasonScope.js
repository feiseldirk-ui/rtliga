import { loadSeasonSettings } from './seasonSettings';

export function getActiveSeason(settingsLike = null) {
  if (typeof settingsLike === "number" && Number.isFinite(settingsLike)) return settingsLike;
  const settings = settingsLike || loadSeasonSettings();
  const numeric = Number(settings?.activeSeason);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : new Date().getFullYear();
}

export function seasonFilterValue(settingsLike = null) {
  return String(getActiveSeason(settingsLike));
}

export function seasonOrNullFilter(query, settingsLike = null) {
  const season = getActiveSeason(settingsLike);
  return query.or(`saison.is.null,saison.eq.${season}`);
}

export function withSeasonPayload(payload, settingsLike = null) {
  return { ...payload, saison: getActiveSeason(settingsLike) };
}
