const { randomUUID } = require('node:crypto');
const { mkdir, readFile, rename, writeFile } = require('node:fs/promises');
const path = require('node:path');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { guildById } = require('./guilds');

const storePath = path.join(__dirname, '..', 'data', 'recruitment.json');
const questionsByUnit = {
  KPP: [
    'Dlaczego chcesz dołączyć do KPP?',
    'Jak zadbasz o realizm podczas patrolu RP?',
    'Jak zareagujesz na błąd swój lub kolegi?',
    'Jak współpracujesz z innymi służbami?',
    'Jakie masz doświadczenie i dyspozycyjność?',
    'Jak rozwiązujesz spór zgodnie z regulaminem?',
    'Jak rozmawiasz spokojnie z mieszkańcem?',
    'Jak dokumentujesz interwencję w RP?',
    'Czego chcesz się nauczyć w KPP?',
  ],
  WRD: [
    'Dlaczego interesuje Cię służba w WRD?',
    'Jak prowadzisz kontrolę według reguł RP?',
    'Jak zachowasz bezstronność w interwencji?',
    'Jak zadbasz o dobrą dokumentację zdarzenia?',
    'Jakie masz doświadczenie i dyspozycyjność?',
    'Jak reagujesz na spór o pierwszeństwo?',
    'Jak oceniasz sytuację, nie łamiąc zasad RP?',
    'Jak współpracujesz przy zdarzeniu drogowym?',
    'Czego chcesz się nauczyć w WRD?',
  ],
  OPP: [
    'Dlaczego chcesz dołączyć do OPP?',
    'Jak rozumiesz dyscyplinę i współpracę?',
    'Co zrobisz, gdy polecenie łamie zasady RP?',
    'Jak zachowasz spokój w trudnej scenie RP?',
    'Jakie masz doświadczenie i dyspozycyjność?',
    'Jak dbasz o jasną komunikację w zespole?',
    'Jak zareagujesz na konflikt w zespole?',
    'Jak trzymasz się zasad podczas sceny RP?',
    'Czego chcesz nauczyć się w OPP?',
  ],
  BOA: [
    'Dlaczego chcesz dołączyć do BOA?',
    'Jak rozumiesz odpowiedzialność w BOA?',
    'Jak dbasz o komunikację i współpracę?',
    'Co zrobisz, gdy scena łamie zasady RP?',
    'Jakie masz doświadczenie i dyspozycyjność?',
    'Jak działasz spokojnie pod presją?',
    'Jak budujesz zaufanie w zespole?',
    'Jak rozwiązujesz różnicę zdań w zespole?',
    'Jakie cele masz w rekrutacji do BOA?',
  ],
};

let store;
let writeQueue = Promise.resolve();

function addRecruitmentSetupSubcommand(subcommand) {
  return subcommand
    .setName('rekrutacja')
    .setDescription('Ustawia logi i role procesu rekrutacji.')
    .addStringOption((option) =>
      option
        .setName('organizacja')
        .setDescription('Organizacja obsługiwana na tym serwerze.')
        .addChoices(
          { name: 'KGP', value: 'KGP' },
          { name: 'BOA', value: 'BOA' },
        )
        .setRequired(true),
    )
    .addChannelOption((option) =>
      option
        .setName('kanal-panelu')
        .setDescription('Kanał, na którym kandydaci rozpoczną rekrutację.')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    )
    .addChannelOption((option) =>
      option
        .setName('kanal-log')
        .setDescription('Prywatny kanał, w którym zespół ocenia zgłoszenia.')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    )
    .addRoleOption((option) =>
      option
        .setName('rola-recenzenta')
        .setDescription('Rola uprawniona do rozpatrywania kandydatur.')
        .setRequired(true),
    )
    .addRoleOption((option) =>
      option
        .setName('rola-recenzenta-2')
        .setDescription('Dodatkowa rola uprawniona do oceny.')
        .setRequired(false),
    )
    .addRoleOption((option) =>
      option
        .setName('rola-kpp')
        .setDescription('Rola nadawana po przyjęciu do KPP.')
        .setRequired(false),
    )
    .addRoleOption((option) =>
      option
        .setName('rola-wrd')
        .setDescription('Rola nadawana po przyjęciu do WRD.')
        .setRequired(false),
    )
    .addRoleOption((option) =>
      option
        .setName('rola-opp')
        .setDescription('Rola nadawana po przyjęciu do OPP.')
        .setRequired(false),
    )
    .addRoleOption((option) =>
      option
        .setName('rola-boa')
        .setDescription('Rola nadawana po przyjęciu do BOA.')
        .setRequired(false),
    );
}

