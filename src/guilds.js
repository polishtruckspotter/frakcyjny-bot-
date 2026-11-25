const guilds = [
  {
    id: '1562984483190345892',
    name: 'KGP',
    units: ['KPP', 'WRD', 'OPP'],
  },
  {
    id: '1557401688158117958',
    name: 'BOA',
    units: ['BOA'],
  },
];

module.exports = {
  guilds,
  guildById: Object.fromEntries(guilds.map((guild) => [guild.id, guild])),
};
