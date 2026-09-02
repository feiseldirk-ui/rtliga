import React, { useCallback, useEffect, useMemo, useState } from "react";
import supabase from "../../../lib/supabase/client";
import { logError } from "../../../lib/logger";
import AdminSessionGate from "../../auth/components/AdminSessionGate";
import { subscribeToTables } from "../../../lib/realtime";
import ZeitfensterTab from "./ZeitfensterTab";
import ErgebnisseTab from "./ErgebnisseTab";
import VereineTab from "./VereineTab";
import SaisonPdfTab from "./SaisonPdfTab";
import ArchivTab from "./ArchivTab";
import RundenprotokollTab from "./RundenprotokollTab";
import AdminManagementTab from "./AdminManagementTab";
import MediaPanel from "../../../shared/ui/dashboard/MediaPanel";
import { getActiveSeason, seasonOrNullFilter } from "../../../lib/seasonScope";

const INITIAL_STATS = {
  vereine: 0,
  teilnehmer: 0,
  offeneZeitfenster: 0,
  ergebnisse: 0,
};
function StatBadge({ label, value }) {
  return (
    <div className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 shadow-sm">
      <span className="text-zinc-500">{label}: </span>
      <span className="text-zinc-900">{value}</span>
    </div>
  );
}


export default function AdminsTab() {
  return <AdminSessionGate>{(record, logout) => <AdminDashboard adminEmail={record.email} logout={logout} />}</AdminSessionGate>;
}

