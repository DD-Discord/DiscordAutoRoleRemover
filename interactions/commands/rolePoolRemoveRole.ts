import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, AutocompleteInteraction } from "discord.js";
import { crudAutocomplete } from "../../crud.js";
import { rolePoolData } from "../../logic/rolePool.js";

export const name = "role-pool-remove-role";

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription("Removes a role from a role pool.")
  .addStringOption(option => option.setName("pool").setDescription("The pool to remove the role from.").setAutocomplete(true).setRequired(true))
  .addRoleOption(option => option.setName("role").setDescription("The role to remove.").setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

export async function execute(interaction: ChatInputCommandInteraction): Promise<unknown> {
  const poolId = interaction.options.getString("pool", true);
  const role = interaction.options.getRole("role", true);
  const guildId = interaction.guildId!;

  const pool = rolePoolData.get({ guildId }, poolId);
  if (!pool) {
    return interaction.reply({ content: `Could not find a role pool with ID \`${poolId}\`.`, ephemeral: true });
  }

  pool.roleIds = pool.roleIds.filter(id => id !== role.id);
  rolePoolData.write({ guildId }, pool);

  return interaction.reply({ content: `Removed <@&${role.id}> from pool **${pool.name}**.` });
}

export const autocomplete = crudAutocomplete(rolePoolData, (interaction: AutocompleteInteraction) => ({ guildId: interaction.guildId! }));
