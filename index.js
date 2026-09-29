const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  ChannelType,
  AuditLogEvent
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const http = require("http");

// ============================================================
// 🌌 MATI NEXUS BOT
// ============================================================

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
  console.error("❌ Falta DISCORD_TOKEN en Render.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.GuildMember
  ]
});

// ============================================================
// 💾 BASE DE DATOS
// ============================================================

const DATA_FILE = path.join(__dirname, "data.json");

let data = {
  users: {},
  guilds: {}
};

if (fs.existsSync(DATA_FILE)) {
  try {
    data = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );
  } catch {
    data = {
      users: {},
      guilds: {}
    };
  }
}

function saveData() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(data, null, 2)
    );
  } catch (err) {
    console.error("❌ Error guardando data.json:", err);
  }
}

function getGuildData(guildId) {
  if (!data.guilds[guildId]) {
    data.guilds[guildId] = {};
  }

  const defaults = {
    welcomeChannel: null,
    goodbyeChannel: null,
    inviteChannel: null,
    logChannel: null,
    ticketChannel: null,
    ticketCategory: null,
    autorole: null,
    prefix: "m.",
    welcomeEnabled: true,
    goodbyeEnabled: true,
    inviteEnabled: true,
    logsEnabled: true,
    antiLinks: false,
    antiSpam: false
  };

  for (const key of Object.keys(defaults)) {
    if (data.guilds[guildId][key] === undefined) {
      data.guilds[guildId][key] = defaults[key];
    }
  }

  return data.guilds[guildId];
}

function getUserData(userId) {
  if (!data.users[userId]) {
    data.users[userId] = {
      wallet: 0,
      bank: 0,
      xp: 0,
      level: 1,
      warns: 0,
      lastDaily: 0,
      lastWork: 0,
      lastCrime: 0,
      lastBeg: 0,
      lastRob: 0,
      lastSalary: 0,
      lastBonus: 0,
      lastIncome: 0,
      lastGig: 0,
      lastHustle: 0
    };
  }

  return data.users[userId];
}

// ============================================================
// 🛠️ FUNCIONES
// ============================================================

function makeEmbed(title, description) {
  return new EmbedBuilder()
    .setColor("#ff7ac8")
    .setTitle(title)
    .setDescription(description)
    .setFooter({
      text: "🌌 Mati Nexus BOT • Nexus System"
    })
    .setTimestamp();
}

function money(amount) {
  return `${Number(amount || 0).toLocaleString("es-ES")} 💰`;
}

function random(min, max) {
  return Math.floor(
    Math.random() * (max - min + 1)
  ) + min;
}

function isAdmin(member) {
  return member?.permissions?.has(
    PermissionsBitField.Flags.Administrator
  );
}

function getPrefix(guild) {
  return getGuildData(guild.id).prefix || "m.";
}

