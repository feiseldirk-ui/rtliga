import React, { useEffect, useMemo, useRef } from "react";
import {
  EDITOR_CANVAS_HEIGHT,
  EDITOR_CANVAS_WIDTH,
  EDITOR_GRID_SIZE,
  getEditorElements,
} from "./editorLayout";

export function modeKey(mode, base) {
  const prefix = mode === "round" ? "round" : "overall";
  return `${prefix}${base}`;
}

export function classLabel(klasse) {
  if (klasse?.toLowerCase().includes("klasse")) return klasse;
  return `${klasse}klasse`;
}

function normalizeOverallRows(rows = []) {
  return rows.map((row) => {
    const wkValues = row.wkValues
      ? row.wkValues
      : Array.from({ length: 9 }, (_, i) => {
          const raw = Array.isArray(row.punkte)
            ? row.punkte[i]
            : row.punkte?.[`WK${i + 1}`] || "";
          return {
            text: raw || "",
            strikeout: Array.isArray(row.streicher)
              ? row.streicher.includes(i)
              : false,
          };
        });
    return { ...row, wkValues };
  });
}

function displayName(row = {}) {
  if (row.name) return row.name;
  return [row.vorname, row.nachname].filter(Boolean).join(" ") || "–";
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function snap(value, enabled) {
  if (!enabled) return value;
  return Math.round(value / EDITOR_GRID_SIZE) * EDITOR_GRID_SIZE;
}

function resizeElement(element, dir, dx, dy, useSnap) {
  const next = { ...element };

  if (dir.includes("e")) next.width = clamp(snap(element.width + dx, useSnap), 48, EDITOR_CANVAS_WIDTH - element.x);
  if (dir.includes("s")) next.height = clamp(snap(element.height + dy, useSnap), 28, EDITOR_CANVAS_HEIGHT - element.y);
  if (dir.includes("w")) {
    const width = clamp(snap(element.width - dx, useSnap), 48, EDITOR_CANVAS_WIDTH - element.x + element.width);
    const x = clamp(snap(element.x + dx, useSnap), 0, element.x + element.width - 48);
    next.x = x;
    next.width = width;
  }
  if (dir.includes("n")) {
    const height = clamp(snap(element.height - dy, useSnap), 28, EDITOR_CANVAS_HEIGHT - element.y + element.height);
    const y = clamp(snap(element.y + dy, useSnap), 0, element.y + element.height - 28);
    next.y = y;
    next.height = height;
  }

  if (next.type === "text") {
    next.fontSize = clamp(Math.round(next.height * (next.role === "title" ? 0.42 : 0.32)), 8, 34);
  }

  return next;
}

function EditorElement({
  element,
  editorMode,
  selected,
  onSelect,
  onInteractionStart,
}) {
  const baseBorder = editorMode
    ? selected
      ? "border-violet-500 ring-2 ring-violet-300"
      : "border-dashed border-zinc-300 hover:border-violet-400"
    : "border-transparent";

  const commonStyle = {
    left: element.x,
    top: element.y,
    width: element.width,
    height: element.height,
  };

  const handles = ["nw", "ne", "sw", "se"];

  return (
    <div
      className={`absolute z-10 ${editorMode ? "cursor-move select-none" : ""}`}
      style={commonStyle}
      onMouseDown={(event) => {
        if (!editorMode) return;
        event.stopPropagation();
        onSelect(element.id);
        onInteractionStart("move", element.id, event);
      }}
      onClick={(event) => {
        if (!editorMode) return;
        event.stopPropagation();
        onSelect(element.id);
      }}
    >
      {element.type === "image" ? (
        <div
          className={`h-full w-full overflow-hidden rounded-xl border p-2 ${editorMode ? "bg-white/60 shadow-none" : "bg-transparent shadow-none"} ${baseBorder} ${!element.src ? "border-dashed" : ""}`}
        >
          {element.src ? (
            <img src={element.src} alt="" className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-zinc-300 text-center text-xs font-medium text-zinc-400">
              Logo wählen
            </div>
          )}
        </div>
      ) : (
        <div
          className={`flex h-full w-full items-center justify-center whitespace-pre-wrap rounded-xl border px-3 py-2 text-center text-zinc-900 ${editorMode ? "bg-white/50 shadow-none" : "bg-transparent shadow-none"} ${baseBorder}`}
          style={{
            fontSize: `${element.fontSize}px`,
            fontFamily: element.fontFamily || "Arial",
            fontWeight: element.fontWeight || "normal",
            lineHeight: 1.1,
          }}
        >
          {element.text || "Text"}
        </div>
      )}

      {editorMode && selected
        ? handles.map((handle) => {
            const positionClass =
              handle === "nw"
                ? "left-[-6px] top-[-6px] cursor-nwse-resize"
                : handle === "ne"
                  ? "right-[-6px] top-[-6px] cursor-nesw-resize"
                  : handle === "sw"
                    ? "bottom-[-6px] left-[-6px] cursor-nesw-resize"
                    : "bottom-[-6px] right-[-6px] cursor-nwse-resize";
            return (
              <button
                key={handle}
                type="button"
                className={`absolute h-3.5 w-3.5 rounded-full border border-violet-600 bg-white shadow ${positionClass}`}
                onMouseDown={(event) => {
                  event.stopPropagation();
                  onInteractionStart("resize", element.id, event, handle);
                }}
                aria-label="Größe ändern"
              />
            );
          })
        : null}
    </div>
  );
}

export default function PdfPreviewPage({
  settings,
  mode,
  titleText,
  seasonText,
  classes = [],
  activeField = "",
  editorMode = false,
  selectedElementId = "",
  onSelectElement,
  onElementsChange,
  showGrid = false,
  pageIndex = 0,
  pageCount = 1,
  generatedAt = "10.03.2026, 12:00",
  showClubColumn = true,
}) {
  const elements = useMemo(
    () => getEditorElements(settings, mode, titleText),
    [settings, mode, titleText]
  );
  const latestElementsRef = useRef(elements);
  const interactionRef = useRef(null);

  useEffect(() => {
    latestElementsRef.current = elements;
  }, [elements]);

  useEffect(() => {
    if (!editorMode || !onElementsChange) return undefined;

    const handleMove = (event) => {
      const interaction = interactionRef.current;
      if (!interaction) return;
      const dx = event.clientX - interaction.startX;
      const dy = event.clientY - interaction.startY;
      const useSnap = showGrid;
      const source = interaction.source;
      const updated = latestElementsRef.current.map((element) => {
        if (element.id !== interaction.id) return element;
        if (interaction.kind === "move") {
          return {
            ...element,
            x: clamp(snap(source.x + dx, useSnap), 0, EDITOR_CANVAS_WIDTH - source.width),
            y: clamp(snap(source.y + dy, useSnap), 0, EDITOR_CANVAS_HEIGHT - source.height),
          };
        }
        return resizeElement(source, interaction.dir, dx, dy, useSnap);
      });
      onElementsChange(updated);
    };

    const stopInteraction = () => {
      interactionRef.current = null;
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", stopInteraction);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", stopInteraction);
    };
  }, [editorMode, onElementsChange, showGrid]);

  const qualificationPlaces = Number(settings.qualificationPlaces || 7);
  const normalizedClasses = mode === "overall" ? classes.map(([name, rows]) => [name, normalizeOverallRows(rows)]) : classes;
  const highlight = (field) => (activeField === field ? "ring-2 ring-violet-400 bg-violet-50/60" : "");
  const isOverallMode = mode === "overall";
  const roundHeaders = ["S1", "S2", "S3", "S4", "S5", "S6", "LL", "SL", "Gesamt"];
  const pageLabel = `Seite ${pageIndex + 1} / ${pageCount}`;

  return (
    <div className="rounded-[28px] border border-zinc-200 bg-zinc-50 p-4">
      <div className="mx-auto overflow-x-auto rounded-2xl border border-zinc-300 bg-white p-4 shadow-sm">
        <div
          className="relative overflow-hidden rounded-xl border border-zinc-400 bg-white"
          style={{
            width: `${EDITOR_CANVAS_WIDTH}px`,
            minHeight: `${EDITOR_CANVAS_HEIGHT}px`,
            backgroundImage: editorMode && showGrid
              ? "linear-gradient(to right, rgba(148,163,184,0.14) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.14) 1px, transparent 1px)"
              : undefined,
            backgroundSize: editorMode && showGrid ? `${EDITOR_GRID_SIZE}px ${EDITOR_GRID_SIZE}px` : undefined,
          }}
          onClick={() => onSelectElement?.("")}
        >
          {elements.map((element) => (
            <EditorElement
              key={element.id}
              element={element}
              editorMode={editorMode}
              selected={selectedElementId === element.id}
              onSelect={onSelectElement || (() => {})}
              onInteractionStart={(kind, id, event, dir) => {
                if (!editorMode) return;
                interactionRef.current = {
                  kind,
                  id,
                  dir,
                  startX: event.clientX,
                  startY: event.clientY,
                  source: latestElementsRef.current.find((item) => item.id === id),
                };
              }}
            />
          ))}

          <div className="absolute inset-x-6 top-[224px] space-y-5">
            {normalizedClasses.map(([klasse, rows]) => {
              const tableRows = isOverallMode ? normalizeOverallRows(rows) : rows;
              const valueColumns = isOverallMode
                ? Array.from({ length: 9 }, (_, index) => ({ key: `wk-${index + 1}`, label: `WK${index + 1}` }))
                : roundHeaders.map((label) => ({ key: label.toLowerCase(), label }));
              const nameColumnWidth = isOverallMode ? "w-[84px]" : showClubColumn ? "w-[102px]" : "w-[118px]";
              const clubColumnWidth = isOverallMode ? "w-[126px]" : "w-[154px]";
              const valueColumnWidth = isOverallMode ? "w-[42px]" : showClubColumn ? "w-[36px]" : "w-[43px]";
              const leadingColumnCount = showClubColumn ? 3 : 2;
              const totalColSpan = leadingColumnCount + valueColumns.length + (isOverallMode ? 1 : 0);
              return (
                <div key={klasse} className="overflow-hidden rounded-2xl border border-zinc-300 bg-white shadow-sm">
                  <div className="border-b border-zinc-300 bg-zinc-100 px-4 py-2 text-sm font-bold uppercase tracking-[0.18em] text-zinc-700">
                    {classLabel(klasse)}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full table-fixed border-collapse text-[10px] text-zinc-800" style={{ lineHeight: 1.1 }}>
                      <thead>
                        <tr className="bg-zinc-50 text-left text-[9px] uppercase tracking-[0.12em] text-zinc-600">
                          <th className="w-[34px] border border-zinc-300 px-0 py-0 align-middle"><div className="flex min-h-[28px] items-center px-2 py-1.5">Pl.</div></th>
                          <th className={`border border-zinc-300 px-0 py-0 align-middle ${nameColumnWidth}`}><div className={`flex min-h-[28px] items-center px-2 py-1.5 ${isOverallMode ? "" : "justify-center text-center"}`}>Name</div></th>
                          {showClubColumn ? <th className={`border border-zinc-300 px-0 py-0 align-middle ${clubColumnWidth}`}><div className={`flex min-h-[28px] items-center px-2 py-1.5 ${isOverallMode ? "" : "justify-center text-center"}`}>Verein</div></th> : null}
                          {valueColumns.map((column) => (
                            <th key={column.key} className={`border border-zinc-300 px-0 py-0 text-center align-middle ${valueColumnWidth}`}><div className="flex min-h-[28px] items-center justify-center px-1 py-1.5">{column.label}</div></th>
                          ))}
                          {isOverallMode ? <th className="w-[58px] border border-zinc-300 px-0 py-0 text-center align-middle"><div className="flex min-h-[28px] items-center justify-center px-2 py-1.5">Gesamt</div></th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {tableRows.map((row, idx) => {
                          const values = isOverallMode
                            ? row.wkValues || []
                            : [row.s1, row.s2, row.s3, row.s4, row.s5, row.s6, row.ll, row.sl, row.gesamt].map((value) => ({ text: value, strikeout: false }));
                          return (
                            <React.Fragment key={`${klasse}-${displayName(row)}-${idx}`}>
                              <tr className={idx % 2 === 0 ? "bg-white" : "bg-zinc-50/70"}>
                                <td className="border border-zinc-300 px-0 py-0 font-semibold align-middle"><div className="flex min-h-[42px] items-center justify-center px-2 py-1.5 text-center">{row.platz || idx + 1}</div></td>
                                <td className="border border-zinc-300 px-0 py-0 align-middle"><div className={`flex min-h-[42px] items-center px-2 py-1.5 leading-tight ${isOverallMode ? "" : "justify-center text-center"}`}>{displayName(row)}</div></td>
                                {showClubColumn ? <td className="border border-zinc-300 px-0 py-0 align-middle"><div className={`flex min-h-[42px] items-center break-words px-2 py-1.5 leading-tight ${isOverallMode ? "" : "justify-center text-center"}`}>{row.verein || "–"}</div></td> : null}
                                {values.map((value, valueIndex) => (
                                  <td key={valueIndex} className={`border border-zinc-300 px-0 py-0 text-center align-middle ${value?.strikeout ? "text-zinc-400 line-through" : ""}`}>
                                    <div className="flex min-h-[42px] items-center justify-center px-1 py-1.5 text-center font-medium">{value?.text || value?.text === 0 ? value.text : "–"}</div>
                                  </td>
                                ))}
                                {isOverallMode ? <td className="border border-zinc-300 px-0 py-0 text-center font-bold align-middle"><div className="flex min-h-[42px] items-center justify-center px-2 py-1.5 text-center">{row.gesamt}</div></td> : null}
                              </tr>
                              {isOverallMode && idx + 1 === qualificationPlaces ? (
                                <tr>
                                  <td colSpan={totalColSpan} className="border-t-2 border-red-500 px-2 py-1 text-[9px] italic text-red-700">
                                    {settings.qualificationText}
                                  </td>
                                </tr>
                              ) : null}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="absolute inset-x-6 bottom-[42px] flex items-center justify-between border-t border-zinc-300 pt-2 text-[10px] text-zinc-500">
            <div>{generatedAt}</div>
            <div className="font-semibold text-zinc-600">{pageLabel}</div>
          </div>

          <div className={`absolute inset-x-6 bottom-5 rounded pt-1 text-sm text-zinc-600 ${highlight("footerText")}`}>
            {(settings.footerText || "Erstellt am {date}").replace("{date}", generatedAt)}
          </div>
        </div>
      </div>
    </div>
  );
}
