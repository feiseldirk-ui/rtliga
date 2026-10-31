export function sanitizeSerieValue(value) {
  const clean = String(value ?? '').replace(/\D/g, '').slice(0, 3);
  if (clean === '') return '';
  return String(Math.min(Number(clean), 100));
}
