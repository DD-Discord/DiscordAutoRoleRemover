const { ButtonInteraction } = require("discord.js");
const { buttons } = require("./buttons");

/**
 * @param {ButtonInteraction} interaction
 */
module.exports.handleButton = async function handleButton(interaction) {
  try {
    const { customId } = interaction;
    const buttonName = customId.split('/')[0];
    console.log("Handle button %s (%s) in %s", buttonName, customId, interaction.guildId)
    if (buttons[buttonName]) {
      await buttons[buttonName].execute(interaction);
      return true;
    }
  } catch (error) {
    console.error('Button error:', error);
    return true;
  }
  return false;
}
