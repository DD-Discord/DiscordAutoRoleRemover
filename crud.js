const fs = require("fs");
const path = require("path");
const db = require("./db");
const discord = require("discord.js");
const { sanitizeMarkdown, batchLines } = require("./util/fmt");

/**
 * Deterministically derives an embed color from a string ID via FNV-1a hash -> hue.
 * @param {string} id The ID to hash.
 * @returns {number} A 24-bit RGB color.
 */
function colorFromId(id) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const hue = (hash >>> 0) % 360;

  // Fixed saturation/lightness keeps every color equally vivid and readable.
  const s = 0.65, l = 0.55;
  const k = n => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return (Math.round(f(0) * 255) << 16) + (Math.round(f(8) * 255) << 8) + Math.round(f(4) * 255);
}

/**
 * Settings to define a CRUD object.
 * @template T
 * @template N
 * @typedef {Object} CrudSettings
 * @property {string} name The name of this record.
 * @property {string?} displayNameSingular The display name in singular.
 * @property {string?} displayNamePlural The display name in plural.
 * @property {(namespace: N) => Table} getTable Gets the table name.
 * @property {(record: T) => string} getId Gets the ID.
 * @property {(record: T?) => T?} migrate Migrates a record.
 * @property {((record: T, template: () => discord.EmbedBuilder) => discord.EmbedBuilder)?} formatFull Formats the record as an embed.
 * @property {((record: T) => string)?} formatShort Formats the record as a single-line string.
 * @property {((record: T) => discord.AttachmentBuilder[])?} getAttachments Gets files to send alongside the record's full embed (e.g. referenced via `attachment://name` in `formatFull`).
 */

/**
 * @template T
 * @template N
 * @typedef {ReturnType<typeof crudDefine<T, N>>} Crud
 */

/**
 * @function
 * @template T
 * @template N
 * @param {CrudSettings<T, N>} crudSettings 
 */
function crudDefine(crudSettings) {
  if (!crudSettings.getTable) {
    throw new Error("Missing CRUD `getTable`.");
  }

  if (!crudSettings.name) {
    throw new Error("Missing CRUD `name`.");
  }

  if (!crudSettings.displayNameSingular) {
    crudSettings.displayNameSingular = crudSettings.name[0].toUpperCase() + crudSettings.name.slice(1);
  }

  if (!crudSettings.displayNamePlural) {
    crudSettings.displayNamePlural = crudSettings.displayNameSingular + "s";
  }

  if (!crudSettings.migrate) {
    crudSettings.migrate = record => record;
  }

  if (!crudSettings.getId) {
    crudSettings.getId = record => record.id;
  }

  if (!crudSettings.formatShort) {
    crudSettings.formatShort = record => `\`${crudSettings.getId(record)}\``;
  }

  const baseFmtFull = record => new discord.EmbedBuilder().setTitle(crudSettings.displayNameSingular).setDescription(crudSettings.formatShort(record)).setColor(colorFromId(crudSettings.getId(record))).setTimestamp(record.createdAt);

  if (!crudSettings.formatFull) {
    crudSettings.formatFull = baseFmtFull;
  }

  if (!crudSettings.getAttachments) {
    crudSettings.getAttachments = () => [];
  }

  return {
    name: crudSettings.name,
    /**
     * Formats the display name for the given amount.
     * @param {number} n The number
     * @returns {string} The fitting display name.
     */
    displayName: (n = 0) => n > 1 ? crudSettings.displayNamePlural : `${n} ${crudSettings.displayNameSingular}`,
    displayNameSingular: crudSettings.displayNameSingular,
    displayNamePlural: crudSettings.displayNamePlural,
    /**
     * Builds a short string.
     * @param {T} record The record.
     * @returns {string} The string.
     */
    formatShort: record => crudSettings.formatShort(record),
    /**
     * Builds a full embed.
     * @param {T} record The record.
     * @returns {discord.EmbedBuilder} The embed.
     */
    formatFull: record => crudSettings.formatFull(record, () => baseFmtFull(record)),
    /**
     * Gets the files to send alongside the record's full embed.
     * @param {T} record The record.
     * @returns {discord.AttachmentBuilder[]} The attachments.
     */
    getAttachments: record => crudSettings.getAttachments(record),
    /**
     * Gets the ID of a record.
     * @param {T} record The record.
     * @returns {string} The ID.
     */
    getId: crudSettings.getId,
    /**
     * Registers the table for this CRUD namespace.
     * @param {N} namespace The namespace.
     */
    register: function (namespace) {
      const table = crudSettings.getTable(namespace);
      db.dbRegister(table);
    },
    /**
     * Gets a single record with the given ID.
     * @param {N} namespace The namespace.
     * @param {string} id The record ID.
     * @returns {T?} The record, if found.
     */
    get: function (namespace, id) {
      const table = crudSettings.getTable(namespace);
      const record = db.dbGet(table, id);
      return crudSettings.migrate(record);
    },
    /**
     * Gets all records.
     * @param {N} namespace The namespace.
     * @returns {T[]} The records.
     */
    getAll: function (namespace) {
      const table = crudSettings.getTable(namespace);
      const records = db.dbGetAll(table);
      return records.map(crudSettings.migrate);
    },
    /**
     * Updates/creates a record.
     * @param {N} namespace The namespace.
     * @param {T} record The record to write.
     * @returns The updated record.
     */
    write: function (namespace, record) {
      record = crudSettings.migrate(record);
      const table = crudSettings.getTable(namespace);
      const id = crudSettings.getId(record);
      db.dbWrite(table, id, record);
      return record;
    },
    /**
     * Deletes a record.
     * @param {N} namespace The namespace.
     * @param {T} record The record to write.
     */
    delete: function (namespace, record) {
      record = crudSettings.migrate(record);
      const table = crudSettings.getTable(namespace);
      const id = crudSettings.getId(record);
      db.dbDelete(table, id, record);
    },
  }
}
module.exports.crudDefine = crudDefine;

