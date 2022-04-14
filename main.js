"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.updateTypes = updateTypes;
exports.getType = getType;
exports.overrideType = overrideType;
exports.typePostProcessor = typePostProcessor;
exports.overrideName = overrideName;

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
  const output = typeof options.output === 'string' ? _fs.default.createWriteStream(options.output, {
    encoding: 'utf-8'
  }) : options.output;
  ['// The TypeScript definitions below are automatically generated.\n', '// Do not touch them, or risk, your modifications being lost.\n\n'].forEach(line => output.write(line));
  const schema = (_ref = typeof options.schema === 'string' ? options.schema.split(',').map(x => x.trim()) : options.schema) !== null && _ref !== void 0 ? _ref : ['public']; // Schemas to include or exclude

  const [includeSchemas, excludeSchemas] = schema.reduce((acc, s) => acc[+s.startsWith('!')].push(s) && acc, [[], []]); // Tables to exclude

  const exclude = (_ref2 = typeof options.exclude === 'string' ? options.exclude.split(',').map(x => x.trim()) : options.exclude) !== null && _ref2 !== void 0 ? _ref2 : [];

  if (options.prefix) {
    output.write(options.prefix);
    output.write('\n\n');
  }

  try {
    // Fetch the list of custom enum types
    const enums = await db.table('pg_type').join('pg_enum', 'pg_enum.enumtypid', 'pg_type.oid').orderBy('pg_type.typname').orderBy('pg_enum.enumsortorder').select('pg_type.typname as key', 'pg_enum.enumlabel as value'); // Construct TypeScript enum types

    enums.forEach((x, i) => {
      var _overrides$;

      // The first line of enum declaration
      if (!(enums[i - 1] && enums[i - 1].key === x.key)) {
        var _overrides$x$key;

        const enumName = (_overrides$x$key = overrides[x.key]) !== null && _overrides$x$key !== void 0 ? _overrides$x$key : (0, _upperFirst2.default)((0, _camelCase2.default)(x.key));
        output.write(`export enum ${enumName} {\n`);
      } // Enum body


      const key = (_overrides$ = overrides[`${x.key}.${x.value}`]) !== null && _overrides$ !== void 0 ? _overrides$ : (0, _upperFirst2.default)((0, _camelCase2.default)(x.value.replace(/[.-]/g, '_')));
      output.write(`  ${key} = "${x.value}",\n`); // The closing line

      if (!(enums[i + 1] && enums[i + 1].key === x.key)) {
        output.write('};\n\n');
      }
    });
    const enumsMap = new Map(enums.map(x => {
      var _ref3;

      return [x.key, (_ref3 = overrides[x.key]) !== null && _ref3 !== void 0 ? _ref3 : (0, _upperFirst2.default)((0, _camelCase2.default)(x.key))];
    })); // Fetch the list of tables/columns

    const columns = await db.withSchema('information_schema').table('columns').whereIn('table_schema', includeSchemas).whereNotIn('table_schema', excludeSchemas).whereNotIn('table_name', exclude).orderBy('table_schema').orderBy('table_name').orderBy('ordinal_position').select('table_schema as schema', 'table_name as table', 'column_name as column', db.raw("(is_nullable = 'YES') as nullable"), 'column_default as default', 'data_type as type', 'udt_name as udt'); // The list of database tables as enum

    output.write(`export enum ${options.tablesEnumName || 'Table'} {\n`); // Unique schema / table combination array

    const tables = [...new Set(columns.map(x => JSON.stringify({
      table: x.table,
      schema: x.schema
    })))].map(t => JSON.parse(t)); // Write enum tables

    for (const table of tables) {
      var _overrideName, _overrideName2;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const x = columns.find(x => x.table === table.table && x.schema === table.schema);
      const tableName = (_overrideName = overrideName(x, 'table', overrides)) !== null && _overrideName !== void 0 ? _overrideName : (0, _upperFirst2.default)((0, _camelCase2.default)(x.table));
      let schemaName = x.schema !== 'public' ? (0, _upperFirst2.default)((0, _camelCase2.default)(x.schema)) : '';
      schemaName = (_overrideName2 = overrideName(x, 'schema', overrides)) !== null && _overrideName2 !== void 0 ? _overrideName2 : schemaName;
      const key = `${schemaName}${tableName}`;
      const schema = x.schema !== 'public' ? `${x.schema}.` : '';
      const value = `${schema}${x.table}`;
      output.write(`  ${key} = "${value}",\n`);
    }

    output.write('};\n\n'); // Write the list of tables as a type

    output.write(`export type ${options.tablesTypeName || 'Tables'} = {\n`);

    for (const table of tables) {
      var _overrideName3, _overrideName4;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const x = columns.find(x => x.table === table.table && x.schema === table.schema);
      const tableName = (_overrideName3 = overrideName(x, 'table', overrides)) !== null && _overrideName3 !== void 0 ? _overrideName3 : (0, _upperFirst2.default)((0, _camelCase2.default)(x.table));
      let schemaName = x.schema !== 'public' ? (0, _upperFirst2.default)((0, _camelCase2.default)(x.schema)) : '';
      schemaName = (_overrideName4 = overrideName(x, 'schema', overrides)) !== null && _overrideName4 !== void 0 ? _overrideName4 : schemaName;
      const key = `${schemaName}${tableName}`;
      const schema = x.schema !== 'public' ? `${x.schema}.` : '';
      const value = `${schema}${x.table}`;
      output.write(`  "${value}": ${key},\n`);
    }

    output.write('};\n\n'); // Construct TypeScript db record types

    columns.forEach((x, i) => {
      var _overrideName7, _overrideType;

      const isTableFirstColumn = !(columns[i - 1] && columns[i - 1].table === x.table); // Export schema & table type

      if (isTableFirstColumn) {
        var _overrideName5, _overrideName6;

        const tableName = (_overrideName5 = overrideName(x, 'table', overrides)) !== null && _overrideName5 !== void 0 ? _overrideName5 : (0, _upperFirst2.default)((0, _camelCase2.default)(x.table)); // Doing it this way because I need to separate the trinary expression from the ?? operator (doesn't work).

        let schemaName = x.schema !== 'public' ? (0, _upperFirst2.default)((0, _camelCase2.default)(x.schema)) : '';
        schemaName = (_overrideName6 = overrideName(x, 'schema', overrides)) !== null && _overrideName6 !== void 0 ? _overrideName6 : schemaName;
        output.write(`export type ${schemaName}${tableName} = {\n`);
      } // Set column type


      const columnName = (_overrideName7 = overrideName(x, 'column', overrides)) !== null && _overrideName7 !== void 0 ? _overrideName7 : x.column;
      const isArrayType = x.type === 'ARRAY';
      let type = (_overrideType = overrideType(x, options)) !== null && _overrideType !== void 0 ? _overrideType : getType(x, enumsMap);
      if (isArrayType) type += '[]';
      if (x.nullable) type += ' | null'; // Process the "*" type override if provided

      type = typePostProcessor(x, type, options);
      output.write(`  ${sanitize(columnName)}: ${type};\n`);

      if (!(columns[i + 1] && columns[i + 1].table === x.table)) {
        output.write('};\n\n');
      }
    });

    if (options.suffix) {
      output.write(options.suffix);
      output.write('\n');
    }
  } finally {
    output.end();
    db.destroy();
  }
}

