import { GuildBasedChannel } from "discord.js";

/**
 * Information about a single channel.
 */
export interface ChannelInfo {
  id: string;
  name: string;
  parent?: ChannelInfo;
}

export function getChannelInfo(channel: GuildBasedChannel): ChannelInfo {
  const parent = "parent" in channel && channel.parent ? getChannelInfo(channel.parent) : undefined;
  return {
    id: channel.id,
    name: channel.name,
    parent,
  };
}