function cooldownText(ms) {
  const seconds = Math.ceil(ms / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  return rest
    ? `${minutes}m ${rest}s`
    : `${minutes}m`;
}

function truncate(text, max = 1000) {
  text = String(text || "");

  if (text.length <= max) {
    return text;
  }

  return text.slice(0, max - 3) + "...";
}

function findMember(guild, input) {
  if (!input) return null;

  const id = input.replace(/[<@!>]/g, "");

  return (
    guild.members.cache.get(id) ||
    guild.members.cache.find(
      m =>
        m.user.username.toLowerCase() ===
        input.toLowerCase()
    )
  );
}

function findChannel(guild, input) {
  if (!input) return null;

  const id = input.replace(/[<#>]/g, "");

  return guild.channels.cache.get(id);
}

function findRole(guild, input) {
  if (!input) return null;

  const id = input.replace(/[<@&>]/g, "");

  return (
    guild.roles.cache.get(id) ||
    guild.roles.cache.find(
      r =>
        r.name.toLowerCase() ===
        input.toLowerCase()
    )
  );
}

function addXP(userId, amount) {
  const user = getUserData(userId);

  user.xp += amount;

  let levelUp = false;

  while (user.xp >= user.level * 100) {
    user.xp -= user.level * 100;
    user.level++;
    levelUp = true;
  }

  saveData();

  return levelUp;
}

async function sendLog(guild, title, description) {
  const config = getGuildData(guild.id);

  if (!config.logsEnabled) return;
  if (!config.logChannel) return;

  const channel =
    guild.channels.cache.get(config.logChannel);

  if (!channel) return;

  await channel.send({
    embeds: [
      makeEmbed(
        `╔══ 📜 ${title} ══╗`,
        truncate(description, 3900)
      )
    ]
  }).catch(() => {});
}

async function getExecutor(
  guild,
  type,
  targetId
) {
  try {
    const logs =
      await guild.fetchAuditLogs({
        type,
        limit: 5
      });

    const entry =
      logs.entries.find(
        e =>
          (!targetId ||
            e.target?.id === targetId) &&
          Date.now() - e.createdTimestamp < 15000
      );

    return entry?.executor || null;
  } catch {
    return null;
  }
}

// ============================================================
// 📚 30 COMANDOS POR CATEGORÍA
// ============================================================

const publicCategories = {
  general: {
    emoji: "🌌",
    name: "General",
    commands: [
      "help",
      "ping",
      "botinfo",
      "serverinfo",
      "userinfo",
      "avatar",
      "banner",
      "profile",
      "invite",
      "servericon",
      "membercount",
      "channelinfo",
      "roleinfo",
      "timestamp",
      "whois",
      "id",
      "afk",
      "serverage",
      "userage",
      "channels",
      "roles",
      "emojis",
      "boosts",
      "support",
      "date",
      "time",
      "guildid",
      "botid",
      "serverowner",
      "created"
    ]
  },

  economy: {
    emoji: "💰",
    name: "Economía",
    commands: [
      "balance",
      "work",
      "daily",
      "crime",
      "rob",
      "beg",
      "deposit",
      "withdraw",
      "dep",
      "with",
      "pay",
      "leaderboard",
      "richest",
      "bank",
      "wallet",
      "money",
      "economy",
      "cash",
      "give",
      "salary",
      "bonus",
      "income",
      "expenses",
      "networth",
      "economystats",
      "gig",
      "hustle",
      "depositall",
      "withdrawall",
      "pocket"
    ]
  },

  fun: {
    emoji: "🎮",
    name: "Diversión",
    commands: [
      "slots",
      "coinflip",
      "dice",
      "blackjack",
      "guess",
      "8ball",
      "roll",
      "choose",
      "rate",
      "ship",
      "joke",
      "meme",
      "rps",
      "trivia",
      "random",
      "reverse",
      "sayfun",
      "ascii",
      "emojify",
      "number",
      "fortune",
      "fact",
      "roast",
      "compliment",
      "roulette",
      "double",
      "highlow",
      "magic",
      "truth",
      "dare"
    ]
  },

  social: {
    emoji: "💗",
    name: "Social",
    commands: [
      "hug",
      "kiss",
      "pat",
      "poke",
      "highfive",
      "wave",
      "slap",
      "compliment",
      "friend",
      "ship",
      "cuddle",
      "dance",
      "smile",
      "wink",
      "happy",
      "love",
      "greet",
      "goodnight",
      "goodmorning",
      "thank",
      "applaud",
      "cheer",
      "support",
      "react",
      "interaction",
      "respect",
      "fistbump",
      "salute",
      "handshake",
      "clap"
    ]
  },

  levels: {
    emoji: "⭐",
    name: "Niveles",
    commands: [
      "level",
      "rank",
      "xp",
      "top",
      "levels",
      "nextlevel",
      "progress",
      "leaderboardxp",
      "levelinfo",
      "xprequired",
      "myxp",
      "mylevel",
      "leveltop",
      "xptop",
      "rankinfo",
      "levelstats",
      "xpstats",
      "progressbar",
      "levelup",
      "experience",
      "ranking",
      "levelboard",
      "xpleaderboard",
      "levelcheck",
      "rewards",
      "levelcard",
      "xpleft",
      "xppercent",
      "levelrank",
      "levelnext"
    ]
  },

  utilities: {
    emoji: "🛠️",
    name: "Utilidades",
    commands: [
      "servericon",
      "channelinfo",
      "roleinfo",
      "membercount",
      "timestamp",
      "calculator",
      "poll",
      "remind",
      "avatar",
      "banner",
      "userinfo",
      "serverinfo",
      "uptime",
      "ping",
      "say",
      "embed",
      "choose",
      "roll",
      "random",
      "translate",
      "weather",
      "timer",
      "afk",
      "help",
      "calc",
      "math",
      "count",
      "mention",
      "now"
    ]
  }
};

const adminCategories = {
  moderation: {
    emoji: "🛡️",
    name: "Moderación",
    commands: [
      "ban",
      "unban",
      "kick",
      "timeout",
      "untimeout",
      "warn",
      "unwarn",
      "clearwarns",
      "clear",
      "lock",
      "unlock",
      "slowmode",
      "nick",
      "resetnick",
      "mute",
      "unmute",
      "purge",
      "massban",
      "softban",
      "modlog",
      "warnings",
      "warns",
      "checkwarns",
      "kickall",
      "modinfo",
      "antilinks",
      "antispam",
      "baninfo",
      "timeoutinfo",
      "automod"
    ]
  },

  configuration: {
    emoji: "⚙️",
    name: "Configuración",
    commands: [
      "welcome",
      "goodbye",
      "invites",
      "logs",
      "welcomeon",
      "welcomeoff",
      "goodbyeon",
      "goodbyeoff",
      "inviteson",
      "invitesoff",
      "logson",
      "logsoff",
      "autorole",
      "autoroleoff",
      "prefix",
      "setup",
      "serverconfig",
      "welcomechannel",
      "goodbyechannel",
      "invitechannel",
      "logchannel",
      "setrules",
      "setticket",
      "config",
      "resetconfig",
      "antilinksconfig",
      "antispamconfig",
      "ticket",
      "setlog",
      "features"
    ]
  },

  administration: {
    emoji: "👑",
    name: "Administración",
    commands: [
      "addmoney",
      "removemoney",
      "setmoney",
      "addbank",
      "removebank",
      "setbank",
      "addxp",
      "removexp",
      "setxp",
      "addlevel",
      "setlevel",
      "resetuser",
      "setwarns",
      "resetwarns",
      "giveall",
      "takeall",
      "createrole",
      "deleterole",
      "role",
      "createchannel",
      "deletechannel",
      "announce",
      "say",
      "embed",
      "server",
      "removelevel",
      "resetxp",
      "resetmoney",
      "resetbank",
      "serverstats"
    ]
  }
};

// ============================================================
// 📨 INVITES
// ============================================================

const inviteCache = new Map();

async function loadInvites(guild) {
  try {
    const invites =
      await guild.invites.fetch();

    const map = new Map();

    invites.forEach(invite => {
      map.set(invite.code, {
        uses: invite.uses || 0,
        inviterId:
          invite.inviter?.id || null
      });
    });

    inviteCache.set(
      guild.id,
      map
    );
  } catch {}
}

async function detectInvite(guild) {
  try {
    const old =
      inviteCache.get(guild.id) ||
      new Map();

    const current =
      await guild.invites.fetch();

    let usedInvite = null;

    current.forEach(invite => {
      const previous =
        old.get(invite.code);

      if (
        previous &&
        (invite.uses || 0) >
          previous.uses
      ) {
        usedInvite = invite;
      }
    });

    await loadInvites(guild);

    return usedInvite;
  } catch {
    return null;
  }
}

// ============================================================
// 👋 BIENVENIDA
// ============================================================

client.on(
  "guildMemberAdd",
  async member => {
    const config =
      getGuildData(member.guild.id);

    const usedInvite =
      await detectInvite(member.guild);

    if (
      config.welcomeEnabled &&
      config.welcomeChannel
    ) {
      const channel =
        member.guild.channels.cache.get(
          config.welcomeChannel
        );

      if (channel) {
        const embed = makeEmbed(
          "╔══ 👋 ¡BIENVENIDO! ══╗",
          [
            `👋 ¡Bienvenido ${member}! 🎉`,
            "",
            `🌌 Ahora formas parte de **${member.guild.name}**.`,
            "",
            "📖 Lee las reglas del servidor.",
            "🎫 Si necesitas ayuda, abre un ticket.",
            "",
            "🧡 ¡Disfruta tu estancia en Mati Nexus!"
          ].join("\n")
        );

        embed.setThumbnail(
          member.user.displayAvatarURL({
            size: 512
          })
        );

        await channel.send({
          embeds: [embed]
        }).catch(() => {});
      }
    }

    if (config.autorole) {
      const role =
        member.guild.roles.cache.get(
          config.autorole
        );

      if (role) {
        await member.roles
          .add(role)
          .catch(() => {});
      }
    }

    if (
      config.inviteEnabled &&
      config.inviteChannel &&
      usedInvite
    ) {
      const channel =
        member.guild.channels.cache.get(
          config.inviteChannel
        );

      if (channel) {
        const inviter =
          usedInvite.inviter
            ? `<@${usedInvite.inviter.id}>`
            : "Desconocido";

        await channel.send({
          embeds: [
            makeEmbed(
              "╔══ 📨 INVITACIÓN ══╗",
              [
                `👤 Nuevo miembro: ${member}`,
                `🤝 Invitado por: ${inviter}`,
                `🔗 Código: \`${usedInvite.code}\``,
                `📊 Usos: **${usedInvite.uses}**`
              ].join("\n")
            )
          ]
        }).catch(() => {});
      }
    }

    await sendLog(
      member.guild,
      "MIEMBRO ENTRÓ",
      [
        `👤 Usuario: ${member.user.tag}`,
        `🤝 Invitado por: ${
          usedInvite?.inviter
            ? usedInvite.inviter.tag
            : "Desconocido"
        }`
      ].join("\n")
    );
  }
);

// ============================================================
// 😭 DESPEDIDA
// ============================================================

client.on(
  "guildMemberRemove",
  async member => {
    const config =
      getGuildData(member.guild.id);

    if (
      config.goodbyeEnabled &&
      config.goodbyeChannel
    ) {
      const channel =
        member.guild.channels.cache.get(
          config.goodbyeChannel
        );

      if (channel) {
        await channel.send({
          embeds: [
            makeEmbed(
              "╔══ 😭 DESPEDIDA ══╗",
              [
                `😭 Nuestro miembro **${member.user.tag}** nos ha dejado..`,
                "",
                "🌌 Esperamos volver a verte algún día."
              ].join("\n")
            )
          ]
        }).catch(() => {});
      }
    }

    await sendLog(
      member.guild,
      "MIEMBRO SALIÓ",
      `👤 Usuario: ${member.user.tag}`
    );
  }
);

// ============================================================
// 📜 LOGS
// ============================================================

client.on(
  "messageDelete",
  async message => {
    if (!message.guild) return;
    if (message.author?.bot) return;

    await sendLog(
      message.guild,
      "MENSAJE ELIMINADO",
      [
        `👤 Autor: ${message.author?.tag || "Desconocido"}`,
        `📁 Canal: ${message.channel}`,
        `💬 Contenido: ${
          message.content || "Sin contenido"
        }`
      ].join("\n")
    );
  }
);

client.on(
  "messageBulkDelete",
  async messages => {
    const first = messages.first();

    if (!first?.guild) return;

    await sendLog(
      first.guild,
      "MENSAJES ELIMINADOS",
      [
        `📁 Canal: ${first.channel}`,
        `🗑️ Cantidad: ${messages.size}`
      ].join("\n")
    );
  }
);

client.on(
  "messageUpdate",
  async (oldMessage, newMessage) => {
    if (!oldMessage.guild) return;
    if (oldMessage.author?.bot) return;

    if (
      oldMessage.content ===
      newMessage.content
    ) return;

    await sendLog(
      oldMessage.guild,
      "MENSAJE EDITADO",
      [
        `👤 Autor: ${oldMessage.author?.tag || "Desconocido"}`,
        `📁 Canal: ${oldMessage.channel}`,
        `Antes: ${truncate(oldMessage.content, 500)}`,
        `Después: ${truncate(newMessage.content, 500)}`
      ].join("\n")
    );
  }
);

client.on(
  "channelCreate",
  async channel => {
    if (!channel.guild) return;

    const executor =
      await getExecutor(
        channel.guild,
        AuditLogEvent.ChannelCreate,
        channel.id
      );

    await sendLog(
      channel.guild,
      "CANAL CREADO",
      [
        `📁 Canal: ${channel}`,
        `🆔 ID: ${channel.id}`,
        `👤 Por: ${executor || "Desconocido"}`
      ].join("\n")
    );
  }
);

client.on(
  "channelDelete",
  async channel => {
    if (!channel.guild) return;

    const executor =
      await getExecutor(
        channel.guild,
        AuditLogEvent.ChannelDelete,
        channel.id
      );

    await sendLog(
      channel.guild,
      "CANAL ELIMINADO",
      [
        `📁 Canal: #${channel.name}`,
        `🆔 ID: ${channel.id}`,
        `👤 Por: ${executor || "Desconocido"}`
      ].join("\n")
    );
  }
);

client.on(
  "channelUpdate",
  async (oldChannel, newChannel) => {
    if (!newChannel.guild) return;

    if (
      oldChannel.name ===
      newChannel.name
    ) return;

    const executor =
      await getExecutor(
        newChannel.guild,
        AuditLogEvent.ChannelUpdate,
        newChannel.id
      );

    await sendLog(
      newChannel.guild,
      "CANAL MODIFICADO",
      [
        `📁 Antes: #${oldChannel.name}`,
        `📁 Ahora: #${newChannel.name}`,
        `👤 Por: ${executor || "Desconocido"}`
      ].join("\n")
    );
  }
);

client.on(
  "roleCreate",
  async role => {
    const executor =
      await getExecutor(
        role.guild,
        AuditLogEvent.RoleCreate,
        role.id
      );

    await sendLog(
      role.guild,
      "ROL CREADO",
      [
        `🎭 Rol: ${role}`,
        `👤 Por: ${executor || "Desconocido"}`
      ].join("\n")
    );
  }
);

client.on(
  "roleDelete",
  async role => {
    const executor =
      await getExecutor(
        role.guild,
        AuditLogEvent.RoleDelete,
        role.id
      );

    await sendLog(
      role.guild,
      "ROL ELIMINADO",
      [
        `🎭 Rol: ${role.name}`,
        `👤 Por: ${executor || "Desconocido"}`
      ].join("\n")
    );
  }
);

client.on(
  "roleUpdate",
  async (oldRole, newRole) => {
    if (
      oldRole.name ===
      newRole.name
    ) return;

    const executor =
      await getExecutor(
        newRole.guild,
        AuditLogEvent.RoleUpdate,
        newRole.id
      );

    await sendLog(
      newRole.guild,
      "ROL MODIFICADO",
      [
        `🎭 Antes: ${oldRole.name}`,
        `🎭 Ahora: ${newRole.name}`,
        `👤 Por: ${executor || "Desconocido"}`
      ].join("\n")
    );
  }
);

client.on(
  "guildBanAdd",
  async ban => {
    const executor =
      await getExecutor(
        ban.guild,
        AuditLogEvent.MemberBanAdd,
        ban.user.id
      );

    await sendLog(
      ban.guild,
      "USUARIO BANEADO",
      [
        `👤 Usuario: ${ban.user.tag}`,
        `👑 Por: ${executor || "Desconocido"}`,
        `📝 Motivo: ${ban.reason || "No especificado"}`
      ].join("\n")
    );
  }
);

client.on(
  "guildBanRemove",
  async ban => {
    const executor =
      await getExecutor(
        ban.guild,
        AuditLogEvent.MemberBanRemove,
        ban.user.id
      );

    await sendLog(
      ban.guild,
      "BAN QUITADO",
      [
        `👤 Usuario: ${ban.user.tag}`,
        `👑 Por: ${executor || "Desconocido"}`
      ].join("\n")
    );
  }
);

client.on(
  "voiceStateUpdate",
  async (oldState, newState) => {
    if (!newState.guild) return;

    if (
      oldState.channelId ===
      newState.channelId
    ) return;

    let text =
      `👤 Usuario: ${newState.member?.user.tag || "Desconocido"}\n`;

    if (
      !oldState.channelId &&
      newState.channelId
    ) {
      text +=
        `🔊 Entró a <#${newState.channelId}>`;
    } else if (
      oldState.channelId &&
      !newState.channelId
    ) {
      text +=
        `🔇 Salió de <#${oldState.channelId}>`;
    } else {
      text +=
        `➡️ <#${oldState.channelId}> → <#${newState.channelId}>`;
    }

    await sendLog(
      newState.guild,
      "CAMBIO DE VOZ",
      text
    );
  }
);

// ============================================================
// 🚨 ANTI-SPAM
// ============================================================

const spamTracker = new Map();

function checkSpam(message) {
  const key = message.guild.id;

  const old = spamTracker.get(key);

  if (
    !old ||
    old.userId !== message.author.id
  ) {
    spamTracker.set(key, {
      userId: message.author.id,
      count: 1
    });

    return false;
  }

  old.count++;

  if (old.count >= 5) {
    old.count = 0;
    return true;
  }

  return false;
}

// ============================================================
// 🔗 ANTI-LINKS
// ============================================================

const linkRegex =
  /(https?:\/\/\S+|www\.\S+|discord\.gg\/\S+)/i;

// ============================================================
// 🎫 TICKETS
// ============================================================

const ticketTypes = {
  general: "💬 General",
  postulaciones: "📝 Postulaciones",
  reporte: "🚨 Reportar a un usuario",
  bug: "🐛 Reportar Bug",
  alianzas: "🤝 Alianzas",
  afiliaciones: "🌠 Afiliaciones",
  partners: "🤠 Partners"
};

function ticketEmbed() {
  return makeEmbed(
    "🎫 Tickets - ミ🧡Mati Nexus🩷彡",
    [
      "¿Necesitas ayuda o deseas postularte? Selecciona una categoría abajo para abrir un ticket.",
      "",
      "💬 General — Dudas o problemas",
      "📝 Postulaciones — Postulaciones abiertas!",
      "🚨 Reportar a un usuario — Reportar a infractores",
      "🐛 Reportar Bug — Reportar bugs del servidor",
      "",
      "**━━━━━━━━━━━━━━ 🤝 ━━━━━━━━━━━━━━**",
      "🤝 Alianzas — Para aliarte",
      "🌠 Afiliaciones — Afiliarte (obligatorio everyone)",
      "🤠 Partners — Para ser partners",
      "",
      "### ⚠️ Importante・Solo abre un ticket si lo necesitas",
      "",
      "https://i.imgur.com/7GbwIT4.jpeg"
    ].join("\n")
  );
}

async function createTicket(
  interaction,
  type
) {
  const guild = interaction.guild;
  const user = interaction.user;
  const config = getGuildData(guild.id);

  const existing =
    guild.channels.cache.find(
      channel =>
        channel.topic ===
        `ticketOwner:${user.id}`
    );

  if (existing) {
    return interaction.reply({
      content:
        `❌ Ya tienes un ticket abierto: ${existing}`,
      ephemeral: true
    });
  }

  let parent = null;

  if (config.ticketCategory) {
    const category =
      guild.channels.cache.get(
        config.ticketCategory
      );

    if (
      category?.type ===
      ChannelType.GuildCategory
    ) {
      parent = category;
    }
  }

  const name =
    `ticket-${user.username}`
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "")
      .slice(0, 70) ||
    `ticket-${user.id}`;

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [
        PermissionsBitField.Flags.ViewChannel
      ]
    },
    {
      id: user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.EmbedLinks
      ]
    },
    {
      id: client.user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageChannels
      ]
    }
  ];

  for (
    const role of guild.roles.cache.values()
  ) {
    if (
      role.permissions.has(
        PermissionsBitField.Flags.Administrator
      ) &&
      role.id !== guild.id
    ) {
      overwrites.push({
        id: role.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      });
    }
  }

  const channel =
    await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: parent?.id || undefined,
      topic: `ticketOwner:${user.id}`,
      permissionOverwrites: overwrites
    });

  const buttons =
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_claim")
        .setLabel("Reclamar ticket")
        .setEmoji("🎟️")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("ticket_close")
        .setLabel("Cerrar ticket")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Danger)
    );

  await channel.send({
    content: `${user}`,
    embeds: [
      makeEmbed(
        ticketTypes[type],
        [
          `👤 Usuario: ${user}`,
          "",
          "Un miembro del staff te atenderá pronto.",
          "",
          "🎟️ Reclamar ticket",
          "🔒 Cerrar ticket"
        ].join("\n")
      )
    ],
    components: [buttons]
  });

  await interaction.reply({
    content:
      `✅ Ticket creado: ${channel}`,
    ephemeral: true
  });

  await sendLog(
    guild,
    "TICKET CREADO",
    [
      `👤 Usuario: ${user.tag}`,
      `📁 Canal: ${channel}`,
      `📌 Categoría: ${ticketTypes[type]}`
    ].join("\n")
  );
}