const recruitmentCommand = new SlashCommandBuilder()
  .setName('rekrutacja')
  .setDescription('Rozpoczyna lub wznawia prywatną kandydaturę.');

async function initializeRecruitmentStore() {
  if (store) {
    return;
  }

  await mkdir(path.dirname(storePath), { recursive: true });

  try {
    const contents = await readFile(storePath, 'utf8');
    const loaded = JSON.parse(contents);
    if (
      loaded?.version !== 1 ||
      !loaded.configs ||
      typeof loaded.configs !== 'object' ||
      Array.isArray(loaded.configs) ||
      !loaded.applications ||
      typeof loaded.applications !== 'object' ||
      Array.isArray(loaded.applications)
    ) {
      throw new Error('Plik danych rekrutacji ma nieobsługiwany format.');
    }
    store = loaded;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    store = { version: 1, configs: {}, applications: {} };
    await persistStore();
  }
}

async function handleRecruitmentInteraction(interaction, client) {
  if (!store) {
    throw new Error('Dane rekrutacji nie zostały załadowane.');
  }

  if (interaction.isChatInputCommand()) {
    if (
      interaction.commandName === 'setup' &&
      interaction.options.getSubcommand() === 'rekrutacja'
    ) {
      await setupRecruitment(interaction);
      return true;
    }
    if (interaction.commandName === 'rekrutacja') {
      await startOrResumeRecruitment(interaction, client);
      return true;
    }
  }

  if (!interaction.isStringSelectMenu() && !interaction.isModalSubmit() && !interaction.isButton()) {
    return false;
  }

  if (interaction.customId.startsWith('recruit:unit:')) {
    await chooseUnit(interaction);
    return true;
  }
  if (interaction.customId.startsWith('recruit:panel:')) {
    const profile = guildById[interaction.guildId];
    const unit = interaction.values[0];
    if (!profile?.units.includes(unit) || !store.configs[interaction.guildId]) {
      await interaction.reply({
        content: 'Ten panel jest nieprawidłowo skonfigurowany. Powiadom administrację.',
        ephemeral: true,
      });
      return true;
    }
    await startOrResumeRecruitment(interaction, client, unit);
    return true;
  }
  if (interaction.customId.startsWith('recruit:resume:')) {
    await resumeRecruitment(interaction);
    return true;
  }
  if (interaction.customId.startsWith('recruit:next:')) {
    await openNextQuestion(interaction);
    return true;
  }
  if (interaction.customId.startsWith('recruit:answer:')) {
    await saveAnswer(interaction, client);
    return true;
  }
  if (interaction.customId.startsWith('recruit:decision:')) {
    await openDecisionModal(interaction);
    return true;
  }
  if (interaction.customId.startsWith('recruit:reason:')) {
    await saveDecision(interaction, client);
    return true;
  }

  return false;
}

