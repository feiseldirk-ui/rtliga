export function getBrandYear(date = new Date()) {
  return date.getFullYear();
}

export function createAppIconSvg(year = getBrandYear()) {
  const safeYear = String(year).replace(/[^0-9]/g, "").slice(0, 4) || String(getBrandYear());

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180">
  <rect width="180" height="180" rx="34" fill="#ffffff"/>
  <path d="M15 12h150l-9 156H24z" fill="#ffffff" stroke="#202020" stroke-width="4"/>
  <text x="90" y="52" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="27" font-style="italic" font-weight="800" fill="#111827">Online-Liga</text>
  <circle cx="35" cy="85" r="14" fill="#f4f4f5" stroke="#a1a1aa" stroke-width="3"/>
  <circle cx="35" cy="85" r="5" fill="#d4d4d8"/>
  <circle cx="145" cy="85" r="14" fill="#f4f4f5" stroke="#a1a1aa" stroke-width="3"/>
  <circle cx="145" cy="85" r="5" fill="#d4d4d8"/>
  <text x="90" y="102" text-anchor="middle" font-family="Georgia,serif" font-size="34" font-style="italic" font-weight="800" fill="#ef2b2d">${safeYear}</text>
  <text x="90" y="142" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="16" font-style="italic" font-weight="800" fill="#ffd91a" stroke="#d69b00" stroke-width="0.8">Laufende Scheibe</text>
</svg>`;
}

export function applyDocumentBranding(doc = document, year = getBrandYear()) {
  doc.title = `Online-Liga ${year} – Laufende Scheibe`;

  let icon = doc.querySelector('link[rel="icon"]');
  if (!icon) {
    icon = doc.createElement("link");
    icon.rel = "icon";
    doc.head.appendChild(icon);
  }

  icon.type = "image/svg+xml";
  icon.href = `data:image/svg+xml,${encodeURIComponent(createAppIconSvg(year))}`;
}
