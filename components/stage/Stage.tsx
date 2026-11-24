"use client";

import { Canvas } from "@react-three/fiber";

export function Stage() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
    >
      <Canvas
        dpr={[1, 1.5]}
        frameloop="demand"
        gl={{ antialias: false, powerPreference: "high-performance" }}
        onCreated={({ gl, invalidate }) => {
          const bg = getComputedStyle(document.documentElement)
            .getPropertyValue("--bg")
            .trim();
          if (bg) {
            gl.setClearColor(bg, 1);
          }
          invalidate();
        }}
      />
    </div>
  );
}
