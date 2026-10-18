import React from "react";
import AppDialog from "./AppDialog";

const toneStyles = {
  danger: {
    icon: "bg-rose-100 text-rose-700",
    panel: "border-rose-200 bg-rose-50 text-rose-800",
    button: "bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500",
  },
  warning: {
    icon: "bg-amber-100 text-amber-700",
    panel: "border-amber-200 bg-amber-50 text-amber-900",
    button: "bg-amber-600 text-white hover:bg-amber-700 focus-visible:ring-amber-500",
  },
  primary: {
    icon: "bg-indigo-100 text-indigo-700",
    panel: "border-indigo-200 bg-indigo-50 text-indigo-900",
    button: "bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:ring-indigo-500",
  },
};

export default function ConfirmDialog({
  open,
  title,
  message,
  children,
  confirmLabel = "Bestätigen",
  cancelLabel = "Abbrechen",
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}) {
  const styles = toneStyles[tone] || toneStyles.danger;

  return (
    <AppDialog open={open} title={title} onCancel={busy ? undefined : onCancel}>
      <div className="mt-5 flex items-start gap-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${styles.icon}`} aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86l-7.5 13A1 1 0 003.66 18h16.68a1 1 0 00.87-1.5l-7.5-13a1 1 0 00-1.74 0z" />
          </svg>
        </div>
        <div className={`min-w-0 flex-1 whitespace-pre-line rounded-2xl border px-4 py-3 text-sm leading-6 ${styles.panel}`}>
          {children || message}
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          className={`min-h-[48px] rounded-2xl px-5 py-3 font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${styles.button}`}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? "Wird ausgeführt …" : confirmLabel}
        </button>
        <button
          type="button"
          className="btn btn-secondary !min-h-[48px] !rounded-2xl !px-5"
          onClick={onCancel}
          disabled={busy}
          autoFocus
        >
          {cancelLabel}
        </button>
      </div>
    </AppDialog>
  );
}