// ============================================================
// 🎛️ MENÚS DE AYUDA
// ============================================================

function categoryMenu(admin = false) {
  const categories =
    admin
      ? adminCategories
      : publicCategories;

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(
        admin
          ? "mati_admin_category"
          : "mati_public_category"
      )
      .setPlaceholder(
        "📚 Selecciona una categoría"
      )
      .addOptions(
        Object.entries(categories).map(
          ([key, category]) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(category.name)
              .setEmoji(category.emoji)
              .setValue(key)
              .setDescription(
                "Ver 30 comandos"
              )
        )
      )
  );
}

function commandPages(
  categoryKey,
  admin = false
) {
  const categories =
    admin
      ? adminCategories
      : publicCategories;

  const category =
    categories[categoryKey];

  if (!category) return [];

  const first =
    category.commands.slice(0, 15);

  const second =
    category.commands.slice(15, 30);

  const row1 =
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(
          `${admin ? "admin" : "public"}_page1_${categoryKey}`
        )
        .setPlaceholder(
          "📄 Página 1 • 15 comandos"
        )
        .addOptions(
          first.map(command =>
            new StringSelectMenuOptionBuilder()
              .setLabel(`m.${command}`)
              .setValue(command)
              .setDescription(
                `Usar m.${command}`
              )
          )
        )
    );

  const row2 =
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(
          `${admin ? "admin" : "public"}_page2_${categoryKey}`
        )
        .setPlaceholder(
          "📄 Página 2 • 15 comandos"
        )
        .addOptions(
          second.map(command =>
            new StringSelectMenuOptionBuilder()
              .setLabel(`m.${command}`)
              .setValue(command)
              .setDescription(
                `Usar m.${command}`
              )
          )
        )
    );

  return [
    categoryMenu(admin),
    row1,
    row2
  ];
}

// ============================================================
// 🎛️ INTERACCIONES
// ============================================================

client.on(
  "interactionCreate",
  async interaction => {

    if (interaction.isStringSelectMenu()) {

      if (
        interaction.customId ===
        "mati_public_category"
      ) {
        const key =
          interaction.values[0];

        const category =
          publicCategories[key];

        if (!category) return;

        return interaction.update({
          embeds: [
            makeEmbed(
              `${category.emoji} ${category.name}`,
              [
                "🌌 Comandos públicos.",
                "",
                "📚 Total: **30 comandos**",
                "📄 Página 1: **15 comandos**",
                "📄 Página 2: **15 comandos**"
              ].join("\n")
            )
          ],
          components:
            commandPages(key, false)
        });
      }

      if (
        interaction.customId ===
        "mati_admin_category"
      ) {
        if (
          !isAdmin(interaction.member)
        ) {
          return interaction.reply({
            content:
              "❌ Solo administradores.",
            ephemeral: true
          });
        }

        const key =
          interaction.values[0];

        const category =
          adminCategories[key];

        if (!category) return;

        return interaction.update({
          embeds: [
            makeEmbed(
              `${category.emoji} ${category.name}`,
              [
                "👑 Comandos administrativos.",
                "",
                "📚 Total: **30 comandos**",
                "📄 Página 1: **15 comandos**",
                "📄 Página 2: **15 comandos**"
              ].join("\n")
            )
          ],
          components:
            commandPages(key, true)
        });
      }

      if (
        interaction.customId ===
        "mati_ticket_select"
      ) {
        return createTicket(
          interaction,
          interaction.values[0]
        );
      }

      if (
        interaction.customId.startsWith(
          "public_page"
        ) ||
        interaction.customId.startsWith(
          "admin_page"
        )
      ) {
        const command =
          interaction.values[0];

        return interaction.reply({
          content:
            `🌌 Comando seleccionado: \`m.${command}\``,
          ephemeral: true
        });
      }
    }

    if (interaction.isButton()) {

      if (
        interaction.customId ===
        "ticket_claim"
      ) {
        if (
          !isAdmin(interaction.member)
        ) {
          return interaction.reply({
            content:
              "❌ Solo administradores.",
            ephemeral: true
          });
        }

        await interaction.channel.send(
          `🎟️ Ticket reclamado por ${interaction.user}.`
        );

        return interaction.reply({
          content:
            "✅ Ticket reclamado.",
          ephemeral: true
        });
      }

      if (
        interaction.customId ===
        "ticket_close"
      ) {
        if (
          !isAdmin(interaction.member)
        ) {
          return interaction.reply({
            content:
              "❌ Solo administradores.",
            ephemeral: true
          });
        }

        await interaction.reply(
          "🔒 Cerrando ticket..."
        );

        await sendLog(
          interaction.guild,
          "TICKET CERRADO",
          [
            `📁 Canal: ${interaction.channel}`,
            `👤 Por: ${interaction.user.tag}`
          ].join("\n")
        );

        setTimeout(() => {
          interaction.channel
            .delete()
            .catch(() => {});
        }, 3000);
      }
    }
  }
);

