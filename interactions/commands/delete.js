const { CommandInteraction, SlashCommandBuilder, Role, PermissionFlagsBits } = require("discord.js");
const discord = require("discord.js");
const { dbGet, dbWrite, dbDelete } = require("../../db");
const { roleRemoverData } = require("../../logic/update");

module.exports.name = "role-remover-delete";

module.exports.data = new SlashCommandBuilder()
  .setName(module.exports.name)
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

/**
 * @param {discord.ChatInputCommandInteraction} interaction
 */
module.exports.execute = async function(interaction) {
  // Get settings
  const optWhen = interaction.options.getRole("when");
  const optRemove = interaction.options.getRole("remove");

  const settings = roleRemoverData.get(interaction, optWhen.id);
  if (!settings) {
    return interaction.reply({
      content: "No auto remove settings for this role.",
      ephemeral: true,
    });
  }

  delete settings.remove[optRemove.id];
  // Done
  if (Object.keys(settings.remove).length === 0) {
    roleRemoverData.delete(interaction, optWhen.id);
    return interaction.reply({
      content: `Disabled all role removal for <@&${optWhen.id}>.`,
    });
  } else {
    roleRemoverData.write(interaction, settings);
    return interaction.reply({
      content: `Will no longer automatically remove role <@&${optRemove.id}> from members without <@&${optWhen.id}>.`,
    });
  }
};
