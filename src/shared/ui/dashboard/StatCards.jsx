import React from "react";

function StatCard({ title, value, subtitle, accent = "indigo", compact = false }) {
  const accentGradient =
    accent === "emerald"
      ? "from-white via-emerald-50 to-teal-50"
      : accent === "sky"
      ? "from-white via-sky-50 to-cyan-50"
      : "from-white via-indigo-50 to-violet-50";

  const badgeClass =
    accent === "emerald"
      ? "bg-emerald-100 text-emerald-700"
      : accent === "sky"
      ? "bg-sky-100 text-sky-700"
      : "bg-indigo-100 text-indigo-700";

  return (
    <div className={compact
      ? `rounded-full border border-zinc-200 bg-white px-4 py-2 shadow-[0_1px_2px_rgba(16,24,40,0.05)]`
      : `rounded-3xl border border-zinc-200 bg-gradient-to-r ${accentGradient} px-5 py-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(16,24,40,0.08)]`}>
      {compact ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-zinc-900">{value}</span>
          <span className="text-zinc-500">{title}</span>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-zinc-600">{title}</p>
            <p className="mt-2 text-3xl font-semibold leading-none text-zinc-900">{value}</p>
            <p className="mt-1.5 text-sm text-zinc-500">{subtitle}</p>
          </div>

          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${badgeClass}`}>
            Aktuell
          </span>
        </div>
      )}
    </div>
  );
}

export default function StatCards({ total, mitErgebnissen, ohneErgebnisse, compact = false }) {
  return (
    <div className={compact ? "flex flex-wrap items-center justify-center gap-3" : "grid grid-cols-1 gap-3 sm:grid-cols-3"}>
      <StatCard compact={compact} title="Teilnehmer" value={total} subtitle="Im Verein gemeldet" accent="indigo" />
      <StatCard compact={compact} title="Mit Ergebnissen" value={mitErgebnissen} subtitle="Bereits erfasst" accent="emerald" />
      <StatCard compact={compact} title="Offene WK" value={ohneErgebnisse} subtitle="Noch offen" accent="sky" />
    </div>
  );
}