// ============================================================
// 💬 MENSAJES
// ============================================================

client.on(
  "messageCreate",
  async message => {

    if (!message.guild) return;
    if (message.author.bot) return;

    const config =
      getGuildData(message.guild.id);

    // --------------------------------------------------------
    // 🔗 ANTI-LINKS
    // --------------------------------------------------------

    if (
      config.antiLinks &&
      !isAdmin(message.member) &&
      linkRegex.test(message.content)
    ) {
      await message
        .delete()
        .catch(() => {});

      await message.member
        .timeout(
          2 * 60 * 60 * 1000,
          "Anti-links Mati Nexus"
        )
        .catch(() => {});

      const user =
        getUserData(message.author.id);

      user.warns++;

      saveData();

      await sendLog(
        message.guild,
        "🔗 ANTI-LINKS",
        [
          `👤 Usuario: ${message.author.tag}`,
          "🔗 Enlace eliminado.",
          "⏱️ Timeout: 2 horas",
          `⚠️ Warns: ${user.warns}`
        ].join("\n")
      );

      return;
    }

    // --------------------------------------------------------
    // 🚨 ANTI-SPAM
    // --------------------------------------------------------

    if (
      config.antiSpam &&
      checkSpam(message)
    ) {
      const user =
        getUserData(message.author.id);

      user.warns++;

      saveData();

      const warning =
        await message.channel.send(
          `⚠️ ${message.author}, recibiste un warn por enviar 5 mensajes seguidos.`
        );

      setTimeout(() => {
        warning.delete().catch(() => {});
      }, 5000);

      await sendLog(
        message.guild,
        "🚨 ANTI-SPAM",
        [
          `👤 Usuario: ${message.author.tag}`,
          "⚠️ 5 mensajes consecutivos.",
          `📊 Warns: ${user.warns}`
        ].join("\n")
      );
    }

    // --------------------------------------------------------
    // PREFIX
    // --------------------------------------------------------

    const prefix =
      getPrefix(message.guild);

    if (
      !message.content.startsWith(prefix)
    ) {
      return;
    }

    const parts =
      message.content
        .slice(prefix.length)
        .trim()
        .split(/\s+/);

    const command =
      parts.shift()?.toLowerCase();

    const args = parts;

    if (!command) return;

    const user =
      getUserData(message.author.id);

    // ========================================================
    // 🌌 HELP
    // ========================================================

    if (command === "help") {
      return message.channel.send({
        embeds: [
          makeEmbed(
            "🌌 ミ🧡Mati Nexus🩷彡",
            [
              "Bienvenido al menú de comandos.",
              "",
              "📚 **30 comandos por categoría**",
              "📄 **15 comandos por página**",
              "",
              "Selecciona una categoría."
            ].join("\n")
          )
        ],
        components: [
          categoryMenu(false)
        ]
      });
    }

    if (
      command === "helpad" ||
      command === "adminhelp" ||
      command === "helpadmin"
    ) {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      return message.channel.send({
        embeds: [
          makeEmbed(
            "👑 Panel Administrativo",
            [
              "Panel exclusivo para administradores.",
              "",
              "📚 **30 comandos por categoría**",
              "📄 **15 comandos por página**"
            ].join("\n")
          )
        ],
        components: [
          categoryMenu(true)
        ]
      });
    }

    // ========================================================
    // 🌌 GENERAL
    // ========================================================

    if (command === "ping") {
      return message.reply(
        `🏓 Pong! **${client.ws.ping}ms**`
      );
    }

    if (command === "uptime") {
      return message.reply(
        `⏱️ Uptime: **${Math.floor(
          process.uptime()
        )} segundos**`
      );
    }

    if (command === "botinfo") {
      return message.channel.send({
        embeds: [
          makeEmbed(
            "🌌 Mati Nexus BOT",
            [
              "🧡 Fundador: mati_jojojo",
              "👤 Creador: rykeryt.25, ryan_lamienyamal",
              "",
              `📡 Servidores: ${client.guilds.cache.size}`,
              `👥 Usuarios: ${client.guilds.cache.reduce(
                (a, g) => a + g.memberCount,
                0
              )}`,
              `🏓 Ping: ${client.ws.ping}ms`
            ].join("\n")
          )
        ]
      });
    }

    if (
      command === "serverinfo" ||
      command === "server"
    ) {
      return message.channel.send({
        embeds: [
          makeEmbed(
            `🌌 ${message.guild.name}`,
            [
              `👑 Dueño: <@${message.guild.ownerId}>`,
              `👥 Miembros: ${message.guild.memberCount}`,
              `📁 Canales: ${message.guild.channels.cache.size}`,
              `🎭 Roles: ${message.guild.roles.cache.size}`,
              `🚀 Boosts: ${message.guild.premiumSubscriptionCount || 0}`,
              `🆔 ID: ${message.guild.id}`
            ].join("\n")
          )
        ]
      });
    }

    if (
      command === "userinfo" ||
      command === "whois" ||
      command === "profile"
    ) {
      const target =
        findMember(
          message.guild,
          args[0]
        ) || message.member;

      const targetData =
        getUserData(target.id);

      return message.channel.send({
        embeds: [
          makeEmbed(
            `👤 ${target.user.tag}`,
            [
              `🆔 ID: ${target.id}`,
              `📅 Cuenta: <t:${Math.floor(
                target.user.createdTimestamp / 1000
              )}:R>`,
              `⭐ Nivel: ${targetData.level}`,
              `✨ XP: ${targetData.xp}`,
              `⚠️ Warns: ${targetData.warns}`
            ].join("\n")
          ).setThumbnail(
            target.user.displayAvatarURL({
              size: 512
            })
          )
        ]
      });
    }

    if (
      command === "avatar" ||
      command === "banner"
    ) {
      const target =
        findMember(
          message.guild,
          args[0]
        ) || message.member;

      return message.channel.send({
        embeds: [
          makeEmbed(
            "🖼️ Avatar",
            `[Abrir imagen](${target.user.displayAvatarURL({
              size: 4096,
              extension: "png"
            })})`
          ).setImage(
            target.user.displayAvatarURL({
              size: 1024
            })
          )
        ]
      });
    }

    if (
      command === "id" ||
      command === "guildid"
    ) {
      return message.reply(
        `🆔 ID: \`${message.guild.id}\``
      );
    }

    if (command === "botid") {
      return message.reply(
        `🤖 ID del bot: \`${client.user.id}\``
      );
    }

    if (command === "membercount") {
      return message.reply(
        `👥 Miembros: **${message.guild.memberCount}**`
      );
    }

    if (command === "channels") {
      return message.channel.send(
        makeEmbed(
          "📁 Canales",
          message.guild.channels.cache
            .map(c => `${c}`)
            .slice(0, 100)
            .join("\n")
        )
      );
    }

    if (command === "roles") {
      return message.channel.send(
        makeEmbed(
          "🎭 Roles",
          message.guild.roles.cache
            .filter(
              r => r.id !== message.guild.id
            )
            .map(r => r.name)
            .slice(0, 100)
            .join("\n") ||
            "Sin roles."
        )
      );
    }

    if (command === "boosts") {
      return message.reply(
        `🚀 Boosts: **${message.guild.premiumSubscriptionCount || 0}**`
      );
    }

    if (command === "serverowner") {
      return message.reply(
        `👑 Dueño: <@${message.guild.ownerId}>`
      );
    }

    if (
      command === "date" ||
      command === "time" ||
      command === "timestamp" ||
      command === "now"
    ) {
      return message.reply(
        `🕐 <t:${Math.floor(
          Date.now() / 1000
        )}:F>`
      );
    }

    if (command === "serverage") {
      return message.reply(
        `📅 Servidor creado: <t:${Math.floor(
          message.guild.createdTimestamp / 1000
        )}:R>`
      );
    }

    if (command === "userage") {
      return message.reply(
        `📅 Tu cuenta fue creada: <t:${Math.floor(
          message.author.createdTimestamp / 1000
        )}:R>`
      );
    }

    if (
      command === "channelinfo"
    ) {
      return message.reply(
        `📁 Canal: ${message.channel}\n🆔 ${message.channel.id}`
      );
    }

    if (command === "roleinfo") {
      const role =
        findRole(
          message.guild,
          args[0]
        );

      if (!role) {
        return message.reply(
          "❌ Menciona un rol."
        );
      }

      return message.reply(
        `🎭 ${role}\n🆔 ${role.id}\n👥 ${role.members.size} miembros`
      );
    }

    // ========================================================
    // 💰 ECONOMÍA
    // ========================================================

    if (
      command === "balance" ||
      command === "money" ||
      command === "wallet" ||
      command === "cash" ||
      command === "economy"
    ) {
      return message.channel.send({
        embeds: [
          makeEmbed(
            "💰 Economía",
            [
              `👛 Billetera: ${money(user.wallet)}`,
              `🏦 Banco: ${money(user.bank)}`,
              `💎 Total: ${money(
                user.wallet + user.bank
              )}`
            ].join("\n")
          )
        ]
      });
    }

    async function earn(
      property,
      min,
      max,
      cooldown
    ) {
      const now = Date.now();

      if (
        now - user[property] <
        cooldown
      ) {
        return message.reply(
          `⏳ Espera **${cooldownText(
            cooldown -
              (now - user[property])
          )}**.`
        );
      }

      const amount =
        random(min, max);

      user[property] = now;
      user.wallet += amount;

      const levelUp =
        addXP(
          message.author.id,
          random(5, 15)
        );

      saveData();

      return message.reply(
        [
          `💰 Ganaste **${money(amount)}**.`,
          `👛 Billetera: **${money(user.wallet)}**`,
          levelUp
            ? "⭐ ¡Subiste de nivel!"
            : ""
        ].filter(Boolean).join("\n")
      );
    }

    if (command === "work") {
      return earn(
        "lastWork",
        100,
        300,
        30000
      );
    }

    if (command === "salary") {
      return earn(
        "lastSalary",
        150,
        350,
        60000
      );
    }

    if (command === "bonus") {
      return earn(
        "lastBonus",
        100,
        250,
        90000
      );
    }

    if (command === "income") {
      return earn(
        "lastIncome",
        75,
        200,
        45000
      );
    }

    if (command === "gig") {
      return earn(
        "lastGig",
        100,
        250,
        45000
      );
    }

    if (command === "hustle") {
      return earn(
        "lastHustle",
        120,
        300,
        60000
      );
    }

    if (command === "daily") {
      const now = Date.now();

      if (
        now - user.lastDaily <
        86400000
      ) {
        return message.reply(
          `⏳ Espera **${cooldownText(
            86400000 -
              (now - user.lastDaily)
          )}**.`
        );
      }

      const amount =
        random(500, 1000);

      user.lastDaily = now;
      user.wallet += amount;

      saveData();

      return message.reply(
        `🎁 Daily: **${money(amount)}**`
      );
    }

    if (command === "beg") {
      return earn(
        "lastBeg",
        20,
        100,
        60000
      );
    }

    if (command === "crime") {
      const now = Date.now();

      if (
        now - user.lastCrime <
        120000
      ) {
        return message.reply(
          `⏳ Espera **${cooldownText(
            120000 -
              (now - user.lastCrime)
          )}**.`
        );
      }

      user.lastCrime = now;

      if (Math.random() <= 0.2) {
        const amount =
          random(500, 700);

        user.wallet += amount;

        saveData();

        return message.reply(
          `💰 ¡Crimen exitoso! Ganaste **${money(amount)}**.`
        );
      }

      user.wallet =
        Math.max(
          0,
          user.wallet - 600
        );

      saveData();

      return message.reply(
        "🚔 Te atraparon. Perdiste **600 💰**."
      );
    }

    if (command === "rob") {
      const target =
        findMember(
          message.guild,
          args[0]
        );

      if (
        !target ||
        target.id === message.author.id
      ) {
        return message.reply(
          "❌ Menciona a un usuario válido."
        );
      }

      const targetData =
        getUserData(target.id);

      if (
        targetData.wallet <= 0
      ) {
        return message.reply(
          "❌ Ese usuario no tiene dinero."
        );
      }

      if (
        Date.now() - user.lastRob <
        120000
      ) {
        return message.reply(
          `⏳ Espera **${cooldownText(
            120000 -
              (Date.now() -
                user.lastRob)
          )}**.`
        );
      }

      user.lastRob = Date.now();

      if (Math.random() < 0.5) {
        const amount =
          Math.min(
            targetData.wallet,
            random(50, 300)
          );

        targetData.wallet -= amount;
        user.wallet += amount;

        saveData();

        return message.reply(
          `💰 Robaste **${money(amount)}** a ${target}.`
        );
      }

      user.wallet =
        Math.max(
          0,
          user.wallet - 200
        );

      saveData();

      return message.reply(
        "🚨 Te descubrieron y perdiste **200 💰**."
      );
    }

    if (
      command === "deposit" ||
      command === "dep"
    ) {
      let amount;

      if (
        args[0]?.toLowerCase() ===
        "all"
      ) {
        amount = user.wallet;
      } else {
        amount = Number(args[0]);
      }

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        return message.reply(
          "❌ Indica una cantidad."
        );
      }

      amount =
        Math.min(
          amount,
          user.wallet
        );

      user.wallet -= amount;
      user.bank += amount;

      saveData();

      return message.reply(
        `🏦 Depositaste **${money(amount)}**.`
      );
    }

    if (
      command === "withdraw" ||
      command === "with"
    ) {
      let amount;

      if (
        args[0]?.toLowerCase() ===
        "all"
      ) {
        amount = user.bank;
      } else {
        amount = Number(args[0]);
      }

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        return message.reply(
          "❌ Indica una cantidad."
        );
      }

      amount =
        Math.min(
          amount,
          user.bank
        );

      user.bank -= amount;
      user.wallet += amount;

      saveData();

      return message.reply(
        `💵 Retiraste **${money(amount)}**.`
      );
    }

    if (
      command === "pay" ||
      command === "give"
    ) {
      const target =
        findMember(
          message.guild,
          args[0]
        );

      const amount =
        Number(args[1]);

      if (
        !target ||
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        return message.reply(
          "❌ Uso: `m.pay @usuario cantidad`"
        );
      }

      if (
        amount > user.wallet
      ) {
        return message.reply(
          "❌ No tienes suficiente dinero."
        );
      }

      const targetData =
        getUserData(target.id);

      user.wallet -= amount;
      targetData.wallet += amount;

      saveData();

      return message.reply(
        `💸 Enviaste **${money(amount)}** a ${target}.`
      );
    }

    if (
      command === "richest" ||
      command === "leaderboard"
    ) {
      const ranking =
        Object.entries(data.users)
          .sort(
            (a, b) =>
              (b[1].wallet +
                b[1].bank) -
              (a[1].wallet +
                a[1].bank)
          )
          .slice(0, 10);

      return message.channel.send({
        embeds: [
          makeEmbed(
            "🏆 Ranking de dinero",
            ranking
              .map(
                ([id, u], i) =>
                  `**${i + 1}.** <@${id}> — ${money(
                    u.wallet + u.bank
                  )}`
              )
              .join("\n") ||
              "Sin datos."
          )
        ]
      });
    }

    if (
      command === "networth" ||
      command === "economystats"
    ) {
      return message.reply(
        `💎 Patrimonio total: **${money(
          user.wallet + user.bank
        )}**`
      );
    }

    // ========================================================
    // 🎮 DIVERSIÓN
    // ========================================================

    if (command === "coinflip") {
      return message.reply(
        `🪙 **${
          Math.random() < 0.5
            ? "Cara"
            : "Cruz"
        }**`
      );
    }

    if (
      command === "dice" ||
      command === "roll"
    ) {
      const sides =
        Math.max(
          2,
          Number(args[0]) || 6
        );

      return message.reply(
        `🎲 Resultado: **${random(
          1,
          sides
        )}**`
      );
    }

    if (command === "8ball") {
      const answers = [
        "🎱 Sí.",
        "🎱 No.",
        "🎱 Probablemente.",
        "🎱 Definitivamente.",
        "🎱 No estoy seguro.",
        "🎱 Pregunta después."
      ];

      return message.reply(
        answers[
          random(
            0,
            answers.length - 1
          )
        ]
      );
    }

    if (command === "choose") {
      if (args.length < 2) {
        return message.reply(
          "❌ Escribe al menos dos opciones."
        );
      }

      return message.reply(
        `🎯 Elegí: **${
          args[
            random(
              0,
              args.length - 1
            )
          ]
        }**`
      );
    }

    if (command === "rate") {
      return message.reply(
        `⭐ Calificación: **${random(
          0,
          100
        )}/100**`
      );
    }

    if (command === "ship") {
      const target =
        findMember(
          message.guild,
          args[0]
        );

      if (!target) {
        return message.reply(
          "❌ Menciona a alguien."
        );
      }

      return message.reply(
        `💗 Compatibilidad: **${random(
          0,
          100
        )}%**`
      );
    }

    if (command === "joke") {
      const jokes = [
        "😂 ¿Qué hace una abeja en el gimnasio? ¡Zum-ba!",
        "😂 ¿Qué le dijo un cero a un ocho? Bonito cinturón.",
        "😂 ¿Cuál es el colmo de un electricista? No encontrar corriente."
      ];

      return message.reply(
        jokes[
          random(
            0,
            jokes.length - 1
          )
        ]
      );
    }

    if (command === "meme") {
      return message.reply(
        "😂 Meme del día: cuando dices que vas a dormir temprano y terminas a las 4 AM en Discord."
      );
    }

    if (command === "compliment") {
      return message.reply(
        `💗 ${message.author}, eres increíble.`
      );
    }

    if (command === "fortune") {
      return message.reply(
        "🔮 El futuro dice que algo interesante viene."
      );
    }

    if (command === "fact") {
      return message.reply(
        "🧠 Dato: los pulpos tienen tres corazones."
      );
    }

    if (command === "roast") {
      return message.reply(
        "🔥 Tu Wi-Fi tiene más estabilidad que tú."
      );
    }

    if (command === "reverse") {
      return message.reply(
        args.join(" ")
          .split("")
          .reverse()
          .join("")
      );
    }

    if (command === "number") {
      return message.reply(
        `🔢 Número: **${random(
          1,
          100
        )}**`
      );
    }

    if (command === "roulette") {
      return message.reply(
        `🎰 Ruleta: **${random(
          0,
          36
        )}**`
      );
    }

    if (command === "double") {
      return message.reply(
        `🎰 Resultado: **${random(
          1,
          2
        )}**`
      );
    }

    if (command === "highlow") {
      return message.reply(
        `📈 Salió: **${
          Math.random() < 0.5
            ? "HIGH"
            : "LOW"
        }**`
      );
    }

    if (command === "magic") {
      return message.reply(
        "✨ La magia dice: posiblemente."
      );
    }

    if (command === "truth") {
      return message.reply(
        "🎭 Verdad: ¿cuándo fue la última vez que mentiste?"
      );
    }

    if (command === "dare") {
      return message.reply(
        "🎯 Reto: manda un emoji que represente tu estado."
      );
    }

    // ========================================================
    // 💗 SOCIAL
    // ========================================================

    const social = {
      hug: "🤗 abrazó a",
      kiss: "💋 le dio un beso a",
      pat: "🫳 acarició a",
      poke: "👉 molestó a",
      highfive: "🙌 chocó la mano con",
      wave: "👋 saludó a",
      slap: "😵 le dio una palmada a",
      cuddle: "🧸 se acurrucó con",
      dance: "💃 bailó con",
      smile: "😊 sonrió a",
      wink: "😉 le guiñó a",
      respect: "🫡 mostró respeto a",
      fistbump: "👊 chocó puños con",
      salute: "🫡 saludó a",
      handshake: "🤝 estrechó la mano de",
      clap: "👏 aplaudió a"
    };

    if (social[command]) {
      const target =
        findMember(
          message.guild,
          args[0]
        ) || message.member;

      return message.reply(
        `${social[command]} ${target}.`
      );
    }

    if (command === "greet") {
      return message.reply(
        `👋 ¡Hola ${message.author}!`
      );
    }

    if (command === "goodmorning") {
      return message.reply(
        `🌅 ¡Buenos días ${message.author}!`
      );
    }

    if (command === "goodnight") {
      return message.reply(
        `🌙 ¡Buenas noches ${message.author}!`
      );
    }

    if (command === "thank") {
      return message.reply(
        `💗 ¡De nada ${message.author}!`
      );
    }

    if (command === "love") {
      return message.reply(
        "💗 El amor está en el aire."
      );
    }

    // ========================================================
    // ⭐ NIVELES
    // ========================================================

    if (
      command === "level" ||
      command === "rank" ||
      command === "mylevel" ||
      command === "levelinfo"
    ) {
      return message.channel.send({
        embeds: [
          makeEmbed(
            "⭐ Nivel",
            [
              `🏆 Nivel: **${user.level}**`,
              `✨ XP: **${user.xp}/${user.level * 100}**`,
              `📊 Falta: **${Math.max(
                0,
                user.level * 100 -
                  user.xp
              )} XP**`
            ].join("\n")
          )
        ]
      });
    }

    if (
      command === "xp" ||
      command === "myxp" ||
      command === "experience"
    ) {
      return message.reply(
        `✨ XP: **${user.xp}**`
      );
    }

    if (
      command === "progress" ||
      command === "progressbar" ||
      command === "xppercent"
    ) {
      const required =
        user.level * 100;

      const percent =
        Math.floor(
          (user.xp / required) * 100
        );

      const filled =
        Math.floor(percent / 10);

      return message.reply(
        `📊 [${"█".repeat(
          filled
        )}${"░".repeat(
          10 - filled
        )}] **${percent}%**`
      );
    }

    if (
      command === "top" ||
      command === "leveltop" ||
      command === "leaderboardxp" ||
      command === "xptop"
    ) {
      const ranking =
        Object.entries(data.users)
          .sort(
            (a, b) =>
              (b[1].level * 100 +
                b[1].xp) -
              (a[1].level * 100 +
                a[1].xp)
          )
          .slice(0, 10);

      return message.channel.send({
        embeds: [
          makeEmbed(
            "🏆 Ranking XP",
            ranking
              .map(
                ([id, u], i) =>
                  `**${i + 1}.** <@${id}> — Nivel ${u.level} • ${u.xp} XP`
              )
              .join("\n") ||
              "Sin datos."
          )
        ]
      });
    }

    if (
      command === "nextlevel" ||
      command === "xprequired" ||
      command === "xpleft"
    ) {
      return message.reply(
        `⭐ Necesitas **${Math.max(
          0,
          user.level * 100 -
            user.xp
        )} XP** para subir.`
      );
    }

    if (
      command === "levelstats" ||
      command === "xpstats" ||
      command === "levelcard" ||
      command === "levelrank"
    ) {
      return message.channel.send({
        embeds: [
          makeEmbed(
            "⭐ Estadísticas",
            [
              `🏆 Nivel: ${user.level}`,
              `✨ XP: ${user.xp}`,
              `⚠️ Warns: ${user.warns}`
            ].join("\n")
          )
        ]
      });
    }

    // ========================================================
    // 🛠️ UTILIDADES
    // ========================================================

    if (
      command === "calculator" ||
      command === "calc" ||
      command === "math"
    ) {
      const expression =
        args.join(" ");

      if (!expression) {
        return message.reply(
          "❌ Escribe una operación."
        );
      }

      if (
        !/^[0-9+\-*/().%\s]+$/.test(
          expression
        )
      ) {
        return message.reply(
          "❌ Operación no válida."
        );
      }

      try {
        const result =
          Function(
            `"use strict"; return (${expression})`
          )();

        return message.reply(
          `🧮 Resultado: **${result}**`
        );
      } catch {
        return message.reply(
          "❌ No pude calcular eso."
        );
      }
    }

    if (command === "count") {
      return message.reply(
        `👥 Miembros: **${message.guild.memberCount}**`
      );
    }

    if (command === "mention") {
      const target =
        findMember(
          message.guild,
          args[0]
        );

      return message.reply(
        target
          ? `${target}`
          : "❌ Usuario no encontrado."
      );
    }

    // ========================================================
    // 🎫 TICKET
    // ========================================================

    if (command === "ticket") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      const menu =
        new StringSelectMenuBuilder()
          .setCustomId(
            "mati_ticket_select"
          )
          .setPlaceholder(
            "🎫 Selecciona una categoría"
          )
          .addOptions(
            Object.entries(
              ticketTypes
            ).map(
              ([value, label]) =>
                new StringSelectMenuOptionBuilder()
                  .setLabel(
                    label.substring(2)
                  )
                  .setEmoji(
                    label.substring(0, 2)
                  )
                  .setValue(value)
                  .setDescription(
                    "Abrir ticket"
                  )
            )
          );

      return message.channel.send({
        embeds: [ticketEmbed()],
        components: [
          new ActionRowBuilder().addComponents(
            menu
          )
        ]
      });
    }

    // ========================================================
    // 🛡️ ANTI-LINKS
    // ========================================================

    if (command === "antilinks") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      const option =
        args[0]?.toLowerCase();

      if (
        option === "on" ||
        option === "enable"
      ) {
        config.antiLinks = true;
      } else if (
        option === "off" ||
        option === "disable"
      ) {
        config.antiLinks = false;
      } else {
        return message.reply(
          `🔗 Anti-links: **${
            config.antiLinks
              ? "ACTIVADO"
              : "DESACTIVADO"
          }**\nUsa \`m.antilinks on/off\`.`
        );
      }

      saveData();

      return message.reply(
        `🔗 Anti-links **${
          config.antiLinks
            ? "activado"
            : "desactivado"
        }**.`
      );
    }

    if (
      command ===
      "antilinksconfig"
    ) {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      return message.reply(
        `🔗 Anti-links: **${
          config.antiLinks
            ? "ON"
            : "OFF"
        }**\n⏱️ Timeout: **2 horas**`
      );
    }

    // ========================================================
    // 🚨 ANTI-SPAM
    // ========================================================

    if (command === "antispam") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      const option =
        args[0]?.toLowerCase();

      if (option === "on") {
        config.antiSpam = true;
      } else if (
        option === "off"
      ) {
        config.antiSpam = false;
      } else {
        return message.reply(
          `🚨 Anti-spam: **${
            config.antiSpam
              ? "ON"
              : "OFF"
          }**\nUsa \`m.antispam on/off\`.`
        );
      }

      saveData();

      return message.reply(
        `🚨 Anti-spam **${
          config.antiSpam
            ? "activado"
            : "desactivado"
        }**.`
      );
    }

    if (
      command ===
      "antispamconfig"
    ) {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      return message.reply(
        `🚨 Anti-spam: **${
          config.antiSpam
            ? "ON"
            : "OFF"
        }**\n⚠️ Warn al llegar a 5 mensajes seguidos.`
      );
    }

    // ========================================================
    // 🛡️ MODERACIÓN
    // ========================================================

    if (
      [
        "ban",
        "kick",
        "timeout",
        "mute",
        "warn"
      ].includes(command)
    ) {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      const target =
        findMember(
          message.guild,
          args[0]
        );

      if (!target) {
        return message.reply(
          "❌ Menciona un usuario válido."
        );
      }

      const reason =
        args.slice(1).join(" ") ||
        "Sin motivo";

      if (command === "warn") {
        const targetData =
          getUserData(target.id);

        targetData.warns++;

        saveData();

        await sendLog(
          message.guild,
          "WARN",
          [
            `👤 Usuario: ${target.user.tag}`,
            `👑 Moderador: ${message.author.tag}`,
            `📝 Motivo: ${reason}`,
            `⚠️ Warns: ${targetData.warns}`
          ].join("\n")
        );

        return message.reply(
          `⚠️ ${target} recibió un warn.`
        );
      }

      if (command === "kick") {
        await target.kick(reason)
          .catch(() => {});

        return message.reply(
          `👢 ${target.user.tag} fue expulsado.`
        );
      }

      if (command === "ban") {
        await target.ban({
          reason
        }).catch(() => {});

        return message.reply(
          `🔨 ${target.user.tag} fue baneado.`
        );
      }

      await target.timeout(
        command === "timeout" ||
        command === "mute"
          ? 10 * 60 * 1000
          : null,
        reason
      ).catch(() => {});

      return message.reply(
        `🔇 ${target.user.tag} recibió timeout por 10 minutos.`
      );
    }

    if (
      command === "untimeout" ||
      command === "unmute"
    ) {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      const target =
        findMember(
          message.guild,
          args[0]
        );

      if (!target) {
        return message.reply(
          "❌ Menciona un usuario."
        );
      }

      await target.timeout(
        null
      ).catch(() => {});

      return message.reply(
        `🔊 Timeout quitado a ${target}.`
      );
    }

    if (
      command === "clear" ||
      command === "purge"
    ) {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      const amount =
        Math.min(
          Math.max(
            Number(args[0]) || 10,
            1
          ),
          100
        );

      const deleted =
        await message.channel.bulkDelete(
          amount,
          true
        ).catch(() => null);

      if (!deleted) {
        return message.reply(
          "❌ No pude borrar mensajes."
        );
      }

      const msg =
        await message.channel.send(
          `🧹 Eliminados **${deleted.size}** mensajes.`
        );

      setTimeout(() => {
        msg.delete().catch(() => {});
      }, 3000);

      return;
    }

    if (
      command === "lock" ||
      command === "unlock"
    ) {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      await message.channel
        .permissionOverwrites
        .edit(
          message.guild.roles.everyone,
          {
            SendMessages:
              command === "lock"
                ? false
                : null
          }
        );

      return message.reply(
        command === "lock"
          ? "🔒 Canal bloqueado."
          : "🔓 Canal desbloqueado."
      );
    }

    if (command === "slowmode") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      const seconds =
        Math.min(
          Math.max(
            Number(args[0]) || 0,
            0
          ),
          21600
        );

      await message.channel
        .setRateLimitPerUser(
          seconds
        );

      return message.reply(
        `🐌 Slowmode: **${seconds}s**`
      );
    }

    if (
      command === "warns" ||
      command === "warnings" ||
      command === "checkwarns"
    ) {
      const target =
        findMember(
          message.guild,
          args[0]
        ) || message.member;

      return message.reply(
        `⚠️ ${target} tiene **${
          getUserData(target.id).warns
        } warns.`
      );
    }

    if (
      command === "clearwarns" ||
      command === "unwarn" ||
      command === "resetwarns"
    ) {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      const target =
        findMember(
          message.guild,
          args[0]
        );

      if (!target) {
        return message.reply(
          "❌ Menciona un usuario."
        );
      }

      getUserData(target.id).warns = 0;

      saveData();

      return message.reply(
        `✅ Warns eliminados de ${target}.`
      );
    }

    if (command === "nick") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      const target =
        findMember(
          message.guild,
          args[0]
        );

      const nick =
        args.slice(1).join(" ");

      if (!target || !nick) {
        return message.reply(
          "❌ Uso: `m.nick @usuario nombre`"
        );
      }

      await target.setNickname(
        nick
      ).catch(() => {});

      return message.reply(
        `✏️ Nickname cambiado a **${nick}**.`
      );
    }

    // ========================================================
    // ⚙️ CONFIGURACIÓN
    // ========================================================

    if (
      command === "welcome" ||
      command === "welcomechannel"
    ) {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      const channel =
        findChannel(
          message.guild,
          args[0]
        ) || message.channel;

      config.welcomeChannel =
        channel.id;

      saveData();

      return message.reply(
        `👋 Bienvenidas: ${channel}`
      );
    }

    if (
      command === "goodbye" ||
      command === "goodbyechannel"
    ) {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      const channel =
        findChannel(
          message.guild,
          args[0]
        ) || message.channel;

      config.goodbyeChannel =
        channel.id;

      saveData();

      return message.reply(
        `😭 Despedidas: ${channel}`
      );
    }

    if (
      command === "invites" ||
      command === "invitechannel"
    ) {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      const channel =
        findChannel(
          message.guild,
          args[0]
        ) || message.channel;

      config.inviteChannel =
        channel.id;

      saveData();

      return message.reply(
        `📨 Invitaciones: ${channel}`
      );
    }

    if (
      command === "logs" ||
      command === "logchannel" ||
      command === "setlog"
    ) {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      const channel =
        findChannel(
          message.guild,
          args[0]
        ) || message.channel;

      config.logChannel =
        channel.id;

      saveData();

      return message.reply(
        `📜 Logs: ${channel}`
      );
    }

    if (command === "autorole") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      const role =
        findRole(
          message.guild,
          args[0]
        );

      if (!role) {
        return message.reply(
          "❌ Menciona un rol."
        );
      }

      config.autorole =
        role.id;

      saveData();

      return message.reply(
        `🎭 Autorol: ${role}`
      );
    }

    if (command === "autoroleoff") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      config.autorole = null;

      saveData();

      return message.reply(
        "🎭 Autorol desactivado."
      );
    }

    if (
      command === "welcomeon" ||
      command === "welcomeoff"
    ) {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      config.welcomeEnabled =
        command === "welcomeon";

      saveData();

      return message.reply(
        `👋 Bienvenidas ${
          config.welcomeEnabled
            ? "activadas"
            : "desactivadas"
        }.`
      );
    }

    if (
      command === "goodbyeon" ||
      command === "goodbyeoff"
    ) {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      config.goodbyeEnabled =
        command === "goodbyeon";

      saveData();

      return message.reply(
        `😭 Despedidas ${
          config.goodbyeEnabled
            ? "activadas"
            : "desactivadas"
        }.`
      );
    }

    if (
      command === "inviteson" ||
      command === "invitesoff"
    ) {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      config.inviteEnabled =
        command === "inviteson";

      saveData();

      return message.reply(
        `📨 Invitaciones ${
          config.inviteEnabled
            ? "activadas"
            : "desactivadas"
        }.`
      );
    }

    if (
      command === "logson" ||
      command === "logsoff"
    ) {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      config.logsEnabled =
        command === "logson";

      saveData();

      return message.reply(
        `📜 Logs ${
          config.logsEnabled
            ? "activados"
            : "desactivados"
        }.`
      );
    }

    if (command === "prefix") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      if (!args[0]) {
        return message.reply(
          `⚙️ Prefix: \`${config.prefix}\``
        );
      }

      config.prefix =
        args[0];

      saveData();

      return message.reply(
        `✅ Prefix cambiado a \`${config.prefix}\`.`
      );
    }

    if (
      command === "config" ||
      command === "serverconfig"
    ) {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      return message.channel.send({
        embeds: [
          makeEmbed(
            "⚙️ Configuración",
            [
              `👋 Bienvenidas: ${config.welcomeEnabled ? "ON" : "OFF"}`,
              `😭 Despedidas: ${config.goodbyeEnabled ? "ON" : "OFF"}`,
              `📨 Invitaciones: ${config.inviteEnabled ? "ON" : "OFF"}`,
              `📜 Logs: ${config.logsEnabled ? "ON" : "OFF"}`,
              `🔗 Anti-links: ${config.antiLinks ? "ON" : "OFF"}`,
              `🚨 Anti-spam: ${config.antiSpam ? "ON" : "OFF"}`,
              `🎭 Autorol: ${config.autorole ? `<@&${config.autorole}>` : "OFF"}`,
              `🎫 Tickets: ${config.ticketChannel ? `<#${config.ticketChannel}>` : "No configurado"}`,
              `⚙️ Prefix: \`${config.prefix}\``
            ].join("\n")
          )
        ]
      });
    }

    // ========================================================
    // 🎫 CONFIGURAR TICKET
    // ========================================================

    if (command === "setticket") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      const channel =
        findChannel(
          message.guild,
          args[0]
        ) || message.channel;

      config.ticketChannel =
        channel.id;

      saveData();

      return message.reply(
        `🎫 Canal de tickets: ${channel}`
      );
    }

    // ========================================================
    // 📢 SAY
    // ========================================================

    if (command === "say") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      const text =
        args.join(" ");

      if (!text) {
        return message.reply(
          "❌ Escribe un mensaje."
        );
      }

      await message.channel.send(
        text
      );

      await message.delete()
        .catch(() => {});

      await sendLog(
        message.guild,
        "SAY EJECUTADO",
        [
          `👤 Administrador: ${message.author.tag}`,
          `📁 Canal: ${message.channel}`,
          `💬 Mensaje: ${truncate(text, 700)}`
        ].join("\n")
      );

      return;
    }

    // ========================================================
    // 📢 ANNOUNCE
    // ========================================================

    if (command === "announce") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      const text =
        args.join(" ");

      if (!text) {
        return message.reply(
          "❌ Escribe el anuncio."
        );
      }

      return message.channel.send({
        embeds: [
          makeEmbed(
            "📢 ANUNCIO",
            text
          )
        ]
      });
    }

    // ========================================================
    // 🎭 CREAR / ELIMINAR ROLES
    // ========================================================

    if (
      command === "createrole" ||
      command === "role"
    ) {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      const name =
        args.join(" ") ||
        "Nuevo Rol";

      const role =
        await message.guild.roles.create({
          name,
          reason:
            `Creado por ${message.author.tag}`
        }).catch(() => null);

      if (!role) {
        return message.reply(
          "❌ No pude crear el rol."
        );
      }

      return message.reply(
        `🎭 Rol creado: ${role}`
      );
    }

    if (command === "deleterole") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      const role =
        findRole(
          message.guild,
          args[0]
        );

      if (!role) {
        return message.reply(
          "❌ Menciona un rol."
        );
      }

      await role.delete()
        .catch(() => {});

      return message.reply(
        "🗑️ Rol eliminado."
      );
    }

    // ========================================================
    // 📁 CANALES
    // ========================================================

    if (command === "createchannel") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      const name =
        args.join("-")
          .toLowerCase() ||
        "nuevo-canal";

      const channel =
        await message.guild.channels.create({
          name,
          type: ChannelType.GuildText
        }).catch(() => null);

      if (!channel) {
        return message.reply(
          "❌ No pude crear el canal."
        );
      }

      return message.reply(
        `📁 Canal creado: ${channel}`
      );
    }

    if (command === "deletechannel") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      const channel =
        findChannel(
          message.guild,
          args[0]
        ) || message.channel;

      await channel.delete()
        .catch(() => {});

      return;
    }

    // ========================================================
    // 💰 ADMIN ECONOMÍA
    // ========================================================

    if (
      command === "addmoney" ||
      command === "removemoney" ||
      command === "setmoney"
    ) {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      const target =
        findMember(
          message.guild,
          args[0]
        );

      const amount =
        Number(args[1]);

      if (
        !target ||
        !Number.isFinite(amount)
      ) {
        return message.reply(
          "❌ Uso: `m.addmoney @usuario cantidad`"
        );
      }

      const targetData =
        getUserData(target.id);

      if (command === "addmoney") {
        targetData.wallet += amount;
      }

      if (command === "removemoney") {
        targetData.wallet =
          Math.max(
            0,
            targetData.wallet -
              amount
          );
      }

      if (command === "setmoney") {
        targetData.wallet =
          Math.max(0, amount);
      }

      saveData();

      return message.reply(
        `💰 Dinero de ${target}: **${money(
          targetData.wallet
        )}**`
      );
    }

    if (
      command === "addbank" ||
      command === "removebank" ||
      command === "setbank"
    ) {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      const target =
        findMember(
          message.guild,
          args[0]
        );

      const amount =
        Number(args[1]);

      if (
        !target ||
        !Number.isFinite(amount)
      ) {
        return message.reply(
          "❌ Cantidad inválida."
        );
      }

      const targetData =
        getUserData(target.id);

      if (command === "addbank") {
        targetData.bank += amount;
      }

      if (command === "removebank") {
        targetData.bank =
          Math.max(
            0,
            targetData.bank -
              amount
          );
      }

      if (command === "setbank") {
        targetData.bank =
          Math.max(0, amount);
      }

      saveData();

      return message.reply(
        `🏦 Banco de ${target}: **${money(
          targetData.bank
        )}**`
      );
    }

    // ========================================================
    // 🔢 ADMIN XP
    // ========================================================

    if (
      command === "addxp" ||
      command === "removexp" ||
      command === "setxp"
    ) {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      const target =
        findMember(
          message.guild,
          args[0]
        );

      const amount =
        Number(args[1]);

      if (
        !target ||
        !Number.isFinite(amount)
      ) {
        return message.reply(
          "❌ Cantidad inválida."
        );
      }

      const targetData =
        getUserData(target.id);

      if (command === "addxp") {
        targetData.xp += amount;
      }

      if (command === "removexp") {
        targetData.xp =
          Math.max(
            0,
            targetData.xp -
              amount
          );
      }

      if (command === "setxp") {
        targetData.xp =
          Math.max(0, amount);
      }

      saveData();

      return message.reply(
        `✨ XP de ${target}: **${targetData.xp}**`
      );
    }

    if (
      command === "addlevel" ||
      command === "removelevel" ||
      command === "setlevel"
    ) {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      const target =
        findMember(
          message.guild,
          args[0]
        );

      const amount =
        Number(args[1]);

      if (
        !target ||
        !Number.isFinite(amount)
      ) {
        return message.reply(
          "❌ Cantidad inválida."
        );
      }

      const targetData =
        getUserData(target.id);

      if (command === "addlevel") {
        targetData.level += amount;
      }

      if (command === "removelevel") {
        targetData.level =
          Math.max(
            1,
            targetData.level -
              amount
          );
      }

      if (command === "setlevel") {
        targetData.level =
          Math.max(1, amount);
      }

      saveData();

      return message.reply(
        `⭐ Nivel de ${target}: **${targetData.level}**`
      );
    }

    if (
      command === "resetuser" ||
      command === "resetmoney" ||
      command === "resetbank" ||
      command === "resetxp"
    ) {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      const target =
        findMember(
          message.guild,
          args[0]
        );

      if (!target) {
        return message.reply(
          "❌ Menciona un usuario."
        );
      }

      const targetData =
        getUserData(target.id);

      if (
        command === "resetuser" ||
        command === "resetmoney"
      ) {
        targetData.wallet = 0;
      }

      if (
        command === "resetuser" ||
        command === "resetbank"
      ) {
        targetData.bank = 0;
      }

      if (
        command === "resetuser" ||
        command === "resetxp"
      ) {
        targetData.xp = 0;
      }

      if (command === "resetuser") {
        targetData.level = 1;
        targetData.warns = 0;
      }

      saveData();

      return message.reply(
        `✅ Datos actualizados de ${target}.`
      );
    }

    if (command === "setwarns") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      const target =
        findMember(
          message.guild,
          args[0]
        );

      const amount =
        Number(args[1]);

      if (
        !target ||
        !Number.isFinite(amount)
      ) {
        return message.reply(
          "❌ Cantidad inválida."
        );
      }

      getUserData(
        target.id
      ).warns =
        Math.max(0, amount);

      saveData();

      return message.reply(
        `⚠️ Warns de ${target}: **${amount}**`
      );
    }

    // ========================================================
    // 🔄 SETUP
    // ========================================================

    if (command === "setup") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "❌ Solo administradores."
        );
      }

      config.welcomeChannel =
        message.channel.id;

      config.goodbyeChannel =
        message.channel.id;

      config.inviteChannel =
        message.channel.id;

      config.logChannel =
        message.channel.id;

      config.ticketChannel =
        message.channel.id;

      saveData();

      return message.channel.send({
        embeds: [
          makeEmbed(
            "⚙️ Mati Nexus Setup",
            [
              "✅ Bienvenidas configuradas.",
              "✅ Despedidas configuradas.",
              "✅ Invitaciones configuradas.",
              "✅ Logs configurados.",
              "✅ Tickets configurados."
            ].join("\n")
          )
        ]
      });
    }

    // ========================================================
    // 🧩 COMANDOS ADICIONALES DEL MENÚ
    // ========================================================

    const simpleCommands = {
      invite:
        "🔗 Usa el enlace de invitación de tu servidor.",
      support:
        "💗 Para recibir ayuda, abre un ticket.",
      afk:
        "💤 Sistema AFK disponible.",
      emojis:
        `😀 Emojis del servidor: ${message.guild.emojis.cache.size}`,
      friend:
        "🤝 ¡Siempre es bueno hacer nuevos amigos!",
      happy:
        "😊 ¡Que tengas un buen día!",
      applaud:
        "👏 ¡Aplausos!",
      cheer:
        "📣 ¡Vamos!",
      react:
        "💫 ¡Reacción enviada!",
      interaction:
        "💗 Interacción realizada.",
      levels:
        "⭐ Consulta tu nivel con `m.level`.",
      rewards:
        "🎁 Los niveles otorgan experiencia.",
      poll:
        "📊 Usa `m.poll` seguido de tu pregunta.",
      remind:
        "⏰ Recordatorio solicitado.",
      translate:
        "🌐 Sistema de traducción.",
      weather:
        "🌤️ Sistema meteorológico.",
      timer:
        "⏱️ Temporizador.",
      sayfun:
        "💬 Diversión con mensajes.",
      ascii:
        "🔤 Sistema ASCII.",
      emojify:
        "😀 Sistema de emojis.",
      random:
        `🎲 Número aleatorio: ${random(1, 100)}`,
      servericon:
        `🖼️ ${message.guild.iconURL({ size: 1024 }) || "Este servidor no tiene icono."}`,
      banner:
        "🖼️ Sistema de banner.",
      botid:
        `🤖 ID: ${client.user.id}`,
      pocket:
        `👛 Tienes ${money(user.wallet)}.`,
      bank:
        `🏦 Tienes ${money(user.bank)} en el banco.`,
      expenses:
        "💸 Tus gastos se mostrarán aquí.",
      sayfun:
        "💬 ¡Diversión!",
      levels:
        `⭐ Tu nivel es ${user.level}.`,
      levelup:
        `⭐ Tu nivel actual es ${user.level}.`,
      levelcheck:
        `⭐ Nivel ${user.level}.`,
      levelboard:
        "🏆 Usa `m.top` para ver el ranking.",
      levelnext:
        `⭐ Te faltan ${Math.max(
          0,
          user.level * 100 -
            user.xp
        )} XP.`,
      levelrank:
        `⭐ Tu rango actual es nivel ${user.level}.`,
      serverstats:
        `📊 Miembros: ${message.guild.memberCount} | Canales: ${message.guild.channels.cache.size} | Roles: ${message.guild.roles.cache.size}`
    };

    if (
      simpleCommands[command]
    ) {
      return message.reply(
        simpleCommands[command]
      );
    }

    // ========================================================
    // ❌ DESCONOCIDO
    // ========================================================

    return message.reply(
      `❌ El comando \`${prefix}${command}\` no existe.\n` +
      `Usa \`${prefix}help\` para ver el menú.`
    );
  }
);

