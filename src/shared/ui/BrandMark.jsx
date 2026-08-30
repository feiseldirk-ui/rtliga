import React from "react";

export default function BrandMark({ className = "h-20 w-52" }) {
  return (
    <svg
      viewBox="0 0 220 82"
      className={className}
      role="img"
      aria-label="RTLiga"
    >
      <defs>
        <linearGradient id="rtliga-mark-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2563eb" />
          <stop offset="1" stopColor="#0f766e" />
        </linearGradient>
      </defs>
      <path d="M18 22h92l-17 8H31z" fill="#38bdf8" />
      <path d="M18 36h84l-17 8H31z" fill="#2563eb" />
      <path d="M18 50h76l-17 8H31z" fill="#0f766e" />
      <circle cx="135" cy="40" r="31" fill="white" stroke="url(#rtliga-mark-gradient)" strokeWidth="8" />
      <circle cx="135" cy="40" r="17" fill="white" stroke="#1d4ed8" strokeWidth="7" />
      <circle cx="135" cy="40" r="6" fill="#0f766e" />
      <circle cx="178" cy="39" r="8" fill="white" stroke="#2563eb" strokeWidth="4" />
      <circle cx="178" cy="39" r="2.5" fill="#0f766e" />
    </svg>
  );
}
