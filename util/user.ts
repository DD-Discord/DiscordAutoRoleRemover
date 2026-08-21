import { User, GuildMember } from "discord.js";

/**
 * Information about a single user.
 */
export interface UserInfo {
  id: string;
  name: string;
  tag: string;
}

export function getUserInfo(user: User | GuildMember): UserInfo {
  const resolved = user instanceof GuildMember ? user.user : user;
  return {
    id: resolved.id,
    name: resolved.displayName,
    tag: resolved.tag,
  };
}
