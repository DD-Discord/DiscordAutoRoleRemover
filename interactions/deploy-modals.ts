import { ModalSubmitInteraction } from "discord.js";
import { modals } from "./modals/index.js";

export async function handleModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  try {
    const { customId } = interaction;
    const modalName = customId.split('/')[0]!;
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
