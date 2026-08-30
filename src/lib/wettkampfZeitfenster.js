export function evaluateZeitfenster(item, currentTime) {
  if (!item?.start || !item?.ende) {
    return { code: "not_set", offen: false };
  }

  const start = new Date(item.start).getTime();
  const ende = new Date(item.ende).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(ende) || start >= ende) {
    return { code: "invalid", offen: false };
  }

  if (currentTime < start) {
    return { code: "upcoming", offen: false };
  }

  if (currentTime > ende) {
    return { code: "closed", offen: false };
  }

  return { code: "open", offen: true };
}
