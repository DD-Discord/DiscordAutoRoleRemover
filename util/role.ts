import { Role } from "discord.js";

/**
 * Information about a single role.
 */
export interface RoleInfo {
  id: string;
  name: string;
}

export function getRoleInfo(role: Role): RoleInfo {
  return {
    id: role.id,
    name: role.name,
  };
}
