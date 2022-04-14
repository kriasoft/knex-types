/// <reference types="node" />
import { Knex } from 'knex';
import type { Writable } from 'stream';
export declare type Options = {
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
export declare function updateTypes(db: Knex, options: Options): Promise<void>;
export declare type Enum = {
  key: string;
  value: string;
};
export declare type Column = {
  table: string;
  column: string;
  schema: string;
  nullable: boolean;
  default: string | null;
  type: string;
  udt: string;
};
export declare type NameOverrideCategory = keyof Column &
  ('table' | 'schema' | 'column');
export declare type OverrideStringFunction =
  | string
  | ((
      x: Column,
      category: NameOverrideCategory,
      defaultValue: string | null
    ) => string | null);
export declare type TypeOverride = Record<
  string,
  string | ((x: Column) => string)
>;
export declare type TypePostProcessor = Record<
  '*',
  string | ((x: Column, defaultType: string) => string)
>;
export declare function getType(
  x: Column,
  customTypes: Map<string, string>
): string;
/**
 * If enabled override a column belonging to a specific table (highest priority),
 * all columns with the same name or overwrite the database's default type (lowest priority).
 * A function can be provided for each override.
 */
export declare function overrideType(
  x: Column,
  options: Options
): string | null;
/**
 * If the "*" override has been provided, if it's a function then call it and return
 * the value, otherwise just return the value it holds.
 * If the "*" override was not provided just return again the same type.
 * Whatever this function returns will override the processed type.
 */
export declare function typePostProcessor(
  x: Column,
  type: string,
  options: Options
): string;
export declare function overrideName(
  x: Column,
  category: NameOverrideCategory,
  overrides: Record<string, OverrideStringFunction>
): string | null;
