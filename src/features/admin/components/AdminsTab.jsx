import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import supabase from "../../../lib/supabase/client";
import { logError } from "../../../lib/logger";
import { ensureSupabaseSession } from "../../../lib/authReady";
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
const ADMIN_LOGOUT_REDIRECT_KEY = "rtliga_admin_logout_redirect";
const ADMIN_ACCESS_FLAG_KEY = "rtliga_admin_access_verified";

function getHomeHref() {
  const basePath = import.meta.env.BASE_URL || "/";
  return new URL(basePath, window.location.origin).href;
}

function redirectToHome() {
  window.location.replace(getHomeHref());
}

function StatBadge({ label, value }) {
  return (
    <div className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 shadow-sm">
      <span className="text-zinc-500">{label}: </span>
      <span className="text-zinc-900">{value}</span>
    </div>
  );
}


export default function AdminsTab() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [adminEmail, setAdminEmail] = useState("");
  const [passwort, setPasswort] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);
  const [verified, setVerified] = useState(false);
  const [authError, setAuthError] = useState("");
  const [activeTab, setActiveTab] = useState("vereine");
  const [stats, setStats] = useState(INITIAL_STATS);
  const [loggingOut, setLoggingOut] = useState(false);
  const [contentReloadKey, setContentReloadKey] = useState(0);

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

  useEffect(() => {
    const presetEmail = (searchParams.get("email") || "").trim().toLowerCase();
    if (!verified && presetEmail) {
      setAdminEmail((current) => current || presetEmail);
    }
  }, [searchParams, verified]);

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

  const checkAdminSession = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data?.session?.user) {
        setVerified(false);
        setChecked(true);
        setStats(INITIAL_STATS);
        return;
      }

      const currentUser = data.session.user;
      const accessFlag = window.sessionStorage.getItem(ADMIN_ACCESS_FLAG_KEY);

      if (accessFlag !== "1") {
        setVerified(false);
        setChecked(true);
        setStats(INITIAL_STATS);
        setAuthError("");
        setAdminEmail(currentUser.email || "");
        return;
      }

      await ensureSupabaseSession();

      const { data: adminRow, error: adminError } = await supabase
        .from("admins")
        .select("user_id")
        .eq("user_id", currentUser.id)
        .maybeSingle();

      if (adminError || !adminRow) {
        await supabase.auth.signOut();
        setVerified(false);
        setChecked(true);
        setAuthError("Dieses Konto besitzt keinen Adminzugang.");
        setStats(INITIAL_STATS);
        return;
      }

      setVerified(true);
      setChecked(true);
      setAuthError("");
      setAdminEmail(currentUser.email || "");
      await ladeDashboardStats();
    } catch {
      setVerified(false);
      setChecked(true);
      setAuthError("Der Adminstatus konnte nicht geprüft werden.");
      setStats(INITIAL_STATS);
    }
  }, [ladeDashboardStats]);

  useEffect(() => {
    checkAdminSession();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => checkAdminSession());

    return () => subscription.unsubscribe();
  }, [checkAdminSession]);

  useEffect(() => {
    if (!verified) return undefined;

    return subscribeToTables({
      tables: ["vereine", "verein_teilnehmer", "verein_ergebnisse", "zeitfenster"],
      onChange: ladeDashboardStats,
    });
  }, [ladeDashboardStats, verified]);

  useEffect(() => {
    if (!verified) return;
    ladeDashboardStats();
  }, [activeTab, ladeDashboardStats, verified]);

  useEffect(() => {
    if (!verified) return undefined;
    setContentReloadKey((value) => value + 1);
    window.dispatchEvent(new CustomEvent("rtliga-admin-tab-activated", { detail: { tab: activeTab } }));
    return undefined;
  }, [activeTab, verified]);

  const handleAdminLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setAuthError("");

    const normalizedEmail = adminEmail.trim().toLowerCase();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: passwort,
    });

    if (error || !data?.user) {
      setAuthError("Admin-Login fehlgeschlagen. Bitte Kennwort prüfen.");
      setLoading(false);
      return;
    }

    await ensureSupabaseSession();

    const { data: adminRow, error: adminError } = await supabase
      .from("admins")
      .select("user_id")
      .eq("user_id", data.user.id)
      .maybeSingle();

    if (adminError || !adminRow) {
      await supabase.auth.signOut();
      setAuthError("Das Konto ist nicht als Admin freigeschaltet.");
      setLoading(false);
      return;
    }

    try {
      window.sessionStorage.setItem(ADMIN_ACCESS_FLAG_KEY, "1");
    } catch {
      // noop
    }

    setVerified(true);
    setChecked(true);
    setAdminEmail(data.user.email || normalizedEmail);
    setPasswort("");
    setLoading(false);
    await ladeDashboardStats();
  };

  const logout = async () => {
    if (loggingOut) return;

    setLoggingOut(true);

    try {
      window.sessionStorage.setItem(ADMIN_LOGOUT_REDIRECT_KEY, "1");
      window.sessionStorage.removeItem(ADMIN_ACCESS_FLAG_KEY);
    } catch {
      // noop
    }

    setVerified(false);
    setChecked(true);
    setAuthError("");
    setAdminEmail("");
    setPasswort("");
    setStats(INITIAL_STATS);

    const fallbackTimer = window.setTimeout(() => {
      redirectToHome();
    }, 60);

    try {
      stopGlobalAudio();
      try {
        await supabase.auth.signOut({ scope: "global" });
      } catch {
        await supabase.auth.signOut({ scope: "local" });
      }
    } catch {
      logError("Admin konnte nicht vollständig abgemeldet werden.");
    }

    try {
      for (const storage of [window.localStorage, window.sessionStorage]) {
        const keys = Object.keys(storage);
        for (const key of keys) {
          if (key.startsWith("sb-") || key.includes("supabase")) {
            storage.removeItem(key);
          }
        }
      }
      window.sessionStorage.setItem(ADMIN_LOGOUT_REDIRECT_KEY, "1");
      window.sessionStorage.removeItem(ADMIN_ACCESS_FLAG_KEY);
    } catch {
      logError("Lokale Auth-Daten konnten nicht vollständig entfernt werden.");
    }

    window.clearTimeout(fallbackTimer);
    redirectToHome();
  };

  if (!checked) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="card p-8 text-center">Adminzugang wird geprüft…</div>
      </div>
    );
  }

  if (!verified) {
    try {
      if (window.sessionStorage.getItem(ADMIN_LOGOUT_REDIRECT_KEY) === "1") {
        redirectToHome();
        return null;
      }
    } catch {
      // noop
    }

    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="card animate-fade-in overflow-hidden">
          <div className="border-b border-zinc-200 bg-gradient-to-r from-indigo-600 via-indigo-500 to-sky-500 px-6 py-8 text-white sm:px-8">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-white/80">RTLiga Verwaltung</p>
            <h2 className="mt-3 text-3xl font-semibold">Admin-Anmeldung</h2>
            <p className="mt-2 max-w-2xl text-sm text-white/85 sm:text-base">
              Adminzugang ist ausschließlich für das freigeschaltete Konto vorgesehen. Kennwort-Änderungen erfolgen nur über die hinterlegte Admin-E-Mail.
            </p>
          </div>

          <div className="space-y-5 px-6 py-6 sm:px-8 sm:py-8">
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                Adminzugang erfolgt über die freigeschaltete Admin-E-Mail und das zugehörige Kennwort.
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-zinc-700">Admin-E-Mail</label>
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(event) => setAdminEmail(event.target.value)}
                  className="input max-w-xl"
                  autoComplete="email"
                  placeholder="admin@beispiel.de"
                  required
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="block text-sm font-semibold text-zinc-700">Kennwort</label>
                  <button
                    type="button"
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? "Verbergen" : "Anzeigen"}
                  </button>
                </div>

                <input
                  type={showPassword ? "text" : "password"}
                  value={passwort}
                  onChange={(event) => setPasswort(event.target.value)}
                  className="input max-w-md"
                  autoComplete="current-password"
                  required
                />
              </div>

              {authError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {authError}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <button className="btn btn-primary" type="submit" disabled={loading}>
                  {loading ? "Anmeldung läuft…" : "Admin anmelden"}
                </button>

                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams();
                    params.set("context", "admin");
                    params.set("back", "/admin");
                    if (adminEmail.trim()) {
                      params.set("email", adminEmail.trim().toLowerCase());
                    }
                    navigate(`/passwort-vergessen?${params.toString()}`);
                  }}
                >
                  Kennwort vergessen?
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 shadow-[0_12px_34px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="mx-auto max-w-[1750px] px-4 py-3 sm:px-6 lg:px-8">
          <div className="grid items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)_220px]">
            <div className="flex justify-start lg:pt-1">
              <MediaPanel compact showIntro={false} filterType="audio" />
            </div>

            <div className="space-y-3">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {tabs.map((tab) => {
                    const isActive = activeTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveTab(tab.key)}
                        className={isActive ? "btn btn-primary" : "btn btn-secondary"}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                <div className="mx-auto h-px w-full max-w-md bg-zinc-200" />

                <div className="flex justify-center pt-1">
                  <button
                    className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-base font-semibold text-rose-700 shadow-sm transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    onClick={logout}
                    disabled={loggingOut}
                  >
                    <span className="text-lg leading-none">⏻</span>
                    <span>{loggingOut ? "Zur Startseite…" : "Adminbereich verlassen"}</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                <div className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 shadow-sm">
                  Admin: {adminEmail || "unbekannt"}
                </div>
                <StatBadge label="Vereine" value={stats.vereine} />
                <StatBadge label="Teilnehmer" value={stats.teilnehmer} />
                <StatBadge label="Offene WK" value={stats.offeneZeitfenster} />
                <StatBadge label="Rundenergebnisse" value={stats.ergebnisse} />
                <StatBadge label="Gesamtergebnisse" value={stats.ergebnisse} />
              </div>
            </div>

            <div className="flex justify-start lg:justify-end lg:pt-1">
              <MediaPanel compact showIntro={false} filterType="video" />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1750px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="space-y-6 rounded-[32px] border border-zinc-200 bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:p-8">
          <div className="rounded-3xl border border-zinc-200 bg-zinc-50/80 px-5 py-5 shadow-inner">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Bereich</p>
                <h3 className="mt-1 text-2xl font-semibold text-zinc-900">{activeTabData.title}</h3>
              </div>
              <p className="max-w-2xl text-sm text-zinc-600">{activeTabData.description}</p>
            </div>
          </div>

          {activeTab === "vereine" ? <VereineTab key={`vereine-${contentReloadKey}`} onRefreshStats={ladeDashboardStats} /> : null}
          {activeTab === "zeitfenster" ? <ZeitfensterTab key={`zeitfenster-${contentReloadKey}`} onRefreshStats={ladeDashboardStats} /> : null}
          {activeTab === "protokoll" ? <RundenprotokollTab key={`protokoll-${contentReloadKey}`} /> : null}
          {activeTab === "ergebnisse" ? <ErgebnisseTab key={`ergebnisse-${contentReloadKey}`} /> : null}
          {activeTab === "pdf" ? <SaisonPdfTab key={`pdf-${contentReloadKey}`} /> : null}
          {activeTab === "archiv" ? <ArchivTab key={`archiv-${contentReloadKey}`} /> : null}
          {activeTab === "admins" ? <AdminManagementTab key={`admins-${contentReloadKey}`} /> : null}
        </div>
      </div>
    </div>
  );
}
