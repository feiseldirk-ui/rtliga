import React from "react";

export default function DashboardShell({
  titleTop = "Verein",
  title,
  subtitle = "",
  leftSlot = null,
  right,
  headerContent = null,
  stickyContent = null,
  hideStickyIdentity = false,
  hideHero = false,
  children,
}) {
  const initials = (title || "")
    .trim()
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 shadow-[0_12px_34px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="mx-auto max-w-[1750px] px-4 py-3 sm:px-6 lg:px-8">
          <div className="grid items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)_220px]">
            <div className="order-2 flex justify-start lg:order-none lg:pt-1">{leftSlot}</div>

            <div className="order-1 min-w-0 space-y-3 lg:order-none">
              {!hideStickyIdentity ? (
                <div className="flex min-w-0 items-center justify-center gap-3 sm:gap-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white shadow-sm">
                    <span className="text-sm font-bold text-zinc-700">{initials || "V"}</span>
                  </div>

                  <div className="min-w-0 text-left">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                      {titleTop}
                    </p>
                    <h1 className="truncate text-lg font-semibold text-zinc-900 sm:text-[2rem]">
                      {title}
                    </h1>
                  </div>
                </div>
              ) : null}

              {stickyContent ? <div>{stickyContent}</div> : null}
            </div>

            <div className="order-3 flex justify-start lg:justify-end lg:pt-1">{right}</div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1750px] px-4 py-6 sm:px-6 lg:px-8">
        {!hideHero ? (
          <div className="mb-6 overflow-hidden rounded-3xl border border-zinc-200 bg-gradient-to-r from-white via-indigo-50 to-emerald-50 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
            <div className="px-6 py-7 sm:px-8">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
                Vereinsbereich
              </p>
              <h2 className="mt-2 text-3xl font-semibold text-zinc-900">{title}</h2>
              {subtitle ? (
                <p className="mt-2 max-w-3xl text-sm text-zinc-600 sm:text-base">{subtitle}</p>
              ) : null}

              {headerContent ? <div className="mt-5">{headerContent}</div> : null}
            </div>
          </div>
        ) : null}

        {children}
      </div>
    </div>
  );
}
