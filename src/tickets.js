const {
  ActionRowBuilder,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const { addVerificationSubcommand } = require('./verification');
const {
  addRecruitmentSetupSubcommand,
  recruitmentCommand,
} = require('./recruitment');

const ticketTypes = [
  {
    value: 'pomoc',
    label: '❓ Pytania ogólne',
    description: 'Zapytaj o zasady, serwer lub przebieg rozgrywki',
  },
  {
    value: 'eh',
    label: '🚘 Sprawa z EH',
    description: 'Opisz problem z pojazdem, mechaniką albo sytuacją w grze',
  },
  {
    value: 'discord',
    label: '💬 Zdarzenie na Discordzie',
    description: 'Przekaż administracji informację o zachowaniu lub problemie',
  },
  {
    value: 'techniczne',
    label: '🛠️ Kłopot techniczny',
    description: 'Zgłoś błąd z kontem, rangą albo dostępem do serwera',
  },
  {
    value: 'odwolanie',
    label: '⚖️ Odwołanie od kary',
    description: 'Przedstaw swoją sytuację do ponownego rozpatrzenia',
  },
  {
    value: 'wspolpraca',
    label: '🤝 Propozycja współpracy',
    description: 'Skontaktuj się z nami w sprawie wspólnego projektu',
  },
];

const ticketCommands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Konfiguruje funkcje bota.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('tickets')
        .setDescription('Ustawia panel i dostęp do zgłoszeń.')
        .addChannelOption((option) =>
          option
            .setName('kanal')
            .setDescription('Kanał, w którym bot opublikuje panel.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName('kategoria')
            .setDescription('Kategoria Discorda dla kanałów zgłoszeń.')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true),
        )
        .addRoleOption((option) =>
          option
            .setName('rola')
            .setDescription('Rola, która może przeglądać i obsługiwać zgłoszenia.')
            .setRequired(true),
        )
        .addRoleOption((option) =>
          option
            .setName('rola-2')
            .setDescription('Dodatkowa rola z dostępem do zgłoszeń.')
            .setRequired(false),
        )
        .addRoleOption((option) =>
          option
            .setName('rola-3')
            .setDescription('Kolejna rola z dostępem do zgłoszeń.')
            .setRequired(false),
        ),
    )
    .addSubcommand(addVerificationSubcommand)
    .addSubcommand(addRecruitmentSetupSubcommand),
  new SlashCommandBuilder()
    .setName('zamknij')
    .setDescription('Zamyka prywatne zgłoszenie, w którym użyto komendy.'),
  recruitmentCommand,
].map((command) => command.toJSON());

async function handleTicketInteraction(interaction, client) {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'setup' && interaction.options.getSubcommand() === 'tickets') {
      await setupTickets(interaction);
    } else if (interaction.commandName === 'zamknij') {
      await closeTicket(interaction);
    }
  } else if (interaction.isStringSelectMenu() && interaction.customId.startsWith('otworz-ticket:')) {
    await createTicket(interaction, client);
  }
}

async function setupTickets(interaction) {
  if (!interaction.guild || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: 'Konfigurację zgłoszeń może zmienić tylko administrator serwera.',
      ephemeral: true,
    });
    return;
  }

  const supportRoleIds = [
    ...new Set(
      ['rola', 'rola-2', 'rola-3']
        .map((optionName) => interaction.options.getRole(optionName))
        .filter(Boolean)
        .map((role) => role.id),
    ),
  ];

  if (supportRoleIds.includes(interaction.guild.roles.everyone.id)) {
    await interaction.reply({
      content: 'Nie można przyznać dostępu wszystkim. Wybierz role zespołu obsługi zgłoszeń.',
      ephemeral: true,
    });
    return;
  }

  const targetChannel = interaction.options.getChannel('kanal', true);
  const category = interaction.options.getChannel('kategoria', true);
  if (targetChannel.type !== ChannelType.GuildText || category.type !== ChannelType.GuildCategory) {
    await interaction.reply({
      content: 'Wybierz tekstowy kanał na panel i kategorię dla zgłoszeń.',
      ephemeral: true,
    });
    return;
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`otworz-ticket:${category.id}:${supportRoleIds.join(',')}`)
    .setPlaceholder('Wybierz rodzaj sprawy...')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(ticketTypes);

  const panel = new EmbedBuilder()
    .setColor(0xb72323)
    .setTitle('Biuro spraw • Frakcyjny Bot Poznań RP')
    .setDescription(
      [
        'Wskaż temat z listy, aby rozpocząć rozmowę z ekipą.',
        '',
        'Bot przygotuje osobny kanał widoczny dla Ciebie i osób obsługujących zgłoszenia. Wybierz kategorię najlepiej pasującą do sprawy.',
      ].join('\n'),
    );

  await targetChannel.send({
    embeds: [panel],
    components: [new ActionRowBuilder().addComponents(selectMenu)],
  });

  await interaction.reply({
    content: `Panel zgłoszeń opublikowano na ${targetChannel}. Kanały będą tworzone w kategorii ${category}.`,
    ephemeral: true,
  });
}