/**
 * Settings to define a CRUD update.
 * @template T
 * @template N
 * @typedef {Object} CrudCommandUpdateSettings
 * @property {string?} name The name of the command.
 * @property {string} description The command description.
 * @property {Crud<T, N>} crud The CRUD object.
 * @property {CrudCommandUpdateSettingsOption<T>[]} options The options.
 * @property {((builder: discord.SlashCommandBuilder) => void)?} factory An additional factory to further configure the command.
 * @property {(interaction: discord.ChatInputCommandInteraction) => T} getDefault Gets a default record.
 * @property {(interaction: discord.ChatInputCommandInteraction) => N} getNamespace Gets the namespace.
 * @property {boolean?} disableDelete No deleting.
 * @property {boolean?} disableUpdate No updating.
 */

/**
 * @template T
 * @typedef {Object} CrudCommandUpdateSettingsOption
 * @property {(builder: discord.SlashCommandBuilder) => void} factory
 * @property {string} name The option's name, used to route autocomplete requests.
 * @property {(interaction: discord.ChatInputCommandInteraction) => any | { value?: any, errors?: string[] }} retriever
 * @property {(value: any, record: T) => (void | Promise<void>)} updater
 * @property {boolean?} allowNullValues
 * @property {boolean?} allowRetrieverErrors
 * @property {((interaction: discord.AutocompleteInteraction) => Promise<void>)?} autocomplete Responds to an autocomplete request for this option.
 */

/**
 * Defines a CRUD update command.
 * @function
 * @template T
 * @template N
 * @param {CrudCommandUpdateSettings<T, N>} crudSettings 
 */
