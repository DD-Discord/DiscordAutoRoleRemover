import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, AutocompleteInteraction } from "discord.js";
import { dbId } from "../../db.js";
import { crudCommandUpdateSubcommand, crudCommandOption, crudAutocomplete } from "../../crud.js";
import { rolePoolData, RolePool } from "../../logic/rolePool.js";

type Namespace = { guildId: string };

const manage = crudCommandUpdateSubcommand<RolePool, Namespace>({
  name: 'manage',
  description: "Creates, edits, deletes, or lists role pools (name only).",
  crud: rolePoolData,
  options: [
    crudCommandOption.simpleString<RolePool>({ name: 'name', description: "The pool's display name.", required: true }),
  ],
  getDefault: interaction => ({ id: dbId(), guildId: interaction.guildId!, name: '', roleIds: [] }),
  getNamespace: interaction => ({ guildId: interaction.guildId! }),
});

async function addRoleExecute(interaction: ChatInputCommandInteraction): Promise<unknown> {
  const poolId = interaction.options.getString("pool", true);
  const role = interaction.options.getRole("role", true);
  const guildId = interaction.guildId!;

  const pool = rolePoolData.get({ guildId }, poolId);
  if (!pool) {
    return interaction.reply({ content: `Could not find a role pool with ID \`${poolId}\`.`, ephemeral: true });
  }

  if (!pool.roleIds.includes(role.id)) {
    pool.roleIds.push(role.id);
    rolePoolData.write({ guildId }, pool);
  }

  return interaction.reply({ content: `Added <@&${role.id}> to pool **${pool.name}**.` });
}

async function removeRoleExecute(interaction: ChatInputCommandInteraction): Promise<unknown> {
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

const poolAutocomplete = crudAutocomplete(rolePoolData, (interaction: AutocompleteInteraction) => ({ guildId: interaction.guildId! }));

export const name = 'role-pool';

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription('Manages role pools (named sets of roles referenced by other rules).')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addSubcommand(manage.data)
  .addSubcommand(sub => sub
    .setName('add-role')
    .setDescription('Adds a role to a role pool.')
    .addStringOption(option => option.setName("pool").setDescription("The pool to add the role to.").setAutocomplete(true).setRequired(true))
    .addRoleOption(option => option.setName("role").setDescription("The role to add.").setRequired(true)))
  .addSubcommand(sub => sub
    .setName('remove-role')
    .setDescription('Removes a role from a role pool.')
    .addStringOption(option => option.setName("pool").setDescription("The pool to remove the role from.").setAutocomplete(true).setRequired(true))
    .addRoleOption(option => option.setName("role").setDescription("The role to remove.").setRequired(true)));

export async function execute(interaction: ChatInputCommandInteraction): Promise<unknown> {
  const sub = interaction.options.getSubcommand();
  if (sub === 'manage') return manage.execute(interaction);
  if (sub === 'add-role') return addRoleExecute(interaction);
  if (sub === 'remove-role') return removeRoleExecute(interaction);
}

export async function autocomplete(interaction: AutocompleteInteraction): Promise<unknown> {
  const sub = interaction.options.getSubcommand();
  if (sub === 'manage') return manage.autocomplete(interaction);
  // add-role and remove-role both only have a "pool" option to autocomplete.
  return poolAutocomplete(interaction);
}
