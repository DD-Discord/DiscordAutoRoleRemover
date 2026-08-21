import fs from "fs";
import path from "path";
import {
  EmbedBuilder,
  AttachmentBuilder,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  Attachment,
  GuildBasedChannel,
  Permissions,
} from "discord.js";
import { dbRegister, dbGet, dbGetAll, dbWrite, dbDelete, DbRecord, Table } from "./db.js";
import { sanitizeMarkdown, batchLines } from "./util/fmt.js";
import { getChannelInfo } from "./util/channel.js";

/**
 * Deterministically derives an embed color from a string ID via FNV-1a hash -> hue.
 */
function colorFromId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const hue = (hash >>> 0) % 360;

  // Fixed saturation/lightness keeps every color equally vivid and readable.
  const s = 0.65, l = 0.55;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return (Math.round(f(0) * 255) << 16) + (Math.round(f(8) * 255) << 8) + Math.round(f(4) * 255);
}

/**
 * Settings to define a CRUD object.
 */
export interface CrudSettings<T extends DbRecord, N> {
  /** The name of this record. */
  name: string;
  /** The display name in singular. */
  displayNameSingular?: string;
  /** The display name in plural. */
  displayNamePlural?: string;
  /** Gets the table name. */
  getTable: (namespace: N) => Table;
  /** Gets the ID. Defaults to `record.id` — override this if `T` doesn't have an `id` field. */
  getId?: (record: T) => string;
  /** Migrates a record. */
  migrate?: (record: T | null) => T | null;
  /** Formats the record as an embed. */
  formatFull?: (record: T, template: () => EmbedBuilder) => EmbedBuilder;
  /** Formats the record as a single-line string. */
  formatShort?: (record: T) => string;
  /** Gets files to send alongside the record's full embed (e.g. referenced via `attachment://name` in `formatFull`). */
  getAttachments?: (record: T) => AttachmentBuilder[];
}

/**
 * A defined CRUD namespace, as returned by {@link crudDefine}.
 */
export interface Crud<T extends DbRecord, N> {
  name: string;
  /** Formats the display name for the given amount. */
  displayName: (n?: number) => string;
  displayNameSingular: string;
  displayNamePlural: string;
  /** Builds a short string. */
  formatShort: (record: T) => string;
  /** Builds a full embed. */
  formatFull: (record: T) => EmbedBuilder;
  /** Gets the files to send alongside the record's full embed. */
  getAttachments: (record: T) => AttachmentBuilder[];
  /** Gets the ID of a record. */
  getId: (record: T) => string;
  /** Registers the table for this CRUD namespace. */
  register: (namespace: N) => void;
  /** Gets a single record with the given ID. */
  get: (namespace: N, id: string) => T | null;
  /** Gets all records. */
  getAll: (namespace: N) => T[];
  /** Updates/creates a record. */
  write: (namespace: N, record: T) => T;
  /** Deletes a record. */
  delete: (namespace: N, record: T) => void;
}

export function crudDefine<T extends DbRecord, N>(crudSettings: CrudSettings<T, N>): Crud<T, N> {
  if (!crudSettings.getTable) {
    throw new Error("Missing CRUD `getTable`.");
  }

  if (!crudSettings.name) {
    throw new Error("Missing CRUD `name`.");
  }

  const displayNameSingular = crudSettings.displayNameSingular
    ?? (crudSettings.name[0]!.toUpperCase() + crudSettings.name.slice(1));

  const displayNamePlural = crudSettings.displayNamePlural ?? (displayNameSingular + "s");

  const migrate = crudSettings.migrate ?? ((record: T | null) => record);

  // Assumes `T` has an `id` field when no explicit `getId` is provided — matches the
  // original untyped default; every CRUD defined in this codebase supplies its own `getId`.
  const getId = crudSettings.getId ?? ((record: T) => (record as unknown as { id: string }).id);

  const formatShort = crudSettings.formatShort ?? ((record: T) => `\`${getId(record)}\``);

  const baseFmtFull = (record: T) => new EmbedBuilder()
    .setTitle(displayNameSingular)
    .setDescription(formatShort(record))
    .setColor(colorFromId(getId(record)))
    .setTimestamp(record.createdAt);

  const formatFull = crudSettings.formatFull ?? ((record: T, _template: () => EmbedBuilder) => baseFmtFull(record));

  const getAttachments = crudSettings.getAttachments ?? (() => []);

  return {
    name: crudSettings.name,
    displayName: (n = 0) => n > 1 ? displayNamePlural : `${n} ${displayNameSingular}`,
    displayNameSingular,
    displayNamePlural,
    formatShort: (record: T) => formatShort(record),
    formatFull: (record: T) => formatFull(record, () => baseFmtFull(record)),
    getAttachments: (record: T) => getAttachments(record),
    getId,
    register: (namespace: N) => {
      const table = crudSettings.getTable(namespace);
      dbRegister(table);
    },
    get: (namespace: N, id: string) => {
      const table = crudSettings.getTable(namespace);
      const record = dbGet<T>(table, id);
      return migrate(record);
    },
    getAll: (namespace: N) => {
      const table = crudSettings.getTable(namespace);
      const records = dbGetAll<T>(table);
      return records.map(record => migrate(record)!);
    },
    write: (namespace: N, record: T) => {
      const migrated = migrate(record)!;
      const table = crudSettings.getTable(namespace);
      const id = getId(migrated);
      dbWrite(table, id, migrated);
      return migrated;
    },
    delete: (namespace: N, record: T) => {
      const migrated = migrate(record)!;
      const table = crudSettings.getTable(namespace);
      const id = getId(migrated);
      dbDelete(table, id);
    },
  };
}

