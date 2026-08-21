import { deployCommands, handleCommand, handleAutocomplete, DeployCommandsProps } from "./deploy-commands.js";
import { handleButton } from "./deploy-buttons.js";
import { handleModal } from "./deploy-modals.js";
import { Interaction } from "discord.js";

export function deploy(props: DeployCommandsProps): Promise<void> {
  return deployCommands(props)
}

/**
 * @returns Was the interaction handled?
 */
export async function handle(interaction: Interaction): Promise<boolean> {
  if (interaction.isChatInputCommand()) {
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
