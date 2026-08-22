import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, Role, GuildMember, User, GuildBasedChannel } from "discord.js";
import { getChannelInfo } from "../../util/channel.js";
import { channelInfoToString, stringList } from "../../util/fmt.js";
import { alertSettingsData, getAlertSettings, PingTarget } from "../../logic/alertSettings.js";

export const name = 'role-alerts';

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription("Configures this server's shared alert channel and ping list, used by every rule type.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addSubcommand(sub => sub
    .setName('set-channel')
    .setDescription('Sets the channel alerts are posted to.')
    .addChannelOption(option => option.setName('channel').setDescription('The alert channel.').setRequired(true)))
  .addSubcommand(sub => sub
    .setName('add-ping')
    .setDescription('Adds a role or user to ping on every alert.')
    .addMentionableOption(option => option.setName('target').setDescription('The role or user to ping.').setRequired(true)))
  .addSubcommand(sub => sub
    .setName('remove-ping')
    .setDescription('Removes a role or user from the ping list.')
    .addMentionableOption(option => option.setName('target').setDescription('The role or user to remove.').setRequired(true)))
  .addSubcommand(sub => sub
    .setName('check')
    .setDescription('Shows the current alert channel and ping list.'));

function pingMention(target: PingTarget): string {
  return target.type === 'role' ? `<@&${target.id}>` : `<@${target.id}>`;
}

// A guild-scoped Mentionable option always resolves to one of these three
// class instances in practice (this is a live guild interaction, not a raw
// API context) - the broader union discord.js's typings allow also includes
// uncached partial API shapes, which we don't expect to hit here.
function resolvePingTarget(mentionable: unknown): PingTarget | null {
  if (mentionable instanceof Role) {
    return { type: 'role', id: mentionable.id, name: mentionable.name };
  }
  if (mentionable instanceof GuildMember) {
    return { type: 'user', id: mentionable.id, name: mentionable.displayName };
  }
  if (mentionable instanceof User) {
    return { type: 'user', id: mentionable.id, name: mentionable.username };
  }
  return null;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<unknown> {
  const guildId = interaction.guildId!;
  const sub = interaction.options.getSubcommand();

  if (sub === 'set-channel') {
    const channel = interaction.options.getChannel('channel', true) as GuildBasedChannel;
    const settings = getAlertSettings(guildId);
    settings.alertChannel = getChannelInfo(channel);
    alertSettingsData.write({ guildId }, settings);
    return interaction.reply({ content: `Alert channel set to ${channelInfoToString(settings.alertChannel)}.` });
  }

  if (sub === 'add-ping') {
    const target = resolvePingTarget(interaction.options.getMentionable('target', true));
    if (!target) {
      return interaction.reply({ content: 'Could not resolve that role or user - please try again.', ephemeral: true });
    }
    const settings = getAlertSettings(guildId);
    if (!settings.pingTargets.some(t => t.type === target.type && t.id === target.id)) {
      settings.pingTargets.push(target);
      alertSettingsData.write({ guildId }, settings);
    }
    return interaction.reply({ content: `Will now ping ${pingMention(target)} on every alert.` });
  }

  if (sub === 'remove-ping') {
    const target = resolvePingTarget(interaction.options.getMentionable('target', true));
    if (!target) {
      return interaction.reply({ content: 'Could not resolve that role or user - please try again.', ephemeral: true });
    }
    const settings = getAlertSettings(guildId);
    settings.pingTargets = settings.pingTargets.filter(t => !(t.type === target.type && t.id === target.id));
    alertSettingsData.write({ guildId }, settings);
    return interaction.reply({ content: `Removed ${pingMention(target)} from the ping list.` });
  }

  if (sub === 'check') {
    const settings = getAlertSettings(guildId);
    return interaction.reply({
      content: [
        `**Alert channel:** ${settings.alertChannel ? channelInfoToString(settings.alertChannel) : 'Not configured'}`,
        `**Pings:** ${stringList(settings.pingTargets.map(pingMention))}`,
      ].join('\n'),
    });
  }
}
