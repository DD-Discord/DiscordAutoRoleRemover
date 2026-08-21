import { Guild } from "discord.js";

/**
 * Information about a single guild.
 */
export interface GuildInfo {
  id: string;
  name: string;
}

export function getGuildInfo(guild: Guild): GuildInfo {
  return {
    id: guild.id,
    name: guild.name,
  };
}
