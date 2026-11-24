import type { ReactNode } from "react";

export function UI({ children }: { children: ReactNode }) {
  return <div className="relative z-10 flex min-h-dvh flex-col">{children}</div>;
}
