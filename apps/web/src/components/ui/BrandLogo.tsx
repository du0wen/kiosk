import type { SVGProps } from "react";

export interface BrandLogoProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

export function BrandLogo({ size = 20, className, ...props }: BrandLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient id="kiosk-logo-bg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#14b8a6" />
          <stop offset="100%" stopColor="#0f766e" />
        </linearGradient>
        <linearGradient id="kiosk-logo-card" x1="6" y1="6" x2="26" y2="26" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f0fdfa" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="7.5" fill="url(#kiosk-logo-bg)" />
      <rect x="5.5" y="6" width="21" height="20" rx="3" fill="#0d1014" fillOpacity="0.18" />
      <rect x="5.5" y="5.5" width="21" height="20" rx="3" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="1" />
      <rect x="8" y="8" width="16" height="15" rx="2" fill="url(#kiosk-logo-card)" />
      <circle cx="10.8" cy="10.5" r="1" fill="#0f766e" />
      <circle cx="13.5" cy="10.5" r="1" fill="#14b8a6" />
      <path d="M16 10.5h5.5" stroke="#99f6e4" strokeWidth="1.2" strokeLinecap="round" />
      <rect x="10.5" y="13.5" width="11" height="1.8" rx="0.9" fill="#0f766e" fillOpacity="0.9" />
      <rect x="10.5" y="16.5" width="7.5" height="1.5" rx="0.75" fill="#14b8a6" fillOpacity="0.7" />
      <rect x="10.5" y="19" width="9" height="1.5" rx="0.75" fill="#14b8a6" fillOpacity="0.5" />
      <circle cx="23.5" cy="8.5" r="3.2" fill="#10b981" stroke="#ffffff" strokeWidth="1.2" />
      <path d="M22.3 8.7l1.8-1.4m0 0v1.6m0-1.6h-1.6" stroke="#ffffff" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
