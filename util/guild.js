const { Guild } = require("discord.js");

/**
 * Information about a single guild.
 * @typedef {Object} GuildInfo
 * 
 * @property {string} id The ID of the guild.
 * @property {string} name The name of the guild.
 */

/**
/**
 * 
 * @param {Guild} guild
 * @returns {GuildInfo}
 */
function getGuildInfo(guild) {
  return {
    id: guild.id,
    name: guild.name,
  };
}
module.exports.getGuildInfo = getGuildInfo;
