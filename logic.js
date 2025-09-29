const { GuildMember } = require("discord.js");
const { dbGetAll } = require("./db");

/**
 * Checks and removes roles.
 * @param {GuildMember} oldMember The old member.
 * @param {GuildMember?} newMember The new member.
 * @returns {Promise<void>} Once done
 */
async function maybeUpdateRoles(oldMember, newMember) {
  const settings = dbGetAll("roles")
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


module.exports = { maybeUpdateRoles };