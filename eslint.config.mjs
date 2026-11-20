import next from "eslint-config-next/core-web-vitals";
import ts from "eslint-config-next/typescript";

export default [
  { ignores: ["src/generated/**", ".next/**", "node_modules/**", "playwright-report/**"] },
  ...next,
  ...ts,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      // Intentional patterns (mounted flags, reset-on-route-change, kick off fetch on mount). TODO: migrate to useSyncExternalStore / keyed resets.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];
