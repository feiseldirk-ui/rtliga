import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { loadSeasonSettings } from "./seasonSettings";
import PdfPreviewPage from "../shared/pdf/PdfPreviewPage";
import { EDITOR_CANVAS_HEIGHT, EDITOR_CANVAS_WIDTH, buildRoundTitle } from "../shared/pdf/editorLayout";

async function waitForPreviewReady(node) {
  if (!node) return;

  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  if (document?.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // noop
    }
  }

  const images = Array.from(node.querySelectorAll("img"));
  await Promise.all(
    images.map(
      (image) =>
        new Promise((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        })
    )
  );
}

function estimateClassBlockHeight(rows = [], mode) {
  const rowCount = Array.isArray(rows) ? rows.length : 0;
  const classHeaderHeight = 34;
  const tableHeaderHeight = mode === "overall" ? 30 : 32;
  const rowHeight = mode === "overall" ? 36 : 34;
  const qualificationHeight = mode === "overall" ? 18 : 0;
  const containerPadding = 28;
  return classHeaderHeight + tableHeaderHeight + rowCount * rowHeight + qualificationHeight + containerPadding;
}

function chunkClasses(entries = [], mode) {
  const pages = [];
  let current = [];
  let usedHeight = 0;
  const pageBudget = mode === "overall" ? 650 : 690;

  entries.forEach(([klasse, rows]) => {
    const blockHeight = estimateClassBlockHeight(rows, mode);
    if (current.length && usedHeight + blockHeight > pageBudget) {
      pages.push(current);
      current = [];
      usedHeight = 0;
    }
    current.push([klasse, rows]);
    usedHeight += blockHeight;
  });

  if (current.length) pages.push(current);
  return pages;
}

function formatTimestampForFilename(date = new Date()) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")}_${get("hour")}-${get("minute")}`;
}

function formatExportDate(date = new Date()) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function sanitizeFileSegment(value) {
  return String(value || "Export")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildPdfFileName(baseName, suffix = "") {
  const timestamp = formatTimestampForFilename();
  const base = sanitizeFileSegment(baseName);
  const extra = sanitizeFileSegment(suffix);
  return `${base}${extra ? `_${extra}` : ""}_${timestamp}.pdf`;
}

async function exportPagesWithPreview({ mode, titleText, seasonText, classesEntries, fileName, showClubColumn = true }) {
  const settings = loadSeasonSettings();
  const pageGroups = chunkClasses(classesEntries, mode);
  const generatedAt = formatExportDate();
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = `${EDITOR_CANVAS_WIDTH + 64}px`;
  host.style.background = "white";
  host.style.padding = "0";
  host.style.opacity = "1";
  host.style.pointerEvents = "none";
  host.style.zIndex = "-1";
  document.body.appendChild(host);

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  try {
    for (let i = 0; i < pageGroups.length; i += 1) {
      const mount = document.createElement("div");
      host.appendChild(mount);
      const root = createRoot(mount);
      flushSync(() => {
        root.render(
          React.createElement(PdfPreviewPage, {
            settings,
            mode,
            titleText,
            seasonText,
            classes: pageGroups[i],
            activeField: "",
            pageIndex: i,
            pageCount: pageGroups.length,
            generatedAt,
            showClubColumn,
          })
        );
      });
      await waitForPreviewReady(mount.firstChild);
      const target = mount.firstChild;
      const canvas = await html2canvas(target, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        foreignObjectRendering: false,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: target.scrollWidth || (EDITOR_CANVAS_WIDTH + 64),
        windowHeight: Math.max(target.scrollHeight || EDITOR_CANVAS_HEIGHT, EDITOR_CANVAS_HEIGHT + 80),
        imageTimeout: 15000,
      });
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 210, 297);
      root.unmount();
      mount.remove();
    }
  } finally {
    host.remove();
  }
  pdf.save(fileName);
}

export async function exportOverallPdf({ groupedResults, season, fileName }) {
  const settings = loadSeasonSettings();
  const entries = Object.entries(groupedResults || {}).filter(([, rows]) => rows?.length);
  const overallHeaderText = settings.overallHeaderText || [settings.overallTitle, settings.subtitle].filter(Boolean).join("\n");
  const firstLine = String(overallHeaderText).split(/\r?\n/).find(Boolean) || settings.overallTitle || "Gesamtwertung";
  await exportPagesWithPreview({
    mode: "overall",
    titleText: overallHeaderText,
    seasonText: `${season}`,
    classesEntries: entries,
    fileName: fileName || buildPdfFileName(firstLine, season),
  });
}

export async function exportRoundProtocolPdf({ groupedResults, season, roundNumber, fileName, isAdmin = true }) {
  const settings = loadSeasonSettings();
  const entries = Object.entries(groupedResults || {}).filter(([, rows]) => rows?.length);
  await exportPagesWithPreview({
    mode: "round",
    titleText: buildRoundTitle(settings.roundTitle, roundNumber),
    seasonText: `${season}`,
    classesEntries: entries,
    fileName: fileName || buildPdfFileName(`Ergebnisse_Runde${roundNumber}`, season),
    showClubColumn: Boolean(isAdmin),
  });
}
