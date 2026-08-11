import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import serviceLayer from "./eslint-rules/service-layer.mjs";

/** @type {import("eslint").Linter.Config[]} */
const config = [
  { ignores: [".next/**", "node_modules/**", "out/**", "build/**"] },
  ...coreWebVitals,
  ...nextTypescript,
  {
    // plan/04-service-layer.md §11 requires these two to be "verified by a
    // lint rule, not by reading". Scoped to the service layer, since both
    // conventions are about that boundary specifically.
    files: ["lib/server/services/**/*.ts"],
    plugins: { "service-layer": serviceLayer },
    rules: {
      "service-layer/no-exported-row-type": "error",
      "service-layer/session-first-argument": "error",
    },
  },
];

export default config;
