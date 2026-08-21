import { ButtonInteraction } from "discord.js";
import { buttons } from "./buttons/index.js";

export async function handleButton(interaction: ButtonInteraction): Promise<boolean> {
  try {
    const { customId } = interaction;
    const buttonName = customId.split('/')[0]!;
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
