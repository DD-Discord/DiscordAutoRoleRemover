const { REST, Routes, CommandInteraction } = require("discord.js");
const { commands } = require("./commands");
const config = require("./config");

const commandsData = Object.values(commands).map((command) => command.data);

const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);

/**
 * @typedef DeployCommandsProps
 * @property {string} guildId
 */

/**
 * @param {DeployCommandsProps}
 */
module.exports.deployCommands = async function deployCommands({ guildId }) {
  try {
    console.log("Started refreshing commands in %s.", guildId);

    await rest.put(
      Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, guildId),
      {
        body: commandsData,
      }
    );

    console.log("Successfully reloaded commands in %s.", guildId);
  } catch (error) {
    console.error(error);
  }
}

/**
 * @param {CommandInteraction} interaction
 */
module.exports.handleCommand = async function handleCommand(interaction) {
  try {
    /** @type {{commandName: keyof commands}} */
    const { commandName } = interaction;
    console.log("Handle command %s in %s", commandName, interaction.guildId)
    if (commands[commandName]) {
      commands[commandName].execute(interaction);
    }
  } catch (error) {
    console.error(error);
  }
}
