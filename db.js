const fs = require('fs');
const path = require('path');
const crypto = require("crypto");

/**
 * A table name.
 * @typedef {(string | string[])} Table
 */

/**
 * Base type for all DB records
 * @typedef {Object} DbRecord
 * @property {Date?} createdAt When the record was created. Only set during the first save.
 * @property {Date?} updatedAt When the record was last saved. Set on each save.
 */

const cache = {};

function tableToStr(table) {
  if (Array.isArray(table)) {
    table = table.join('/');
  }
  return table;
}

/**
 * Gets the cache of a table.
 * @param {Table} table The table name
 * @returns {Record<string, DbRecord>} The cache
 */
function tableCache(table) {
  table = tableToStr(table);
  let tableCache = cache[table];
  if (!tableCache) {
    throw new Error(`The table '${table}' has not been registered.`);
  }
  return tableCache;
}

/**
 * Generates a random hexadecimal ID string.
 * @returns {string} The ID.
 */
function dbId() {
  return crypto.randomUUID().toString().replaceAll('-', '');
}
module.exports.dbId = dbId;

/**
 * Registers a table and ensures its directory exists.
 * @param {Table} table The table to register.
 */
function dbRegister(table) {
  const dir = dbDir(table);
  if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
    console.log('Created table', table, dir);
  }
  cache[tableToStr(table)] = {};
  console.log('Registered table', table)
}
module.exports.dbRegister = dbRegister;

/**
 * Serializes an object to the database, using its internal replacer function.
 * @param {DbRecord} data The data to serialize.
 * @returns {string} The string for the database.
 */
function dbSerialize(data) {
  return JSON.stringify(data, replacer, 2);
}
module.exports.dbSerialize = dbSerialize;

/**
 * Deserializes an object previously serialized via `dbSerialize` by using its internal reviver function.
 * @param {string} data The string to deserialize.
 * @returns {DbRecord} The object.
 */
function dbDeserialize(data) {
  return JSON.parse(data, reviver);
}
module.exports.dbDeserialize = dbDeserialize;

/**
 * Deletes an entry from the database.
 * @param {Table} table The table name
 * @param {string} id The record ID.
 */
function dbDelete(table, id) {
  if (typeof id !== 'string') {
    throw new Error(`Invalid ID '${id}' for table '${tableToStr(table)}'`);
  }
  const file = dbFile(table, id);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
  delete tableCache(table)[id];
}
module.exports.dbDelete = dbDelete;

/**
 * Writes an entry to the database.
 * @param {Table} table The table.
 * @param {string} id The record ID.
 * @param {DbRecord} data The data to write.
 */
function dbWrite(table, id, data) {
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
module.exports.dbWrite = dbWrite;

/**
 * Gets an entry from the database.
 * @param {Table} table The table name
 * @param {string} id The record ID.
 * @returns {DbRecord | null} The entry
 */
function dbGet(table, id) {
  if (typeof id !== 'string') {
    throw new Error(`Invalid ID '${id}' for table '${tableToStr(table)}'`);
  }
  const file = dbFile(table, id);
  let data = tableCache(table)[id];
  if (data === undefined) {
    if (fs.existsSync(file)) {
      console.log(`Loading ${table} with ID ${id} from disk: '${file}'`)
      data = dbDeserialize(fs.readFileSync(file));
    } else {
      data = null;
    }
    tableCache(table)[id] = data;
  }
  return data;
}
module.exports.dbGet = dbGet;

/**
 * Gets all entires of a given table from the database.
 * @param {Table} table The table name
 * @returns {DbRecord[]} The entries
 */
function dbGetAll(table) {
  const files = fs.readdirSync(dbDir(table));
  const all = [];
  for (const file of files) {
    if (!file.endsWith('.json')) {
      continue;
    }
    const id = file.split('.')[0];
    const data = dbGet(table, id);
    if (!data) {
      continue;
    }
    all.push(data);
  }
  return all;
}
module.exports.dbGetAll = dbGetAll;

function dbDir(table) {
  return path.join('data', ...dbSafe(table));
}

function dbFile(table, id) {
  return path.join('data', ...dbSafe(table), `${dbSafe(id).join('')}.json`);
}

/**
 * @param {Table} value
 * @returns {string[]}
 */
function dbSafe(value) {
  if (!value) {
    throw new Error('Parts of a DB safe string is false-y. Maybe you forgot to pass a table as a parameter?')
  }
  if (Array.isArray(value)) {
    return value.flatMap(dbSafe);
  }
  return [value.replaceAll(/[^a-z0-9]/gi, '_').toLowerCase()];
}

function reviver(key, value) {
  if (typeof value === "object" && value != null) {
    for (const customTypeName in customTypes) {
      if (value.hasOwnProperty(customTypeName)) {
        const customTypeValue = value[customTypeName];
        const customType = customTypes[customTypeName];
        return customType.reviver(customTypeValue);
      }
    }
  }
  return value;
}

function replacer(key, value) {
  const rawValue = this[key];
  for (const customTypeName in customTypes) {
    const customType = customTypes[customTypeName];
    if (customType.condition(rawValue)) {
      return { [customTypeName]: customType.replacer(rawValue) };
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
    condition: function (value) {
      return value instanceof Date;
    },
    replacer: function (value) {
      return value.toISOString();
    },
    reviver: function (value) {
      return new Date(value);
    },
  },
  $set: {
    /** @param {Set} value */
    condition: function (value) {
      return value instanceof Set;
    },
    /** @param {Set} value */
    replacer: function (value) {
      return [...value];
    },
    /** @param {Array} value */
    reviver: function (value) {
      return new Set(value);
    },
  },
  $map: {
    /** @param {Map} value */
    condition: function (value) {
      return value instanceof Map;
    },
    /** @param {Map} value */
    replacer: function (value) {
      return Array.from(value.entries());
    },
    /** @param {Array} value */
    reviver: function (value) {
      const map = new Map();
      for (const [mapKey, mapValue] of value) {
        map.set(mapKey, mapValue);
      }
      return map;
    },
  },
}