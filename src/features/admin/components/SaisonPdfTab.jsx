import React, { useEffect, useMemo, useRef, useState } from "react";
import PdfPreviewPage from "../../../shared/pdf/PdfPreviewPage";
import {
  applyEditorElementsToSettings,
  createImageElement,
  createTextElement,
  getEditorElements,
  buildRoundTitle,
  EDITOR_CANVAS_WIDTH,
} from "../../../shared/pdf/editorLayout";
import {
  fileToDataUrl,
  loadSeasonSettings,
  loadSeasonSettingsFromSupabase,
  saveSeasonSettings,
  saveSeasonSettingsToSupabase,
  uploadPdfLogoToSupabase,
} from "../../../lib/seasonSettings";

const SAMPLE_OVERALL = {
  Herren: [
    { platz: 1, name: "Max Muster", verein: "SV Test", wkValues: Array.from({ length: 9 }, (_, i) => ({ text: i < 6 ? `${298 - i}` : `${292 - i}`, strikeout: i > 5 })), gesamt: 1779 },
    { platz: 2, name: "Paul Beispiel", verein: "SG Probe", wkValues: Array.from({ length: 9 }, (_, i) => ({ text: i < 6 ? `${294 - i}` : `${289 - i}`, strikeout: i > 5 })), gesamt: 1752 },
  ],
  Damen: [
    { platz: 1, name: "Anna Vorlage", verein: "BSV Demo", wkValues: Array.from({ length: 9 }, (_, i) => ({ text: i < 6 ? `${291 - i}` : `${286 - i}`, strikeout: i > 5 })), gesamt: 1734 },
  ],
};

const SAMPLE_ROUND = {
  Herren: [
    { platz: 1, name: "Max Muster", verein: "SV Test", wk1: 298, wk2: 297, wk3: 296, wk4: 295, wk5: 294, wk6: 293, wk7: 292, wk8: 291, wk9: 290 },
    { platz: 2, name: "Paul Beispiel", verein: "SG Probe", wk1: 294, wk2: 293, wk3: 292, wk4: 291, wk5: 290, wk6: 289, wk7: 288, wk8: 287, wk9: 286 },
  ],
};

const FONT_OPTIONS = ["Arial", "Helvetica", "Times New Roman", "Georgia", "Verdana"];

function arraysEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function StatusBanner({ syncState, notice, dirty, isSaving, saveStage }) {
  const toneClasses =
    notice.type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : notice.type === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-zinc-200 bg-zinc-50 text-zinc-700";
  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${toneClasses}`}>
      {isSaving
        ? saveStage === "remote"
          ? "Layout ist lokal gespeichert und wird gerade mit Supabase synchronisiert…"
          : "Layout wird lokal gesichert…"
        : notice.message || (dirty ? "Es gibt noch ungespeicherte Änderungen." : syncState === "synced" ? "Layout ist mit Supabase synchronisiert." : "Layout ist lokal geladen." )}
    </div>
  );
}

function GeneralInput({ label, value, onChange, type = "text" }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</span>
      <input
        type={type}
        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
        value={value}
        onChange={onChange}
      />
    </label>
  );
}

function GeneralTextarea({ label, value, onChange, rows = 3 }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</span>
      <textarea
        rows={rows}
        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
        value={value}
        onChange={onChange}
      />
    </label>
  );
}

function SelectedElementPanel({ element, onChange, onDelete, onUpload, onAlignField, uploading }) {
  if (!element) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-sm text-zinc-500">
        Ein Element in der Vorschau anklicken, um Text, Größe, Schrift oder Bild zu bearbeiten.
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Ausgewählt</p>
          <h4 className="mt-1 text-lg font-semibold text-zinc-900">
            {element.type === "image" ? "Bild / Logo" : "Textfeld"}
          </h4>
          <p className="mt-1 text-sm text-zinc-500">Rolle: {element.role}</p>
        </div>
        {element.role.startsWith("custom") ? (
          <button type="button" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700" onClick={onDelete}>
            Element löschen
          </button>
        ) : null}
      </div>

      {element.type === "text" ? (
        <>
          <GeneralTextarea label="Text" value={element.text} onChange={(event) => onChange({ text: event.target.value })} rows={4} />
          <div className="grid gap-3 sm:grid-cols-2">
            <GeneralInput label="X" type="number" value={element.x} onChange={(event) => onChange({ x: Number(event.target.value || 0) })} />
            <GeneralInput label="Y" type="number" value={element.y} onChange={(event) => onChange({ y: Number(event.target.value || 0) })} />
            <GeneralInput label="Breite" type="number" value={element.width} onChange={(event) => onChange({ width: Number(event.target.value || 0) })} />
            <GeneralInput label="Höhe" type="number" value={element.height} onChange={(event) => onChange({ height: Number(event.target.value || 0) })} />
            <GeneralInput label="Schriftgröße" type="number" value={element.fontSize} onChange={(event) => onChange({ fontSize: Number(event.target.value || 0) })} />
            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Schriftart</span>
              <select
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
                value={element.fontFamily}
                onChange={(event) => onChange({ fontFamily: event.target.value })}
              >
                {FONT_OPTIONS.map((font) => (
                  <option key={font} value={font}>{font}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Text ausrichten</span>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "left", label: "Links" },
                { value: "center", label: "Zentriert" },
                { value: "right", label: "Rechts" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${element.textAlign === option.value ? "border-violet-500 bg-violet-600 text-white shadow-sm" : "border-zinc-200 bg-white text-zinc-700 hover:border-violet-300 hover:bg-violet-50"}`}
                  onClick={() => onChange({ textAlign: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Textfeld ausrichten</span>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "left", label: "Links" },
                { value: "center", label: "Zentriert" },
                { value: "right", label: "Rechts" },
              ].map((option) => (
                <button
                  key={`field-${option.value}`}
                  type="button"
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:border-violet-300 hover:bg-violet-50"
                  onClick={() => onAlignField(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`rounded-xl px-3 py-2 text-sm font-semibold ${element.fontWeight === "bold" ? "bg-violet-600 text-white" : "border border-zinc-200 bg-white text-zinc-700"}`}
              onClick={() => onChange({ fontWeight: element.fontWeight === "bold" ? "normal" : "bold" })}
            >
              {element.fontWeight === "bold" ? "Fett aktiv" : "Fett einschalten"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="mb-2 text-sm font-semibold text-zinc-800">Bilddatei</div>
            <input type="file" accept="image/*" onChange={(event) => onUpload(event.target.files?.[0] || null)} className="block w-full text-sm text-zinc-600" />
            <p className="mt-2 text-xs text-zinc-500">{uploading ? "Upload läuft…" : element.storagePath || (element.src ? "Nur lokal eingebunden" : "Noch kein Bild gewählt")}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <GeneralInput label="X" type="number" value={element.x} onChange={(event) => onChange({ x: Number(event.target.value || 0) })} />
            <GeneralInput label="Y" type="number" value={element.y} onChange={(event) => onChange({ y: Number(event.target.value || 0) })} />
            <GeneralInput label="Breite" type="number" value={element.width} onChange={(event) => onChange({ width: Number(event.target.value || 0) })} />
            <GeneralInput label="Höhe" type="number" value={element.height} onChange={(event) => onChange({ height: Number(event.target.value || 0) })} />
          </div>
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Logofeld ausrichten</span>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "left", label: "Links" },
                { value: "center", label: "Zentriert" },
                { value: "right", label: "Rechts" },
              ].map((option) => (
                <button
                  key={`image-field-${option.value}`}
                  type="button"
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:border-violet-300 hover:bg-violet-50"
                  onClick={() => onAlignField(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function SaisonPdfTab() {
  const [previewMode, setPreviewMode] = useState("overall");
  const [showGrid, setShowGrid] = useState(true);
  const [savedSettings, setSavedSettings] = useState(loadSeasonSettings());
  const [draftSettings, setDraftSettings] = useState(loadSeasonSettings());
  const [previewRoundNumber, setPreviewRoundNumber] = useState(1);
  const [selectedElementId, setSelectedElementId] = useState("");
  const [syncState, setSyncState] = useState("local");
  const [notice, setNotice] = useState({ type: "info", message: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [saveStage, setSaveStage] = useState("idle");
  const [uploadingLogoSide, setUploadingLogoSide] = useState("");
  const [justSaved, setJustSaved] = useState(false);
  const saveFeedbackTimeoutRef = useRef(null);

  useEffect(() => () => {
    if (saveFeedbackTimeoutRef.current) {
      window.clearTimeout(saveFeedbackTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    let active = true;
    loadSeasonSettingsFromSupabase().then((settingsFromSupabase) => {
      if (!active || !settingsFromSupabase) return;
      setSavedSettings(settingsFromSupabase);
      setDraftSettings(settingsFromSupabase);
      setSyncState("synced");
      setNotice({ type: "success", message: "PDF-Layout aus Supabase geladen." });
    });
    return () => {
      active = false;
    };
  }, []);

  const titleText = previewMode === "overall"
    ? draftSettings.overallHeaderText || [draftSettings.overallTitle, draftSettings.subtitle].filter(Boolean).join("\n")
    : buildRoundTitle(draftSettings.roundTitle, previewRoundNumber);

  const currentElements = useMemo(
    () => getEditorElements(draftSettings, previewMode, titleText),
    [draftSettings, previewMode, titleText]
  );

  useEffect(() => {
    if (!currentElements.some((element) => element.id === selectedElementId)) {
      setSelectedElementId(currentElements[0]?.id || "");
    }
  }, [currentElements, selectedElementId]);

  const selectedElement = currentElements.find((element) => element.id === selectedElementId) || null;
  const dirty = JSON.stringify(draftSettings) !== JSON.stringify(savedSettings);

  const updateDraft = (nextSettings) => {
    if (justSaved) setJustSaved(false);
    setDraftSettings(nextSettings);
    setNotice({ type: "info", message: "" });
  };

  const commitElements = (nextElements) => {
    updateDraft(applyEditorElementsToSettings(draftSettings, previewMode, nextElements));
  };

  const updateSelectedElement = (partial) => {
    if (!selectedElement) return;
    const nextElements = currentElements.map((element) =>
      element.id === selectedElement.id ? { ...element, ...partial } : element
    );
    commitElements(nextElements);
  };

  const alignSelectedElement = (alignment) => {
    if (!selectedElement) return;
    const maxX = Math.max(0, EDITOR_CANVAS_WIDTH - selectedElement.width);
    const nextX = alignment === "right"
      ? maxX
      : alignment === "center"
        ? Math.round(maxX / 2)
        : 0;
    updateSelectedElement({ x: nextX });
  };

  const addTextElement = () => {
    const next = [...currentElements, createTextElement(previewMode, currentElements.length + 1)];
    commitElements(next);
    setSelectedElementId(next.at(-1)?.id || "");
  };

  const addImageElement = () => {
    const next = [...currentElements, createImageElement(previewMode, currentElements.length + 1)];
    commitElements(next);
    setSelectedElementId(next.at(-1)?.id || "");
  };

  const removeSelectedElement = () => {
    if (!selectedElement || !selectedElement.role.startsWith("custom")) return;
    const next = currentElements.filter((element) => element.id !== selectedElement.id);
    commitElements(next);
    setSelectedElementId(next[0]?.id || "");
  };

  const persistDraft = async () => {
    if (isSaving) return;
    if (saveFeedbackTimeoutRef.current) {
      window.clearTimeout(saveFeedbackTimeoutRef.current);
      saveFeedbackTimeoutRef.current = null;
    }
    setJustSaved(false);
    setIsSaving(true);
    setSaveStage("local");
    const locallySaved = saveSeasonSettings(draftSettings);
    setSavedSettings(locallySaved);
    setDraftSettings(locallySaved);
    setSyncState("syncing");

    try {
      window.dispatchEvent(new CustomEvent("rtliga-admin-refresh", { detail: { source: "pdf-editor", phase: "local-save" } }));
      setSaveStage("remote");
      const result = await Promise.race([
        saveSeasonSettingsToSupabase(locallySaved),
        new Promise((resolve) => {
          window.setTimeout(() => resolve({ ok: false, reason: "timeout" }), 12000);
        }),
      ]);
      if (result.ok) {
        setSyncState("synced");
        setJustSaved(true);
        setNotice({ type: "success", message: `Layout für Saison ${result.season || locallySaved.activeSeason} gespeichert.` });
        window.dispatchEvent(new CustomEvent("rtliga-admin-refresh", { detail: { source: "pdf-editor", phase: "remote-save" } }));
        saveFeedbackTimeoutRef.current = window.setTimeout(() => {
          setJustSaved(false);
          saveFeedbackTimeoutRef.current = null;
        }, 2500);
      } else {
        setSyncState("local");
        setNotice({ type: "warning", message: result.reason === "timeout" ? "Layout lokal gespeichert. Die Supabase-Synchronisierung hat zu lange gedauert und wurde beendet." : "Layout lokal gespeichert, aber nicht vollständig mit Supabase synchronisiert." });
        window.dispatchEvent(new CustomEvent("rtliga-admin-refresh", { detail: { source: "pdf-editor", phase: "fallback-save" } }));
      }
    } finally {
      setIsSaving(false);
      setSaveStage("idle");
    }
  };

  const resetDraft = () => {
    setDraftSettings(savedSettings);
    setNotice({ type: "info", message: "Änderungen verworfen." });
  };

  const handleSelectedImageUpload = async (file) => {
    if (!selectedElement || !file) return;
    const side = selectedElement.role === "leftLogo" ? "left" : selectedElement.role === "rightLogo" ? "right" : "custom";
    setUploadingLogoSide(selectedElement.id);

    let publicUrl = "";
    let storagePath = selectedElement.storagePath || "";

    if (side !== "custom") {
      const storageResult = await uploadPdfLogoToSupabase({
        file,
        season: draftSettings.activeSeason,
        side,
      });
      if (storageResult.ok) {
        publicUrl = storageResult.publicUrl;
        storagePath = storageResult.path;
      }
    }

    if (!publicUrl) {
      publicUrl = await fileToDataUrl(file);
    }

    updateSelectedElement({ src: publicUrl, storagePath });
    setUploadingLogoSide("");
    setNotice({ type: publicUrl.startsWith("data:") ? "warning" : "success", message: publicUrl.startsWith("data:") ? "Bild lokal übernommen. Für eigene Logos bleibt der Upload lokal, Standardlogos werden zentral gespeichert." : "Bild erfolgreich hochgeladen." });
  };

  const sampleClasses = useMemo(
    () => Object.entries(previewMode === "overall" ? SAMPLE_OVERALL : SAMPLE_ROUND),
    [previewMode]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-3xl border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] lg:flex-row lg:items-center lg:justify-between sm:p-6">
        <div>
          <h3 className="text-2xl font-semibold text-zinc-900">Visueller PDF-Editor</h3>
          <p className="mt-2 text-sm text-zinc-600">Elemente direkt in der Vorschau anklicken, verschieben, an Ecken skalieren und rechts feinjustieren. Auch Saison, Liga-Titel und Haupttitel werden jetzt direkt auf der Seite bearbeitet.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-secondary" onClick={resetDraft} disabled={!dirty || isSaving || !!uploadingLogoSide}>Änderungen verwerfen</button>
          <button type="button" className="btn btn-primary min-w-[220px]" onClick={persistDraft} disabled={!dirty || isSaving || !!uploadingLogoSide}>
            {isSaving ? (saveStage === "remote" ? "Supabase wird aktualisiert…" : "Layout wird gespeichert…") : justSaved && !dirty ? "Gespeichert" : "Layout speichern"}
          </button>
        </div>
      </div>

      <div className="grid gap-6 2xl:grid-cols-[240px_minmax(0,1fr)_300px] xl:grid-cols-[240px_minmax(0,1fr)]">
        <div className="space-y-5 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div>
            <h4 className="text-lg font-semibold text-zinc-900">Werkzeuge</h4>
            <p className="mt-1 text-sm text-zinc-600">Neue Elemente direkt hinzufügen und Dokumentgrundlagen pflegen.</p>
          </div>

          <div className="inline-flex rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-sm">
            <button type="button" onClick={() => setPreviewMode("overall")} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${previewMode === "overall" ? "bg-violet-600 text-white shadow" : "text-zinc-700 hover:bg-zinc-50"}`}>Gesamt</button>
            <button type="button" onClick={() => setPreviewMode("round")} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${previewMode === "round" ? "bg-violet-600 text-white shadow" : "text-zinc-700 hover:bg-zinc-50"}`}>Runde</button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <button type="button" className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-left text-sm font-semibold text-zinc-800 transition hover:border-violet-300 hover:bg-violet-50" onClick={addTextElement}>+ Text hinzufügen</button>
            <button type="button" className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-left text-sm font-semibold text-zinc-800 transition hover:border-violet-300 hover:bg-violet-50" onClick={addImageElement}>+ Logo / Bild hinzufügen</button>
            <button type="button" className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${showGrid ? "border-violet-300 bg-violet-50 text-violet-700" : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-violet-300 hover:bg-violet-50"}`} onClick={() => setShowGrid((current) => !current)}>
              {showGrid ? "Raster ausgeblendet? Nein, Raster an" : "Raster einblenden"}
            </button>
          </div>

          <div className="space-y-4 rounded-3xl border border-zinc-200 bg-zinc-50/60 p-4">
            <h5 className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-500">Dokument</h5>
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-600">
              <div className="font-semibold text-zinc-800">Saison und Liga-Titel werden jetzt direkt auf der Editorfläche bearbeitet.</div>
              <div className="mt-1">Einfach die Elemente oben im Kopf anklicken, verschieben oder skalieren.</div>
            </div>
            <GeneralTextarea label="Hinweis Qualifikation" value={draftSettings.qualificationText} onChange={(event) => updateDraft({ ...draftSettings, qualificationText: event.target.value })} rows={3} />
            <GeneralInput label="Qualifikationsplätze" type="number" value={draftSettings.qualificationPlaces} onChange={(event) => updateDraft({ ...draftSettings, qualificationPlaces: Number(event.target.value || 7) })} />
            <GeneralInput label="Fußzeile" value={draftSettings.footerText} onChange={(event) => updateDraft({ ...draftSettings, footerText: event.target.value })} />
          </div>
        </div>

        <div className="space-y-4 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h4 className="text-lg font-semibold text-zinc-900">Editorfläche</h4>
              <p className="mt-1 text-sm text-zinc-600">Gestrichelte Rahmen sind nur im Editor sichtbar. Elemente lassen sich per Maus verschieben und an den Ecken skalieren.</p>
            </div>
            <div className="text-xs font-medium text-zinc-500">Modus: {previewMode === "overall" ? "Gesamtergebnisliste" : "Rundenprotokoll"}</div>
            {previewMode === "round" ? (
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-500">
                <span>Vorschau-Runde</span>
                <select
                  className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-800"
                  value={previewRoundNumber}
                  onChange={(event) => setPreviewRoundNumber(Number(event.target.value))}
                >
                  {Array.from({ length: 9 }, (_, i) => i + 1).map((wk) => (
                    <option key={wk} value={wk}>Runde {wk}</option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <PdfPreviewPage
            settings={draftSettings}
            mode={previewMode}
            titleText={titleText}
            seasonText={`${draftSettings.activeSeason}`}
            classes={sampleClasses}
            editorMode
            selectedElementId={selectedElementId}
            onSelectElement={setSelectedElementId}
            onElementsChange={(nextElements) => {
              if (!arraysEqual(nextElements, currentElements)) {
                commitElements(nextElements);
              }
            }}
            showGrid={showGrid}
          />
        </div>

        <div className="space-y-4 2xl:min-w-[300px]">
          <SelectedElementPanel
            element={selectedElement}
            onChange={updateSelectedElement}
            onDelete={removeSelectedElement}
            onUpload={handleSelectedImageUpload}
            onAlignField={alignSelectedElement}
            uploading={uploadingLogoSide === selectedElementId}
          />
          <StatusBanner syncState={syncState} notice={notice} dirty={dirty} isSaving={isSaving} saveStage={saveStage} />
        </div>
      </div>
    </div>
  );
}
