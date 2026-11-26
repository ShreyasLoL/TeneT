import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/bh/**",
  ]),
  {
    files: ["lib/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react",
                "react/*",
                "react-dom",
                "react-dom/*",
                "next",
                "next/*",
                "drizzle-orm",
                "drizzle-orm/*",
                "node:*",
                "fs",
                "path",
                "pg",
                "@neondatabase/*",
                "@/lib/db*",
                "@/components/*",
                "@/app/*",
                "zustand",
                "@tanstack/*",
                "three",
                "@react-three/*",
                "gsap",
                "motion",
                "lenis",
              ],
              message:
                "lib/domain/ must remain pure TypeScript (no React, Next, DB, UI, or I/O).",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
