import { Guild } from "discord.js";
import { DbRecord } from "../db.js";
import { crudDefine, Crud } from "../crud.js";
import { channelInfoToString, stringList } from "../util/fmt.js";
import { ChannelInfo } from "../util/channel.js";

/**
 * A role or user to ping whenever an alert is posted.
 */
export interface PingTarget {
  type: 'role' | 'user';
  id: string;
  name: string;
}

/**
 * Per-guild alert configuration: one alert channel and one ping list, shared
 * by every rule type. A singleton per guild - there is always exactly one
 * record, keyed by the guild's own ID.
 *
 * `webhookId`/`webhookToken` back the bot-managed webhook alerts are sent
 * through (see logic/outcome.ts's sendAlert), so each alert can impersonate
 * the reported member's name/avatar. Both are `null` until the first alert
 * (or `/role-alerts set-channel`) creates one - see `createWebhookForChannel`.
 */
export interface GuildAlertSettings extends DbRecord {
  id: string;
  guildId: string;
  alertChannel: ChannelInfo | null;
  pingTargets: PingTarget[];
  webhookId: string | null;
  webhookToken: string | null;
}

function pingLabel(target: PingTarget): string {
  return target.type === 'role' ? `<@&${target.id}>` : `<@${target.id}>`;
}

export const alertSettingsData: Crud<GuildAlertSettings, { guildId: string }> = crudDefine<GuildAlertSettings, { guildId: string }>({
  name: 'alert settings',
  getTable: ns => [ns.guildId, 'settings'],
  formatShort: record => `Alert settings for this server`,
  formatFull: (record, template) => template().addFields(
    { name: 'Alert channel', value: record.alertChannel ? channelInfoToString(record.alertChannel) : 'Not configured' },
    { name: 'Pings', value: stringList(record.pingTargets.map(pingLabel)) },
  ),
});

/**
 * Gets a guild's alert settings, or a safe empty default if nothing has been
 * configured yet - callers never need a null check, just check `.alertChannel`.
 */
export function getAlertSettings(guildId: string): GuildAlertSettings {
  return alertSettingsData.get({ guildId }, guildId) ?? { id: guildId, guildId, alertChannel: null, pingTargets: [], webhookId: null, webhookToken: null };
}

/**
 * Creates a fresh webhook in the given channel for posting alerts through.
 * Requires the bot to have Manage Webhooks in that channel. Returns `null`
 * (rather than throwing) on any failure - callers surface that as "couldn't
 * set up alerts here" rather than a crash.
 */
export async function createWebhookForChannel(channelId: string, guild: Guild): Promise<{ id: string, token: string } | null> {
  try {
    const channel = await guild.channels.fetch(channelId);
    if (!channel || !('createWebhook' in channel)) {
      return null;
    }
    const webhook = await channel.createWebhook({
      name: 'Role Alerts',
      reason: 'Alert channel for the role rule engine',
    });
    return webhook.token ? { id: webhook.id, token: webhook.token } : null;
  } catch (error) {
    console.warn(`Failed to create alert webhook in channel ${channelId}`, error);
    return null;
  }
}