function crudCommandUpdate(crudSettings) {
  if (!crudSettings.description) throw new Error("A command description is required");
  if (!crudSettings.crud) throw new Error("The CRUD object is required");

  if (!crudSettings.name) {
    crudSettings.name = crudSettings.crud.name;
  }

  const builder = new discord.SlashCommandBuilder()
    .setName(crudSettings.name)
    .setDescription(crudSettings.description)
    .setDefaultMemberPermissions(crudSettings.defaultMemberPermissions);

  if (!crudSettings.disableUpdate) {
    builder.addStringOption(option => {
      option.setName("id");
      option.setDescription(`Updates ${crudSettings.crud.displayNamePlural} instead of creating a new one.`);
      option.setAutocomplete(true);
      return option;
    });
  }
  if (!crudSettings.disableDelete) {
    builder.addBooleanOption(option => {
      option.setName("delete");
      option.setDescription(`If set, the ${crudSettings.crud.displayNamePlural} will be deleted.`);
      return option;
    });
  }

  for (const option of crudSettings.options) {
    option.factory(builder, option);
  }

  if (crudSettings.factory) {
    crudSettings.factory(builder, crudSettings);
  }

  /**
   * Executes the command.
   * @param {discord.ChatInputCommandInteraction} interaction The command interaction.
   */
  async function execute(interaction) {
    // Get fixed options
    const id = interaction.options.getString("id", false);
    const deleteFlag = interaction.options.getBoolean("delete", false);
    const namespace = crudSettings.getNamespace(interaction);
    const errors = [];

    // Get records to update.
    let operationName = '';
    const recordsToUpdate = [];
    if (id === null) {
      const defaultRecord = crudSettings.getDefault(interaction);
      const defaultRecordId = crudSettings.crud.getId(defaultRecord);
      // Ensure we arent overwriting records which have a generated ID
      const oldRecord = crudSettings.crud.get(namespace, defaultRecordId);
      if (oldRecord) {
        errors.push(`Cannot create new ${crudSettings.crud.displayNameSingular} with ID \`${defaultRecordId}\` since it already exists. *(${crudSettings.crud.formatShort(oldRecord)})*`);
      } else {
        recordsToUpdate.push(defaultRecord);
        operationName = 'created';
      }
    } else if (id === "all") {
      const allRecords = crudSettings.crud.getAll(namespace);
      recordsToUpdate.push(...allRecords);
    } else {
      const idParts = id.split(",").map(idPart => idPart.trim()).filter(idPart => idPart);
      for (const idPart of idParts) {
        const idRecord = crudSettings.crud.get(namespace, idPart);
        if (idRecord === null) {
          errors.push(`Could not find ${crudSettings.crud.displayNameSingular} with ID \`${idPart}\`.`);
        } else {
          recordsToUpdate.push(idRecord);
        }
      }
    }

    // We must at least update one record.
    if (recordsToUpdate.length === 0 && errors.length === 0) {
      errors.push(`No ${crudSettings.crud.displayNamePlural} found.`);
    }

    // Cannot continue with errors.
    if (errors.length > 0) {
      return interaction.reply({
        content: `# Errors are present\n${errors.map(str => `- ${str}`).join('\n')}`,
        ephemeral: true,
      });
    }

    // Delete records.
    if (deleteFlag) {
      operationName = 'deleted';
      for (const record of recordsToUpdate) {
        crudSettings.crud.delete(namespace, record);
      }
      const deleteLines = [
        `# ${crudSettings.crud.displayName(recordsToUpdate.length)} ${operationName}`,
        ...recordsToUpdate.map(record => `- ${crudSettings.crud.formatShort(record)}`),
      ];
      const deleteBatches = batchLines(deleteLines);
      await interaction.reply({ content: deleteBatches[0] });
      for (const batch of deleteBatches.slice(1)) {
        await interaction.followUp({ content: batch });
      }
      return;
    }

    // Update/Create records.
    const optionsValueArray = [];
    for (let i = 0; i < crudSettings.options.length; i++) {
      const option = crudSettings.options[i];
      const retrieved = option.retriever(interaction);
      const retrievedErrors = option.allowRetrieverErrors ? retrieved.errors : null;
      const retrievedValue = option.allowRetrieverErrors ? retrieved.value : retrieved;
      optionsValueArray[i] = retrievedValue;
      if (retrievedErrors) {
        errors.push(...retrievedErrors);
      }
    }
    // Cannot continue with errors.
    if (errors.length > 0) {
      return interaction.reply({
        content: `# Errors are present\n${errors.map(str => `- ${str}`).join('\n')}`,
        ephemeral: true,
      });
    }
    // Perform patches.
    for (const record of recordsToUpdate) {
      for (let i = 0; i < crudSettings.options.length; i++) {
        const option = crudSettings.options[i];
        const value = optionsValueArray[i];
        if (value !== null || option.allowNullValues) {
          await option.updater(value, record);
          if (!operationName) {
            operationName = 'updated';
          }
        }
      }
      crudSettings.crud.write(namespace, record);
    }

    if (!operationName) {
      operationName = 'displayed';
    }
    return interaction.reply({
      content: `# ${crudSettings.crud.displayName(recordsToUpdate.length)} ${operationName}`,
      embeds: recordsToUpdate.map(crudSettings.crud.formatFull),
      files: recordsToUpdate.flatMap(crudSettings.crud.getAttachments),
    });
  }

  /**
   * Suggests IDs for the "id" option, preserving the "all" and comma-separated
   * bulk-update syntax: only the last (currently-typed) segment gets matched, and
   * already-completed segments are carried through so picking a suggestion doesn't
   * erase them.
   * @param {discord.AutocompleteInteraction} interaction The autocomplete interaction.
   */
  async function idAutocomplete(interaction) {
    const namespace = crudSettings.getNamespace(interaction);
    const raw = interaction.options.getFocused();

    const segments = raw.split(",");
    const prefix = segments.slice(0, -1).map(part => part.trim()).filter(part => part);
    const query = segments[segments.length - 1].trim().toLowerCase();

    const choices = [];
    if (prefix.length === 0 && "all".startsWith(query)) {
      choices.push({ name: `All ${crudSettings.crud.displayNamePlural}`, value: "all" });
    }

    const records = crudSettings.crud.getAll(namespace);
    for (const record of records) {
      if (choices.length >= 25) break;
      const label = sanitizeMarkdown(crudSettings.crud.formatShort(record));
      if (!label.toLowerCase().includes(query)) continue;
      const value = [...prefix, crudSettings.crud.getId(record)].join(",");
      if (value.length > 100) continue; // Discord caps autocomplete choice values at 100 chars; user can still type longer lists by hand.
      choices.push({ name: label.slice(0, 100), value });
    }

    await interaction.respond(choices);
  }

  /**
   * Routes an autocomplete request to the focused option's handler.
   * @param {discord.AutocompleteInteraction} interaction The autocomplete interaction.
   */
  async function autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name === "id" && !crudSettings.disableUpdate) {
      return await idAutocomplete(interaction);
    }
    const option = crudSettings.options.find(opt => opt.name === focused.name);
    if (option && option.autocomplete) {
      await option.autocomplete(interaction);
    } else {
      await interaction.respond([]);
    }
  }

  return {
    name: builder.name,
    data: builder,
    execute,
    autocomplete,
  };
}
module.exports.crudCommandUpdate = crudCommandUpdate;

