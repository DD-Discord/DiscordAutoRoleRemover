import { Guild } from "discord.js";
import { GuildAlertSettings } from "./alertSettings.js";

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

/**
 * Sends a moderator alert to the guild's configured alert channel, prefixed
 * with a ping for every configured ping target. Silently does nothing if no
 * channel is configured yet, or if the configured channel can't be found or
 * isn't text-based (e.g. it was deleted after being configured).
 */
export async function sendAlert(guild: Guild, settings: GuildAlertSettings, message: string): Promise<void> {
  if (!settings.alertChannel) {
    console.warn(`No alert channel configured for guild ${guild.id}; dropping alert: ${message}`);
    return;
  }

  const pings = settings.pingTargets.map(target => target.type === 'role' ? `<@&${target.id}>` : `<@${target.id}>`).join(' ');
  const content = pings ? `${pings}\n${message}` : message;

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
