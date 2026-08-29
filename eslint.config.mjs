import tseslint from "typescript-eslint";
export default tseslint.config(
  {
    files: ["src/**/*.ts"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } }
  },
  { ignores: ["dist/**", "docs/**", "coverage/**"] }
);
