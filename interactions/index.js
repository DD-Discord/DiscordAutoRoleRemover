const { deployCommands, handleCommand, handleAutocomplete } = require("./deploy-commands");
const { handleButton } = require("./deploy-buttons");
const { handleModal } = require("./deploy-modals");
const { Interaction } = require("discord.js");

function deploy(props) {
  return deployCommands(props)
}
module.exports.deploy = deploy;

/**
 * @param {Interaction} interaction 
 * @returns {Promise<boolean>} Was the interaction handled?
 */
async function handle(interaction) {
  if (interaction.isCommand()) {
    return await handleCommand(interaction);
  }

  if (interaction.isAutocomplete()) {
    return await handleAutocomplete(interaction);
  }

  if (interaction.isButton()) {
    return await handleButton(interaction);
  }

  if (interaction.isModalSubmit()) {
    return await handleModal(interaction);
  }

  return false;
}
module.exports.handle = handle;