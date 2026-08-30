import React from "react";

export default function BrandMark({ className = "h-20 w-52" }) {
  return (
    <svg
      viewBox="0 0 190 80"
      className={className}
      role="img"
      aria-label="RTLiga"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g fill="#1769aa">
        <path d="M2 14h126l7 7H18z" />
        <path d="M2 27h123l5 7H28z" />
        <path d="M2 46h128l-5 7H22z" />
        <path d="M2 59h133l-7 7H14z" />
      </g>
      <g fill="#0b2845">
        <circle cx="128" cy="40" r="28" />
        <circle cx="128" cy="40" r="14" />
        <circle cx="85" cy="40" r="6" />
        <circle cx="171" cy="40" r="6" />
      </g>
      <g fill="#fff">
        <circle cx="128" cy="40" r="20" />
        <circle cx="128" cy="40" r="8" />
        <circle cx="85" cy="40" r="3" />
        <circle cx="171" cy="40" r="3" />
      </g>
      <circle cx="128" cy="40" r="3.5" fill="#1769aa" />
    </svg>
  );
}
