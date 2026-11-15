import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    ".next/**", ".next-e2e/**", "out/**", "coverage/**", "node_modules/**",
    "playwright-report/**", "test-results/**", "next-env.d.ts",
    "prototype/**", "temp/**", "docs/archive/**",
  ]),
]);
