import { ChannelWebhookCreateOptions, Guild, WebhookClient, WebhookMessageCreateOptions } from "discord.js";
import { ChannelInfo } from "./channel.js";
import { getGuildInfo, GuildInfo } from "./guild.js";

const cache = new Map<string, WebhookClient>();

/**
 * Information about a webhook in a single channel.
 */
export interface WebhookChannelInfo {
  /**
   * The webhook ID.
   */
  id: string;
  /**
   * The webhook token.
   */
  token: string;
  /**
   * The guild.
   */
  guild: GuildInfo;
  /**
   * The webhook channel.
   */
  channel: ChannelInfo;
}

/**
 * Creates a fresh webhook in the given channel for posting alerts through.
 * Requires the bot to have Manage Webhooks in that channel. Returns `null`
 * (rather than throwing) on any failure - callers surface that as "couldn't
 * set up alerts here" rather than a crash.
 */
export async function createWebhookForChannel(guild: Guild, channelInfo: ChannelInfo, options: ChannelWebhookCreateOptions): Promise<WebhookChannelInfo | null> {
  try {
    let channel = await guild.channels.fetch(channelInfo.id);
    if (channel?.isThread()) {
      channel = channel.parent;
    }
    if (!channel || !('createWebhook' in channel)) {
      return null;
    }
    const webhook = await channel.createWebhook(options);
    return webhook.token ? { id: webhook.id, token: webhook.token, guild: getGuildInfo(guild), channel: channelInfo } : null;
  } catch (error) {
    console.warn(`Failed to create alert webhook in channel ${channelInfo.id} (${channelInfo.name})`, error);
    return null;
  }
}

export function getWebhookClient({ id, token }: WebhookChannelInfo) {
  let webhook = cache.get(id);
  if (!webhook) {
    webhook = new WebhookClient({ id: id, token: token });
    cache.set(webhook.id, webhook);
  }
  return webhook;
}

export function webhookSend(info: WebhookChannelInfo, message: Omit<WebhookMessageCreateOptions, "threadId" | "threadName">) {
  const webhook = getWebhookClient(info);
  return webhook.send({
    ...message,
    threadId: info.channel?.parent ? info.channel.id : undefined,
  });
}

export function webhookDelete(info: WebhookChannelInfo, messageId: string) {
  const webhook = getWebhookClient(info);
  return webhook.deleteMessage(messageId, info.channel?.parent ? info.channel.id : undefined);
}
