import React, { useEffect, useRef, useState } from 'react';
import AppDialog from './AppDialog';

export default function AppValidationNotice() {
  const [message, setMessage] = useState('');
  const field = useRef(null);
  useEffect(() => {
    const handleInvalid = event => {
      if (event.target.tagName === 'SELECT') return;
      event.preventDefault();
      if (field.current) return;
      field.current = event.target;
      const label = event.target.labels?.[0]?.textContent?.trim() || event.target.getAttribute('aria-label') || 'Eingabe';
      setMessage(`${label}: ${event.target.validationMessage || 'Bitte die Eingabe prüfen.'}`);
    };
    document.addEventListener('invalid', handleInvalid, true);
    return () => document.removeEventListener('invalid', handleInvalid, true);
  }, []);
  function close() { const input = field.current; field.current = null; setMessage(''); input?.focus(); }
  return <AppDialog open={Boolean(message)} title="Bitte Eingabe prüfen" onCancel={close}>
    <p role="alert" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">{message}</p>
    <button type="button" className="btn btn-primary mt-4 w-full" onClick={close}>Eingabe korrigieren</button>
  </AppDialog>;
}
