/* SPDX-FileCopyrightText: 2016-present Kriasoft <hello@kriasoft.com> */
/* SPDX-License-Identifier: MIT */

import fs from "fs";
import { Knex } from "knex";
import { camelCase, upperFirst } from "lodash";
import type { Writable } from "stream";

export type Options = {
  /**
   * Filename or output stream where the type definitions needs to be written.
   */
  output: Writable | string;

  /**
   * Name overrides for enums, classes, and fields.
   *
   * @example
   *   overrides: {
   *     "identity_provider.linkedin": "LinkedIn"
   *   }
   */
  overrides?: Record<string, string>;

  prefix?: string;
  suffix?: string;

  /**
   * Schemas that should be included/excluded when generating types.
   *
   * By default if this is null/not specified, "public" will be the only schema added, but if this property
   * is specified, public will be excluded by default and has to be included in the list to be added to the output.
   * If a schema is added by its name, i.e. 'log' all tables from that schema will be added.
   * If a schema name is added with an exclamation mark it will be ignored, i.e. "!log".
   *
   * The table-type will be prefixed by its schema name, the table log.message will become LogMessage.
   *
   * @example
   *   // This will include "public" and "log", but exclude the "auth" schema.
   *   schema: ["public", "log", "!auth"]
   * @default
   *   "public"
   */
  schema?: string[] | string;

  /**
   * A comma separated list or an array of tables that should be excluded when
   * generating types.
   *
   * @example
   *   exclude: ["migration", "migration_lock"]
   */
  exclude?: string[] | string;

  /**
   * Custom formatters for specific type of data - enum, enumEl, table and column.
   *
   * If any type is null/not specified default formatter for this type will be used.
   *
   * @example
   *   formatters: {
   *      column: (name) => kebabCase(name),
   *      table: (name) => upperFirst(name),
   *   }
   */
  formatters?: {
    column?: (name: string) => string;
    enum?: (name: string) => string;
    enumEl?: (name: string) => string;
    table?: (name: string) => string;
  };
};

/**
 * Generates TypeScript definitions (types) from a PostgreSQL database schema.
 */
export async function updateTypes(db: Knex, options: Options): Promise<void> {
  // const formatter: Record<string, (name: string) => string> = {
  const formatter: Required<Options["formatters"]> = {
    column: options.formatters?.column ?? ((name) => name),
    enum: options.formatters?.enum ?? ((name) => upperFirst(camelCase(name))),
    enumEl:
      options.formatters?.enumEl ??
      ((name) => upperFirst(camelCase(name.replace(/[.-]/g, "_")))),
    table: options.formatters?.table ?? ((name) => upperFirst(camelCase(name))),
  };
  const overrides: Record<string, string> = options.overrides ?? {};
  const output: Writable =
    typeof options.output === "string"
      ? fs.createWriteStream(options.output, { encoding: "utf-8" })
      : options.output;

  [
    "// The TypeScript definitions below are automatically generated.\n",
    "// Do not touch them, or risk, your modifications being lost.\n\n",
  ].forEach((line) => output.write(line));

  const schema = (typeof options.schema === "string"
    ? options.schema.split(",").map((x) => x.trim())
    : options.schema) ?? ["public"];

  // Schemas to include or exclude
  const [includeSchemas, excludeSchemas] = schema.reduce(
    (acc, s) =>
      (acc[+s.startsWith("!")].push(s) && acc) as [string[], string[]],
    [[] as string[], [] as string[]]
  );

  // Tables to exclude
  const exclude =
    (typeof options.exclude === "string"
      ? options.exclude.split(",").map((x) => x.trim())
      : options.exclude) ?? [];

  if (options.prefix) {
    output.write(options.prefix);
    output.write("\n\n");
  }

  try {
    // Fetch the list of custom enum types
    const enums = await db
      .table("pg_type")
      .join("pg_enum", "pg_enum.enumtypid", "pg_type.oid")
      .orderBy("pg_type.typname")
      .orderBy("pg_enum.enumsortorder")
      .select<Enum[]>("pg_type.typname as key", "pg_enum.enumlabel as value");

    // Construct TypeScript enum types
    enums.forEach((x, i) => {
      // The first line of enum declaration
      if (!(enums[i - 1] && enums[i - 1].key === x.key)) {
        const enumName = overrides[x.key] ?? formatter.enum(x.key);
        output.write(`export enum ${enumName} {\n`);
      }

      // Enum body
      const key = overrides[`${x.key}.${x.value}`] ?? formatter.enumEl(x.value);
      output.write(`  ${key} = "${x.value}",\n`);

      // The closing line
      if (!(enums[i + 1] && enums[i + 1].key === x.key)) {
        output.write("}\n\n");
      }
    });

    const enumsMap = new Map(
      enums.map((x) => [x.key, overrides[x.key] ?? formatter.enum(x.key)])
    );

    // Fetch the list of tables/columns
    const columns = await db
      .withSchema("information_schema")
      .table("columns")
      .whereIn("table_schema", includeSchemas)
      .whereNotIn("table_schema", excludeSchemas)
      .whereNotIn("table_name", exclude)
      .orderBy("table_schema")
      .orderBy("table_name")
      .orderBy("ordinal_position")
      .select<Column[]>(
        "table_schema as schema",
        "table_name as table",
        "column_name as column",
        db.raw("(is_nullable = 'YES') as nullable"),
        "column_default as default",
        "data_type as type",
        "udt_name as udt"
      );

    // The list of database tables as enum
    output.write("export enum Table {\n");
    const tableSet = new Set(
      columns.map((x) => {
        const schema = x.schema !== "public" ? `${x.schema}.` : "";
        return `${schema}${x.table}`;
      })
    );
    Array.from(tableSet).forEach((value) => {
      const key = overrides[value] ?? formatter.table(value);
      output.write(`  ${key} = "${value}",\n`);
    });
    output.write("}\n\n");

    // Construct TypeScript db record types
    columns.forEach((x, i) => {
      if (!(columns[i - 1] && columns[i - 1].table === x.table)) {
        const tableName = overrides[x.table] ?? formatter.table(x.table);
        const schemaName =
          x.schema !== "public" ? formatter.table(x.schema) : "";
        output.write(`export type ${schemaName}${tableName} = {\n`);
      }

      let type =
        x.type === "ARRAY"
          ? `${getType(x.udt.substring(1), enumsMap, x.default)}[]`
          : getType(x.udt, enumsMap, x.default);

      if (x.nullable) {
        type += " | null";
      }

      output.write(`  ${formatter.column(x.column)}: ${type};\n`);

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

type Enum = {
  key: string;
  value: string;
};

type Column = {
  table: string;
  column: string;
  schema: string;
  nullable: boolean;
  default: string | null;
  type: string;
  udt: string;
};

export function getType(
  udt: string,
  customTypes: Map<string, string>,
  defaultValue: string | null
): string {
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
      return customTypes.get(udt) ?? "unknown";
  }
}
