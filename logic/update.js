const { GuildMember } = require("discord.js");
const db = require("../db");
const crud = require("../crud");
const { maxLength } = require("../util/fmt");

/**
 * Data about reole removal conditions.
 * @typedef {Object} RoleRemoverData
 * @property {string} guildId The related guild id.
 * @property {string} roleId The role ID to remove.
 * @property {string} roleName The role name to remove.
 * @property {Record<string, { removeId: string, removeName }>} remove Roles that will be removed.
 */

/**
 * @type {crud.Crud<RoleRemoverData, { guildId: string }>}
 */
const roleRemoverData = crud.crudDefine({
  name: 'role remover',
  getId: record => record.roleId,
  getTable: ns => [ns.guildId, 'roles'],
  formatShort: record => `\`${record.roleId}\`: ${record.roleName} (${Object.keys(record.remove).length} linked roles)`,
  formatFull: (record, template) => template().addFields(
    { name: 'Conditonal role', value: `<@&${record.roleId}> (${record.roleName})` },
    { name: 'Required for', value: maxLength(Object.values(record.remove).map(remove => `- <@&${record.roleId}> (${record.roleName})`).join('\n') || 'None', 1000) }
  ),
});
module.exports.roleRemoverData = roleRemoverData;

/**
 * Checks and removes roles.
 * @param {GuildMember} oldMember The old member.
 * @param {GuildMember?} newMember The new member.
 * @returns {Promise<void>} Once done
 */
async function maybeUpdateRoles(oldMember, newMember) {
  const settings = db.dbGetAll("roles")
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
      } catch(error) {
        console.log(`Failed to remove ${role} from ${newMember}`, error);
      }
    }
  }
}
module.exports.maybeUpdateRoles = maybeUpdateRoles;
