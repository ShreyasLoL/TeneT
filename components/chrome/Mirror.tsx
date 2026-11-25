import type { ReactNode } from 'react';

/**
 * Non-interactive mirrored numeral reflection below hero figures.
 */
export function Mirror({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative inline-flex flex-col items-center leading-none ${className}`}>
      <div className="leading-none">{children}</div>
      <div
        aria-hidden="true"
        inert={true}
        className="pointer-events-none -mt-1 max-h-[0.65em] select-none overflow-hidden leading-none opacity-[0.16]"
        style={{
          transform: 'scaleY(-1)',
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.88), transparent 68%)',
          WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.88), transparent 68%)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
