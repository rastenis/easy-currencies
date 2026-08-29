import tseslint from "typescript-eslint";
export default tseslint.config(
  {
    files: ["src/**/*.ts"],
    extends: [tseslint.configs.base],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      // The bug classes that actually bite an async library. Deliberately not
      // the no-unsafe-* family: this code handles untrusted vendor JSON, so
      // `any` at those boundaries is the design, not an oversight.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/no-for-in-array": "error",
      "@typescript-eslint/no-array-delete": "error",
      "@typescript-eslint/no-duplicate-type-constituents": "error"
    }
  },
  { ignores: ["dist/**", "docs/**", "coverage/**"] }
);
