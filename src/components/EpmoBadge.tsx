'use client';

import React from 'react';

interface EpmoBadgeProps {
  className?: string;
}

/**
 * Hanging golden EPMO badge displayed on the sign-in / institutional pages.
 *
 * Recreates the golden hanging shield pennant with "SYSTEM BY EPMO".
 *
 * The pennant sways about its pin (`.epmo-swing` in globals.css): a pure CSS
 * transform animation, so it costs no JavaScript, no timer and no re-render,
 * and it stops for anyone who has asked for reduced motion.
 */
export const EpmoBadge: React.FC<EpmoBadgeProps> = ({ className = '' }) => {
  return (
    <div
      aria-label="System by EPMO"
      className={`epmo-swing flex flex-col items-center pointer-events-none select-none ${className}`}
    >
      {/* Top Hanging Cord & Pin */}
      <div className="relative flex flex-col items-center">
        {/* Glowing Pin Dot */}
        <div className="w-2.5 h-2.5 rounded-full bg-amber-400 border border-amber-200 shadow-[0_0_10px_2px_rgba(251,191,36,0.85)] z-10" />
        {/* Golden Cord */}
        <div className="w-[2px] h-8 bg-gradient-to-b from-amber-400 via-amber-500 to-amber-600 shadow-[0_0_6px_rgba(245,158,11,0.6)]" />
      </div>

      {/* Shield Badge */}
      <div className="relative w-[124px] h-[134px] -mt-[1px] filter drop-shadow-[0_12px_24px_rgba(0,0,0,0.75)] transition-transform duration-300 pointer-events-auto hover:scale-105 cursor-default">
        <svg
          viewBox="0 0 124 134"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full overflow-visible"
        >
          <defs>
            {/* Background gradient - rich golden amber to deep dark brown */}
            <linearGradient id="epmo-bg-grad" x1="62" y1="0" x2="62" y2="134" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#A35B13" />
              <stop offset="28%" stopColor="#824207" />
              <stop offset="68%" stopColor="#4A2004" />
              <stop offset="100%" stopColor="#240D01" />
            </linearGradient>

            {/* Gold border stroke gradient */}
            <linearGradient id="epmo-border-grad" x1="0" y1="0" x2="124" y2="134" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FDE68A" />
              <stop offset="25%" stopColor="#F59E0B" />
              <stop offset="70%" stopColor="#D97706" />
              <stop offset="100%" stopColor="#92400E" />
            </linearGradient>

            {/* Radiant specular highlight */}
            <radialGradient id="epmo-radial-highlight" cx="50%" cy="28%" r="60%">
              <stop offset="0%" stopColor="#FBBF24" stopOpacity="0.4" />
              <stop offset="55%" stopColor="#F59E0B" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.3" />
            </radialGradient>

            {/* Text drop shadow filters */}
            <filter id="epmo-text-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#000000" floodOpacity="0.85" />
            </filter>
            <filter id="epmo-subtext-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.75" />
            </filter>
          </defs>

          {/* Outer Shield Path */}
          <path
            d="M 3 2 L 121 2 L 121 100 L 62 130 L 3 100 Z"
            fill="url(#epmo-bg-grad)"
            stroke="url(#epmo-border-grad)"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />

          {/* Radial light overlay */}
          <path
            d="M 5 4 L 119 4 L 119 98 L 62 127 L 5 98 Z"
            fill="url(#epmo-radial-highlight)"
          />

          {/* Subtle inner pinstripe */}
          <path
            d="M 7 6 L 117 6 L 117 96 L 62 124 L 7 96 Z"
            fill="none"
            stroke="#FEF3C7"
            strokeOpacity="0.2"
            strokeWidth="1"
            strokeLinejoin="round"
          />

          {/* Subtext: "SYSTEM BY" */}
          <text
            x="62"
            y="50"
            textAnchor="middle"
            fill="#F6CA68"
            fontSize="10"
            fontWeight="800"
            letterSpacing="0.24em"
            filter="url(#epmo-subtext-shadow)"
            className="font-[family-name:var(--font-geist-sans),system-ui,-apple-system,sans-serif]"
          >
            SYSTEM BY
          </text>

          {/* Main text: "EPMO" */}
          <text
            x="62"
            y="84"
            textAnchor="middle"
            fill="#FFFFFF"
            fontSize="23"
            fontWeight="900"
            letterSpacing="0.08em"
            filter="url(#epmo-text-shadow)"
            className="font-[family-name:var(--font-geist-sans),system-ui,-apple-system,sans-serif]"
          >
            EPMO
          </text>
        </svg>
      </div>
    </div>
  );
};
