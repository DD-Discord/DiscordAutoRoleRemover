import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction } from "discord.js";
import { roleRemoverData } from "../../logic/update.js";

export const name = "role-remover-create";

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription("Adds a role to be auto removed.")
  .addRoleOption(option => {
    option.setName("when");
    option.setDescription("Check for the absence of this role.");
    option.setRequired(true);
    return option;
  })
  .addRoleOption(option => {
    option.setName("remove");
    option.setDescription("Remove this role if missing.");
    option.setRequired(true);
    return option;
  })
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

export async function execute(interaction: ChatInputCommandInteraction): Promise<unknown> {
  const optWhen = interaction.options.getRole("when", true);
  const optRemove = interaction.options.getRole("remove", true);
  const guildId = interaction.guildId!;

  let roles = roleRemoverData.get({ guildId }, optWhen.id);
  if (roles === null) {
    roles = {
      roleId: optWhen.id,
      roleName: optWhen.name,
      guildId,
      remove: {},
    };
  }

  roles.remove[optRemove.id] = {
    removeId: optRemove.id,
    removeName: optRemove.name,
  };

  roleRemoverData.write({ guildId }, roles);

  return interaction.reply({
    content: `Will now automatically remove role <@&${optRemove.id}> from members without <@&${optWhen.id}>.`,
  });
}
