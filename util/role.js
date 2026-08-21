const { Role } = require("discord.js");

/**
 * Information about a single role.
 * @typedef {Object} RoleInfo
 * 
 * @property {string} id The ID of the role.
 * @property {string} name The name of the role.
 */

/**
/**
 * 
 * @param {Role} role
 * @returns {RoleInfo}
 */
function getRoleInfo(role) {
  return {
    id: role.id,
    name: role.name,
  };
}
module.exports.getRoleInfo = getRoleInfo;