/**
 * Settings to define a CRUD update.
 */
export interface CrudCommandUpdateSettings<T extends DbRecord, N> {
  /** The name of the command. */
  name?: string;
  /** The command description. */
  description: string;
  /** The CRUD object. */
  crud: Crud<T, N>;
  /** The options. */
  options: CrudCommandUpdateSettingsOption<T>[];
  /** An additional factory to further configure the command. */
  factory?: (builder: SlashCommandBuilder, settings: CrudCommandUpdateSettings<T, N>) => void;
  /** Gets a default record. */
  getDefault: (interaction: ChatInputCommandInteraction) => T;
  /** Gets the namespace. */
  getNamespace: (interaction: ChatInputCommandInteraction) => N;
  /** No deleting. */
  disableDelete?: boolean;
  /** No updating. */
  disableUpdate?: boolean;
  defaultMemberPermissions?: Permissions | bigint | number | null;
}

export interface CrudCommandUpdateSettingsOption<T> {
  factory: (builder: SlashCommandBuilder, option: CrudCommandUpdateSettingsOption<T>) => void;
  /** The option's name, used to route autocomplete requests. */
  name: string;
  // The result is inherently either a raw value or `{ value?, errors? }` depending on
  // `allowRetrieverErrors`, decided at runtime by the caller — kept loose intentionally,
  // same rationale as db.ts's custom-type registry.
  retriever: (interaction: ChatInputCommandInteraction) => any;
  updater: (value: any, record: T) => void | Promise<void>;
  allowNullValues?: boolean;
  allowRetrieverErrors?: boolean;
  /** Responds to an autocomplete request for this option. */
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

/**
 * Defines a CRUD update command.
 */
export function crudCommandUpdate<T extends DbRecord, N>(crudSettings: CrudCommandUpdateSettings<T, N>) {
  if (!crudSettings.description) throw new Error("A command description is required");
  if (!crudSettings.crud) throw new Error("The CRUD object is required");

  const name = crudSettings.name ?? crudSettings.crud.name;

  const builder = new SlashCommandBuilder()
    .setName(name)
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

  async function execute(interaction: ChatInputCommandInteraction) {
    // Get fixed options
    const id = interaction.options.getString("id", false);
    const deleteFlag = interaction.options.getBoolean("delete", false);
    const namespace = crudSettings.getNamespace(interaction);
    const errors: string[] = [];

    // Get records to update.
    let operationName = '';
    const recordsToUpdate: T[] = [];
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
      await interaction.reply({ content: deleteBatches[0]! });
      for (const batch of deleteBatches.slice(1)) {
        await interaction.followUp({ content: batch });
      }
      return;
    }

    // Update/Create records.
    const optionsValueArray: any[] = [];
    for (let i = 0; i < crudSettings.options.length; i++) {
      const option = crudSettings.options[i]!;
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
        const option = crudSettings.options[i]!;
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
      embeds: recordsToUpdate.map(record => crudSettings.crud.formatFull(record)),
      files: recordsToUpdate.flatMap(record => crudSettings.crud.getAttachments(record)),
    });
  }

  /**
   * Suggests IDs for the "id" option, preserving the "all" and comma-separated
   * bulk-update syntax: only the last (currently-typed) segment gets matched, and
   * already-completed segments are carried through so picking a suggestion doesn't
   * erase them.
   */
  async function idAutocomplete(interaction: AutocompleteInteraction) {
    const namespace = crudSettings.getNamespace(interaction as unknown as ChatInputCommandInteraction);
    const raw = interaction.options.getFocused();

    const segments = raw.split(",");
    const prefix = segments.slice(0, -1).map(part => part.trim()).filter(part => part);
    const query = segments[segments.length - 1]!.trim().toLowerCase();

    const choices: { name: string, value: string }[] = [];
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
   */
  async function autocomplete(interaction: AutocompleteInteraction) {
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

export const crudCommandOption = {
  simpleString<T>(crudSettings: { name: string, description: string, key?: keyof T }): CrudCommandUpdateSettingsOption<T> {
    const key = crudSettings.key ?? (crudSettings.name as keyof T);

    return {
      name: crudSettings.name,
      factory: builder => builder.addStringOption(option => option.setName(crudSettings.name).setDescription(crudSettings.description)),
      retriever: interaction => interaction.options.getString(crudSettings.name, false),
      updater: (value, record: T) => (record as Record<string, unknown>)[key as string] = value,
    };
  },
  simpleBoolean<T>(crudSettings: { name: string, description: string, key?: keyof T }): CrudCommandUpdateSettingsOption<T> {
    const key = crudSettings.key ?? (crudSettings.name as keyof T);
    return {
      name: crudSettings.name,
      factory: builder => builder.addBooleanOption(option => option.setName(crudSettings.name).setDescription(crudSettings.description)),
      retriever: interaction => interaction.options.getBoolean(crudSettings.name, false),
      updater: (value, record: T) => (record as Record<string, unknown>)[key as string] = value,
    };
  },
  simpleChannel<T>(crudSettings: { name: string, description: string, key?: keyof T }): CrudCommandUpdateSettingsOption<T> {
    const key = crudSettings.key ?? (crudSettings.name as keyof T);

    return {
      name: crudSettings.name,
      factory: builder => builder.addChannelOption(option => option.setName(crudSettings.name).setDescription(crudSettings.description)),
      retriever: interaction => interaction.options.getChannel(crudSettings.name, false),
      updater: (value: GuildBasedChannel, record: T) => {
        (record as Record<string, unknown>)[key as string] = getChannelInfo(value);
      },
    };
  },
  /**
   * @param crudSettings.fkCrud The CRUD object of the foreign record.
   * @param crudSettings.getFkNamespace Gets the namespace for the foreign CRUD lookup.
   */
  simpleFk<T, F extends DbRecord, FN>(crudSettings: {
    name: string,
    description: string,
    key?: keyof T,
    fkCrud: Crud<F, FN>,
    getFkNamespace: (interaction: ChatInputCommandInteraction) => FN,
    useString?: boolean,
    required?: boolean,
  }): CrudCommandUpdateSettingsOption<T> {
    const key = crudSettings.key ?? (crudSettings.name as keyof T);

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
      updater: (value, record: T) => (record as Record<string, unknown>)[key as string] = value,
      allowRetrieverErrors: true,
      autocomplete: crudSettings.useString ? undefined : async interaction => {
        const query = interaction.options.getFocused().toLowerCase();
        const fkNamespace = crudSettings.getFkNamespace(interaction as unknown as ChatInputCommandInteraction);
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
   */
  simpleAttachment<T extends DbRecord, N>(crudSettings: {
    name: string,
    description: string,
    key?: keyof T,
    crud: Crud<T, N>,
    folder: string,
    contentTypePrefix?: string,
  }): CrudCommandUpdateSettingsOption<T> {
    const key = crudSettings.key ?? (crudSettings.name as keyof T);
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
      updater: async (attachment: Attachment, record: T) => {
        const ext = path.extname(attachment.name);
        const filePath = path.join(crudSettings.folder, `${crudSettings.crud.getId(record)}${ext}`);

        const oldPath = (record as Record<string, unknown>)[key as string] as string | undefined;
        if (oldPath && oldPath !== filePath && fs.existsSync(oldPath)) {
          await fs.promises.unlink(oldPath);
        }

        const response = await fetch(attachment.url);
        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.promises.writeFile(filePath, buffer);

        (record as Record<string, unknown>)[key as string] = filePath;
      },
      allowRetrieverErrors: true,
    };
  },
};
