import React, { useEffect, useId, useRef, useState } from "react";

export default function AppChoiceField({ label, value, options, onChange, helpText, className = "" }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const labelId = useId();
  const selected = options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={className}>
      <span id={labelId} className="block text-sm font-semibold text-zinc-800">{label}</span>
      <button
        type="button"
        className={`input mt-2 flex w-full items-center justify-between gap-3 text-left transition ${open ? "border-indigo-400 ring-4 ring-indigo-100" : ""}`}
        aria-labelledby={labelId}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0 truncate font-medium text-zinc-900">{selected?.label || "Bitte auswählen"}</span>
        <span className={`shrink-0 text-indigo-600 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">⌄</span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-labelledby={labelId}
          className="mt-2 max-h-72 space-y-1 overflow-y-auto rounded-2xl border border-indigo-100 bg-indigo-50/70 p-2 shadow-inner"
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition ${
                  active
                    ? "border-indigo-300 bg-white text-indigo-800 shadow-sm"
                    : "border-transparent bg-transparent text-zinc-700 hover:border-indigo-200 hover:bg-white"
                }`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${active ? "border-indigo-600 bg-indigo-600 text-white" : "border-zinc-300 bg-white text-transparent"}`} aria-hidden="true">✓</span>
              </button>
            );
          })}
        </div>
      )}

      {helpText && <span className="mt-1.5 block text-xs font-normal leading-5 text-zinc-500">{helpText}</span>}
    </div>
  );
}
