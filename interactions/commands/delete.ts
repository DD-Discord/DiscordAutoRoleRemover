import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction } from "discord.js";
import { roleRemoverData } from "../../logic/update.js";

export const name = "role-remover-delete";

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription("Disables a role to be auto removed.")
  .addRoleOption(option => {
    option.setName("when");
    option.setDescription("Check for the absence of this role.");
    option.setRequired(true);
    return option;
  })
  .addRoleOption(option => {
    option.setName("remove");
    option.setDescription("No longer remove this role if missing.");
    option.setRequired(true);
    return option;
  })
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

export async function execute(interaction: ChatInputCommandInteraction): Promise<unknown> {
  const optWhen = interaction.options.getRole("when", true);
  const optRemove = interaction.options.getRole("remove", true);
  const guildId = interaction.guildId!;

  const settings = roleRemoverData.get({ guildId }, optWhen.id);
  if (!settings) {
    return interaction.reply({
      content: "No auto remove settings for this role.",
      ephemeral: true,
    });
  }

  delete settings.remove[optRemove.id];
  if (Object.keys(settings.remove).length === 0) {
    roleRemoverData.delete({ guildId }, settings);
    return interaction.reply({
      content: `Disabled all role removal for <@&${optWhen.id}>.`,
    });
  } else {
    roleRemoverData.write({ guildId }, settings);
    return interaction.reply({
      content: `Will no longer automatically remove role <@&${optRemove.id}> from members without <@&${optWhen.id}>.`,
    });
  }
}
