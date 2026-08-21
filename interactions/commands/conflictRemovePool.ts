import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, AutocompleteInteraction } from "discord.js";
import { crudAutocomplete } from "../../crud.js";
import { rolePoolData } from "../../logic/rolePool.js";
import { conflictRuleData } from "../../logic/conflict.js";

export const name = "role-conflict-remove-pool";

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription("Removes a pool from a conflict rule.")
  .addStringOption(option => option.setName("rule").setDescription("The conflict rule.").setAutocomplete(true).setRequired(true))
  .addStringOption(option => option.setName("pool").setDescription("The pool to remove.").setAutocomplete(true).setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

export async function execute(interaction: ChatInputCommandInteraction): Promise<unknown> {
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

export async function autocomplete(interaction: AutocompleteInteraction): Promise<unknown> {
  const focused = interaction.options.getFocused(true);
  if (focused.name === "rule") {
    return ruleAutocomplete(interaction);
  }
  return poolAutocomplete(interaction);
}
