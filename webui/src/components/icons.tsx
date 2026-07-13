import React from 'react';

type IconProps = { size?: number; className?: string };

const base = (size: number): React.SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

/** Scenes — stacked layers (a scene = a composed stack of skills). */
export const ScenesIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M12 3 3 8l9 5 9-5-9-5Z" />
    <path d="m3 13 9 5 9-5" />
  </svg>
);

/** Catalog / skills — sparkle. */
export const SkillsIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
    <path d="M12 8.5 13.2 11l2.3.8-2.3.8L12 15.5 10.8 12.6 8.5 11.8 10.8 11 12 8.5Z" />
  </svg>
);

export const SearchIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

export const PlusIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const CopyIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
  </svg>
);

export const CheckIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="m5 12 4 4L19 6" />
  </svg>
);

export const CloseIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const SunIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

export const MoonIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </svg>
);
