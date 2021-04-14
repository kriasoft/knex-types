/* SPDX-FileCopyrightText: 2016-present Kriasoft <hello@kriasoft.com> */
/* SPDX-License-Identifier: MIT */

import { knex } from "knex";
import { PassThrough } from "stream";
import { updateTypes } from "./main";

const db = knex({ client: "pg", connection: { database: "update_types" } });

beforeAll(async function setup() {
  await createDatabase();

  await db.raw(`CREATE DOMAIN user_id AS TEXT CHECK(VALUE ~ '^[0-9a-z]{6}$')`);
  await db.raw(
    "CREATE TYPE identity_provider AS ENUM ('google', 'facebook', 'linkedin')"
  );

  await db.schema.createTable("user", (table) => {
    table.specificType("id", "user_id").notNullable().primary();
    table.text("name").notNullable();
    table.text("name_null");
    table.specificType("roles", "text[]").notNullable();
    table.specificType("roles_null", "text[]");
    table.jsonb("credentials").notNullable().defaultTo("{}");
    table.jsonb("credentials_null");
    table.jsonb("events").notNullable().defaultTo("[]");
    table.integer("followers").notNullable();
    table.integer("followers_null");
    table.timestamp("created_at").notNullable();
    table.timestamp("deleted_at");
  });
});

afterAll(async function teardown() {
  await db.destroy();
});

test("updateTypes", async function () {
  const output = new PassThrough();
  const overrides = {
    "identity_provider.linkedin": "LinkedIn",
  };

  await updateTypes(db, { output, overrides });

  expect(await toString(output)).toMatchInlineSnapshot(`
    "// The TypeScript definitions below are automatically generated.
    // Do not touch them, or risk, your modifications being lost.

    import { Knex } from \\"knex\\";

    export enum IdentityProvider {
      Google = \\"google\\",
      Facebook = \\"facebook\\",
      LinkedIn = \\"linkedin\\",
    }

    export enum Table {
      User = \\"user\\",
    }

    export type User = {
      id: string;
      name: string;
      name_null: string | null;
      roles: string[];
      roles_null: string[] | null;
      credentials: Record<string, unknown>;
      credentials_null: unknown | null;
      events: unknown[];
      followers: number;
      followers_null: number | null;
      created_at: Date;
      deleted_at: Date | null;
    };

    export type UserRecord = {
      id: Knex.Raw | string;
      name: Knex.Raw | string;
      name_null?: Knex.Raw | string | null;
      roles: Knex.Raw | string[];
      roles_null?: Knex.Raw | string[] | null;
      credentials?: Knex.Raw | string;
      credentials_null?: Knex.Raw | string | null;
      events?: Knex.Raw | string;
      followers: Knex.Raw | number;
      followers_null?: Knex.Raw | number | null;
      created_at: Knex.Raw | Date | string;
      deleted_at?: Knex.Raw | Date | string | null;
    };

    "
  `);
});

async function createDatabase(): Promise<void> {
  try {
    await db.select(db.raw("version()")).first();
  } catch (err) {
    if (err.code !== "3D000") throw err;
    // Create a new test database if it doesn't exist
    const tmp = knex({ client: "pg", connection: { database: "template1" } });
    try {
      const dbName = db.client.config.connection.database;
      await tmp.raw("create database ?", [dbName]);
    } finally {
      await tmp.destroy();
    }
  }

  await db.schema.raw("drop schema if exists public cascade");
  await db.schema.raw("create schema public");
}

function toString(stream: PassThrough): Promise<string> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", (err) => reject(err));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}
