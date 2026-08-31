import React, { useEffect, useMemo, useState } from "react";
import { evaluateZeitfenster } from "../../lib/wettkampfZeitfenster";
import {
  downloadWkCalendar,
  getValidWkTimeWindows,
  normalizeWkTimeWindows,
} from "../../lib/wkCalendarExport";

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function formatDateTime(value) {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatus(item, currentTime) {
  const status = evaluateZeitfenster(item, currentTime);
  if (status.code === "not_set") return { label: "Nicht festgelegt", cls: "border-zinc-200 bg-zinc-50 text-zinc-600" };
  if (status.code === "invalid") return { label: "Ungültig", cls: "border-rose-200 bg-rose-50 text-rose-700" };
  if (status.code === "upcoming") return { label: "Bevorstehend", cls: "border-sky-200 bg-sky-50 text-sky-700" };
  if (status.code === "closed") return { label: "Geschlossen", cls: "border-zinc-200 bg-zinc-50 text-zinc-600" };
  return { label: "Offen", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" };
}

export default function WkTimeWindowsModal({
  open,
  onClose,
  zeitfenster = [],
  loading = false,
  error = "",
  currentTime = Date.now(),
  season = new Date().getFullYear(),
}) {
  const [downloadMessage, setDownloadMessage] = useState("");
  const normalizedWindows = useMemo(() => normalizeWkTimeWindows(zeitfenster), [zeitfenster]);
  const validWindowCount = useMemo(() => getValidWkTimeWindows(normalizedWindows).length, [normalizedWindows]);

  useEffect(() => {
    if (!open) return undefined;
    setDownloadMessage("");
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const handleCalendarDownload = () => {
    try {
      const result = downloadWkCalendar(normalizedWindows, { season });
      if (!result.count) {
        setDownloadMessage("Es sind noch keine gültigen Zeitfenster für den Kalender vorhanden.");
        return;
      }
      setDownloadMessage(`${result.count} WK-Termine wurden als Kalenderdatei gespeichert.`);
    } catch {
      setDownloadMessage("Die Kalenderdatei konnte nicht erstellt werden. Bitte erneut versuchen.");
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wk-time-windows-title"
        className="max-h-[88vh] w-full max-w-4xl overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.28)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col gap-4 border-b border-zinc-200 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">Wettkampfrunden</p>
            <h3 id="wk-time-windows-title" className="mt-1 text-xl font-semibold text-zinc-950">WK-Zeitfenster</h3>
            <p className="mt-1 text-sm text-zinc-600">Die vom Admin hinterlegten Start- und Endzeiten der Wettkampfrunden.</p>
          </div>
          <div className="flex items-center gap-2 sm:justify-end">
            <button
              type="button"
              onClick={handleCalendarDownload}
              disabled={loading || !!error || validWindowCount === 0}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <DownloadIcon />
              Kalenderdatei herunterladen
            </button>
            <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-xl text-zinc-500 transition hover:bg-zinc-50" aria-label="Zeitfenster schließen">×</button>
          </div>
        </div>

        <div className="max-h-[calc(88vh-104px)] overflow-y-auto p-5 sm:p-6">
          {downloadMessage ? (
            <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{downloadMessage}</div>
          ) : null}

          {loading ? (
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">Zeitfenster werden geladen…</div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 9 }, (_, index) => {
                  const wk = index + 1;
                  const item = normalizedWindows.find((entry) => Number(entry.wettkampf) === wk);
                  const status = getStatus(item, currentTime);
                  return (
                    <div key={wk} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-base font-semibold text-zinc-900">WK{wk}</div>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${status.cls}`}>{status.label}</span>
                      </div>
                      <dl className="mt-4 space-y-3 text-sm">
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Beginn</dt>
                          <dd className="mt-1 font-medium text-zinc-900">{formatDateTime(item?.start)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Ende</dt>
                          <dd className="mt-1 font-medium text-zinc-900">{formatDateTime(item?.ende)}</dd>
                        </div>
                      </dl>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-xs leading-5 text-zinc-500">
                Die Kalenderdatei enthält alle gültigen Zeitfenster der Saison {season} und kann in Outlook, Google Kalender oder einem Smartphone-Kalender importiert werden.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
