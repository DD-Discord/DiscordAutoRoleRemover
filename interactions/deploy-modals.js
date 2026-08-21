const { ModalInteraction } = require("discord.js");
const { modals } = require("./modals");

/**
 * @param {ModalInteraction} interaction
 */
module.exports.handleModal = async function handleModal(interaction) {
  try {
    const { customId } = interaction;
    const modalName = customId.split('/')[0];
    console.log("Handle modal %s (%s) in %s", modalName, customId, interaction.guildId)
    if (modals[modalName]) {
      await modals[modalName].execute(interaction);
      return true;
    }
  } catch (error) {
    console.error('Modal error:', error);
    return true;
  }
  return false;
}
