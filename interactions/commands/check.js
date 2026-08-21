const { CommandInteraction, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { dbGetAll, dbSerialize } = require("../../db");

module.exports.name = "role-remover-check";

module.exports.data = new SlashCommandBuilder()
  .setName(module.exports.name)
  .setDescription("Gets the list of roles that are auto removed.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);
    
/**
 * @param {CommandInteraction} interaction
 */
module.exports.execute = async function(interaction) {
  const guildId = interaction.guildId;
  const settings = dbGetAll("roles")
  const sameGuild = settings.filter(s => s.guildId === guildId)

  // Done
  return interaction.reply({
    content: '# Auto removed roles:\n```json\n' + dbSerialize(sameGuild).substring(0, 1900) + '\n```',
  });
};
