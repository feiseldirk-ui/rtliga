import React, { useEffect, useRef } from "react";

export default function AppDialog({ open, title, children, onCancel }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} aria-label={title} onCancel={event => { event.preventDefault(); onCancel?.(); }}
    className="m-auto w-[calc(100%_-_2rem)] max-w-lg rounded-[28px] border border-zinc-200 bg-white p-0 shadow-2xl backdrop:bg-zinc-950/50">
    <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-500" />
    <div className="max-h-[85vh] overflow-y-auto p-6">
      <h2 className="text-xl font-bold text-zinc-950">{title}</h2>
      {children}
    </div>
  </dialog>;
}
