const fs = require('fs');
const path = require('path');

const cache = {};

function tableCache(table) {
  let tableCache = cache[table];
  if (!tableCache) {
    tableCache = {};
    cache[table] = tableCache;
  }
  return tableCache;
}

function dbSerialize(data) {
  return JSON.stringify(data, replacer, 2);
}
module.exports.dbSerialize = dbSerialize;

function dbDeserialize(data) {
  return JSON.parse(data, reviver);
}
module.exports.dbDeserialize = dbDeserialize;

function dbDelete(table, id) {
  const file = dbFile(table, id);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
  delete tableCache(table)[id];
}
module.exports.dbDelete = dbDelete;

function dbWrite(table, id, data) {
  const file = dbFile(table, id);
  fs.writeFileSync(file, dbSerialize(data));
  tableCache(table)[id] = data;
}
module.exports.dbWrite = dbWrite;

/**
 * Gets an entry from the database.
 * @param {string} table The table name
 * @param {string} id The record ID.
 * @returns {object | null} The entry
 */
function dbGet(table, id) {
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
 * @param {string} table The table name
 * @returns {object[]} The entries
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
  return path.join('data', dbSafe(table));
}

function dbFile(table, id) {
  return path.join('data', dbSafe(table), `${dbSafe(id)}.json`);
}

function dbSafe(str) {
  return str.replace(/[^a-z0-9]/gi, '_').toLowerCase();
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
}