function getType(x, customTypes) {
  var _customTypes$get;

  const udt = x.type === 'ARRAY' ? x.udt.substring(1) : x.udt;

  switch (udt) {
    case 'bool':
      return 'boolean';

    case 'text':
    case 'citext':
    case 'money':
    case 'numeric':
    case 'int8':
    case 'char':
    case 'character':
    case 'bpchar':
    case 'varchar':
    case 'time':
    case 'tsquery':
    case 'tsvector':
    case 'uuid':
    case 'xml':
    case 'cidr':
    case 'inet':
    case 'macaddr':
      return 'string';

    case 'smallint':
    case 'integer':
    case 'int':
    case 'int4':
    case 'real':
    case 'float':
    case 'float4':
    case 'float8':
      return 'number';

    case 'date':
    case 'timestamp':
    case 'timestamptz':
      return 'Date';

    case 'json':
    case 'jsonb':
      if (x.default) {
        if (x.default.startsWith("'{")) {
          return 'Record<string, unknown>';
        }

        if (x.default.startsWith("'[")) {
          return 'unknown[]';
        }
      }

      return 'unknown';

    case 'bytea':
      return 'Buffer';

    case 'interval':
      return 'PostgresInterval';

    default:
      return (_customTypes$get = customTypes.get(udt)) !== null && _customTypes$get !== void 0 ? _customTypes$get : 'unknown';
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
/**
 * If enabled override a column belonging to a specific table (highest priority),
 * all columns with the same name or overwrite the database's default type (lowest priority).
 * A function can be provided for each override.
 */


function overrideType(x, options) {
  var _ref4, _options$overrideTabl, _options$overrideColu, _options$overrideDefa;

  const typeOverrides = (_ref4 = options.typeOverrides) !== null && _ref4 !== void 0 ? _ref4 : {}; // Override a table's specific column type

  const overrideTableColumnTypes = (_options$overrideTabl = options.overrideTableColumnTypes) !== null && _options$overrideTabl !== void 0 ? _options$overrideTabl : true;

  if (overrideTableColumnTypes && `${x.table}.${x.column}` in typeOverrides) {
    const tableColumnType = typeOverrides[`${x.table}.${x.column}`];
    return isFunction(tableColumnType) ? tableColumnType(x) : tableColumnType;
  } // Override all matching columns type


  const overrideColumnTypes = (_options$overrideColu = options.overrideColumnTypes) !== null && _options$overrideColu !== void 0 ? _options$overrideColu : true;

  if (overrideColumnTypes && x.column in typeOverrides) {
    const columnType = typeOverrides[x.column];
    return isFunction(columnType) ? columnType(x) : columnType;
  } // Override the database's default type if provided.


  const overrideDefaultTypes = (_options$overrideDefa = options.overrideDefaultTypes) !== null && _options$overrideDefa !== void 0 ? _options$overrideDefa : true;
  const udt = x.type === 'ARRAY' ? x.udt.substring(1) : x.udt;

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


function typePostProcessor(x, type, options) {
  var _options$typeOverride;

  const typeOverrides = (_options$typeOverride = options.typeOverrides) !== null && _options$typeOverride !== void 0 ? _options$typeOverride : {}; // If the "*" has been provided, return its value.

  if ('*' in typeOverrides) {
    return isFunction(typeOverrides['*']) ? typeOverrides['*'](x, type) : typeOverrides['*'];
  } // Return the default type


  return type;
} // eslint-disable-next-line @typescript-eslint/ban-types


function isFunction(value) {
  return typeof value === 'function';
}

function overrideName(x, category, overrides) {
  let name = null;
  const defaultValue = x[category];

  if (category === 'column') {
    // Run override for specific table column
    if (`${x.table}.${x.column}` in overrides) {
      const override = overrides[`${x.table}.${x.column}`];
      name = isFunction(override) ? override(x, category, defaultValue) : override;
    } else if (x.column in overrides) {
      // Run override for all columns with same name
      const override = overrides[x.column];
      name = isFunction(override) ? override(x, category, defaultValue) : override;
    }
  } else {
    // Run override for specific name/key
    if (x[category] in overrides) {
      const override = overrides[x[category]];
      name = isFunction(override) ? override(x, category, defaultValue) : override;
    }
  }

  if ('*' in overrides) {
    name = isFunction(overrides['*']) ? overrides['*'](x, category, name) : overrides['*'];
  }

  return name;
}