async function setupRecruitment(interaction) {
  const guildId = interaction.guildId;
  const profile = guildById[guildId];
  if (!profile || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: 'Konfigurację rekrutacji może zmienić administrator na serwerze KGP lub BOA.',
      ephemeral: true,
    });
    return;
  }
  const organization = interaction.options.getString('organizacja', true);
  if (organization !== profile.name) {
    await interaction.reply({
      content: `Ten serwer obsługuje organizację ${profile.name}.`,
      ephemeral: true,
    });
    return;
  }

  const panelChannel = interaction.options.getChannel('kanal-panelu', true);
  const logChannel = interaction.options.getChannel('kanal-log', true);
  const reviewerRoles = [
    interaction.options.getRole('rola-recenzenta', true),
    interaction.options.getRole('rola-recenzenta-2'),
  ].filter(Boolean);
  const acceptedRoles = Object.fromEntries(
    profile.units.map((unit) => [
      unit,
      interaction.options.getRole(`rola-${unit.toLowerCase()}`),
    ]),
  );
  const reviewerRoleIds = reviewerRoles.map((role) => role.id);
  const acceptedRoleIds = Object.values(acceptedRoles).filter(Boolean).map((role) => role.id);
  const roleIds = [...reviewerRoleIds, ...acceptedRoleIds];

  if (panelChannel.type !== ChannelType.GuildText || logChannel.type !== ChannelType.GuildText) {
    await interaction.reply({
      content: 'Wybierz tekstowy kanał na panel i tekstowy kanał logów.',
      ephemeral: true,
    });
    return;
  }

  if (
    roleIds.includes(interaction.guild.roles.everyone.id) ||
    profile.units.some((unit) => !acceptedRoles[unit]) ||
    new Set(reviewerRoleIds).size !== reviewerRoleIds.length ||
    new Set(acceptedRoleIds).size !== acceptedRoleIds.length
  ) {
    await interaction.reply({
      content: `Wybierz role recenzentów oraz osobną rolę po akceptacji dla: ${profile.units.join(', ')}. Nie używaj @everyone ani tej samej roli w kilku polach.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  store.configs[guildId] = {
    organization,
    panelChannelId: panelChannel.id,
    logChannelId: logChannel.id,
    reviewerRoleIds: reviewerRoles.map((role) => role.id),
    acceptedRoles: Object.fromEntries(
      Object.entries(acceptedRoles).map(([unit, role]) => [unit, role.id]),
    ),
  };
  await persistStore();

  const panel = new EmbedBuilder()
    .setColor(0x247a55)
    .setTitle(`Rekrutacja • ${organization}`)
    .setDescription(
      'Zgłoś swoją kandydaturę, wybierając jednostkę z listy. Formularz i odpowiedzi będą prowadzone prywatnie w DM.',
    );
  const unitMenu = new StringSelectMenuBuilder()
    .setCustomId(`recruit:panel:${guildId}`)
    .setPlaceholder('Wybierz jednostkę...')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      profile.units.map((unit) => ({
        label: unit,
        value: unit,
        description: `Rozpocznij kandydaturę do ${unit}`,
      })),
    );

  try {
    await panelChannel.send({
      embeds: [panel],
      components: [new ActionRowBuilder().addComponents(unitMenu)],
    });
  } catch (error) {
    console.error('Nie udało się opublikować panelu rekrutacyjnego:', error);
    await interaction.editReply({
      content: `Ustawienia zapisano, ale nie udało się opublikować panelu na ${panelChannel}. Sprawdź uprawnienia bota.`,
    });
    return;
  }

  await interaction.editReply({
    content: `Rekrutacja ${organization} skonfigurowana. Panel opublikowano na ${panelChannel}, a logi będą trafiać na ${logChannel}. Kandydaci mogą też użyć /rekrutacja.`,
  });
}

async function startOrResumeRecruitment(interaction, client, selectedUnit = null) {
  const profile = guildById[interaction.guildId];
  const config = store.configs[interaction.guildId];
  if (!profile || !config) {
    await interaction.reply({
      content: 'Rekrutacja nie jest jeszcze skonfigurowana na tym serwerze.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const existing = Object.values(store.applications).find(
    (application) =>
      application.guildId === interaction.guildId &&
      application.userId === interaction.user.id &&
      ['in_progress', 'submitted', 'pending_review', 'accepted'].includes(application.status),
  );

  if (existing?.status === 'in_progress') {
    try {
      await sendResumeMessage(interaction.user, existing, profile);
      await interaction.editReply({
        content: 'Wysłałem prywatną wiadomość z możliwością wznowienia kandydatury.',
      });
    } catch (error) {
      console.error('Nie udało się wysłać wiadomości rekrutacyjnej:', error);
      await interaction.editReply({
        content: 'Nie mogę wysłać Ci DM. Włącz prywatne wiadomości od członków serwera i spróbuj ponownie.',
      });
    }
    return;
  }

  if (
    (existing?.status === 'submitted' || existing?.status === 'pending_review') &&
    !existing.logMessageId
  ) {
    try {
      await publishApplication(existing, client);
      await interaction.editReply({
        content: 'Twoja kandydatura jest zapisana i przekazana do oceny.',
      });
    } catch (error) {
      console.error('Nie udało się opublikować kandydatury w logach:', error);
      await interaction.editReply({
        content: 'Kandydatura jest zapisana, ale nie udało się wysłać jej do logów. Powiadom administrację.',
      });
    }
    return;
  }

  if (existing) {
    await interaction.editReply({
      content: existing.status === 'accepted'
        ? 'Twoja kandydatura została już zaakceptowana.'
        : 'Twoja kandydatura jest już sprawdzana przez zespół.',
    });
    return;
  }

  const application = {
    id: randomUUID(),
    guildId: interaction.guildId,
    userId: interaction.user.id,
    organization: profile.name,
    unit: selectedUnit,
    status: 'in_progress',
    questionIndex: 0,
    answers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  store.applications[application.id] = application;
  await persistStore();

  try {
    await sendResumeMessage(interaction.user, application, profile);
    await interaction.editReply({
      content: 'Wysłałem DM z formularzem rekrutacyjnym. Odpowiedzi są prywatne.',
    });
  } catch (error) {
    delete store.applications[application.id];
    await persistStore();
    console.error('Nie udało się rozpocząć DM rekrutacyjnego:', error);
    await interaction.editReply({
      content: 'Nie mogę wysłać Ci DM. Włącz prywatne wiadomości od członków serwera i spróbuj ponownie.',
    });
  }
}

async function sendResumeMessage(user, application, profile) {
  const selectMenu = application.unit
    ? new StringSelectMenuBuilder()
      .setCustomId(`recruit:resume:${application.id}`)
      .setPlaceholder('Wznów formularz...')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions({
        label: 'Wróć do zapisanych odpowiedzi',
        value: 'resume',
        description: `Pytanie ${application.questionIndex + 1} z ${questionsByUnit[application.unit].length}`,
      })
    : createUnitMenu(application, profile);

  await user.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`Rekrutacja ${profile.name}`)
        .setDescription(
          application.unit
            ? `Twoje odpowiedzi są zapisane. Możesz wznowić od pytania ${application.questionIndex + 1}.`
            : 'Wybierz jednostkę, do której chcesz aplikować. Rozmowa odbywa się w tej prywatnej wiadomości.',
        ),
    ],
    components: [new ActionRowBuilder().addComponents(selectMenu)],
  });
}

function createUnitMenu(application, profile) {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`recruit:unit:${application.id}`)
    .setPlaceholder('Wybierz jednostkę...')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      profile.units.map((unit) => ({
        label: unit,
        value: unit,
        description: `Rozpocznij kandydaturę do ${unit}`,
      })),
    );
  return selectMenu;
}

async function chooseUnit(interaction) {
  const application = getOwnedApplication(interaction, 'in_progress');
  const profile = application && guildById[application.guildId];
  const unit = interaction.values[0];
  if (!application || !profile?.units.includes(unit)) {
    await interaction.reply({
      content: 'Nie udało się odczytać kandydatury. Użyj ponownie `/rekrutacja` na serwerze.',
    });
    return;
  }
  if (application.unit) {
    await interaction.reply({
      content: `Masz już wybraną jednostkę ${application.unit}. Wznów formularz poleceniem \`/rekrutacja\` na serwerze.`,
    });
    return;
  }

  application.unit = unit;
  application.questionIndex = 0;
  application.answers = [];
  application.updatedAt = new Date().toISOString();
  await persistStore();
  await interaction.showModal(createQuestionModal(application));
}

