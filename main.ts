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
   * The name of the exported enum (Which encapsulates all tables)
   * Default: "Table"
   */
  tablesEnumName?: string;

  /**
   * The name of the exported tables type
   * Default: "Tables"
   */
  tablesTypeName?: string;

  /**
   * Name overrides for enums, schemas, tables and columns.
   * Check tests for more info.
   *
   * @example
   *   overrides: {
   *     "identity_provider.linkedin": "LinkedIn"
   *   }
   *
   * @example
   * Override a table name with a function
   *
   *   overrides: {
   *     // Overwrite the 'user' table name
   *     user: (x, type, defaultValue) => UserTable
   *   }
   *
   * @example
   * Tag all schemas, tables and columns
   *
   *  overrides: {
   *     // Append "Table" to all tables and TitleCase the name
   *     "*": (x, type, defaultValue) => type === "table" ? "Table" +  upperFirst(camelCase(x.table)) : defaultValue
   *   }
   */
  overrides?: Record<string, OverrideStringFunction>;

  /**
   * Overrides of column types.
   * Overrides have higher priority the more specific they are, from highest to lowest:
   *
   * 1. A single table's column
   * 2. All tables columns
   * 3. Database's default types
   *
   * If any of these types can overwrite the other, the one with the higher specificity will be chosen.
   *
   * The special `"*"` can be used to match all columns after all types have been set. If it's a function
   * call it, otherwise just return the value.
   * Whatever this special override returns will overwrite all other processed types. That's why it's
   * recommended for this property to be a function, as the second argument provided will be the already
   * processed type.
   *
   * @example
   * Override a specific table's column.
   * If `overrideTableColumnTypes` is set to true, a table's column type will be overwritten
   * with the provided custom type.
   * Check tests for more info.
   *
   *   typeOverrides: {
   *     // Will only modify the `notes` column in the `messages` table.
   *     "messages.notes": "OnlyForThisColumnInThisTable",
   *
   *     // A function can also be provided.
   *     "messages.notes": (x: Column) => "OnlyForThisColumnInThisTable"
   *   }
   *
   * @example
   * Override all columns with the same name.
   * if `overrideColumnTypes` is set to true, all columns types from all tables that matches
   * the column name will be overwritten with the provided custom type.
   * Check tests for more info.
   *
   *   typeOverrides: {
   *     // Will modify all columns called `notes` in all tables.
   *     "notes": "SomeTypeForAllNotesColumns",
   *
   *     // A function can also be provided.
   *     "messages.notes": (x: Column) => "SomeTypeForAllNotesColumns"
   *   }
   *
   * @example
   * Override a database's default type.
   * if `overrideDefaultTypes` is set to true, all database's default types that match
   * the type name will be overwritten with the provided custom type.
   * Check tests for more info.
   *
   *   prefix: 'type Numeric = `${number}` | Number;',
   *   typeOverrides: {
   *     // Will modify all decimal columns (which by default are of type 'numeric').
   *     "numeric": "Numeric",
   *
   *     // A function can also be provided.
   *     "numeric": (x: Column) => "Numeric"
   *   }
   *
   * @example
   * Use the special "*" override to format all types (The second argument provided is
   * the type that has been processed so far).
   * This value provided will overwrite all types.
   * Check tests for more info.
   *
   *   typeOverrides: {
   *     // All types will be set to `null`
   *     "*": "null",
   *
   *     // Append 'Nullable' to all types
   *     "numeric": (x: Column, defaultType: string) => defaultType + ' | Nullable'
   *   }
   */
  typeOverrides?: TypePostProcessor | TypeOverride;

  /**
   * Enable the overriding of a specific table's column type.
   * Default value is true.
   * More info at the `typeOverrides` documentation.
   */
  overrideTableColumnTypes?: boolean;

  /**
   * Enable the overriding of all columns with the same name types.
   * Default value is true.
   * More info at the `typeOverrides` documentation.
   */
  overrideColumnTypes?: boolean;

  /**
   * Enable the overriding of the database's default types.
   * Default value is true.
   * More info at the `typeOverrides` documentation.
   */
  overrideDefaultTypes?: boolean;

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
};

