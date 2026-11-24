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
    <div className={`relative inline-flex flex-col items-center ${className}`}>
      <div>{children}</div>
      <div
        aria-hidden="true"
        inert={true}
        className="pointer-events-none select-none overflow-hidden opacity-[0.22] blur-[2px]"
        style={{
          transform: 'scaleY(-1)',
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.9), transparent 82%)',
          WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.9), transparent 82%)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
