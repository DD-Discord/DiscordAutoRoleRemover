const { CommandInteraction, SlashCommandBuilder, Role } = require("discord.js");
const { dbGet, dbWrite, dbDelete } = require("../db");
const { PermissionFlagsBits } = require('discord-api-types/v10');

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
 * @param {CommandInteraction} interaction
 */
module.exports.execute = async function(interaction) {
  // Get settings
  /** @type {Role} */
  const optWhen = interaction.options.getRole("when");
  /** @type {Role} */
  const optRemove = interaction.options.getRole("remove");

  const settings = dbGet("roles", optWhen.id);
  if (!settings) {
    return interaction.reply({
      content: "No auto remove settings for this role.",
      ephemeral: true,
    });
  }

  delete settings.remove[optRemove.id];
  // Done
  if (Object.keys(settings.remove).length === 0) {
    dbDelete("roles", optWhen.id);
    return interaction.reply({
      content: `Disabled all role removal for <@&${optWhen.id}>.`,
    });
  } else {
    dbWrite("roles", optWhen.id, settings)
    return interaction.reply({
      content: `Will no longer automatically remove role <@&${optRemove.id}> from members without <@&${optWhen.id}>.`,
    });
  }
};
