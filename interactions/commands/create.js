const { CommandInteraction, SlashCommandBuilder, Role, PermissionFlagsBits } = require("discord.js");
const discord = require("discord.js");
const { dbGet, dbWrite } = require("../../db");
const { roleRemoverData } = require("../../logic/update");

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
 * @param {discord.ChatInputCommandInteraction} interaction
 */
module.exports.execute = async function(interaction) {
  // Get settings
  const optWhen = interaction.options.getRole("when");
  const optRemove = interaction.options.getRole("remove");
  const guildId = interaction.guildId;

  let roles = roleRemoverData.get(interaction, optWhen.id)
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

  roleRemoverData.write(interaction, roles);
  
  // Done
  return interaction.reply({
    content: `Will now automatically remove role <@&${optRemove.id}> from members without <@&${optWhen.id}>.`,
  });
};
