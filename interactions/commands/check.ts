import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction } from "discord.js";
import { roleRemoverData } from "../../logic/update.js";
import { batchLines } from "../../util/fmt.js";

export const name = "role-remover-check";

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription("Gets the list of roles that are auto removed.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

export async function execute(interaction: ChatInputCommandInteraction): Promise<unknown> {
  const roleDatas = roleRemoverData.getAll({ guildId: interaction.guildId! });

  if (roleDatas.length === 0) {
    return interaction.reply({ content: `No ${roleRemoverData.displayNamePlural} found.`, ephemeral: true });
  }

  const lines: string[] = [];
  for (const roleData of roleDatas) {
    lines.push(`# ${roleRemoverData.formatShort(roleData)}`);
    for (const key in roleData.remove) {
      const linked = roleData.remove[key]!;
      lines.push(`- <@&${linked.removeId}> (${linked.removeName})`);
    }
  }

  const batches = batchLines(lines);
  await interaction.reply({ content: batches[0]! });
  for (const batch of batches.slice(1)) {
    await interaction.followUp({ content: batch });
  }
}
