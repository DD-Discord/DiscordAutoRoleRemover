const { CommandInteraction, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const discord = require("discord.js");
const { roleRemoverData } = require("../../logic/update");
const { batchLines } = require("../../util/fmt");

module.exports.name = "role-remover-check";

module.exports.data = new SlashCommandBuilder()
  .setName(module.exports.name)
  .setDescription("Gets the list of roles that are auto removed.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

/**
 * @param {discord.ChatInputCommandInteraction} interaction
 */
module.exports.execute = async function(interaction) {
  const roleDatas = roleRemoverData.getAll(interaction);

	if (roleDatas.length === 0) {
		return interaction.reply({ content: `No ${roleRemoverData.displayNamePlural} found.`, ephemeral: true });
	}

	const lines = [];
  for (const roleData of roleDatas) {
    lines.push(`# ${roleRemoverData.formatShort(roleData)}`);
		for (const key in roleData.remove) {
			const linked = roleData.remove[key];
    lines.push(`- <@&${linked.removeId}> (${linked.removeName})`);
		}
  }
  
	const batches = batchLines(lines);
	await interaction.reply({ content: batches[0] });
	for (const batch of batches.slice(1)) {
		await interaction.followUp({ content: batch });
	}
};
