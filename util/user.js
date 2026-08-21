const { User, GuildMember } = require("discord.js");

/**
 * Information about a single user.
 * @typedef {Object} UserInfo
 * 
 * @property {string} id The ID of the user.
 * @property {string} name The name of the user.
 * @property {string} tag The tag of the user.
 */

/**
/**
 * 
 * @param {User | GuildMember} user
 * @returns {UserInfo}
 */
function getUserInfo(user) {
  if (user instanceof GuildMember) {
    user = user.user;
  }
  return {
    id: user.id,
    name: user.displayName,
    tag: user.tag,
  };
}
module.exports.getUserInfo = getUserInfo;
