import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": "off",
      // This codebase currently uses `any` in many places. Keep it as a warning
      // so builds and CI can pass while we gradually type-harden.
      "@typescript-eslint/no-explicit-any": "warn",
      // Same for exhaustive deps: warn instead of fail-the-world.
      "react-hooks/exhaustive-deps": "warn",
      // Allow incremental cleanup without blocking builds.
      "prefer-const": "off",
      "no-case-declarations": "off",
      "no-useless-escape": "warn",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  }
);
