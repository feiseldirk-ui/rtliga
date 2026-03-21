import React, { useMemo, useState } from "react";

const SECTION_CARD =
  "overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)]";

const EMPTY_STATE =
  "rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-10 text-center text-sm text-zinc-500";

const AGE_ORDER = ["Schüler", "Jugend", "Junioren", "Damen", "Herren", "Altersklasse"];

function SortHeader({ label, current, options, onChange }) {
  const [open, setOpen] = useState(false);
  const activeLabel = options.find((opt) => opt.value === current)?.label || "Sortieren";

  return (
    <div className="relative inline-flex items-center gap-2">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-[11px] text-zinc-600 shadow-sm transition hover:bg-zinc-50"
      >
        ▾
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-20 mt-2 min-w-[180px] overflow-hidden rounded-2xl border border-zinc-200 bg-white p-1 shadow-[0_18px_36px_rgba(16,24,40,0.14)]">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${current === option.value ? "bg-indigo-50 text-indigo-700" : "text-zinc-700 hover:bg-zinc-50"}`}
            >
              <span>{option.label}</span>
              {current === option.value ? <span>✓</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      <span className="sr-only">Aktive Sortierung: {activeLabel}</span>
    </div>
  );
}

export default function TeilnehmerPanel({
  teilnehmer = [],
  form,
  setForm,
  bearbeiteId,
  onAdd,
  onUpdate,
  onCancelEdit,
  onEdit,
  onDelete,
  gesperrtFn,
  altersklassen = [],
  loading = false,
}) {
  const [nameSort, setNameSort] = useState("none");
  const [ageSort, setAgeSort] = useState("none");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (bearbeiteId) {
      onUpdate();
    } else {
      onAdd();
    }
  };

  const sortedTeilnehmer = useMemo(() => {
    const list = [...teilnehmer];
    list.sort((a, b) => {
      if (ageSort !== "none") {
        const ai = AGE_ORDER.indexOf(a.altersklasse || "");
        const bi = AGE_ORDER.indexOf(b.altersklasse || "");
        if (ai !== bi) {
          return ageSort === "asc" ? ai - bi : bi - ai;
        }
      }

      if (nameSort !== "none") {
        const an = `${a.name || ""} ${a.vorname || ""}`.trim();
        const bn = `${b.name || ""} ${b.vorname || ""}`.trim();
        const cmp = an.localeCompare(bn, "de", { sensitivity: "base" });
        if (cmp !== 0) return nameSort === "asc" ? cmp : -cmp;
      }

      return 0;
    });
    return list;
  }, [teilnehmer, nameSort, ageSort]);

  return (
    <div className={SECTION_CARD}>
      <div className="border-b border-zinc-200 bg-gradient-to-r from-white to-zinc-50 px-6 py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">
              Teilnehmerverwaltung
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-900">
              Teilnehmer verwalten
            </h2>
            <p className="mt-2 text-sm text-zinc-600 sm:text-base">
              Teilnehmer hinzufügen, bearbeiten oder löschen.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600 shadow-sm">
            <span className="font-semibold text-zinc-900">{teilnehmer.length}</span> Teilnehmer geladen
          </div>
        </div>
      </div>

      <div className="space-y-6 px-6 py-6">
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-700">
          <span className="font-semibold text-zinc-900">Hinweis:</span> Bitte auf korrekte
          Schreibweise (Vor- und Nachname) und die richtige Altersklasse achten – sobald
          Ergebnisse erfasst sind, sind Änderungen an den Teilnehmerdaten nicht mehr möglich.
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr_auto] xl:items-end">
            <div>
              <label className="mb-2 block text-sm font-semibold text-zinc-700">Vorname</label>
              <input
                type="text"
                value={form.vorname}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    vorname: e.target.value,
                  }))
                }
                placeholder="Vorname"
                className="input w-full"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-zinc-700">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
                placeholder="Name"
                className="input w-full"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-zinc-700">Altersklasse</label>
              <select
                value={form.altersklasse}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    altersklasse: e.target.value,
                  }))
                }
                className={`input w-full ${!form.altersklasse ? "text-zinc-400" : "text-zinc-900"}`}
              >
                <option value="" disabled hidden>
                  Altersklasse wählen
                </option>
                {altersklassen.map((ak) => (
                  <option key={ak} value={ak}>
                    {ak}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 xl:pb-[1px]">
              <button type="submit" className="btn btn-primary min-w-[170px]">
                {bearbeiteId ? "Speichern" : "Hinzufügen"}
              </button>

              {bearbeiteId && (
                <button type="button" className="btn btn-secondary" onClick={onCancelEdit}>
                  Abbrechen
                </button>
              )}
            </div>
          </div>
        </form>

        <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">
                    Vorname
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">
                    <SortHeader
                      label="Name"
                      current={nameSort}
                      onChange={setNameSort}
                      options={[
                        { value: "none", label: "Keine Sortierung" },
                        { value: "asc", label: "A → Z" },
                        { value: "desc", label: "Z → A" },
                      ]}
                    />
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">
                    <SortHeader
                      label="Altersklasse"
                      current={ageSort}
                      onChange={setAgeSort}
                      options={[
                        { value: "none", label: "Keine Sortierung" },
                        { value: "asc", label: "Aufsteigend" },
                        { value: "desc", label: "Absteigend" },
                      ]}
                    />
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">
                    Status
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">
                    Aktionen
                  </th>
                </tr>
              </thead>

              <tbody className="bg-white">
                {loading ? (
                  <tr>
                    <td colSpan="5" className="px-4 py-8">
                      <div className={EMPTY_STATE}>Teilnehmer werden geladen …</div>
                    </td>
                  </tr>
                ) : sortedTeilnehmer.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-4 py-8">
                      <div className={EMPTY_STATE}>Noch keine Teilnehmer vorhanden.</div>
                    </td>
                  </tr>
                ) : (
                  sortedTeilnehmer.map((t) => {
                    const locked = gesperrtFn?.(t);

                    return (
                      <tr key={t.id} className="border-t border-zinc-200">
                        <td className="px-4 py-4 text-sm font-medium text-zinc-900">{t.vorname}</td>
                        <td className="px-4 py-4 text-sm text-zinc-900">{t.name}</td>
                        <td className="px-4 py-4 text-sm text-zinc-900">{t.altersklasse}</td>

                        <td className="px-4 py-4 text-sm">
                          {locked ? (
                            <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">
                              Protokolliert
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                              Änderbar
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-4 text-sm">
                          {locked ? (
                            <span className="text-zinc-500">
                              Ergebnisse sind erfasst – Änderungen an den Teilnehmerdaten sind nicht mehr möglich.
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="btn-mini"
                                onClick={() => onEdit?.(t)}
                              >
                                Bearbeiten
                              </button>

                              <button
                                type="button"
                                className="btn-mini"
                                onClick={() => onDelete?.(t.id)}
                              >
                                Löschen
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
