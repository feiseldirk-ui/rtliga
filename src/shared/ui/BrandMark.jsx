import React from "react";
import { getBrandYear } from "../../lib/branding";

function Target({ x }) {
  return (
    <g aria-hidden="true">
      <circle cx={x} cy="56" r="12" fill="#f4f4f5" stroke="#a1a1aa" strokeWidth="2" />
      <circle cx={x} cy="56" r="7" fill="none" stroke="#d4d4d8" strokeWidth="2" />
      <circle cx={x} cy="56" r="2.5" fill="#b8b8bd" />
    </g>
  );
}

export default function BrandMark({ className = "h-20 w-72", year = getBrandYear() }) {
  return (
    <svg
      viewBox="0 0 360 115"
      className={className}
      role="img"
      aria-label={`Online-Liga ${year} Laufende Scheibe`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M18 3h334l-14 109H3z" fill="#fff" stroke="#27272a" strokeWidth="2" />
      <text x="180" y="34" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="35" fontStyle="italic" fontWeight="800" fill="#18181b">
        Online-Liga
      </text>
      <Target x="68" />
      <Target x="292" />
      <text x="180" y="68" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontSize="36" fontStyle="italic" fontWeight="800" fill="#ef2b2d" stroke="#b91c1c" strokeWidth="0.45">
        {year}
      </text>
      <text x="180" y="101" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="30" fontStyle="italic" fontWeight="800" fill="#ffe11a" stroke="#d79b00" strokeWidth="0.9" paintOrder="stroke">
        Laufende Scheibe
      </text>
    </svg>
  );
}
