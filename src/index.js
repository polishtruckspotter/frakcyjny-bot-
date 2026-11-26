require('dotenv').config();

const { Client, Events, GatewayIntentBits, Partials } = require('discord.js');
const { ticketCommands, handleTicketInteraction } = require('./tickets');
const { handleVerificationInteraction } = require('./verification');
const {
  handleRecruitmentInteraction,
  initializeRecruitmentStore,
  retryUnpublishedApplications,
} = require('./recruitment');
const { guilds } = require('./guilds');

const token = process.env.DISCORD_TOKEN || process.env.DISCORDTOKEN;

if (!token) {
  throw new Error('Brakuje DISCORD_TOKEN (lub DISCORDTOKEN). Ustaw token bota w zmiennych środowiskowych.');
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, async (readyClient) => {
  for (const target of guilds) {
    try {
      const guild = await readyClient.guilds.fetch(target.id);
      await guild.commands.set(ticketCommands);
      console.log(`Komendy zarejestrowano na serwerze ${target.name} (${target.id}).`);
    } catch (error) {
      console.error(`Nie udało się zarejestrować komend na serwerze ${target.name} (${target.id}). Sprawdź, czy bot jest na serwerze i ma dostęp do komend aplikacji.`, error);
    }
  }

  try {
    await retryUnpublishedApplications(readyClient);
    readyClient.user.setPresence({
      activities: [{ name: 'Frakcyjny Bot Poznań RP' }],
      status: 'online',
    });
    console.log(`Frakcyjny Bot Poznań RP działa jako ${readyClient.user.tag}`);
  } catch (error) {
    console.error('Bot zalogował się, ale nie udało się dokończyć konfiguracji po uruchomieniu:', error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    await handleTicketInteraction(interaction, client);
    await handleVerificationInteraction(interaction, client);
    await handleRecruitmentInteraction(interaction, client);
  } catch (error) {
    console.error('Błąd podczas obsługi interakcji Discorda:', error);

    if (!interaction.isRepliable()) {
      return;
    }

    const reply = { content: 'Wystąpił błąd. Spróbuj ponownie albo skontaktuj się z administracją.' };
    if (interaction.guildId) {
      reply.ephemeral = true;
    }

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    } catch (replyError) {
      console.error('Nie udało się wysłać informacji o błędzie:', replyError);
    }
  }
});

async function startBot() {
  await initializeRecruitmentStore();
  await client.login(token);
}

startBot().catch((error) => {
  console.error('Nie udało się uruchomić bota:', error);
  client.destroy();
  process.exitCode = 1;
});
