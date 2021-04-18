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
   *   {
   *     overrides: { "identity_provider.linkedin": "LinkedIn" }
   *   }
   */
  overrides?: Record<string, string>;
};

/**
 * Generates TypeScript definitions (types) from a PostgreSQL database schema.
 */
export async function updateTypes(db: Knex, options: Options): Promise<void> {
  const overrides: Record<string, string> = options.overrides ?? {};
  const output: Writable =
    typeof options.output === "string"
      ? fs.createWriteStream(options.output, { encoding: "utf-8" })
      : options.output;

  [
    "// The TypeScript definitions below are automatically generated.\n",
    "// Do not touch them, or risk, your modifications being lost.\n\n",
    'import { Knex } from "knex";\n\n',
  ].forEach((line) => output.write(line));

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
        output.write("}\n\n");
      }
    });

    // Fetch the list of tables/columns
    const columns = await db
      .withSchema("information_schema")
      .table("columns")
      .where("table_schema", "public")
      .orderBy("table_name")
      .orderBy("ordinal_position")
      .select<Column[]>(
        "table_name as table",
        "column_name as column",
        db.raw("(is_nullable = 'YES') as nullable"),
        "column_default as default",
        "data_type as type",
        "udt_name as udt"
      );

    // The list of database tables as enum
    output.write("export enum Table {\n");
    Array.from(new Set(columns.map((x) => x.table))).forEach((value) => {
      const key = overrides[value] ?? upperFirst(camelCase(value));
      output.write(`  ${key} = "${value}",\n`);
    });
    output.write("}\n\n");

    // Construct TypeScript db record types
    columns.forEach((x, i) => {
      if (!(columns[i - 1] && columns[i - 1].table === x.table)) {
        const tableName = overrides[x.table] ?? upperFirst(camelCase(x.table));
        output.write(`export type ${tableName} = {\n`);
      }

      output.write(`  ${x.column}: ${toType(x, enums, overrides)};\n`);

      if (!(columns[i + 1] && columns[i + 1].table === x.table)) {
        output.write("};\n\n");
      }
    });

    // Construct TypeScript db record types
    columns.forEach((x, i) => {
      if (!(columns[i - 1] && columns[i - 1].table === x.table)) {
        const tableName = overrides[x.table] ?? upperFirst(camelCase(x.table));
        output.write(`export type ${tableName}Record = {\n`);
      }

      const optional = x.nullable || x.default !== null ? "?" : "";
      output.write(
        `  ${x.column}${optional}: ${toType(x, enums, overrides, true)};\n`
      );

      if (!(columns[i + 1] && columns[i + 1].table === x.table)) {
        output.write("};\n\n");
      }
    });
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
  nullable: boolean;
  default: string | null;
  type: string;
  udt: string;
};

function toType(
  c: Column,
  enums: Enum[],
  overrides: Record<string, string>,
  isRecord = false
): string {
  let type = ["integer", "numeric", "decimal", "bigint"].includes(c.type)
    ? "number"
    : c.type === "boolean"
    ? "boolean"
    : c.type === "jsonb"
    ? isRecord
      ? "string"
      : c.default?.startsWith("'{")
      ? "Record<string, unknown>"
      : c.default?.startsWith("'[")
      ? "unknown[]"
      : "unknown"
    : c.type === "ARRAY" && (c.udt === "_text" || c.udt === "_citext")
    ? "string[]"
    : c.type.startsWith("timestamp") || c.type === "date"
    ? "Date"
    : "string";

  if (c.type === "USER-DEFINED") {
    const key = enums.find((x) => x.key === c.udt)?.key;
    if (key) {
      type = overrides[key] ?? upperFirst(camelCase(key));
    }
  }

  if (type === "Date" && isRecord) {
    type = "Date | string";
  }

  return `${isRecord ? "Knex.Raw | " : ""}${type}${
    c.nullable ? " | null" : ""
  }`;
}
