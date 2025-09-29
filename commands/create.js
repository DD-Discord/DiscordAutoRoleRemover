const { CommandInteraction, SlashCommandBuilder, Role } = require("discord.js");
const { dbGet, dbWrite } = require("../db");
const { PermissionFlagsBits } = require('discord-api-types/v10');

module.exports.name = "role-remover-create";

module.exports.data = new SlashCommandBuilder()
  .setName(module.exports.name)
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
    

/**
 * @param {CommandInteraction} interaction
 */
module.exports.execute = async function(interaction) {
  // Get settings
  /** @type {Role} */
  const optWhen = interaction.options.getRole("when");
  /** @type {Role} */
  const optRemove = interaction.options.getRole("remove");
  const guildId = interaction.guildId;

  let roles = dbGet("roles", optWhen.id);
  if (roles === null) {
    roles = {}
    roles.roleId = optWhen.id;
    roles.roleName = optWhen.name;
    roles.guildId = guildId;
    roles.remove = {};
  }

  roles.remove[optRemove.id] = {
    removeId: optRemove.id,
    removeName: optRemove.name,
  };

  dbWrite("roles", optWhen.id, roles)
  
  // Done
  return interaction.reply({
    content: `Will now automatically remove role <@&${optRemove.id}> from members without <@&${optWhen.id}>.`,
  });
};
