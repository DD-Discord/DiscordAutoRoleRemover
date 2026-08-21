import { GuildMember, PartialGuildMember } from "discord.js";
import { dbGetAll, DbRecord } from "../db.js";
import { crudDefine, Crud } from "../crud.js";
import { maxLength } from "../util/fmt.js";

/**
 * Data about role removal conditions.
 */
export interface RoleRemoverData extends DbRecord {
  /** The related guild id. */
  guildId: string;
  /** The role ID to remove. */
  roleId: string;
  /** The role name to remove. */
  roleName: string;
  /** Roles that will be removed. */
  remove: Record<string, { removeId: string, removeName: string }>;
}

export const roleRemoverData = crudDefine<RoleRemoverData, { guildId: string }>({
  name: 'role remover',
  getId: record => record.roleId,
  getTable: ns => [ns.guildId, 'roles'],
  formatShort: record => `\`${record.roleId}\`: ${record.roleName} (${Object.keys(record.remove).length} linked roles)`,
  formatFull: (record, template) => template().addFields(
    { name: 'Conditonal role', value: `<@&${record.roleId}> (${record.roleName})` },
    { name: 'Required for', value: maxLength(Object.values(record.remove).map(remove => `- <@&${record.roleId}> (${record.roleName})`).join('\n') || 'None', 1000) }
  ),
});

/**
 * Checks and removes roles.
 */
export async function maybeUpdateRoles(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember): Promise<void> {
  const settings = dbGetAll<RoleRemoverData>("roles")
  for (const setting of settings) {
    if (setting.guildId !== newMember.guild.id) {
      continue;
    }

    // Still has the role
    if (newMember.roles.cache.has(setting.roleId)) {
      continue;
    }
    // The user never had the role
    if (!oldMember.roles.cache.has(setting.roleId)) {
      continue;
    }

    for (const removeSetting in setting.remove) {
      const role = newMember.roles.cache.get(removeSetting);
      if (!role) {
        continue;
      }

      console.log(`Will remove ${role.id} (${role.name}) from ${newMember.id} (${newMember.displayName})`)
      try {
        await newMember.roles.remove(role, "Auto remover: " + setting.roleName);
      } catch (error) {
        console.log(`Failed to remove ${role} from ${newMember}`, error);
      }
    }
  }
}