// ============================================================
// 🤖 READY
// ============================================================

client.once(
  "ready",
  async () => {

    console.log(
      `🌌 ${client.user.tag} está conectado correctamente.`
    );

    console.log(
      `📡 Servidores: ${client.guilds.cache.size}`
    );

    console.log(
      `👥 Usuarios: ${client.guilds.cache.reduce(
        (total, guild) =>
          total + guild.memberCount,
        0
      )}`
    );

    for (
      const guild of client.guilds.cache.values()
    ) {
      await loadInvites(guild);
    }

    client.user.setPresence({
      activities: [
        {
          name: "ミ🧡Mati Nexus🩷彡",
          type: 3
        }
      ],
      status: "online"
    });
  }
);

// ============================================================
// 🌐 SERVIDOR PARA RENDER
// ============================================================

const PORT =
  process.env.PORT || 3000;

const server =
  http.createServer(
    (req, res) => {
      res.writeHead(
        200,
        {
          "Content-Type":
            "text/plain; charset=utf-8"
        }
      );

      res.end(
        "🌌 Mati Nexus BOT está funcionando correctamente."
      );
    }
  );

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `🌐 Servidor HTTP activo en el puerto ${PORT}`
    );
  }
);

// ============================================================
// 🔑 LOGIN
// ============================================================

client.login(TOKEN)
  .then(() => {
    console.log(
      "🔐 Login iniciado correctamente."
    );
  })
  .catch(error => {
    console.error(
      "❌ Error iniciando sesión:",
      error
    );
  });
