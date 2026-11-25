const { randomInt, randomUUID } = require('node:crypto');
const {
  ActionRowBuilder,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  Routes,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const challengeLifetime = 5 * 60 * 1000;
const challenges = new Map();

function addVerificationSubcommand(subcommand) {
  return subcommand
    .setName('weryfikacja')
    .setDescription('Konfiguruje panel matematycznej weryfikacji.')
    .addChannelOption((option) =>
      option
        .setName('kanal')
        .setDescription('Kanał, na którym pojawi się panel weryfikacji.')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    )
    .addRoleOption((option) =>
      option
        .setName('rola-dodana-1')
        .setDescription('Pierwsza rola nadawana po poprawnej odpowiedzi.')
        .setRequired(true),
    )
    .addRoleOption((option) =>
      option
        .setName('rola-dodana-2')
        .setDescription('Druga rola nadawana po poprawnej odpowiedzi.')
        .setRequired(true),
    )
    .addRoleOption((option) =>
      option
        .setName('rola-usuwana')
        .setDescription('Rola zdejmowana po poprawnej odpowiedzi.')
        .setRequired(true),
    );
}

async function handleVerificationInteraction(interaction, client) {
  if (
    interaction.isChatInputCommand() &&
    interaction.commandName === 'setup' &&
    interaction.options.getSubcommand() === 'weryfikacja'
  ) {
    await setupVerification(interaction);
    return true;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('verify:start:')) {
    await startVerification(interaction);
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('verify:answer:')) {
    await finishVerification(interaction, client);
    return true;
  }

  return false;
}

async function setupVerification(interaction) {
  if (!interaction.guild || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: 'Konfigurację weryfikacji może zmienić tylko administrator serwera.',
      ephemeral: true,
    });
    return;
  }

  const channel = interaction.options.getChannel('kanal', true);
  const roles = [
    interaction.options.getRole('rola-dodana-1', true),
    interaction.options.getRole('rola-dodana-2', true),
    interaction.options.getRole('rola-usuwana', true),
  ];
  const roleIds = roles.map((role) => role.id);

  if (channel.type !== ChannelType.GuildText) {
    await interaction.reply({
      content: 'Wybierz tekstowy kanał Discorda dla panelu.',
      ephemeral: true,
    });
    return;
  }

  if (
    roleIds.includes(interaction.guild.roles.everyone.id) ||
    new Set(roleIds).size !== roleIds.length
  ) {
    await interaction.reply({
      content: 'Wybierz trzy różne role. Rola @everyone nie może być użyta.',
      ephemeral: true,
    });
    return;
  }

  const [verifiedRoleOne, verifiedRoleTwo, roleToRemove] = roleIds;
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`verify:start:${verifiedRoleOne}:${verifiedRoleTwo}:${roleToRemove}`)
    .setPlaceholder('Otwórz weryfikację...')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions({
      label: 'Rozpocznij weryfikację',
      value: 'start',
      description: 'Odpowiedz na krótkie działanie matematyczne',
    });
  const panel = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Weryfikacja • Frakcyjny Bot Poznań RP')
    .setDescription(
      'Aby uzyskać dostęp do serwera, wybierz opcję z listy i rozwiąż krótkie działanie.',
    );

  await channel.send({
    embeds: [panel],
    components: [new ActionRowBuilder().addComponents(selectMenu)],
  });
  await interaction.reply({
    content: `Panel weryfikacji opublikowano na ${channel}.`,
    ephemeral: true,
  });
}

