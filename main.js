"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getType = getType;
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
  var _options$overrides, _ref, _ref2;
  const overrides = (_options$overrides = options.overrides) !== null && _options$overrides !== void 0 ? _options$overrides : {};
  const output = typeof options.output === "string" ? _fs.default.createWriteStream(options.output, {
    encoding: "utf-8"
  }) : options.output;
  ["// The TypeScript definitions below are automatically generated.\n", "// Do not touch them, or risk, your modifications being lost.\n\n"].forEach(line => output.write(line));
  const schema = (_ref = typeof options.schema === "string" ? options.schema.split(",").map(x => x.trim()) : options.schema) !== null && _ref !== void 0 ? _ref : ["public"];

  // Schemas to include or exclude
  const [includeSchemas, excludeSchemas] = schema.reduce((acc, s) => acc[+s.startsWith("!")].push(s) && acc, [[], []]);

  // Tables to exclude
  const exclude = (_ref2 = typeof options.exclude === "string" ? options.exclude.split(",").map(x => x.trim()) : options.exclude) !== null && _ref2 !== void 0 ? _ref2 : [];
  if (options.prefix) {
    output.write(options.prefix);
    output.write("\n\n");
  }
  try {
    // Fetch the list of custom enum types
    const enums = await db.table("pg_type").join("pg_enum", "pg_enum.enumtypid", "pg_type.oid").orderBy("pg_type.typname").orderBy("pg_enum.enumsortorder").select("pg_type.typname as key", "pg_enum.enumlabel as value");

    // Construct TypeScript enum types
    enums.forEach((x, i) => {
      var _overrides;
      // The first line of enum declaration
      if (!(enums[i - 1] && enums[i - 1].key === x.key)) {
        var _overrides$x$key;
        const enumName = (_overrides$x$key = overrides[x.key]) !== null && _overrides$x$key !== void 0 ? _overrides$x$key : (0, _upperFirst2.default)((0, _camelCase2.default)(x.key));
        output.write(`export enum ${enumName} {\n`);
      }

      // Enum body
      const key = (_overrides = overrides[`${x.key}.${x.value}`]) !== null && _overrides !== void 0 ? _overrides : (0, _upperFirst2.default)((0, _camelCase2.default)(x.value.replace(/[.-]/g, "_")));
      output.write(`  ${key} = "${x.value}",\n`);

      // The closing line
      if (!(enums[i + 1] && enums[i + 1].key === x.key)) {
        output.write("}\n\n");
      }
    });
    const enumsMap = new Map(enums.map(x => {
      var _overrides$x$key2;
      return [x.key, (_overrides$x$key2 = overrides[x.key]) !== null && _overrides$x$key2 !== void 0 ? _overrides$x$key2 : (0, _upperFirst2.default)((0, _camelCase2.default)(x.key))];
    }));

    // Fetch the list of tables/columns
    const columns = await db.withSchema("information_schema").table("columns").whereIn("table_schema", includeSchemas).whereNotIn("table_schema", excludeSchemas).whereNotIn("table_name", exclude).orderBy("table_schema").orderBy("table_name").orderBy("ordinal_position").select("table_schema as schema", "table_name as table", "column_name as column", db.raw("(is_nullable = 'YES') as nullable"), "column_default as default", "data_type as type", "udt_name as udt");

    // The list of database tables as enum
    output.write("export enum Table {\n");
    const tableSet = new Set(columns.map(x => {
      const schema = x.schema !== "public" ? `${x.schema}.` : "";
      return `${schema}${x.table}`;
    }));
    Array.from(tableSet).forEach(value => {
      var _overrides$value;
      const key = (_overrides$value = overrides[value]) !== null && _overrides$value !== void 0 ? _overrides$value : (0, _upperFirst2.default)((0, _camelCase2.default)(value));
      output.write(`  ${key} = "${value}",\n`);
    });
    output.write("}\n\n");
    // The list of tables as type
    output.write("export type Tables = {\n");
    Array.from(tableSet).forEach(key => {
      var _overrides$key;
      const value = (_overrides$key = overrides[key]) !== null && _overrides$key !== void 0 ? _overrides$key : (0, _upperFirst2.default)((0, _camelCase2.default)(key));
      output.write(`  "${key}": ${value},\n`);
    });
    output.write("};\n\n");

    // Construct TypeScript db record types
    columns.forEach((x, i) => {
      if (!(columns[i - 1] && columns[i - 1].table === x.table)) {
        var _overrides$x$table;
        const tableName = (_overrides$x$table = overrides[x.table]) !== null && _overrides$x$table !== void 0 ? _overrides$x$table : (0, _upperFirst2.default)((0, _camelCase2.default)(x.table));
        const schemaName = x.schema !== "public" ? (0, _upperFirst2.default)((0, _camelCase2.default)(x.schema)) : "";
        output.write(`export type ${schemaName}${tableName} = {\n`);
      }
      let type = x.type === "ARRAY" ? `${getType(x.udt.substring(1), enumsMap, x.default)}[]` : getType(x.udt, enumsMap, x.default);
      if (x.nullable) {
        type += " | null";
      }
      output.write(`  ${sanitize(x.column)}: ${type};\n`);
      if (!(columns[i + 1] && columns[i + 1].table === x.table)) {
        output.write("};\n\n");
      }
    });
    if (options.suffix) {
      output.write(options.suffix);
      output.write("\n");
    }
  } finally {
    output.end();
    db.destroy();
  }
}
function getType(udt, customTypes, defaultValue) {
  var _customTypes$get;
  switch (udt) {
    case "bool":
      return "boolean";
    case "text":
    case "citext":
    case "money":
    case "numeric":
    case "int8":
    case "char":
    case "character":
    case "bpchar":
    case "varchar":
    case "time":
    case "tsquery":
    case "tsvector":
    case "uuid":
    case "xml":
    case "cidr":
    case "inet":
    case "macaddr":
      return "string";
    case "smallint":
    case "integer":
    case "int":
    case "int2":
    case "int4":
    case "real":
    case "float":
    case "float4":
    case "float8":
      return "number";
    case "date":
    case "timestamp":
    case "timestamptz":
      return "Date";
    case "json":
    case "jsonb":
      if (defaultValue) {
        if (defaultValue.startsWith("'{")) {
          return "Record<string, unknown>";
        }
        if (defaultValue.startsWith("'[")) {
          return "unknown[]";
        }
      }
      return "unknown";
    case "bytea":
      return "Buffer";
    case "interval":
      return "PostgresInterval";
    default:
      return (_customTypes$get = customTypes.get(udt)) !== null && _customTypes$get !== void 0 ? _customTypes$get : "unknown";
  }
}

/**
 * Wraps the target property identifier into quotes in case it contains any
 * invalid characters.
 *
 * @see https://developer.mozilla.org/docs/Glossary/Identifier
 */
function sanitize(name) {
  return /^[a-zA-Z$_][a-zA-Z$_0-9]*$/.test(name) ? name : JSON.stringify(name);
}
//# sourceMappingURL=main.js.map