async function resumeRecruitment(interaction) {
  const application = getOwnedApplication(interaction, 'in_progress');
  if (!application?.unit || !questionsByUnit[application.unit]) {
    await interaction.reply({
      content: 'Nie udało się wznowić formularza. Użyj ponownie `/rekrutacja` na serwerze.',
    });
    return;
  }
  await interaction.showModal(createQuestionModal(application));
}

async function openNextQuestion(interaction) {
  const application = getOwnedApplication(interaction, 'in_progress');
  if (!application?.unit || application.questionIndex >= questionsByUnit[application.unit].length) {
    await interaction.reply({
      content: 'Nie znaleziono następnego pytania. Użyj `/rekrutacja` na serwerze, aby sprawdzić status.',
    });
    return;
  }
  await interaction.showModal(createQuestionModal(application));
}

function createQuestionModal(application) {
  const question = questionsByUnit[application.unit][application.questionIndex];
  const answer = new TextInputBuilder()
    .setCustomId('answer')
    .setLabel(question)
    .setPlaceholder('Wpisz swoją odpowiedź')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(400)
    .setRequired(true);

  return new ModalBuilder()
    .setCustomId(`recruit:answer:${application.id}:${application.questionIndex}`)
    .setTitle(`${application.unit} • pytanie ${application.questionIndex + 1}`)
    .addComponents(new ActionRowBuilder().addComponents(answer));
}

