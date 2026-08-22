import { Guild, GuildMember, WebhookClient } from "discord.js";
import { GuildAlertSettings, alertSettingsData, createWebhookForChannel } from "./alertSettings.js";

/**
 * Shared outcome config for rule types where "fix" is meaningful: `fix` and
 * `alert` are independent - a rule can auto-remove the offending role(s),
 * notify a moderator, both, or (validated at the command level) neither is
 * rejected as a no-op rule.
 */
export interface RuleOutcome {
  fix: boolean;
  alert: boolean;
}

async function sendViaWebhook(id: string, token: string, member: GuildMember, content: string): Promise<void> {
  const client = new WebhookClient({ id, token });
  await client.send({
    content,
    username: member.displayName,
    avatarURL: member.displayAvatarURL(),
  });
}

/**
 * Sends a moderator alert to the guild's configured alert channel, prefixed
 * with a ping for every configured ping target. The alert is posted through a
 * bot-managed webhook so it can impersonate the reported member's name and
 * avatar; a missing/deleted webhook is silently recreated once and retried,
 * and if a webhook genuinely can't be created or used (e.g. the bot lacks
 * Manage Webhooks in that channel), falls back to a plain message from the
 * bot itself rather than dropping the alert entirely. Silently does nothing
 * if no alert channel is configured yet.
 */
export async function sendAlert(guild: Guild, settings: GuildAlertSettings, message: string, member: GuildMember): Promise<void> {
  if (!settings.alertChannel) {
    console.warn(`No alert channel configured for guild ${guild.id}; dropping alert: ${message}`);
    return;
  }

  const pings = settings.pingTargets.map(target => target.type === 'role' ? `<@&${target.id}>` : `<@${target.id}>`).join(' ');
  const content = pings ? `${pings}\n${message}` : message;

  let webhookId = settings.webhookId;
  let webhookToken = settings.webhookToken;

  if (!webhookId || !webhookToken) {
    const created = await createWebhookForChannel(settings.alertChannel.id, guild);
    if (created) {
      webhookId = created.id;
      webhookToken = created.token;
      settings.webhookId = webhookId;
      settings.webhookToken = webhookToken;
      alertSettingsData.write({ guildId: guild.id }, settings);
    }
  }

  if (webhookId && webhookToken) {
    try {
      await sendViaWebhook(webhookId, webhookToken, member, content);
      return;
    } catch (error) {
      console.warn(`Alert webhook ${webhookId} in guild ${guild.id} failed, recreating`, error);
      const recreated = await createWebhookForChannel(settings.alertChannel.id, guild);
      if (recreated) {
        settings.webhookId = recreated.id;
        settings.webhookToken = recreated.token;
        alertSettingsData.write({ guildId: guild.id }, settings);
        try {
          await sendViaWebhook(recreated.id, recreated.token, member, content);
          return;
        } catch (retryError) {
          console.warn(`Retry after recreating alert webhook in guild ${guild.id} also failed`, retryError);
        }
      }
    }
  }

  // Last resort: a webhook genuinely isn't usable (e.g. missing Manage
  // Webhooks) - still get the alert through, just without the impersonation.
  try {
    const fetched = await guild.channels.fetch(settings.alertChannel.id);
    if (fetched?.isTextBased()) {
      await fetched.send(content);
    } else {
      console.warn(`Alert channel ${settings.alertChannel.id} in guild ${guild.id} is missing or not text-based.`);
    }
  } catch (error) {
    console.warn(`Failed to send alert to channel ${settings.alertChannel.id} in guild ${guild.id}`, error);
  }
}
