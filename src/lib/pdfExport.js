import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { loadSeasonSettings } from "./seasonSettings";
import PdfPreviewPage from "../shared/pdf/PdfPreviewPage";
import { EDITOR_CANVAS_HEIGHT, EDITOR_CANVAS_WIDTH } from "../shared/pdf/editorLayout";

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

function chunkClasses(entries = [], mode) {
  const pages = [];
  let current = [];
  let used = 0;
  const max = mode === "overall" ? 24 : 22;
  entries.forEach(([klasse, rows]) => {
    const weight = 4 + rows.length;
    if (current.length && used + weight > max) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push([klasse, rows]);
    used += weight;
  });
  if (current.length) pages.push(current);
  return pages;
}

async function exportPagesWithPreview({ mode, titleText, seasonText, classesEntries, fileName }) {
  const settings = loadSeasonSettings();
  const pageGroups = chunkClasses(classesEntries, mode);
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
    fileName: fileName || `${firstLine}_${season}.pdf`,
  });
}

export async function exportRoundProtocolPdf({ groupedResults, season, roundNumber, fileName }) {
  const settings = loadSeasonSettings();
  const entries = Object.entries(groupedResults || {}).filter(([, rows]) => rows?.length);
  await exportPagesWithPreview({
    mode: "round",
    titleText: `${settings.roundTitle} ${roundNumber}`,
    seasonText: `${season}`,
    classesEntries: entries,
    fileName: fileName || `Ergebnisse_Runde${roundNumber}_${season}.pdf`,
  });
}
