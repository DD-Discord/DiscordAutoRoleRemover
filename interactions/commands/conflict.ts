import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, AutocompleteInteraction } from "discord.js";
import { dbId } from "../../db.js";
import { crudCommandUpdateSubcommand, crudCommandOption, crudAutocomplete } from "../../crud.js";
import { rolePoolData } from "../../logic/rolePool.js";
import { conflictRuleData, ConflictRule } from "../../logic/conflict.js";
import { getAlertSettings } from "../../logic/alertSettings.js";

type Namespace = { guildId: string };

// Pool membership (poolIds) is managed via the add-pool/remove-pool subcommands -
// Discord has no multi-select option type, so "manage" only handles the flat
// `name` field. The alert channel is global now (see /role-alerts), not per-rule.
const manage = crudCommandUpdateSubcommand<ConflictRule, Namespace>({
  name: 'manage',
  description: 'Creates, edits, deletes, or lists conflict rules (name only).',
  crud: conflictRuleData,
  options: [
    crudCommandOption.simpleString<ConflictRule>({ name: 'name', description: "The rule's display name.", required: true }),
  ],
  getDefault: interaction => ({
    id: dbId(),
    guildId: interaction.guildId!,
    name: '',
    poolIds: [],
  }),
  getNamespace: interaction => ({ guildId: interaction.guildId! }),
  validate: record => getAlertSettings(record.guildId).alertChannel
    ? []
    : ["No global alert channel configured yet - run `/role-alerts set-channel` first."],
});

async function addPoolExecute(interaction: ChatInputCommandInteraction): Promise<unknown> {
  const ruleId = interaction.options.getString("rule", true);
  const poolId = interaction.options.getString("pool", true);
  const guildId = interaction.guildId!;

  const rule = conflictRuleData.get({ guildId }, ruleId);
  if (!rule) {
    return interaction.reply({ content: `Could not find a conflict rule with ID \`${ruleId}\`.`, ephemeral: true });
  }
  const pool = rolePoolData.get({ guildId }, poolId);
  if (!pool) {
    return interaction.reply({ content: `Could not find a role pool with ID \`${poolId}\`.`, ephemeral: true });
  }

  if (!rule.poolIds.includes(pool.id)) {
    rule.poolIds.push(pool.id);
    conflictRuleData.write({ guildId }, rule);
  }

  return interaction.reply({ content: `Added pool **${pool.name}** to conflict rule **${rule.name}**.` });
}

async function removePoolExecute(interaction: ChatInputCommandInteraction): Promise<unknown> {
  const ruleId = interaction.options.getString("rule", true);
  const poolId = interaction.options.getString("pool", true);
  const guildId = interaction.guildId!;

  const rule = conflictRuleData.get({ guildId }, ruleId);
  if (!rule) {
    return interaction.reply({ content: `Could not find a conflict rule with ID \`${ruleId}\`.`, ephemeral: true });
  }
  const pool = rolePoolData.get({ guildId }, poolId);
  if (!pool) {
    return interaction.reply({ content: `Could not find a role pool with ID \`${poolId}\`.`, ephemeral: true });
  }

  rule.poolIds = rule.poolIds.filter(id => id !== pool.id);
  conflictRuleData.write({ guildId }, rule);

  return interaction.reply({ content: `Removed pool **${pool.name}** from conflict rule **${rule.name}**.` });
}

const ruleAutocomplete = crudAutocomplete(conflictRuleData, (interaction: AutocompleteInteraction) => ({ guildId: interaction.guildId! }));
const poolAutocomplete = crudAutocomplete(rolePoolData, (interaction: AutocompleteInteraction) => ({ guildId: interaction.guildId! }));

export const name = 'role-conflict';

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription('Manages conflict rules: alerts when a member holds roles from 2+ mutually exclusive pools.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addSubcommand(manage.data)
  .addSubcommand(sub => sub
    .setName('add-pool')
    .setDescription('Adds a pool to a conflict rule.')
    .addStringOption(option => option.setName("rule").setDescription("The conflict rule.").setAutocomplete(true).setRequired(true))
    .addStringOption(option => option.setName("pool").setDescription("The pool to add.").setAutocomplete(true).setRequired(true)))
  .addSubcommand(sub => sub
    .setName('remove-pool')
    .setDescription('Removes a pool from a conflict rule.')
    .addStringOption(option => option.setName("rule").setDescription("The conflict rule.").setAutocomplete(true).setRequired(true))
    .addStringOption(option => option.setName("pool").setDescription("The pool to remove.").setAutocomplete(true).setRequired(true)));

export async function execute(interaction: ChatInputCommandInteraction): Promise<unknown> {
  const sub = interaction.options.getSubcommand();
  if (sub === 'manage') return manage.execute(interaction);
  if (sub === 'add-pool') return addPoolExecute(interaction);
  if (sub === 'remove-pool') return removePoolExecute(interaction);
}

export async function autocomplete(interaction: AutocompleteInteraction): Promise<unknown> {
  const sub = interaction.options.getSubcommand();
  if (sub === 'manage') return manage.autocomplete(interaction);
  const focused = interaction.options.getFocused(true);
  if (focused.name === "rule") {
    return ruleAutocomplete(interaction);
  }
  return poolAutocomplete(interaction);
}
