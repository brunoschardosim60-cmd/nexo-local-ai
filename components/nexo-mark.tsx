import type { SVGProps } from 'react';

export function NexoMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M6.5 17.5v-11l11 11v-11" stroke="currentColor" strokeWidth="2.15" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 12h4.25M13.35 12h4.15" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" opacity=".6" />
      <circle cx="6.5" cy="6.5" r="1.65" fill="currentColor" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <circle cx="17.5" cy="6.5" r="1.65" fill="currentColor" />
      <circle cx="6.5" cy="17.5" r="1.65" fill="currentColor" />
      <circle cx="17.5" cy="17.5" r="1.65" fill="currentColor" />
    </svg>
  );
}
