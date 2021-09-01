/**
 * Babel configuration.
 *
 * @see https://babeljs.io/docs/en/options
 * @copyright 2021-present Kriasoft (https://git.io/JmNtC)
 *
 * @type {import("@babel/core").ConfigAPI}
 */

module.exports = function config(api) {
  return {
    presets: [["@babel/preset-env", { targets: { node: "10" } }]],

    plugins: [
      ["@babel/plugin-proposal-class-properties"],
      [
        "babel-plugin-import",
        {
          libraryName: "lodash",
          libraryDirectory: "",
          camel2DashComponentName: false,
        },
      ],
    ],

    ignore: api.env() === "test" ? [] : ["*.d.ts", "*.test.ts"],

    sourceMaps: api.env() === "production",

    overrides: [
      {
        test: /\.ts$/,
        presets: ["@babel/preset-typescript"],
      },
    ],
  };
};
