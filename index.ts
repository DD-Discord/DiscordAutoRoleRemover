import { Client, GatewayIntentBits, Events, Guild } from "discord.js";
import * as interactions from "./interactions/index.js";
import { config } from "./config.js";
import { maybeUpdateRoles, roleRemoverData } from "./logic/update.js";

const client = new Client({
  intents: [
		GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
	],
});

client.once(Events.ClientReady, () => {
  console.log("Discord bot is ready! 🤖");
});

async function setupGuild(guild: Guild): Promise<void> {
  roleRemoverData.register({ guildId: guild.id })
  await interactions.deploy({ guildId: guild.id });
}

// GuildAvailable covers guilds the bot is already in (Discord sends them as
// unavailable stubs in the initial READY payload, then flips them available
// shortly after). GuildCreate covers the bot joining a brand-new guild while
// already running - a separate event, only emitted for that case.
client.on(Events.GuildAvailable, setupGuild);
client.on(Events.GuildCreate, setupGuild);

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  await maybeUpdateRoles(oldMember, newMember);
});

client.on(Events.InteractionCreate, async (interaction) => {
  const handled = await interactions.handle(interaction);
  if (!handled) {
    console.warn('Unhandled interaction', interaction);
  }
});
client.login(config.DISCORD_TOKEN);