const crudCommandOption = {
  /**
   * @function
   * @template T
   * @param {{ name: string, description: string, key?: keyof T }} crudSettings 
   * @returns {CrudCommandUpdateSettingsOption<T>}
   */
  simpleString: function (crudSettings) {
    if (!crudSettings.key) {
      crudSettings.key = crudSettings.name;
    }

    return {
      name: crudSettings.name,
      factory: builder => builder.addStringOption(option => option.setName(crudSettings.name).setDescription(crudSettings.description)),
      retriever: interaction => interaction.options.getString(crudSettings.name, false),
      updater: (value, record) => record[crudSettings.key] = value,
    };
  },
  /**
   * @function
   * @template T
   * @param {{ name: string, description: string, key?: keyof T }} crudSettings
   * @returns {CrudCommandUpdateSettingsOption<T>}
   */
  simpleBoolean: function (crudSettings) {
    if (!crudSettings.key) {
      crudSettings.key = crudSettings.name;
    }
    return {
      name: crudSettings.name,
      factory: builder => builder.addBooleanOption(option => option.setName(crudSettings.name).setDescription(crudSettings.description)),
      retriever: interaction => interaction.options.getBoolean(crudSettings.name, false),
      updater: (value, record) => record[crudSettings.key] = value,
    };
  },
  /**
   * @function
   * @template T
   * @param {{ name: string, description: string, key?: keyof T }} crudSettings 
   * @returns {CrudCommandUpdateSettingsOption<T>}
   */
  simpleChannel: function (crudSettings) {
    const channels = require("./channel");

    if (!crudSettings.key) {
      crudSettings.key = crudSettings.name;
    }

    return {
      name: crudSettings.name,
      factory: builder => builder.addChannelOption(option => option.setName(crudSettings.name).setDescription(crudSettings.description)),
      retriever: interaction => interaction.options.getChannel(crudSettings.name, false),
      updater: (value, record) => record[crudSettings.key] = channels.getChannelInfo(value),
    };
  },
  /**
   * @function
   * @template T
   * @template F
   * @template N
   * @param {{ name: string, description: string, key?: keyof T, fkCrud: Crud<F, N>, getFkNamespace: (interaction: discord.ChatInputCommandInteraction) => N, useString?: boolean, required?: boolean }} crudSettings
   * @returns {CrudCommandUpdateSettingsOption<T>}
   */
  simpleFk: function (crudSettings) {
    if (!crudSettings.key) {
      crudSettings.key = crudSettings.name;
    }

    return {
      name: crudSettings.name,
      factory: builder => builder.addStringOption(option => option.setName(crudSettings.name).setDescription(crudSettings.description).setAutocomplete(!crudSettings.useString).setRequired(!!crudSettings.required)),
      retriever: interaction => {
        const strValue = interaction.options.getString(crudSettings.name, false);
        if (strValue === null) {
          return { value: null };
        }
        const fkNamespace = crudSettings.getFkNamespace(interaction);
        const fkRecord = crudSettings.fkCrud.get(fkNamespace, strValue);
        if (fkRecord === null) {
          return { errors: [`\`${crudSettings.name}\`: Could not find ${crudSettings.fkCrud.displayNameSingular} with ID \`${strValue}\`.`] };
        }

        return { value: crudSettings.fkCrud.getId(fkRecord) };
      },
      updater: (value, record) => record[crudSettings.key] = value,
      allowRetrieverErrors: true,
      autocomplete: crudSettings.useString ? undefined : async interaction => {
        const query = interaction.options.getFocused().toLowerCase();
        const fkNamespace = crudSettings.getFkNamespace(interaction);
        const records = crudSettings.fkCrud.getAll(fkNamespace);
        const choices = records
          .filter(record => crudSettings.fkCrud.formatShort(record).toLowerCase().includes(query))
          .slice(0, 25)
          .map(record => ({
            name: sanitizeMarkdown(crudSettings.fkCrud.formatShort(record)).slice(0, 100),
            value: crudSettings.fkCrud.getId(record),
          }));
        await interaction.respond(choices);
      },
    };
  },
  /**
   * A file attachment option. Downloads the uploaded file to `folder`, named after the
   * record's ID (via `crud.getId`), and stores the resulting local path under `key`.
   * @function
   * @template T
   * @template N
   * @param {{ name: string, description: string, key?: keyof T, crud: Crud<T, N>, folder: string, contentTypePrefix?: string }} crudSettings
   * @returns {CrudCommandUpdateSettingsOption<T>}
   */
  simpleAttachment: function (crudSettings) {
    if (!crudSettings.key) {
      crudSettings.key = crudSettings.name;
    }
    fs.mkdirSync(crudSettings.folder, { recursive: true });

    return {
      name: crudSettings.name,
      factory: builder => builder.addAttachmentOption(option => option.setName(crudSettings.name).setDescription(crudSettings.description)),
      retriever: interaction => {
        const attachment = interaction.options.getAttachment(crudSettings.name, false);
        if (!attachment) {
          return { value: null };
        }
        if (crudSettings.contentTypePrefix && !attachment.contentType?.startsWith(crudSettings.contentTypePrefix)) {
          return { errors: [`\`${crudSettings.name}\`: Must be a file of type \`${crudSettings.contentTypePrefix}*\`.`] };
        }
        return { value: attachment };
      },
      updater: async (attachment, record) => {
        const ext = path.extname(attachment.name);
        const filePath = path.join(crudSettings.folder, `${crudSettings.crud.getId(record)}${ext}`);

        const oldPath = record[crudSettings.key];
        if (oldPath && oldPath !== filePath && fs.existsSync(oldPath)) {
          await fs.promises.unlink(oldPath);
        }

        const response = await fetch(attachment.url);
        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.promises.writeFile(filePath, buffer);

        record[crudSettings.key] = filePath;
      },
      allowRetrieverErrors: true,
    };
  },
}
module.exports.crudCommandOption = crudCommandOption;