/**
 * Generates TypeScript definitions (types) from a PostgreSQL database schema.
 */
export async function updateTypes(db: Knex, options: Options): Promise<void> {
  const overrides = options.overrides ?? {};
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
        const enumName = overrides[x.key] ?? upperFirst(camelCase(x.key));
        output.write(`export enum ${enumName} {\n`);
      }

      // Enum body
      const key =
        overrides[`${x.key}.${x.value}`] ??
        upperFirst(camelCase(x.value.replace(/[.-]/g, "_")));
      output.write(`  ${key} = "${x.value}",\n`);

      // The closing line
      if (!(enums[i + 1] && enums[i + 1].key === x.key)) {
        output.write("};\n\n");
      }
    });

    const enumsMap = new Map(
      enums.map((x) => [
        x.key,
        (overrides[x.key] as string) ?? upperFirst(camelCase(x.key)),
      ])
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
    output.write(`export enum ${options.tablesEnumName || "Table"} {\n`);

    // Unique schema / table combination array
    const tables: { table: string; schema: string }[] = [
      ...new Set(
        columns.map((x) => JSON.stringify({ table: x.table, schema: x.schema }))
      ),
    ].map((t) => JSON.parse(t));

    // Write enum tables
    for (const table of tables) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const x = columns.find(
        (x) => x.table === table.table && x.schema === table.schema
      )!;

      const tableName =
        overrideName(x, "table", overrides) ?? upperFirst(camelCase(x.table));
      let schemaName =
        x.schema !== "public" ? upperFirst(camelCase(x.schema)) : "";
      schemaName = overrideName(x, "schema", overrides) ?? schemaName;
      const key = `${schemaName}${tableName}`;

      const schema = x.schema !== "public" ? `${x.schema}.` : "";
      const value = `${schema}${x.table}`;
      output.write(`  ${key} = "${value}",\n`);
    }
    output.write("};\n\n");

    // Write the list of tables as a type
    output.write(`export type ${options.tablesTypeName || "Tables"} = {\n`);
    for (const table of tables) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const x = columns.find(
        (x) => x.table === table.table && x.schema === table.schema
      )!;

      const tableName =
        overrideName(x, "table", overrides) ?? upperFirst(camelCase(x.table));
      let schemaName =
        x.schema !== "public" ? upperFirst(camelCase(x.schema)) : "";
      schemaName = overrideName(x, "schema", overrides) ?? schemaName;
      const key = `${schemaName}${tableName}`;

      const schema = x.schema !== "public" ? `${x.schema}.` : "";
      const value = `${schema}${x.table}`;
      output.write(`  "${value}": ${key},\n`);
    }
    output.write("};\n\n");

    // Construct TypeScript db record types
    columns.forEach((x, i) => {
      const isTableFirstColumn = !(
        columns[i - 1] && columns[i - 1].table === x.table
      );

      // Export schema & table type
      if (isTableFirstColumn) {
        const tableName =
          overrideName(x, "table", overrides) ?? upperFirst(camelCase(x.table));

        // Doing it this way because I need to separate the trinary expression from the ?? operator (doesn't work).
        let schemaName =
          x.schema !== "public" ? upperFirst(camelCase(x.schema)) : "";
        schemaName = overrideName(x, "schema", overrides) ?? schemaName;

        output.write(`export type ${schemaName}${tableName} = {\n`);
      }

      // Set column type
      const columnName = overrideName(x, "column", overrides) ?? x.column;
      const isArrayType = x.type === "ARRAY";
      let type = overrideType(x, options) ?? getType(x, enumsMap);

      if (isArrayType) type += "[]";
      if (x.nullable) type += " | null";

      // Process the "*" type override if provided
      type = typePostProcessor(x, type, options);

      output.write(`  ${sanitize(columnName)}: ${type};\n`);

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

export type Enum = {
  key: string;
  value: string;
};

export type Column = {
  table: string;
  column: string;
  schema: string;
  nullable: boolean;
  default: string | null;
  type: string;
  udt: string;
};

export type NameOverrideCategory = keyof Column &
  ("table" | "schema" | "column");
export type OverrideStringFunction =
  | string
  | ((
      x: Column,
      category: NameOverrideCategory,
      defaultValue: string | null
    ) => string | null);

export type TypeOverride = Record<string, string | ((x: Column) => string)>;
export type TypePostProcessor = Record<
  "*",
  string | ((x: Column, defaultType: string) => string)
>;

export function getType(x: Column, customTypes: Map<string, string>): string {
  const udt: string = x.type === "ARRAY" ? x.udt.substring(1) : x.udt;

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
      if (x.default) {
        if (x.default.startsWith("'{")) {
          return "Record<string, unknown>";
        }
        if (x.default.startsWith("'[")) {
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

/**
 * Wraps the target property identifier into quotes in case it contains any
 * invalid characters.
 *
 * @see https://developer.mozilla.org/docs/Glossary/Identifier
 */
function sanitize(name: string): string {
  return /^[a-zA-Z$_][a-zA-Z$_0-9]*$/.test(name) ? name : JSON.stringify(name);
}

/**
 * If enabled override a column belonging to a specific table (highest priority),
 * all columns with the same name or overwrite the database's default type (lowest priority).
 * A function can be provided for each override.
 */
export function overrideType(x: Column, options: Options): string | null {
  const typeOverrides = (options.typeOverrides as TypeOverride) ?? {};

  // Override a table's specific column type
  const overrideTableColumnTypes = options.overrideTableColumnTypes ?? true;
  if (overrideTableColumnTypes && `${x.table}.${x.column}` in typeOverrides) {
    const tableColumnType = typeOverrides[`${x.table}.${x.column}`];
    return isFunction(tableColumnType) ? tableColumnType(x) : tableColumnType;
  }

  // Override all matching columns type
  const overrideColumnTypes = options.overrideColumnTypes ?? true;
  if (overrideColumnTypes && x.column in typeOverrides) {
    const columnType = typeOverrides[x.column];
    return isFunction(columnType) ? columnType(x) : columnType;
  }

  // Override the database's default type if provided.
  const overrideDefaultTypes = options.overrideDefaultTypes ?? true;
  const udt = x.type === "ARRAY" ? x.udt.substring(1) : x.udt;
  if (overrideDefaultTypes && udt in typeOverrides) {
    const type = typeOverrides[udt];
    return isFunction(type) ? type(x) : type;
  }

  return null;
}

/**
 * If the "*" override has been provided, if it's a function then call it and return
 * the value, otherwise just return the value it holds.
 * If the "*" override was not provided just return again the same type.
 * Whatever this function returns will override the processed type.
 */
export function typePostProcessor(
  x: Column,
  type: string,
  options: Options
): string {
  const typeOverrides = options.typeOverrides ?? {};

  // If the "*" has been provided, return its value.
  if ("*" in typeOverrides) {
    return isFunction(typeOverrides["*"])
      ? typeOverrides["*"](x, type)
      : typeOverrides["*"];
  }

  // Return the default type
  return type;
}

// eslint-disable-next-line @typescript-eslint/ban-types
function isFunction(value: unknown): value is Function {
  return typeof value === "function";
}

export function overrideName(
  x: Column,
  category: NameOverrideCategory,
  overrides: Record<string, OverrideStringFunction>
): string | null {
  let name: string | null = null;
  const defaultValue = x[category];

  if (category === "column") {
    // Run override for specific table column
    if (`${x.table}.${x.column}` in overrides) {
      const override = overrides[`${x.table}.${x.column}`];
      name = isFunction(override)
        ? override(x, category, defaultValue)
        : override;
    } else if (x.column in overrides) {
      // Run override for all columns with same name
      const override = overrides[x.column];
      name = isFunction(override)
        ? override(x, category, defaultValue)
        : override;
    }
  } else {
    // Run override for specific name/key
    if (x[category] in overrides) {
      const override = overrides[x[category]];
      name = isFunction(override)
        ? override(x, category, defaultValue)
        : override;
    }
  }

  if ("*" in overrides) {
    name = isFunction(overrides["*"])
      ? overrides["*"](x, category, name)
      : overrides["*"];
  }

  return name;
}
