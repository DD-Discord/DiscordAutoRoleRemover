import { Guild, GuildMember } from "discord.js";
import { GuildAlertSettings, alertSettingsData, toWebhookChannelInfo } from "./alertSettings.js";
import { createWebhookForChannel, webhookSend, WebhookChannelInfo } from "../util/webhook.js";

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

const WEBHOOK_CREATE_OPTIONS = { name: 'Role Alerts', reason: 'Alert channel for the role rule engine' };

async function recreateWebhook(guild: Guild, settings: GuildAlertSettings): Promise<WebhookChannelInfo | null> {
  if (!settings.alertChannel) {
    return null;
  }
  const created = await createWebhookForChannel(guild, settings.alertChannel, WEBHOOK_CREATE_OPTIONS);
  if (created) {
    settings.webhookId = created.id;
    settings.webhookToken = created.token;
    alertSettingsData.write({ guildId: guild.id }, settings);
  }
  return created;
}

/**
 * Sends a moderator alert to the guild's configured alert channel, prefixed
 * with a ping for every configured ping target. The alert is posted through a
 * bot-managed webhook (`util/webhook.ts`, thread-aware) so it can impersonate
 * the reported member's name and avatar; a missing/deleted webhook is
 * silently recreated once and retried, and if a webhook genuinely can't be
 * created or used (e.g. the bot lacks Manage Webhooks in that channel), falls
 * back to a plain message from the bot itself rather than dropping the
 * alert. Silently does nothing if no alert channel is configured yet.
 */
export async function sendAlert(guild: Guild, settings: GuildAlertSettings, message: string, member: GuildMember): Promise<void> {
  if (!settings.alertChannel) {
    console.warn(`No alert channel configured for guild ${guild.id}; dropping alert: ${message}`);
    return;
  }

  const pings = settings.pingTargets.map(target => target.type === 'role' ? `<@&${target.id}>` : `<@${target.id}>`).join(' ');
  const content = pings ? `${pings}\n${message}` : message;
  const options = { content, username: member.displayName, avatarURL: member.displayAvatarURL() ?? undefined };

  let webhook = toWebhookChannelInfo(guild, settings) ?? await recreateWebhook(guild, settings);

  if (webhook) {
    try {
      await webhookSend(webhook, options);
      return;
    } catch (error) {
      console.warn(`Alert webhook ${webhook.id} in guild ${guild.id} failed, recreating`, error);
      webhook = await recreateWebhook(guild, settings);
      if (webhook) {
        try {
          await webhookSend(webhook, options);
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
      await fetched.send(content + '\n*Warning: Webhook not available!*');
    } else {
      console.warn(`Alert channel ${settings.alertChannel.id} in guild ${guild.id} is missing or not text-based.`);
    }
  } catch (error) {
    console.warn(`Failed to send alert to channel ${settings.alertChannel.id} in guild ${guild.id}`, error);
  }
}