function AdminDashboard({ adminEmail, logout }) {
  const [activeTab, setActiveTab] = useState("vereine");
  const [stats, setStats] = useState(INITIAL_STATS);

  const tabs = useMemo(
    () => [
      { key: "vereine", label: "Vereine", title: "Vereinsübersicht", description: "Alle Vereine und gemeldeten Teilnehmer kompakt im Überblick." },
      { key: "zeitfenster", label: "Zeitfenster", title: "Wettkampffenster verwalten", description: "Start- und Endzeiten für alle 9 Wettkämpfe zentral steuern." },
      { key: "protokoll", label: "Rundenprotokoll", title: "Rundenergebnisse & PDF-Protokolle", description: "Rundenweise Ergebnisse nach Vorlage anzeigen und als PDF exportieren." },
      { key: "ergebnisse", label: "Gesamtergebnisse", title: "Ligaauswertung", description: "Gesamtergebnisse je Altersklasse prüfen und exportieren." },
      { key: "pdf", label: "PDF-Editor", title: "PDF-Vorlagen und Vorschau", description: "Logos, Titel, Qualifikationslinie und freie Textfelder direkt in der Vorschau anpassen." },
      { key: "archiv", label: "Archiv", title: "Archiv & Saisonwechsel", description: "Neue Saison absichern und Archivierung vorbereiten." },
      { key: "admins", label: "Admins", title: "Admin-Verwaltung", description: "Admins synchron aus Supabase laden, neue Admins per E-Mail freischalten und Einträge sicher entfernen." },
    ],
    []
  );

  const activeTabData = tabs.find((tab) => tab.key === activeTab) || tabs[0];

  const ladeDashboardStats = useCallback(async () => {
    try {
      const jetztIso = new Date().toISOString();
      const activeSeason = getActiveSeason();
      const [vereineRes, teilnehmerRes, offeneZeitfensterRes, ergebnisseRes] = await Promise.all([
        supabase.from("vereine").select("id", { count: "exact", head: true }),
        seasonOrNullFilter(supabase.from("verein_teilnehmer").select("id", { count: "exact", head: true }), activeSeason),
        seasonOrNullFilter(
          supabase
            .from("zeitfenster")
            .select("id", { count: "exact", head: true })
            .lte("start", jetztIso)
            .gte("ende", jetztIso),
          activeSeason
        ),
        seasonOrNullFilter(supabase.from("verein_ergebnisse").select("id", { count: "exact", head: true }), activeSeason),
      ]);

      setStats({
        vereine: vereineRes.count || 0,
        teilnehmer: teilnehmerRes.count || 0,
        offeneZeitfenster: offeneZeitfensterRes.count || 0,
        ergebnisse: ergebnisseRes.count || 0,
      });
    } catch {
      logError("Dashboard-Statistiken konnten nicht geladen werden.");
    }
  }, []);

  useEffect(() => subscribeToTables({
    tables: ["vereine", "verein_teilnehmer", "verein_ergebnisse", "zeitfenster"],
    onChange: ladeDashboardStats,
  }), [ladeDashboardStats]);

  useEffect(() => {
    const timer = window.setTimeout(ladeDashboardStats, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, ladeDashboardStats]);

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Sticky Header */}
      <div className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 shadow-[0_4px_16px_rgba(15,23,42,0.07)] backdrop-blur">
        {/* Akzentstreifen */}
        <div className="h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-sky-500" />
        <div className="mx-auto max-w-[1750px] px-4 sm:px-6 lg:px-8">

          {/* Zeile 1: Identity + Media-Chips + Stats + Logout */}
          <div className="flex items-center justify-between gap-3 py-2 border-b border-zinc-100">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
                <span className="text-xs font-bold">A</span>
              </div>
              <span className="text-sm font-semibold text-zinc-900 truncate hidden sm:block">RTLiga Admin</span>
              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 truncate max-w-[160px]">
                {adminEmail || "unbekannt"}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="hidden lg:flex items-center gap-2">
                <StatBadge label="Vereine" value={stats.vereine} />
                <StatBadge label="Teilnehmer" value={stats.teilnehmer} />
                <StatBadge label="WK" value={stats.offeneZeitfenster} />
                <StatBadge label="Erg." value={stats.ergebnisse} />
              </div>
              <MediaPanel compact showIntro={false} filterType="audio" />
              <MediaPanel compact showIntro={false} filterType="video" />
              <button
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:opacity-60"
                type="button"
                onClick={logout}
              >
                <span className="text-sm leading-none">⏻</span>
                <span className="hidden sm:inline">Verlassen</span>
              </button>
            </div>
          </div>

          {/* Zeile 2: Tabs scrollbar */}
          <div className="flex items-center gap-1.5 py-2 overflow-x-auto scrollbar-none -mx-1 px-1">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={[
                    "shrink-0 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-semibold transition-all duration-150",
                    isActive
                      ? "bg-indigo-600 text-white shadow-[0_4px_14px_rgba(99,102,241,0.35)]"
                      : "border border-zinc-200 bg-white text-zinc-600 hover:border-indigo-200 hover:text-indigo-700 hover:bg-indigo-50/60",
                  ].join(" ")}
                >
                  {tab.label}
                </button>
              );
            })}
            {/* Stats mobil */}
            <div className="ml-auto lg:hidden flex items-center gap-1 shrink-0 pl-2">
              <StatBadge label="V" value={stats.vereine} />
              <StatBadge label="T" value={stats.teilnehmer} />
              <StatBadge label="E" value={stats.ergebnisse} />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1750px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="space-y-5 rounded-[28px] border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:p-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between px-1 pb-2 border-b border-zinc-100">
            <div>
              <h3 className="text-lg font-semibold text-zinc-900">{activeTabData.title}</h3>
            </div>
            <p className="text-sm text-zinc-500 max-w-xl">{activeTabData.description}</p>
          </div>

          {activeTab === "vereine" ? <VereineTab onRefreshStats={ladeDashboardStats} /> : null}
          {activeTab === "zeitfenster" ? <ZeitfensterTab onRefreshStats={ladeDashboardStats} /> : null}
          {activeTab === "protokoll" ? <RundenprotokollTab /> : null}
          {activeTab === "ergebnisse" ? <ErgebnisseTab /> : null}
          {activeTab === "pdf" ? <SaisonPdfTab /> : null}
          {activeTab === "archiv" ? <ArchivTab /> : null}
          {activeTab === "admins" ? <AdminManagementTab /> : null}
        </div>
      </div>
    </div>
  );
}
