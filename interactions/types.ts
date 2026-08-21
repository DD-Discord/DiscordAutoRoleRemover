import { SlashCommandBuilder, ChatInputCommandInteraction, AutocompleteInteraction, ButtonInteraction, ModalSubmitInteraction } from "discord.js";

export interface Command {
  name: string;
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<unknown>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<unknown>;
}

export interface Button {
  name: string;
  execute: (interaction: ButtonInteraction) => Promise<unknown>;
}

export interface Modal {
  name: string;
  execute: (interaction: ModalSubmitInteraction) => Promise<unknown>;
}
