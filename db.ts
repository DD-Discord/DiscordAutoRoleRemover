import fs from "fs";
import path from "path";
import crypto from "crypto";

/**
 * A table name.
 */
export type Table = string | string[];

/**
 * Base type for all DB records
 */
export interface DbRecord {
  /** When the record was created. Only set during the first save. */
  createdAt?: Date;
  /** When the record was last saved. Set on each save. */
  updatedAt?: Date;
}

const cache: Record<string, Record<string, unknown>> = {};

function tableToStr(table: Table): string {
  if (Array.isArray(table)) {
    return table.join('/');
  }
  return table;
}

/**
 * Gets the cache of a table.
 */
function tableCache(table: Table): Record<string, unknown> {
  const str = tableToStr(table);
  const tableCache = cache[str];
  if (!tableCache) {
    throw new Error(`The table '${str}' has not been registered.`);
  }
  return tableCache;
}

/**
 * Generates a random hexadecimal ID string.
 */
export function dbId(): string {
  return crypto.randomUUID().toString().replaceAll('-', '');
}

/**
 * Registers a table and ensures its directory exists.
 */
export function dbRegister(table: Table): void {
  const dir = dbDir(table);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log('Created table', table, dir);
  }
  cache[tableToStr(table)] = {};
  console.log('Registered table', table)
}

/**
 * Serializes an object to the database, using its internal replacer function.
 */
export function dbSerialize(data: object): string {
  return JSON.stringify(data, replacer, 2);
}

/**
 * Deserializes an object previously serialized via `dbSerialize` by using its internal reviver function.
 */
export function dbDeserialize<T>(data: string): T {
  return JSON.parse(data, reviver);
}

/**
 * Deletes an entry from the database.
 */
export function dbDelete(table: Table, id: string): void {
  if (typeof id !== 'string') {
    throw new Error(`Invalid ID '${id}' for table '${tableToStr(table)}'`);
  }
  const file = dbFile(table, id);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
  delete tableCache(table)[id];
}

/**
 * Writes an entry to the database.
 */
export function dbWrite<T extends DbRecord>(table: Table, id: string, data: T): void {
  if (typeof id !== 'string') {
    throw new Error(`Invalid ID '${id}' for table '${tableToStr(table)}'`);
  }
  if (!data.createdAt) {
    data.createdAt = new Date();
  }
  data.updatedAt = new Date();
  const file = dbFile(table, id);
  fs.writeFileSync(file, dbSerialize(data));
  tableCache(table)[id] = data;
}

/**
 * Gets an entry from the database.
 */
export function dbGet<T extends DbRecord>(table: Table, id: string): T | null {
  if (typeof id !== 'string') {
    throw new Error(`Invalid ID '${id}' for table '${tableToStr(table)}'`);
  }
  const file = dbFile(table, id);
  const tc = tableCache(table);
  let data = tc[id] as T | null | undefined;
  if (data === undefined) {
    if (fs.existsSync(file)) {
      console.log(`Loading ${table} with ID ${id} from disk: '${file}'`)
      data = dbDeserialize<T>(fs.readFileSync(file, "utf-8"));
    } else {
      data = null;
    }
    tc[id] = data;
  }
  return data;
}

/**
 * Gets all entires of a given table from the database.
 */
export function dbGetAll<T extends DbRecord>(table: Table): T[] {
  const files = fs.readdirSync(dbDir(table));
  const all: T[] = [];
  for (const file of files) {
    if (!file.endsWith('.json')) {
      continue;
    }
    const id = file.split('.')[0]!;
    const data = dbGet<T>(table, id);
    if (!data) {
      continue;
    }
    all.push(data);
  }
  return all;
}

function dbDir(table: Table): string {
  return path.join('data', ...dbSafe(table));
}

function dbFile(table: Table, id: string): string {
  return path.join('data', ...dbSafe(table), `${dbSafe(id).join('')}.json`);
}

function dbSafe(value: Table): string[] {
  if (!value) {
    throw new Error('Parts of a DB safe string is false-y. Maybe you forgot to pass a table as a parameter?')
  }
  if (Array.isArray(value)) {
    return value.flatMap(dbSafe);
  }
  return [value.replaceAll(/[^a-z0-9]/gi, '_').toLowerCase()];
}

function reviver(this: unknown, _key: string, value: unknown): unknown {
  if (typeof value === "object" && value !== null) {
    for (const customTypeName in customTypes) {
      if (Object.prototype.hasOwnProperty.call(value, customTypeName)) {
        const customTypeValue = (value as Record<string, unknown>)[customTypeName];
        const customType = customTypes[customTypeName as keyof typeof customTypes];
        return customType.reviver(customTypeValue as never);
      }
    }
  }
  return value;
}

function replacer(this: Record<string, unknown>, key: string, value: unknown): unknown {
  const rawValue = this[key];
  for (const customTypeName in customTypes) {
    const customType = customTypes[customTypeName as keyof typeof customTypes];
    if (customType.condition(rawValue as never)) {
      return { [customTypeName]: customType.replacer(rawValue as never) };
    }
  }
  return value;
}

/**
 * Custom types support for JSON files. Make sure that no custom type names conflict with actual possible JSON keys.
 *
 * When serializing:
 * - Custom types work by running the `condition` function of every value to be serialized.
 * - If it returns `true`, the `replacer` function is called with the value.
 * - The return value of the `replacer` will be saved to JSON wrapped in an object using the key of the custom type. (e.g. `{"$myType": "hello"}`).
 *
 * When deserializing:
 * - Each value is checked if it is an object with a key of any custom type.
 * - If one is found, the `reviver` is called for the value of this key.
 * - The return value is used as the actual value.
 */
const customTypes = {
  $date: {
    condition: (value: unknown): value is Date => value instanceof Date,
    replacer: (value: Date): string => value.toISOString(),
    reviver: (value: string): Date => new Date(value),
  },
  $set: {
    condition: (value: unknown): value is Set<unknown> => value instanceof Set,
    replacer: (value: Set<unknown>): unknown[] => [...value],
    reviver: (value: unknown[]): Set<unknown> => new Set(value),
  },
  $map: {
    condition: (value: unknown): value is Map<unknown, unknown> => value instanceof Map,
    replacer: (value: Map<unknown, unknown>): [unknown, unknown][] => Array.from(value.entries()),
    reviver: (value: [unknown, unknown][]): Map<unknown, unknown> => {
      const map = new Map<unknown, unknown>();
      for (const [mapKey, mapValue] of value) {
        map.set(mapKey, mapValue);
      }
      return map;
    },
  },
};