async function saveAnswer(interaction, client) {
  const [, , applicationId, questionIndexText] = interaction.customId.split(':');
  const application = store.applications[applicationId];
  if (
    !application ||
    application.userId !== interaction.user.id ||
    application.status !== 'in_progress' ||
    !application.unit ||
    Number(questionIndexText) !== application.questionIndex
  ) {
    await interaction.reply({ content: 'Ta kandydatura nie jest już aktywna.' });
    return;
  }

  const answer = interaction.fields.getTextInputValue('answer').trim();
  if (!answer) {
    await interaction.reply({ content: 'Odpowiedź nie może być pusta.' });
    return;
  }

  application.answers[application.questionIndex] = answer;
  application.questionIndex += 1;
  application.updatedAt = new Date().toISOString();
  const questions = questionsByUnit[application.unit];
  const isComplete = application.questionIndex >= questions.length;
  if (isComplete) {
    application.status = 'pending_review';
  }
  await persistStore();

  if (!isComplete) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`recruit:next:${application.id}`)
      .setPlaceholder('Kontynuuj formularz...')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions({
        label: 'Następne pytanie',
        value: 'next',
        description: `Pytanie ${application.questionIndex + 1} z ${questions.length}`,
      });
    await interaction.reply({
      content: `Odpowiedź zapisana. Zostało pytań: ${questions.length - application.questionIndex}.`,
      components: [new ActionRowBuilder().addComponents(menu)],
    });
    return;
  }

  await interaction.reply({
    content: 'Formularz zapisany i przekazany do oceny. Decyzję otrzymasz tutaj w DM.',
  });

  try {
    await publishApplication(application, client);
  } catch (error) {
    console.error('Nie udało się wysłać kandydatury do logów:', error);
    await interaction.followUp({
      content: 'Twoje odpowiedzi są zapisane. Nie udało się jeszcze powiadomić zespołu; bot ponowi próbę po restarcie.',
    });
  }
}

async function publishApplication(application, client) {
  if (application.logMessageId) {
    return;
  }
  const config = store.configs[application.guildId];
  if (!config) {
    throw new Error(`Brakuje konfiguracji rekrutacji dla serwera ${application.guildId}.`);
  }

  const channel = await client.channels.fetch(config.logChannelId);
  if (channel?.type !== ChannelType.GuildText) {
    throw new Error(`Kanał logów ${config.logChannelId} nie jest dostępny.`);
  }

  application.status = 'pending_review';
  await persistStore();
  const message = await channel.send({
    embeds: [buildApplicationEmbed(application)],
    components: [createReviewButtons(application.id)],
    allowedMentions: { parse: [] },
  });
  application.logChannelId = channel.id;
  application.logMessageId = message.id;
  await persistStore();
}

function buildApplicationEmbed(application) {
  const embed = new EmbedBuilder()
    .setColor(0xd19a28)
    .setTitle(`Kandydatura ${application.organization} • ${application.unit}`)
    .setDescription(
      `Kandydat: <@${application.userId}>\nID zgłoszenia: \`${application.id}\`\nStatus: ${application.status === 'pending_review' ? 'Oczekuje na decyzję' : application.status}`,
    )
    .addFields(
      questionsByUnit[application.unit].map((question, index) => ({
        name: `${index + 1}. ${question}`,
        value: application.answers[index] || 'Brak odpowiedzi',
      })),
    )
    .setTimestamp(new Date(application.updatedAt));

  if (application.decisionReason) {
    embed.addFields({
      name: application.status === 'accepted' ? 'Powód przyjęcia' : 'Powód odmowy',
      value: application.decisionReason,
    });
  }
  return embed;
}

function createReviewButtons(applicationId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`recruit:decision:accept:${applicationId}`)
      .setLabel('Akceptuj')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`recruit:decision:deny:${applicationId}`)
      .setLabel('Odrzuć')
      .setStyle(ButtonStyle.Danger),
  );
}

async function openDecisionModal(interaction) {
  const [, , decision, applicationId] = interaction.customId.split(':');
  const application = store.applications[applicationId];
  if (!['accept', 'deny'].includes(decision) || !canReview(interaction, application)) {
    await interaction.reply({
      content: 'Nie masz uprawnień do rozpatrzenia tej kandydatury.',
      ephemeral: true,
    });
    return;
  }
  if (application.status !== 'pending_review') {
    await interaction.reply({
      content: 'Ta kandydatura została już rozpatrzona.',
      ephemeral: true,
    });
    return;
  }

  const reason = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel(decision === 'accept' ? 'Powód przyjęcia' : 'Powód odmowy')
    .setPlaceholder('Wpisz krótkie uzasadnienie')
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(3)
    .setMaxLength(400)
    .setRequired(true);
  const modal = new ModalBuilder()
    .setCustomId(`recruit:reason:${decision}:${applicationId}`)
    .setTitle(decision === 'accept' ? 'Akceptacja kandydatury' : 'Odmowa kandydatury')
    .addComponents(new ActionRowBuilder().addComponents(reason));
  await interaction.showModal(modal);
}

