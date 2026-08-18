import {
  ActivityType,
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  MessageType,
  REST,
  Routes,
  SlashCommandBuilder,
  TextChannel,
  WebhookMessageCreateOptions,
} from 'discord.js';
import { readFileSync } from 'fs';

// Load .env
const envContent = readFileSync('.env', 'utf8');
const env: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx > 0) {
    env[trimmed.substring(0, eqIdx)] = trimmed.substring(eqIdx + 1);
  }
}

const DISCORD_TOKEN = env.DISCORD_TOKEN;
const DISCORD_APP_ID = env.DISCORD_APP_ID;
const DISCORD_GUILD_ID = env.DISCORD_GUILD_ID;
const DISCORD_NETWORK_CHANNEL_ID = env.DISCORD_NETWORK_CHANNEL_ID;
const DISCORD_MATCHMAKING_ROLE_ID = env.DISCORD_MATCHMAKING_ROLE_ID;
const WORKER_URL = env.WORKER_URL;

interface ClientWithCommands extends Client {
  commands: Collection<string, SlashCommandBuilder>;
}

let networkChannel: TextChannel | null = null;
let client: ClientWithCommands;

async function init() {
  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    closeTimeout: 30000,
  }) as ClientWithCommands;

  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
    networkChannel = client.channels.cache.get(DISCORD_NETWORK_CHANNEL_ID) as TextChannel;
    client.user.setActivity('You', { type: ActivityType.Watching });
  });

  client.on(Events.Error, (err) => {
    console.log('DISCORD ERROR:');
    console.error(err);
  });

  await client.login(DISCORD_TOKEN);

  // Forward Discord messages to NetworkRoom
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || message.channel.id !== DISCORD_NETWORK_CHANNEL_ID) return;

    let suffix = '';
    if (message.type == MessageType.Reply) {
      const ref = await message.fetchReference();
      suffix = ' (replying to @' + ref.author.username + ')';
    }

    const content = '[DC] @' + message.author.username + suffix + ': ' + message.content;

    try {
      await fetch(`${WORKER_URL}/api/network/logToAll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, notDiscord: true }),
      });
    } catch (err) {
      console.error('Failed to forward to worker:', err);
    }
  });

  // Register slash commands
  client.commands = new Collection();
  const matchmakeCommand = new SlashCommandBuilder()
    .setName('matchmake')
    .setDescription('Gives you a pingable @Matchmaking role for 30 minutes.');
  client.commands.set(matchmakeCommand.name, matchmakeCommand);

  const rest = new REST().setToken(DISCORD_TOKEN);
  const commands = [];
  for (const [, cmd] of client.commands) {
    commands.push(cmd.toJSON());
  }
  await rest.put(Routes.applicationCommands(DISCORD_APP_ID), { body: commands });

  // Handle interactions
  const remMatchmakeRoleTimeout = new Map<string, NodeJS.Timeout>();

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'matchmake') {
      const guild = await client.guilds.fetch(DISCORD_GUILD_ID);
      const role = await guild.roles.fetch(DISCORD_MATCHMAKING_ROLE_ID);
      const member = await guild.members.fetch({ user: interaction.user, force: true });

      if (!role || !member) {
        return interaction.reply('Error occurred with fetching user or role.');
      }

      clearTimeout(remMatchmakeRoleTimeout.get(member.id));

      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role);
        await interaction.reply({ content: 'Removed!' });
      } else {
        await member.roles.add(role);
        if (interaction.guildId === DISCORD_GUILD_ID) {
          await interaction.reply({
            content: '<@&' + role.id + '> <@' + member.id + '> is now looking to play!',
          });
        } else {
          await interaction.reply({ content: 'Gave you the matchmaking role! (silently....)' });
        }
        remMatchmakeRoleTimeout.set(
          member.id,
          setTimeout(async () => {
            await member.roles.remove(role);
          }, 1000 * 60 * 30)
        );
      }
    }
  });
}

async function tryAlive() {
  if (!networkChannel || !client.isReady()) {
    try {
      await client.destroy();
    } catch (_) {}
    await init();
  }
}

// Keep alive check every minute
setInterval(tryAlive, 1000 * 60);

init().catch(console.error);
