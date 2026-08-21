import { Guild } from "discord.js";
import { ChannelInfo } from "../util/channel.js";

/**
 * Shared outcome config for rule types where "fix" is meaningful: either
 * auto-remove the offending role(s), or alert a moderator channel instead of
 * touching the member's roles.
 */
export interface RuleOutcome {
  action: 'fix' | 'alert';
  /**
   * Always required, even when `action === 'fix'` — some situations (an
   * ambiguous pool-cap overflow, for example) fall back to alerting
   * regardless of the configured action, so there must always be a channel
   * to alert into. Stored as a full `ChannelInfo` (not just an ID) since
   * that's what `crudCommandOption.simpleChannel` already produces.
   */
  alertChannel: ChannelInfo;
}

/**
 * Sends a moderator alert to the given channel. Silently does nothing if the
 * channel can't be found or isn't text-based (e.g. it was deleted after the
 * rule was configured).
 */
export async function sendAlert(guild: Guild, channel: ChannelInfo, message: string): Promise<void> {
  try {
    const fetched = await guild.channels.fetch(channel.id);
    if (fetched?.isTextBased()) {
      await fetched.send(message);
    } else {
      console.warn(`Alert channel ${channel.id} in guild ${guild.id} is missing or not text-based.`);
    }
  } catch (error) {
    console.warn(`Failed to send alert to channel ${channel.id} in guild ${guild.id}`, error);
  }
}