async function startVerification(interaction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: 'Weryfikacja jest dostępna tylko na serwerze.',
      ephemeral: true,
    });
    return;
  }

  const [, , verifiedRoleOne, verifiedRoleTwo, roleToRemove] = interaction.customId.split(':');
  const roleIds = [verifiedRoleOne, verifiedRoleTwo, roleToRemove];
  if (
    roleIds.some((roleId) => !/^\d+$/.test(roleId ?? '')) ||
    new Set(roleIds).size !== roleIds.length
  ) {
    await interaction.reply({
      content: 'Panel jest nieprawidłowo skonfigurowany. Poproś administratora o ponowne użycie `/setup weryfikacja`.',
      ephemeral: true,
    });
    return;
  }

  const now = Date.now();
  for (const [nonce, challenge] of challenges) {
    if (
      challenge.expiresAt <= now ||
      (challenge.guildId === interaction.guild.id && challenge.userId === interaction.user.id)
    ) {
      challenges.delete(nonce);
    }
  }

  const firstNumber = randomInt(12, 90);
  const secondNumber = randomInt(12, 90);
  const nonce = randomUUID();
  challenges.set(nonce, {
    guildId: interaction.guild.id,
    userId: interaction.user.id,
    answer: firstNumber + secondNumber,
    verifiedRoleIds: [verifiedRoleOne, verifiedRoleTwo],
    roleToRemove,
    expiresAt: now + challengeLifetime,
  });

  const answerField = new TextInputBuilder()
    .setCustomId('wynik')
    .setLabel(`Ile wynosi ${firstNumber} + ${secondNumber}?`)
    .setPlaceholder('Wpisz wynik działania')
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(3)
    .setRequired(true);
  const modal = new ModalBuilder()
    .setCustomId(`verify:answer:${nonce}`)
    .setTitle('Weryfikacja konta')
    .addComponents(new ActionRowBuilder().addComponents(answerField));

  await interaction.showModal(modal);
}

async function finishVerification(interaction, client) {
  const nonce = interaction.customId.slice('verify:answer:'.length);
  const challenge = challenges.get(nonce);

  if (
    !challenge ||
    challenge.expiresAt <= Date.now() ||
    challenge.guildId !== interaction.guildId ||
    challenge.userId !== interaction.user.id
  ) {
    challenges.delete(nonce);
    await interaction.reply({
      content: 'Ta weryfikacja wygasła. Wróć do panelu i rozpocznij ją ponownie.',
      ephemeral: true,
    });
    return;
  }

  challenges.delete(nonce);
  const answer = interaction.fields.getTextInputValue('wynik').trim();
  if (!/^\d+$/.test(answer) || Number(answer) !== challenge.answer) {
    await interaction.reply({
      content: 'Wynik jest niepoprawny. Rozpocznij weryfikację ponownie i spróbuj jeszcze raz.',
      ephemeral: true,
    });
    return;
  }

  const memberRoleIds = Array.isArray(interaction.member?.roles) ? interaction.member.roles : [];
  if (!memberRoleIds.includes(challenge.roleToRemove)) {
    await interaction.reply({
      content: 'Nie masz roli wymagającej weryfikacji. Jeśli to pomyłka, skontaktuj się z administracją.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const reason = 'Użytkownik ukończył weryfikację matematyczną.';
  try {
    for (const roleId of challenge.verifiedRoleIds) {
      await client.rest.put(
        Routes.guildMemberRole(challenge.guildId, interaction.user.id, roleId),
        { reason },
      );
    }
    await client.rest.delete(
      Routes.guildMemberRole(challenge.guildId, interaction.user.id, challenge.roleToRemove),
      { reason },
    );
  } catch (error) {
    console.error('Nie udało się zmienić ról po weryfikacji:', error);
    await interaction.editReply({
      content: 'Wynik jest poprawny, ale nie udało się zaktualizować ról. Poproś administrację o sprawdzenie uprawnień i hierarchii ról; część zmian mogła już zostać zastosowana.',
    });
    return;
  }

  await interaction.editReply({
    content: `Weryfikacja zakończona. Nadano role <@&${challenge.verifiedRoleIds[0]}> i <@&${challenge.verifiedRoleIds[1]}>.`,
    allowedMentions: { roles: challenge.verifiedRoleIds },
  });
}

module.exports = {
  addVerificationSubcommand,
  handleVerificationInteraction,
};
