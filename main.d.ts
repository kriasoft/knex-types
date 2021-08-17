/// <reference types="node" />
import { Knex } from "knex";
import type { Writable } from "stream";
export declare type Options = {
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
    prefix?: string;
    includedSchemas?: string[];
};
/**
 * Generates TypeScript definitions (types) from a PostgreSQL database schema.
 */
export declare function updateTypes(db: Knex, options: Options): Promise<void>;
export declare function getType(udt: string, customTypes: Map<string, string>, defaultValue: string | null): string;
