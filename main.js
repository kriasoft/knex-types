"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.updateTypes = updateTypes;

var _camelCase2 = _interopRequireDefault(require("lodash/camelCase"));

var _upperFirst2 = _interopRequireDefault(require("lodash/upperFirst"));

var _fs = _interopRequireDefault(require("fs"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* SPDX-FileCopyrightText: 2016-present Kriasoft <hello@kriasoft.com> */

/* SPDX-License-Identifier: MIT */

/**
 * Generates TypeScript definitions (types) from a PostgreSQL database schema.
 */
async function updateTypes(db, options) {
  var _options$overrides;

  const overrides = (_options$overrides = options.overrides) !== null && _options$overrides !== void 0 ? _options$overrides : {};
  const output = typeof options.output === "string" ? _fs.default.createWriteStream(options.output, {
    encoding: "utf-8"
  }) : options.output;
  ["// The TypeScript definitions below are automatically generated.\n", "// Do not touch them, or risk, your modifications being lost.\n\n", 'import { Knex } from "knex";\n\n'].forEach(line => output.write(line));

  try {
    // Fetch the list of custom enum types
    const enums = await db.table("pg_type").join("pg_enum", "pg_enum.enumtypid", "pg_type.oid").orderBy("pg_type.typname").orderBy("pg_enum.enumsortorder").select("pg_type.typname as key", "pg_enum.enumlabel as value"); // Construct TypeScript enum types

    enums.forEach((x, i) => {
      var _overrides$;

      // The first line of enum declaration
      if (!(enums[i - 1] && enums[i - 1].key === x.key)) {
        var _overrides$x$key;

        const enumName = (_overrides$x$key = overrides[x.key]) !== null && _overrides$x$key !== void 0 ? _overrides$x$key : (0, _upperFirst2.default)((0, _camelCase2.default)(x.key));
        output.write(`export enum ${enumName} {\n`);
      } // Enum body


      const key = (_overrides$ = overrides[`${x.key}.${x.value}`]) !== null && _overrides$ !== void 0 ? _overrides$ : (0, _upperFirst2.default)((0, _camelCase2.default)(x.value.replace(/[.-]/g, "_")));
      output.write(`  ${key} = "${x.value}",\n`); // The closing line

      if (!(enums[i + 1] && enums[i + 1].key === x.key)) {
        output.write("}\n\n");
      }
    }); // Fetch the list of tables/columns

    const columns = await db.withSchema("information_schema").table("columns").where("table_schema", "public").orderBy("table_name").orderBy("ordinal_position").select("table_name as table", "column_name as column", db.raw("(is_nullable = 'YES') as nullable"), "column_default as default", "data_type as type", "udt_name as udt"); // The list of database tables as enum

    output.write("export enum Table {\n");
    Array.from(new Set(columns.map(x => x.table))).forEach(value => {
      var _overrides$value;

      const key = (_overrides$value = overrides[value]) !== null && _overrides$value !== void 0 ? _overrides$value : (0, _upperFirst2.default)((0, _camelCase2.default)(value));
      output.write(`  ${key} = "${value}",\n`);
    });
    output.write("}\n\n"); // Construct TypeScript db record types

    columns.forEach((x, i) => {
      if (!(columns[i - 1] && columns[i - 1].table === x.table)) {
        var _overrides$x$table;

        const tableName = (_overrides$x$table = overrides[x.table]) !== null && _overrides$x$table !== void 0 ? _overrides$x$table : (0, _upperFirst2.default)((0, _camelCase2.default)(x.table));
        output.write(`export type ${tableName} = {\n`);
      }

      output.write(`  ${x.column}: ${toType(x, enums, overrides)};\n`);

      if (!(columns[i + 1] && columns[i + 1].table === x.table)) {
        output.write("};\n\n");
      }
    }); // Construct TypeScript db record types

    columns.forEach((x, i) => {
      if (!(columns[i - 1] && columns[i - 1].table === x.table)) {
        var _overrides$x$table2;

        const tableName = (_overrides$x$table2 = overrides[x.table]) !== null && _overrides$x$table2 !== void 0 ? _overrides$x$table2 : (0, _upperFirst2.default)((0, _camelCase2.default)(x.table));
        output.write(`export type ${tableName}Record = {\n`);
      }

      const optional = x.nullable || x.default !== null ? "?" : "";
      output.write(`  ${x.column}${optional}: ${toType(x, enums, overrides, true)};\n`);

      if (!(columns[i + 1] && columns[i + 1].table === x.table)) {
        output.write("};\n\n");
      }
    });
  } finally {
    output.end();
    db.destroy();
  }
}

function toType(c, enums, overrides, isRecord = false) {
  var _c$default, _c$default2;

  let type = ["integer", "numeric", "decimal", "bigint"].includes(c.type) ? "number" : c.type === "boolean" ? "boolean" : c.type === "jsonb" ? isRecord ? "string" : (_c$default = c.default) !== null && _c$default !== void 0 && _c$default.startsWith("'{") ? "Record<string, unknown>" : (_c$default2 = c.default) !== null && _c$default2 !== void 0 && _c$default2.startsWith("'[") ? "unknown[]" : "unknown" : c.type === "ARRAY" && (c.udt === "_text" || c.udt === "_citext") ? "string[]" : c.type.startsWith("timestamp") || c.type === "date" ? "Date" : "string";

  if (c.type === "USER-DEFINED") {
    var _enums$find;

    const key = (_enums$find = enums.find(x => x.key === c.udt)) === null || _enums$find === void 0 ? void 0 : _enums$find.key;

    if (key) {
      var _overrides$key;

      type = (_overrides$key = overrides[key]) !== null && _overrides$key !== void 0 ? _overrides$key : (0, _upperFirst2.default)((0, _camelCase2.default)(key));
    }
  }

  if (type === "Date" && isRecord) {
    type = "Date | string";
  }

  return `${isRecord ? "Knex.Raw | " : ""}${type}${c.nullable ? " | null" : ""}`;
}