async function saveDecision(interaction, client) {
  const [, , decision, applicationId] = interaction.customId.split(':');
  const application = store.applications[applicationId];
  if (
    !['accept', 'deny'].includes(decision) ||
    !canReview(interaction, application) ||
    application.status !== 'pending_review'
  ) {
    await interaction.reply({
      content: 'Nie możesz zmienić tej decyzji albo kandydatura została już rozpatrzona.',
      ephemeral: true,
    });
    return;
  }

  const reason = interaction.fields.getTextInputValue('reason').trim();
  if (!reason) {
    await interaction.reply({ content: 'Podaj uzasadnienie decyzji.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  if (decision === 'accept') {
    const roleId = store.configs[application.guildId]?.acceptedRoles[application.unit];
    if (!roleId) {
      throw new Error(`Brakuje roli akceptacji dla ${application.unit}.`);
    }
    await client.rest.put(
      Routes.guildMemberRole(application.guildId, application.userId, roleId),
      { reason: `Przyjęcie do ${application.unit}: ${reason.slice(0, 400)}` },
    );
  }

  application.status = decision === 'accept' ? 'accepted' : 'denied';
  application.decisionReason = reason;
  application.decidedBy = interaction.user.id;
  application.decidedAt = new Date().toISOString();
  application.updatedAt = application.decidedAt;
  await persistStore();

  try {
    const channel = await client.channels.fetch(application.logChannelId);
    const message = await channel.messages.fetch(application.logMessageId);
    await message.edit({ embeds: [buildApplicationEmbed(application)], components: [] });
  } catch (error) {
    console.error('Nie udało się zaktualizować wpisu w kanale logów:', error);
  }

  try {
    const applicant = await client.users.fetch(application.userId);
    const result = decision === 'accept' ? 'zaakceptowana' : 'odrzucona';
    await applicant.send(`Twoja kandydatura do ${application.unit} została ${result}.\nUzasadnienie: ${reason}`);
  } catch (error) {
    console.error('Nie udało się wysłać kandydatowi decyzji w DM:', error);
  }

  await interaction.editReply({
    content: decision === 'accept'
      ? 'Kandydatura zaakceptowana, rola została nadana, a decyzja zapisana.'
      : 'Kandydatura odrzucona, a decyzja zapisana.',
  });
}

function canReview(interaction, application) {
  if (!application || !interaction.guildId || interaction.guildId !== application.guildId) {
    return false;
  }
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return true;
  }
  const roles = interaction.member?.roles;
  const roleIds = Array.isArray(roles) ? roles : [...(roles?.cache?.keys() ?? [])];
  const reviewerRoleIds = store.configs[application.guildId]?.reviewerRoleIds ?? [];
  return reviewerRoleIds.some((roleId) => roleIds.includes(roleId));
}

function getOwnedApplication(interaction, requiredStatus) {
  const applicationId = interaction.customId.split(':').at(-1);
  const application = store.applications[applicationId];
  if (
    !application ||
    application.userId !== interaction.user.id ||
    application.status !== requiredStatus
  ) {
    return null;
  }
  return application;
}

async function retryUnpublishedApplications(client) {
  for (const application of Object.values(store.applications)) {
    if (!['submitted', 'pending_review'].includes(application.status) || application.logMessageId) {
      continue;
    }
    try {
      await publishApplication(application, client);
    } catch (error) {
      console.error(`Nie udało się ponowić publikacji kandydatury ${application.id}:`, error);
    }
  }
}

async function persistStore() {
  const contents = JSON.stringify(store, null, 2);
  const write = writeQueue.then(async () => {
    const temporaryPath = `${storePath}.tmp`;
    await mkdir(path.dirname(storePath), { recursive: true });
    await writeFile(temporaryPath, contents, 'utf8');
    await rename(temporaryPath, storePath);
  });
  writeQueue = write.catch(() => {});
  return write;
}

module.exports = {
  addRecruitmentSetupSubcommand,
  handleRecruitmentInteraction,
  initializeRecruitmentStore,
  recruitmentCommand,
  retryUnpublishedApplications,
};
