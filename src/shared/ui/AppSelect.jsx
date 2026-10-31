import React, { useId, useRef, useState } from 'react';
import AppDialog from './AppDialog';

// Keep the native element for form values/validation, but open our own dialog.
// This prevents Android/iOS from displaying a system-themed selection sheet.
export default function AppSelect({ children, className = 'input', value, defaultValue, onChange, disabled, required, name, id, ...props }) {
  const generatedId = useId();
  const native = useRef(null);
  const trigger = useRef(null);
  const wrapper = useRef(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('Auswählen');
  const [query, setQuery] = useState('');
  const [localValue, setLocalValue] = useState(defaultValue);
  const currentValue = value === undefined ? localValue : value;
  function flatten(nodes) {
    return React.Children.toArray(nodes).flatMap(child => {
      if (!React.isValidElement(child)) return [];
      if (child.type === 'option') return [{ value: String(child.props.value ?? text(child.props.children)), label: text(child.props.children), disabled: child.props.disabled }];
      return flatten(child.props.children);
    });
  }
  function text(node) { return React.Children.toArray(node).map(n => React.isValidElement(n) ? text(n.props.children) : String(n)).join(''); }
  const options = flatten(children);
  const selected = options.find(o => o.value === String(currentValue ?? options[0]?.value ?? ''));
  const shown = options.filter(o => o.label.toLocaleLowerCase('de').includes(query.toLocaleLowerCase('de')));
  function show() {
    if (disabled || trigger.current?.matches(':disabled')) return;
    const label = wrapper.current?.closest('label');
    const labelText = label ? [...label.childNodes].filter(node => node !== wrapper.current).map(node => node.textContent).join(' ').trim() : '';
    setTitle(props['aria-label'] || labelText || 'Auswählen'); setQuery(''); setOpen(true);
  }
  function close() { setOpen(false); trigger.current?.focus(); }
  function choose(option) {
    if (option.disabled) return;
    if (value === undefined) setLocalValue(option.value);
    native.current.value = option.value;
    onChange?.({ target: native.current, currentTarget: native.current });
    close();
  }
  return <span ref={wrapper} className="inline-block w-full min-w-0">
    <select {...props} ref={native} id={id || generatedId} name={name} value={value} defaultValue={defaultValue} required={required} disabled={disabled}
      tabIndex={-1} aria-hidden="true" className="sr-only pointer-events-none" onChange={onChange}
      onClick={event => { event.preventDefault(); show(); }} onInvalid={event => { event.preventDefault(); show(); }}>{children}</select>
    <button ref={trigger} type="button" role="combobox" aria-haspopup="dialog" aria-expanded={open} aria-label={props['aria-label']}
      disabled={disabled} onClick={show} onKeyDown={event => { if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); show(); } }}
      className={`${className} flex min-h-11 items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60`}>
      <span className="min-w-0 truncate">{selected?.label || 'Bitte auswählen'}</span><span aria-hidden="true" className="shrink-0 text-indigo-600">▾</span>
    </button>
    <AppDialog open={open} title={title} onCancel={close}>
      {options.length > 7 && <input type="search" className="input my-4" placeholder="Auswahl durchsuchen…" aria-label="Auswahl durchsuchen" value={query} onChange={event => setQuery(event.target.value)} />}
      <div role="listbox" aria-label={title} className="mt-4 max-h-[50vh] space-y-1 overflow-y-auto rounded-2xl border border-zinc-200 p-2">
        {shown.map((option, index) => <button key={`${option.value}-${index}`} type="button" role="option" aria-selected={selected?.value === option.value}
          disabled={option.disabled} onClick={() => choose(option)}
          className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-sm transition disabled:opacity-40 ${selected?.value === option.value ? 'bg-indigo-100 font-semibold text-indigo-900' : 'bg-white text-zinc-800 hover:bg-indigo-50 focus:bg-indigo-50'}`}>
          <span>{option.label}</span><span aria-hidden="true">{selected?.value === option.value ? '✓' : ''}</span>
        </button>)}
        {!shown.length && <p className="p-4 text-sm text-zinc-500">Keine passenden Einträge.</p>}
      </div>
      <button type="button" className="btn btn-secondary mt-4 w-full" onClick={close}>Abbrechen</button>
    </AppDialog>
  </span>;
}
