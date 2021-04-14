/**
 * ESLint configuration.
 *
 * @see https://eslint.org/docs/user-guide/configuring
 * @type {import("eslint").Linter.Config}
 *
 * @copyright 2021-present Kriasoft (https://git.io/JOevo)
 */

module.exports = {
  root: true,

  env: {
    es6: true,
    node: true,
  },

  extends: ["eslint:recommended", "prettier"],

  parserOptions: {
    ecmaVersion: 2020,
  },

  overrides: [
    {
      files: ["*.ts"],
      parser: "@typescript-eslint/parser",
      extends: ["plugin:@typescript-eslint/recommended"],
      plugins: ["@typescript-eslint"],
      parserOptions: {
        sourceType: "module",
        warnOnUnsupportedTypeScriptVersion: true,
      },
    },
    {
      files: ["*.test.js", "*.test.ts"],
      env: {
        jest: true,
      },
    },
  ],

  ignorePatterns: [
    "/.cache",
    "/.git",
    "/.yarn",
    "*.d.ts",
    "*.js",
    "!.eslintrc.js",
    "!babel.config.js",
  ],
};
