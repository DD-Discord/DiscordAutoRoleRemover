import { REST, Routes, ChatInputCommandInteraction, AutocompleteInteraction } from "discord.js";
import { commands } from "./commands/index.js";
import { config } from "../config.js";

const commandsData = Object.values(commands).map((command) => command.data);

const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);

export interface DeployCommandsProps {
  guildId: string;
}

export async function deployCommands({ guildId }: DeployCommandsProps): Promise<void> {
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
    if (error && typeof error === 'object' && 'rawError' in error) {
      console.error('Discord validation errors:', JSON.stringify((error as { rawError: unknown }).rawError, null, 2));
    }
  }
}

export async function handleCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  try {
    const { commandName } = interaction;
    console.log("Handle command %s in %s", commandName, interaction.guildId)
    if (commands[commandName]) {
      await commands[commandName].execute(interaction);
      return true;
    }
  } catch (error) {
    console.error('Command error:', error);
    return true;
  }
  return false;
}

export async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<boolean> {
  try {
    const { commandName } = interaction;
    if (commands[commandName] && commands[commandName].autocomplete) {
      await commands[commandName].autocomplete(interaction);
      return true;
    }
  } catch (error) {
    console.error('Autocomplete error:', error);
    return true;
  }
  return false;
}
