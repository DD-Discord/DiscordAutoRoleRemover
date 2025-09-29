const { Client, GatewayIntentBits } = require("discord.js");
const { deployCommands, handleCommand } = require("./deploy-commands");
const config = require("./config");
const { maybeUpdateRoles } = require("./logic");

const client = new Client({
  intents: [
		GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
	],
});

client.once("clientReady", () => {
  console.log("Discord bot is ready! 🤖");
});

client.on("guildAvailable", async (guild) => {
  await deployCommands({ guildId: guild.id });
});

client.on('messageCreate', async (message) => {
  if (message.channel != null) {
    maybeRepost(message.channel, message).catch(console.error);
  }
});

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  await maybeUpdateRoles(oldMember, newMember);
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isCommand()) {
    try {
      await handleCommand(interaction);
    } catch (error) {
      console.error(error);
    }
  }
});
client.login(config.DISCORD_TOKEN);