async function createTicket(interaction, client) {
  const ticketType = ticketTypes.find((type) => type.value === interaction.values[0]);
  if (!ticketType || !interaction.guild) {
    await interaction.reply({
      content: 'Nie udało się rozpoznać wybranej kategorii zgłoszenia.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const [, categoryId, supportRoleIdsText] = interaction.customId.split(':');
  const supportRoleIds = [...new Set(supportRoleIdsText.split(',').filter(Boolean))];
  if (supportRoleIds.length === 0 || supportRoleIds.length > 3) {
    await interaction.editReply({
      content: 'Panel jest nieprawidłowo skonfigurowany. Poproś administratora o ponowne użycie `/setup tickets`.',
    });
    return;
  }

  const channels = await interaction.guild.channels.fetch();
  const existingTicket = channels.find(
    (channel) =>
      channel?.type === ChannelType.GuildText &&
      channel.topic?.includes(`ticket-owner=${interaction.user.id};`) &&
      channel.topic.includes('ticket-status=open'),
  );

  if (existingTicket) {
    await interaction.editReply({
      content: `Masz już otwarte zgłoszenie: ${existingTicket}.`,
    });
    return;
  }

  const username = interaction.user.username
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20);
  const channelName = `ticket-${ticketType.value}-${username || 'uzytkownik'}`;
  const topic = `ticket-owner=${interaction.user.id};ticket-support=${supportRoleIds.join(',')};ticket-type=${ticketType.value};ticket-status=open`;
  const sharedPermissions = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AttachFiles,
  ];
  const channel = await interaction.guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: categoryId === 'brak' ? undefined : categoryId,
    topic,
    permissionOverwrites: [
      {
        id: interaction.guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: interaction.user.id,
        allow: sharedPermissions,
      },
      ...supportRoleIds.map((roleId) => ({
        id: roleId,
        allow: sharedPermissions,
      })),
      {
        id: client.user.id,
        allow: [
          ...sharedPermissions,
          PermissionFlagsBits.ManageChannels,
        ],
      },
    ],
  });

  await channel.send({
    content: [
      `Cześć <@${interaction.user.id}>! Twoje zgłoszenie: **${ticketType.label}**.`,
      'Opisz dokładnie swoją sprawę — zespół wsparcia odpowie tutaj.',
      'Aby zamknąć zgłoszenie, użyj komendy `/zamknij`.',
      supportRoleIds.map((roleId) => `<@&${roleId}>`).join(' '),
    ].join('\n'),
    allowedMentions: {
      users: [interaction.user.id],
      roles: supportRoleIds,
    },
  });

  await interaction.editReply({
    content: `Utworzono Twoje prywatne zgłoszenie: ${channel}.`,
  });
}

async function closeTicket(interaction) {
  const channel = interaction.channel;
  const ticket = channel?.topic?.match(
    /^ticket-owner=(\d+);ticket-support=([\d,]+);ticket-type=([a-z0-9_-]+);ticket-status=(open|closed)$/,
  );

  if (!interaction.guild || channel?.type !== ChannelType.GuildText || !ticket) {
    await interaction.reply({
      content: 'Tej komendy można użyć tylko w kanale zgłoszenia.',
      ephemeral: true,
    });
    return;
  }

  const [, ownerId, supportRoleIdsText, , status] = ticket;
  const supportRoleIds = supportRoleIdsText.split(',');
  if (status === 'closed') {
    await interaction.reply({
      content: 'To zgłoszenie jest już zamknięte.',
      ephemeral: true,
    });
    return;
  }

  const isOwner = interaction.user.id === ownerId;
  const isSupport = supportRoleIds.some((roleId) => hasRole(interaction, roleId));
  const isAdministrator = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);

  if (!isOwner && !isSupport && !isAdministrator) {
    await interaction.reply({
      content: 'Tylko autor zgłoszenia, zespół wsparcia lub administrator może je zamknąć.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  await channel.permissionOverwrites.edit(ownerId, {
    ViewChannel: false,
    SendMessages: false,
  });
  await channel.setName(`zamkniety-${channel.name}`);
  await channel.setTopic(channel.topic.replace('ticket-status=open', 'ticket-status=closed'));
  await channel.send({
    content: `Zgłoszenie zamknął <@${interaction.user.id}>.`,
    allowedMentions: { users: [interaction.user.id] },
  });
  await interaction.editReply({
    content: 'Zgłoszenie zostało zamknięte. Kanał pozostaje dostępny dla zespołu wsparcia.',
  });
}

function hasRole(interaction, roleId) {
  const roles = interaction.member?.roles;
  return Array.isArray(roles) ? roles.includes(roleId) : Boolean(roles?.cache?.has(roleId));
}

module.exports = {
  ticketCommands,
  handleTicketInteraction,
};
