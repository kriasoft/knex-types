/// <reference types="node" />
import { Knex } from "knex";
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
};
/**
 * Generates TypeScript definitions (types) from a PostgreSQL database schema.
 */
export declare function updateTypes(db: Knex, options: Options): Promise<void>;
export declare function getType(
  udt: string,
  customTypes: Map<string, string>,
  defaultValue: string | null
): string;
