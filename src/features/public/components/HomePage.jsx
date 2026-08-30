import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import BrandMark from "../../../shared/ui/BrandMark";

const ADMIN_LOGOUT_REDIRECT_KEY = "rtliga_admin_logout_redirect";
const ADMIN_ACCESS_FLAG_KEY = "rtliga_admin_access_verified";

function Icon({ name, className = "h-5 w-5" }) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  if (name === "login") {
    return <svg {...common}><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M14 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/></svg>;
  }
  if (name === "shield") {
    return <svg {...common}><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3z"/><path d="M9 12l2 2 4-5"/></svg>;
  }
  if (name === "chart") {
    return <svg {...common}><path d="M4 20V10h4v10"/><path d="M10 20V5h4v15"/><path d="M16 20v-7h4v7"/></svg>;
  }
  if (name === "calendar") {
    return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>;
  }
  if (name === "trophy") {
    return <svg {...common}><path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H5v2a3 3 0 0 0 3 3M16 6h3v2a3 3 0 0 1-3 3M12 13v4M8 21h8M10 17h4"/></svg>;
  }
  if (name === "users") {
    return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
  }
  if (name === "add-user") {
    return <svg {...common}><path d="M15 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8" cy="7" r="4"/><path d="M19 8v6M16 11h6"/></svg>;
  }
  return <svg {...common}><path d="M9 18l6-6-6-6"/></svg>;
}

function ActionButton({ icon, children, tone = "blue", onClick, primary = false }) {
  const toneClasses = tone === "green"
    ? "border-emerald-200 text-zinc-900 hover:border-emerald-400 hover:bg-emerald-50"
    : primary
      ? "border-blue-600 bg-blue-600 text-white shadow-[0_15px_32px_rgba(37,99,235,0.24)] hover:-translate-y-0.5 hover:bg-blue-500"
      : "border-blue-200 text-zinc-900 hover:border-blue-400 hover:bg-blue-50";
  const iconClasses = tone === "green" ? "text-emerald-600" : primary ? "text-white" : "text-blue-600";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left text-sm font-semibold transition ${toneClasses}`}
    >
      <Icon name={icon} className={`h-6 w-6 shrink-0 ${iconClasses}`} />
      <span className="min-w-0 flex-1">{children}</span>
      <Icon name="arrow" className={`h-5 w-5 shrink-0 transition group-hover:translate-x-0.5 ${iconClasses}`} />
    </button>
  );
}

export default function HomePage() {
  const navigate = useNavigate();

  useEffect(() => {
    try {
      window.sessionStorage.removeItem(ADMIN_LOGOUT_REDIRECT_KEY);
      window.sessionStorage.removeItem(ADMIN_ACCESS_FLAG_KEY);
    } catch {
      // noop
    }
  }, []);

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-5xl animate-fade-in overflow-hidden rounded-[32px] border border-white/80 bg-white/95 shadow-[0_30px_80px_rgba(15,23,42,0.14)] backdrop-blur">
        <header className="relative overflow-hidden border-b border-zinc-200 px-6 py-9 text-center sm:px-10 sm:py-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(59,130,246,0.12),transparent_30%),radial-gradient(circle_at_88%_20%,rgba(16,185,129,0.10),transparent_32%)]" />
          <div className="relative flex flex-col items-center">
            <BrandMark className="h-[72px] w-[194px]" />
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              RTLiga Verwaltung
            </h1>
            <p className="mt-3 text-base text-slate-600 sm:text-lg">
              Verwaltung, Meldungen und Ergebnisse
            </p>
          </div>
        </header>

        <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-2 lg:p-8">
          <section className="rounded-[26px] border border-blue-200 bg-gradient-to-br from-blue-50/80 via-white to-white p-5 sm:p-7">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                <Icon name="users" className="h-7 w-7" />
              </div>
              <h2 className="mt-4 text-2xl font-bold text-slate-900">Vereine</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">
                Für registrierte Vereine und administrative Aufgaben.
              </p>
            </div>

            <div className="mt-6 space-y-3">
              <ActionButton icon="login" primary onClick={() => navigate("/login")}>Vereinslogin</ActionButton>
              <ActionButton icon="add-user" onClick={() => navigate("/registrieren")}>Verein registrieren</ActionButton>
              <ActionButton icon="shield" onClick={() => navigate("/admin")}>Adminbereich</ActionButton>
            </div>
          </section>

          <section className="rounded-[26px] border border-emerald-200 bg-gradient-to-br from-emerald-50/80 via-white to-white p-5 sm:p-7">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <Icon name="chart" className="h-7 w-7" />
              </div>
              <h2 className="mt-4 text-2xl font-bold text-slate-900">Öffentliche Ergebnisse</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">
                Ranglisten und Ergebnisse geschlossener Runden – ohne Anmeldung.
              </p>
            </div>

            <div className="mt-6 space-y-3">
              <ActionButton icon="chart" tone="green" onClick={() => navigate("/ergebnisse")}>Ergebnisse abrufen</ActionButton>
              <ActionButton icon="calendar" tone="green" onClick={() => navigate("/ergebnisse?ansicht=runden")}>Wettkampfrunden</ActionButton>
              <ActionButton icon="trophy" tone="green" onClick={() => navigate("/ergebnisse?ansicht=gesamt")}>Aktuelle Gesamtliste</ActionButton>
            </div>
          </section>
        </div>

        <footer className="mx-5 mb-5 flex items-start gap-3 rounded-2xl bg-gradient-to-r from-blue-50 to-emerald-50 px-4 py-4 sm:mx-8 sm:mb-8 sm:px-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-blue-600 shadow-sm">
            <Icon name="shield" className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-blue-700">Öffentliche Ergebnisse für alle zugänglich</p>
            <p className="mt-1 text-xs leading-5 text-slate-600 sm:text-sm">
              Veröffentlicht werden ausschließlich abgeschlossene Wettkampfrunden. Offene Eingaben bleiben geschützt.
            </p>
          </div>
        </footer>
      </div>
    </main>
  );
}
