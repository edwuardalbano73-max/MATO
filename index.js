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
  ActivityType,
  AuditLogEvent
} = require("discord.js");

const fs = require("fs");
const http = require("http");

const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = "m.";

if (!TOKEN) process.exit(console.error("❌ Falta DISCORD_TOKEN"));

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

/* =========================================================
   💾 DATABASE
========================================================= */

const FILE = "./data.json";

let data = {
  users: {},
  guilds: {}
};

try {
  if (fs.existsSync(FILE)) {
    data = JSON.parse(fs.readFileSync(FILE, "utf8"));
  }
} catch {
  data = { users: {}, guilds: {} };
}

function save() {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function guildData(id) {
  if (!data.guilds[id]) {
    data.guilds[id] = {
      prefix: PREFIX,
      welcomeChannel: null,
      goodbyeChannel: null,
      inviteChannel: null,
      logChannel: null,
      ticketChannel: null,
      ticketCategory: null,
      rulesChannel: null,
      autorole: null,
      welcomeEnabled: true,
      goodbyeEnabled: true,
      inviteEnabled: true,
      logsEnabled: true,
      antiLinks: false,
      antiSpam: false
    };
  }
  return data.guilds[id];
}

function userData(id) {
  if (!data.users[id]) {
    data.users[id] = {
      wallet: 0,
      bank: 0,
      xp: 0,
      level: 1,
      warns: 0,
      warnHistory: [],
      afk: false,
      afkReason: "",
      cooldowns: {}
    };
  }

  if (!data.users[id].cooldowns)
    data.users[id].cooldowns = {};

  if (!data.users[id].warnHistory)
    data.users[id].warnHistory = [];

  return data.users[id];
}

/* =========================================================
   🎨 EMBEDS
========================================================= */

function E(title, text) {
  return new EmbedBuilder()
    .setColor("#ff7ac8")
    .setTitle(`╔══ ${title} ══╗`)
    .setDescription(text || " ")
    .setFooter({
      text: "🌌 Mati Nexus BOT • Nexus System"
    })
    .setTimestamp();
}

function OK(text) {
  return E("✅ ACCIÓN COMPLETADA", `🌌 ${text}`);
}

function ERR(text) {
  return E("❌ ERROR", `⚠️ ${text}`);
}

function money(n) {
  return `${Number(n || 0).toLocaleString("es-ES")} 💰`;
}

function rand(a, b) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

function admin(member) {
  return member?.permissions?.has(
    PermissionsBitField.Flags.Administrator
  );
}

function memberOf(guild, x) {
  if (!x) return null;
  const id = x.replace(/[<@!>]/g, "");
  return guild.members.cache.get(id) ||
    guild.members.cache.find(
      m => m.user.username.toLowerCase() === x.toLowerCase()
    );
}

function channelOf(guild, x) {
  if (!x) return null;
  const id = x.replace(/[<#>]/g, "");
  return guild.channels.cache.get(id);
}

function roleOf(guild, x) {
  if (!x) return null;
  const id = x.replace(/[<@&>]/g, "");
  return guild.roles.cache.get(id) ||
    guild.roles.cache.find(
      r => r.name.toLowerCase() === x.toLowerCase()
    );
}

function cd(user, key, ms) {
  const last = user.cooldowns[key] || 0;
  const left = ms - (Date.now() - last);

  if (left > 0) return left;

  user.cooldowns[key] = Date.now();
  return 0;
}

function cdText(ms) {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

function addXP(id, amount) {
  const u = userData(id);
  u.xp += amount;

  let up = false;

  while (u.xp >= u.level * 100) {
    u.xp -= u.level * 100;
    u.level++;
    up = true;
  }

  save();
  return up;
}

/* =========================================================
   ⚠️ WARNS
========================================================= */

function addWarn(guild, target, moderator, reason) {
  const u = userData(target.id);

  u.warns++;

  u.warnHistory.push({
    guild: guild.id,
    moderator: moderator.id,
    reason: reason || "Sin razón",
    time: Date.now()
  });

  save();
  return u.warns;
}

/* =========================================================
   📜 LOGS
========================================================= */

async function log(guild, title, text) {
  const cfg = guildData(guild.id);

  if (!cfg.logsEnabled || !cfg.logChannel) return;

  const ch = guild.channels.cache.get(cfg.logChannel);

  if (!ch) return;

  await ch.send({
    embeds: [E(`📜 ${title}`, text)]
  }).catch(() => {});
}

async function executor(guild, type, id) {
  try {
    const logs = await guild.fetchAuditLogs({
      type,
      limit: 5
    });

    const e = logs.entries.find(
      x =>
        (!id || x.target?.id === id) &&
        Date.now() - x.createdTimestamp < 15000
    );

    return e?.executor || null;
  } catch {
    return null;
  }
}

/* =========================================================
   📨 INVITES
========================================================= */

const inviteCache = new Map();

async function cacheInvites(guild) {
  try {
    const invites = await guild.invites.fetch();

    const map = new Map();

    invites.forEach(i => {
      map.set(i.code, {
        uses: i.uses || 0,
        inviterId: i.inviter?.id || null
      });
    });

    inviteCache.set(guild.id, map);
  } catch {}
}

async function usedInvite(guild) {
  try {
    const old = inviteCache.get(guild.id) || new Map();
    const invites = await guild.invites.fetch();

    let found = null;

    for (const i of invites.values()) {
      const previous = old.get(i.code);

      if (
        previous &&
        (i.uses || 0) > previous.uses
      ) {
        found = i;
        break;
      }
    }

    await cacheInvites(guild);
    return found;
  } catch {
    return null;
  }
}

/* =========================================================
   👋 WELCOME
========================================================= */

client.on("guildMemberAdd", async member => {
  const cfg = guildData(member.guild.id);
  const invite = await usedInvite(member.guild);

  if (cfg.welcomeEnabled && cfg.welcomeChannel) {
    const ch = member.guild.channels.cache.get(
      cfg.welcomeChannel
    );

    if (ch) {
      await ch.send({
        embeds: [
          E(
            "👋 ¡BIENVENIDO!",
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
          ).setThumbnail(
            member.user.displayAvatarURL({ size: 512 })
          )
        ]
      }).catch(() => {});
    }
  }

  if (cfg.autorole) {
    const role = member.guild.roles.cache.get(cfg.autorole);
    if (role) await member.roles.add(role).catch(() => {});
  }

  if (cfg.inviteEnabled && cfg.inviteChannel && invite) {
    const ch = member.guild.channels.cache.get(
      cfg.inviteChannel
    );

    if (ch) {
      const who =
        invite.inviter ||
        (invite.inviterId
          ? `<@${invite.inviterId}>`
          : "Desconocido");

      await ch.send({
        embeds: [
          E(
            "📨 NUEVA INVITACIÓN",
            [
              `👤 **Quién entró:** ${member}`,
              `🤝 **Quién lo invitó:** ${who}`,
              `🔗 **Código:** \`${invite.code}\``,
              `📊 **Usos:** ${invite.uses || 0}`
            ].join("\n")
          )
        ]
      }).catch(() => {});
    }
  }

  await log(
    member.guild,
    "👋 MIEMBRO ENTRÓ",
    [
      `👤 Usuario: ${member.user.tag}`,
      `🆔 ID: ${member.id}`,
      `🤝 Invitado por: ${
        invite?.inviter ||
        (invite?.inviterId
          ? `<@${invite.inviterId}>`
          : "Desconocido")
      }`
    ].join("\n")
  );
});

/* =========================================================
   😭 GOODBYE
========================================================= */

client.on("guildMemberRemove", async member => {
  const cfg = guildData(member.guild.id);

  if (cfg.goodbyeEnabled && cfg.goodbyeChannel) {
    const ch = member.guild.channels.cache.get(
      cfg.goodbyeChannel
    );

    if (ch) {
      await ch.send({
        embeds: [
          E(
            "😭 DESPEDIDA",
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

  await log(
    member.guild,
    "😭 MIEMBRO SALIÓ",
    `👤 Usuario: ${member.user.tag}\n🆔 ID: ${member.id}`
  );
});

/* =========================================================
   📜 EVENTOS DE LOG
========================================================= */

client.on("messageDelete", async msg => {
  if (!msg.guild) return;

  await log(
    msg.guild,
    "🗑️ MENSAJE ELIMINADO",
    [
      `👤 Autor: ${msg.author?.tag || "Desconocido"}`,
      `📍 Canal: ${msg.channel}`,
      `💬 ${msg.content || "Sin contenido"}`
    ].join("\n")
  );
});

client.on("messageDeleteBulk", async msgs => {
  const msg = msgs.first();
  if (!msg?.guild) return;

  await log(
    msg.guild,
    "🗑️ MENSAJES ELIMINADOS",
    `📊 Se eliminaron **${msgs.size}** mensajes en ${msg.channel}.`
  );
});

client.on("messageUpdate", async (oldMsg, newMsg) => {
  if (!newMsg.guild) return;
  if (oldMsg.content === newMsg.content) return;

  await log(
    newMsg.guild,
    "✏️ MENSAJE EDITADO",
    [
      `👤 Autor: ${newMsg.author?.tag || "Desconocido"}`,
      `📍 Canal: ${newMsg.channel}`,
      `📝 Antes: ${oldMsg.content || "Sin contenido"}`,
      `📝 Después: ${newMsg.content || "Sin contenido"}`
    ].join("\n")
  );
});

client.on("channelCreate", async ch => {
  if (!ch.guild) return;

  const ex = await executor(
    ch.guild,
    AuditLogEvent.ChannelCreate,
    ch.id
  );

  await log(
    ch.guild,
    "📁 CANAL CREADO",
    `📍 ${ch}\n👤 Por: ${ex || "Desconocido"}`
  );
});

client.on("channelDelete", async ch => {
  if (!ch.guild) return;

  const ex = await executor(
    ch.guild,
    AuditLogEvent.ChannelDelete,
    ch.id
  );

  await log(
    ch.guild,
    "🗑️ CANAL ELIMINADO",
    `📍 #${ch.name}\n👤 Por: ${ex || "Desconocido"}`
  );
});

client.on("channelUpdate", async (a,b) => {
  if (!b.guild) return;

  await log(
    b.guild,
    "📝 CANAL ACTUALIZADO",
    `📍 ${b}\n📝 Antes: ${a.name}\n📝 Ahora: ${b.name}`
  );
});

client.on("roleCreate", async role => {
  const ex = await executor(
    role.guild,
    AuditLogEvent.RoleCreate,
    role.id
  );

  await log(
    role.guild,
    "🎭 ROL CREADO",
    `🎭 ${role}\n👤 Por: ${ex || "Desconocido"}`
  );
});

client.on("roleDelete", async role => {
  const ex = await executor(
    role.guild,
    AuditLogEvent.RoleDelete,
    role.id
  );

  await log(
    role.guild,
    "🗑️ ROL ELIMINADO",
    `🎭 ${role.name}\n👤 Por: ${ex || "Desconocido"}`
  );
});

client.on("roleUpdate", async (a,b) => {
  await log(
    b.guild,
    "📝 ROL ACTUALIZADO",
    `🎭 ${b}\n📝 Antes: ${a.name}\n📝 Ahora: ${b.name}`
  );
});

client.on("guildBanAdd", async ban => {
  const ex = await executor(
    ban.guild,
    AuditLogEvent.MemberBanAdd,
    ban.user.id
  );

  await log(
    ban.guild,
    "🔨 BAN",
    `👤 ${ban.user.tag}\n👑 ${ex || "Desconocido"}\n📝 ${ban.reason || "Sin razón"}`
  );
});

client.on("guildBanRemove", async ban => {
  const ex = await executor(
    ban.guild,
    AuditLogEvent.MemberBanRemove,
    ban.user.id
  );

  await log(
    ban.guild,
    "🔓 UNBAN",
    `👤 ${ban.user.tag}\n👑 ${ex || "Desconocido"}`
  );
});

client.on("inviteCreate", async invite => {
  await cacheInvites(invite.guild);

  await log(
    invite.guild,
    "📨 INVITACIÓN CREADA",
    `🔗 \`${invite.code}\`\n👤 ${invite.inviter || "Desconocido"}`
  );
});

client.on("inviteDelete", async invite => {
  await cacheInvites(invite.guild);

  await log(
    invite.guild,
    "🗑️ INVITACIÓN ELIMINADA",
    `🔗 \`${invite.code}\``
  );
});

client.on("voiceStateUpdate", async (oldS,newS) => {
  if (oldS.channelId === newS.channelId) return;

  let text;

  if (!oldS.channelId) {
    text = `🎙️ Entró a ${newS.channel}`;
  } else if (!newS.channelId) {
    text = `🚪 Salió de ${oldS.channel}`;
  } else {
    text = `🔄 ${oldS.channel} → ${newS.channel}`;
  }

  await log(
    newS.guild,
    "🎙️ VOZ",
    `👤 ${newS.member?.user.tag || "Desconocido"}\n${text}`
  );
});

/* =========================================================
   🔗 ANTI LINK / 🚨 ANTI SPAM
========================================================= */

const spamMap = new Map();

client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot) return;

  const cfg = guildData(message.guild.id);

  if (
    cfg.antiLinks &&
    !admin(message.member) &&
    /(https?:\/\/|www\.|discord\.gg\/|discord\.com\/invite\/)/i.test(
      message.content
    )
  ) {
    await message.delete().catch(() => {});

    if (message.member.moderatable) {
      await message.member.timeout(
        7200000,
        "🌌 Anti-Link"
      ).catch(() => {});
    }

    const warns = addWarn(
      message.guild,
      message.member,
      client.user,
      "Anti-Link"
    );

    await log(
      message.guild,
      "🔗 ANTI-LINK",
      `👤 ${message.author.tag}\n⏱️ Timeout: **2 horas**\n⚠️ Warns: **${warns}**`
    );

    return;
  }

  if (
    cfg.antiSpam &&
    !admin(message.member)
  ) {
    const key =
      `${message.guild.id}:${message.author.id}`;

    const now = Date.now();
    const old =
      spamMap.get(key) || {
        count: 0,
        last: 0
      };

    old.count =
      now - old.last < 10000
        ? old.count + 1
        : 1;

    old.last = now;

    spamMap.set(key, old);

    if (old.count >= 5) {
      spamMap.delete(key);

      const warns = addWarn(
        message.guild,
        message.member,
        client.user,
        "Anti-Spam"
      );

      await log(
        message.guild,
        "🚨 ANTI-SPAM",
        `👤 ${message.author.tag}\n⚠️ Warns: **${warns}**`
      );

      await message.channel.send({
        embeds: [
          E(
            "🚨 ANTI-SPAM",
            `${message.author} recibió un warn automático por enviar 5 mensajes consecutivos.`
          )
        ]
      }).catch(() => {});
    }
  }
});

/* =========================================================
   📚 HELP
========================================================= */

const publicCategories = {
  general: {
    emoji: "🌌",
    name: "General",
    commands: [
      "help","ping","botinfo","serverinfo","userinfo",
      "avatar","banner","profile","invite","servericon",
      "membercount","channelinfo","roleinfo","timestamp","whois",
      "id","afk","serverage","userage","channels",
      "roles","emojis","boosts","support","date",
      "time","guildid","botid","serverowner","created"
    ]
  },

  economy: {
    emoji: "💰",
    name: "Economía",
    commands: [
      "balance","work","daily","crime","rob",
      "beg","deposit","withdraw","dep","with",
      "pay","leaderboard","richest","bank","wallet",
      "money","economy","cash","give","salary",
      "bonus","income","expenses","networth","economystats",
      "gig","hustle","depositall","withdrawall","pocket"
    ]
  },

  fun: {
    emoji: "🎮",
    name: "Diversión",
    commands: [
      "slots","coinflip","dice","blackjack","guess",
      "8ball","roll","choose","rate","ship",
      "joke","meme","rps","trivia","random",
      "reverse","sayfun","ascii","emojify","number",
      "fortune","fact","roast","compliment","roulette",
      "double","highlow","magic","truth","dare"
    ]
  },

  social: {
    emoji: "💗",
    name: "Social",
    commands: [
      "hug","kiss","pat","poke","highfive",
      "wave","slap","compliment","friend","ship",
      "cuddle","dance","smile","wink","happy",
      "love","greet","goodnight","goodmorning","thank",
      "applaud","cheer","support","react","interaction",
      "respect","fistbump","salute","handshake","clap"
    ]
  },

  levels: {
    emoji: "⭐",
    name: "Niveles",
    commands: [
      "level","rank","xp","top","levels",
      "nextlevel","progress","leaderboardxp","levelinfo",
      "xprequired","myxp","mylevel","leveltop","xptop",
      "rankinfo","levelstats","xpstats","progressbar","levelup",
      "experience","ranking","levelboard","xpleaderboard",
      "levelcheck","rewards","levelcard","xpleft",
      "xppercent","levelrank","levelnext"
    ]
  },

  utilities: {
    emoji: "🛠️",
    name: "Utilidades",
    commands: [
      "servericon","channelinfo","roleinfo","membercount",
      "timestamp","calculator","poll","remind",
      "avatar","banner","userinfo","serverinfo","uptime",
      "ping","say","embed","choose","roll","random",
      "translate","weather","timer","afk","help","calc",
      "math","count","mention","now","unix"
    ]
  }
};

const adminCategories = {
  moderation: {
    emoji: "🛡️",
    name: "Moderación",
    commands: [
      "ban","unban","kick","timeout","untimeout",
      "warn","unwarn","clearwarns","clear","lock",
      "unlock","slowmode","nick","resetnick","mute",
      "unmute","purge","massban","modlog","warnings",
      "warns","checkwarns","kickall","modinfo","antilinks",
      "antispam","baninfo","timeoutinfo","automod","clearall"
    ]
  },

  configuration: {
    emoji: "⚙️",
    name: "Configuración",
    commands: [
      "welcome","goodbye","invites","logs","welcomeon",
      "welcomeoff","goodbyeon","goodbyeoff","inviteson",
      "invitesoff","logson","logsoff","autorole",
      "autoroleoff","prefix","setup","serverconfig",
      "welcomechannel","goodbyechannel","invitechannel",
      "logchannel","setrules","setticket","config",
      "resetconfig","antilinksconfig","antispamconfig",
      "ticket","setlog","features"
    ]
  },

  administration: {
    emoji: "👑",
    name: "Administración",
    commands: [
      "addmoney","removemoney","setmoney","addbank",
      "removebank","setbank","addxp","removexp",
      "setxp","addlevel","setlevel","resetuser",
      "setwarns","resetwarns","giveall","takeall",
      "createrole","deleterole","role",
      "createchannel","deletechannel","announce","say",
      "embed","server","removelevel","resetxp",
      "resetmoney","resetbank","serverstats"
    ]
  }
};

function helpMenu(adminPanel) {
  const source =
    adminPanel
      ? adminCategories
      : publicCategories;

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(
        adminPanel
          ? "admin_help"
          : "public_help"
      )
      .setPlaceholder("🌌 Selecciona una categoría...")
      .addOptions(
        Object.entries(source).map(([key,c]) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(c.name)
            .setDescription("Ver los 30 comandos")
            .setEmoji(c.emoji)
            .setValue(key)
        )
      )
  );
}

/* =========================================================
   🎫 TICKETS
========================================================= */

const ticketTypes = {
  general: ["💬 General","Dudas o problemas"],
  postulaciones: ["📝 Postulaciones","Postulaciones abiertas!"],
  reportar: ["🚨 Reportar a un usuario","Reportar a infractores"],
  bug: ["🐛 Reportar Bug","Reportar bugs del servidor"],
  alianzas: ["🤝 Alianzas","Para aliarte"],
  afiliaciones: ["🌠 Afiliaciones","Afiliarte (obligatorio everyone)"],
  partners: ["🤠 Partners","Para ser partners"]
};

const ticketClaims = new Map();

async function makeTicket(interaction,type) {
  const guild = interaction.guild;
  const member = interaction.member;
  const cfg = guildData(guild.id);

  const existing = guild.channels.cache.find(
    c =>
      c.type === ChannelType.GuildText &&
      c.topic === `ticket:${member.id}`
  );

  if (existing) {
    return interaction.reply({
      content: `❌ Ya tienes un ticket abierto: ${existing}`,
      ephemeral: true
    });
  }

  const category =
    cfg.ticketCategory
      ? guild.channels.cache.get(cfg.ticketCategory)
      : null;

  const name =
    `ticket-${member.user.username}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g,"")
      .slice(0,20);

  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent:
      category?.type === ChannelType.GuildCategory
        ? category.id
        : undefined,
    topic: `ticket:${member.id}`,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      {
        id: member.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      }
    ]
  }).catch(() => null);

  if (!channel) {
    return interaction.reply({
      content: "❌ No pude crear el ticket.",
      ephemeral: true
    });
  }

  const [title,desc] = ticketTypes[type];

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("claim_ticket")
      .setLabel("🎟️ Reclamar ticket")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("close_ticket")
      .setLabel("🔒 Cerrar ticket")
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({
    content: `${member}`,
    embeds: [
      E(
        title,
        [
          `📌 ${desc}`,
          "",
          "👑 Solo un administrador puede reclamar este ticket.",
          "🚫 El creador del ticket no puede reclamarlo.",
          "🔒 El creador tampoco puede cerrarlo.",
          "✅ Solo el administrador que lo reclame podrá cerrarlo."
        ].join("\n")
      )
    ],
    components: [row]
  });

  await interaction.reply({
    content: `🎫 Ticket creado: ${channel}`,
    ephemeral: true
  });

  await log(
    guild,
    "🎫 TICKET CREADO",
    `👤 ${member.user.tag}\n📂 ${title}\n📍 ${channel}`
  );
}

/* =========================================================
   🎮 MESSAGE COMMANDS
========================================================= */

client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot) return;

  const cfg = guildData(message.guild.id);
  const u = userData(message.author.id);

  /* AFK */

  if (u.afk && !message.content.startsWith(PREFIX)) {
    u.afk = false;
    u.afkReason = "";
    save();

    await message.channel.send({
      embeds: [
        E(
          "💤 AFK TERMINADO",
          `${message.author} ya no está AFK.`
        )
      ]
    }).catch(() => {});
  }

  for (const member of message.mentions.members.values()) {
    const mentioned = userData(member.id);

    if (mentioned.afk) {
      await message.channel.send({
        embeds: [
          E(
            "💤 USUARIO AFK",
            `${member} está AFK.\n📝 ${mentioned.afkReason}`
          )
        ]
      }).catch(() => {});
    }
  }

  if (!message.content.startsWith(PREFIX)) return;

  const parts =
    message.content.slice(PREFIX.length).trim().split(/\s+/);

  const cmd = (parts.shift() || "").toLowerCase();
  const args = parts;

  if (!cmd) return;

  addXP(message.author.id, rand(3,8));

  /* =======================================================
     HELP
  ======================================================= */

  if (cmd === "help") {
    return message.reply({
      embeds: [
        E(
          "🌌 MATI NEXUS BOT",
          [
            "Selecciona una categoría para ver los comandos.",
            "",
            "🌌 General",
            "💰 Economía",
            "🎮 Diversión",
            "💗 Social",
            "⭐ Niveles",
            "🛠️ Utilidades",
            "",
            "📚 Cada categoría muestra los comandos en **2 páginas**.",
            "🚫 No hay menú individual de comandos."
          ].join("\n")
        )
      ],
      components: [helpMenu(false)]
    });
  }

  if (cmd === "helpad") {
    if (!admin(message.member))
      return message.reply({
        embeds: [ERR("Solo administradores.")]
      });

    return message.reply({
      embeds: [
        E(
          "👑 PANEL ADMINISTRATIVO",
          "Selecciona una categoría administrativa."
        )
      ],
      components: [helpMenu(true)]
    });
  }

  /* =======================================================
     GENERAL
  ======================================================= */

  if (cmd === "ping") {
    return message.reply({
      embeds: [
        E(
          "🏓 PONG",
          `📡 Latencia: **${client.ws.ping}ms**`
        )
      ]
    });
  }

  if (cmd === "botinfo") {
    return message.reply({
      embeds: [
        E(
          "🤖 INFORMACIÓN DEL BOT",
          [
            "🌌 **Mati Nexus BOT**",
            "",
            "🧡 Bot oficial de **ミ🧡Mati Nexus🩷彡**",
            "👤 Creador: **rykeryt.25, ryan_lamienyamal**",
            "🧡 Fundador: **mati_jojojo**",
            `🌐 Servidores: **${client.guilds.cache.size}**`,
            `📡 Ping: **${client.ws.ping}ms**`
          ].join("\n")
        )
      ]
    });
  }

  if (
    ["serverinfo","server","serverstats"].includes(cmd)
  ) {
    return message.reply({
      embeds: [
        E(
          "🏠 INFORMACIÓN DEL SERVIDOR",
          [
            `🏠 **${message.guild.name}**`,
            `🆔 \`${message.guild.id}\``,
            `👥 Miembros: **${message.guild.memberCount}**`,
            `💬 Canales: **${message.guild.channels.cache.size}**`,
            `🎭 Roles: **${message.guild.roles.cache.size}**`,
            `😀 Emojis: **${message.guild.emojis.cache.size}**`,
            `🚀 Boosts: **${message.guild.premiumSubscriptionCount || 0}**`,
            `👑 Dueño: <@${message.guild.ownerId}>`
          ].join("\n")
        )
      ]
    });
  }

  if (
    ["userinfo","whois","profile"].includes(cmd)
  ) {
    const target =
      memberOf(message.guild,args[0]) ||
      message.member;

    const d = userData(target.id);

    return message.reply({
      embeds: [
        E(
          "👤 PERFIL",
          [
            `👤 Usuario: ${target}`,
            `🏷️ Tag: **${target.user.tag}**`,
            `🆔 ID: \`${target.id}\``,
            `⭐ Nivel: **${d.level}**`,
            `✨ XP: **${d.xp}**`,
            `💰 Dinero: **${money(d.wallet+d.bank)}**`,
            `⚠️ Warns: **${d.warns}**`
          ].join("\n")
        ).setThumbnail(
          target.user.displayAvatarURL({size:512})
        )
      ]
    });
  }

  if (["avatar","servericon"].includes(cmd)) {
    if (cmd === "servericon") {
      const icon = message.guild.iconURL({size:2048});

      return message.reply({
        embeds: [
          E(
            "🖼️ ICONO DEL SERVIDOR",
            icon ? `[Abrir imagen](${icon})` : "Sin icono."
          ).setImage(icon || null)
        ]
      });
    }

    const target =
      memberOf(message.guild,args[0]) ||
      message.member;

    const avatar =
      target.user.displayAvatarURL({size:2048});

    return message.reply({
      embeds: [
        E(
          "🖼️ AVATAR",
          `[Abrir imagen](${avatar})`
        ).setImage(avatar)
      ]
    });
  }

  if (cmd === "banner") {
    const target =
      memberOf(message.guild,args[0]) ||
      message.member;

    const usr =
      await client.users.fetch(target.id,{force:true});

    if (!usr.banner) {
      return message.reply({
        embeds: [ERR("Este usuario no tiene banner.")]
      });
    }

    const banner = usr.bannerURL({size:2048});

    return message.reply({
      embeds: [
        E(
          "🖼️ BANNER",
          `[Abrir banner](${banner})`
        ).setImage(banner)
      ]
    });
  }

  if (
    [
      "membercount","channels","roles","emojis",
      "boosts","guildid","botid","serverowner",
      "created","serverage","userage","id"
    ].includes(cmd)
  ) {
    return message.reply({
      embeds: [
        E(
          "📊 INFORMACIÓN",
          [
            `👥 Miembros: **${message.guild.memberCount}**`,
            `💬 Canales: **${message.guild.channels.cache.size}**`,
            `🎭 Roles: **${message.guild.roles.cache.size}**`,
            `😀 Emojis: **${message.guild.emojis.cache.size}**`,
            `🚀 Boosts: **${message.guild.premiumSubscriptionCount || 0}**`,
            `🆔 Servidor: \`${message.guild.id}\``,
            `🤖 Bot: \`${client.user.id}\``,
            `👑 Dueño: <@${message.guild.ownerId}>`
          ].join("\n")
        )
      ]
    });
  }

  if (cmd === "channelinfo") {
    const ch =
      channelOf(message.guild,args[0]) ||
      message.channel;

    return message.reply({
      embeds: [
        E(
          "📁 CANAL",
          [
            `📛 Nombre: **${ch.name}**`,
            `🆔 ID: \`${ch.id}\``,
            `📌 Tipo: **${ch.type}**`
          ].join("\n")
        )
      ]
    });
  }

  if (cmd === "roleinfo") {
    const role = roleOf(message.guild,args[0]);

    if (!role)
      return message.reply({
        embeds: [ERR("Rol no encontrado.")]
      });

    return message.reply({
      embeds: [
        E(
          "🎭 ROL",
          [
            `🎭 ${role}`,
            `📛 **${role.name}**`,
            `🆔 \`${role.id}\``,
            `👥 Miembros: **${role.members.size}**`
          ].join("\n")
        )
      ]
    });
  }

  if (
    ["timestamp","date","time","now","unix"].includes(cmd)
  ) {
    const unix = Math.floor(Date.now()/1000);

    return message.reply({
      embeds: [
        E(
          "🕐 FECHA Y HORA",
          [
            `📅 <t:${unix}:F>`,
            `⏰ <t:${unix}:R>`,
            `🔢 Unix: \`${unix}\``
          ].join("\n")
        )
      ]
    });
  }

  if (cmd === "invite") {
    return message.reply({
      embeds: [
        E(
          "🔗 INVITACIÓN",
          `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`
        )
      ]
    });
  }

  if (cmd === "support") {
    return message.reply({
      embeds: [
        E(
          "🎫 SOPORTE",
          "Usa `m.ticket` para abrir un ticket."
        )
      ]
    });
  }

  /* =======================================================
     💰 ECONOMÍA
  ======================================================= */

  if (
    [
      "balance","wallet","bank","money",
      "economy","cash","networth","pocket"
    ].includes(cmd)
  ) {
    return message.reply({
      embeds: [
        E(
          "💰 ECONOMÍA",
          [
            `👛 Cartera: **${money(u.wallet)}**`,
            `🏦 Banco: **${money(u.bank)}**`,
            `💎 Total: **${money(u.wallet+u.bank)}**`
          ].join("\n")
        )
      ]
    });
  }

  const earn = {
    work:["work",30000,100,300,"💼 WORK"],
    daily:["daily",86400000,500,1000,"🎁 DAILY"],
    beg:["beg",60000,20,100,"🥺 BEG"],
    salary:["salary",60000,150,350,"💼 SALARY"],
    bonus:["bonus",90000,100,250,"🎁 BONUS"],
    income:["income",45000,75,200,"💵 INCOME"],
    gig:["gig",45000,100,250,"🧰 GIG"],
    hustle:["hustle",60000,120,300,"🔥 HUSTLE"]
  };

  if (earn[cmd]) {
    const [key,time,min,max,title] = earn[cmd];

    const left = cd(u,key,time);

    if (left)
      return message.reply({
        embeds: [
          ERR(`Debes esperar **${cdText(left)}**.`)
        ]
      });

    const amount = rand(min,max);

    u.wallet += amount;
    save();

    return message.reply({
      embeds: [
        E(
          title,
          [
            `💰 Ganaste: **${money(amount)}**`,
            `👛 Cartera: **${money(u.wallet)}**`
          ].join("\n")
        )
      ]
    });
  }

  if (cmd === "crime") {
    const left = cd(u,"crime",120000);

    if (left)
      return message.reply({
        embeds: [ERR(`Espera **${cdText(left)}**.`)]
      });

    if (Math.random() < .2) {
      const amount = rand(500,700);
      u.wallet += amount;
      save();

      return message.reply({
        embeds: [
          E(
            "🕶️ CRIME",
            `🎉 Salió bien.\n\n💰 Ganaste **${money(amount)}**.`
          )
        ]
      });
    }

    u.wallet = Math.max(0,u.wallet-600);
    save();

    return message.reply({
      embeds: [
        E(
          "🚓 CRIME",
          "❌ Te atraparon.\n\n💸 Perdiste **600 💰**."
        )
      ]
    });
  }

  if (cmd === "rob") {
    const left = cd(u,"rob",120000);

    if (left)
      return message.reply({
        embeds: [ERR(`Espera **${cdText(left)}**.`)]
      });

    const target = memberOf(message.guild,args[0]);

    if (!target || target.id === message.author.id)
      return message.reply({
        embeds: [ERR("Usa `m.rob @usuario`.")]
      });

    const victim = userData(target.id);

    if (victim.wallet <= 0)
      return message.reply({
        embeds: [ERR("Ese usuario no tiene dinero.")]
      });

    if (Math.random() < .5) {
      const amount =
        Math.min(victim.wallet,rand(50,Math.max(50,victim.wallet)));

      victim.wallet -= amount;
      u.wallet += amount;

      save();

      return message.reply({
        embeds: [
          E(
            "🥷 ROB",
            `🎉 Robaste **${money(amount)}** a ${target}.`
          )
        ]
      });
    }

    const fine = Math.min(u.wallet,300);
    u.wallet -= fine;
    save();

    return message.reply({
      embeds: [
        E(
          "🚔 ROB",
          `❌ Te descubrieron.\n💸 Perdiste **${money(fine)}**.`
        )
      ]
    });
  }

  if (["deposit","dep","depositall"].includes(cmd)) {
    const amount =
      args[0]?.toLowerCase() === "all"
        ? u.wallet
        : Number(args[0]);

    if (!Number.isInteger(amount) || amount <= 0 || amount > u.wallet)
      return message.reply({
        embeds: [ERR("Cantidad inválida.")]
      });

    u.wallet -= amount;
    u.bank += amount;
    save();

    return message.reply({
      embeds: [
        OK(`Depositaste **${money(amount)}**.`)
      ]
    });
  }

  if (["withdraw","with","withdrawall"].includes(cmd)) {
    const amount =
      args[0]?.toLowerCase() === "all"
        ? u.bank
        : Number(args[0]);

    if (!Number.isInteger(amount) || amount <= 0 || amount > u.bank)
      return message.reply({
        embeds: [ERR("Cantidad inválida.")]
      });

    u.bank -= amount;
    u.wallet += amount;
    save();

    return message.reply({
      embeds: [
        OK(`Retiraste **${money(amount)}**.`)
      ]
    });
  }

  if (["pay","give"].includes(cmd)) {
    const target = memberOf(message.guild,args[0]);
    const amount = Number(args[1]);

    if (!target || !Number.isInteger(amount) || amount <= 0)
      return message.reply({
        embeds: [ERR("Usa `m.pay @usuario cantidad`.")]
      });

    if (amount > u.wallet)
      return message.reply({
        embeds: [ERR("No tienes suficiente dinero.")]
      });

    const receiver = userData(target.id);

    u.wallet -= amount;
    receiver.wallet += amount;
    save();

    return message.reply({
      embeds: [
        E(
          "💸 TRANSFERENCIA",
          `👤 ${target}\n💰 Cantidad: **${money(amount)}**`
        )
      ]
    });
  }

  if (
    ["leaderboard","richest","economystats"].includes(cmd)
  ) {
    const list =
      Object.entries(data.users)
        .map(([id,d]) => ({
          id,
          total:(d.wallet||0)+(d.bank||0)
        }))
        .sort((a,b)=>b.total-a.total)
        .slice(0,10);

    return message.reply({
      embeds: [
        E(
          "🏆 TOP ECONOMÍA",
          list.map(
            (x,i) =>
              `**${i+1}.** <@${x.id}> — **${money(x.total)}**`
          ).join("\n") || "Sin datos."
        )
      ]
    });
  }

  /* =======================================================
     🎮 JUEGOS
  ======================================================= */

  if (cmd === "slots") {
    let amount =
      args[0]?.toLowerCase() === "all"
        ? u.wallet
        : Number(args[0]);

    if (!Number.isInteger(amount) || amount <= 0 || amount > u.wallet)
      return message.reply({
        embeds: [ERR("Usa `m.slots cantidad` o `m.slots all`.")]
      });

    const icons = ["🍒","🍋","🍉","⭐","💎","7️⃣"];

    const a = icons[rand(0,5)];
    const b = icons[rand(0,5)];
    const c = icons[rand(0,5)];

    let change = -amount;

    if (a===b && b===c) change = amount*5;
    else if (a===b || b===c || a===c) change = amount;

    u.wallet += change;
    save();

    return message.reply({
      embeds: [
        E(
          "🎰 SLOTS",
          [
            `${a} │ ${b} │ ${c}`,
            "",
            change > 0
              ? `🎉 Ganaste **${money(change)}**`
              : change === 0
                ? "🤝 Recuperaste la apuesta."
                : `💸 Perdiste **${money(Math.abs(change))}`,
            `👛 Saldo: **${money(u.wallet)}**`
          ].join("\n")
        )
      ]
    });
  }

  if (["coinflip","dice","roll"].includes(cmd)) {
    let result;

    if (cmd === "coinflip")
      result = Math.random()<.5 ? "🪙 CARA" : "🪙 CRUZ";

    if (cmd === "dice")
      result = `🎲 Resultado: **${rand(1,6)}**`;

    if (cmd === "roll")
      result = `🎲 Resultado: **${rand(1,100)}**`;

    return message.reply({
      embeds: [E(`🎮 ${cmd.toUpperCase()}`,result)]
    });
  }

  if (cmd === "blackjack") {
    let amount =
      args[0]?.toLowerCase() === "all"
        ? u.wallet
        : Number(args[0]);

    if (!Number.isInteger(amount) || amount<=0 || amount>u.wallet)
      return message.reply({
        embeds: [ERR("Usa `m.blackjack cantidad` o `all`.")]
      });

    const player=rand(15,21);
    const dealer=rand(15,21);

    let change=0;

    if (player<=21 && (player>dealer || dealer>21))
      change=player===21 ? amount*2 : amount;
    else if(player===dealer)
      change=0;
    else
      change=-amount;

    u.wallet+=change;
    save();

    return message.reply({
      embeds: [
        E(
          "🃏 BLACKJACK",
          [
            `👤 Tú: **${player}**`,
            `🤖 Dealer: **${dealer}**`,
            "",
            change>0
              ? `🎉 Ganaste **${money(change)}**`
              : change===0
                ? "🤝 Empate."
                : `💸 Perdiste **${money(amount)}**`,
            `👛 Saldo: **${money(u.wallet)}**`
          ].join("\n")
        )
      ]
    });
  }

  if (cmd === "roulette") {
    const n=rand(0,36);

    return message.reply({
      embeds: [
        E(
          "🎡 RULETA",
          `🎯 Salió el número **${n}**.`
        )
      ]
    });
  }

  if (cmd === "double") {
    let amount =
      args[0]?.toLowerCase()==="all"
        ? u.wallet
        : Number(args[0]);

    if (!Number.isInteger(amount)||amount<=0||amount>u.wallet)
      return message.reply({
        embeds:[ERR("Cantidad inválida.")]
      });

    if(Math.random()<.5){
      u.wallet+=amount;
      save();

      return message.reply({
        embeds:[
          E(
            "🎲 DOUBLE",
            `🎉 Ganaste **${money(amount)}**.`
          )
        ]
      });
    }

    u.wallet-=amount;
    save();

    return message.reply({
      embeds:[
        E(
          "🎲 DOUBLE",
          `💸 Perdiste **${money(amount)}**.`
        )
      ]
    });
  }

  if (cmd === "highlow") {
    const n=rand(1,100);

    return message.reply({
      embeds:[
        E(
          "📈 HIGHLOW",
          `🔢 Número generado: **${n}**`
        )
      ]
    });
  }

  if (cmd === "trivia") {
    const questions=[
      ["¿Cuál es la capital de Francia?","paris"],
      ["¿Cuántos continentes hay?","7"],
      ["¿Cuál es el planeta rojo?","marte"]
    ];

    const q=questions[rand(0,questions.length-1)];

    return message.reply({
      embeds:[
        E(
          "🧠 TRIVIA",
          `${q[0]}\n\n💡 Respuesta: **${q[1]}**`
        )
      ]
    });
  }

  if (cmd === "guess") {
    const n=rand(1,10);
    const x=Number(args[0]);

    return message.reply({
      embeds:[
        E(
          "🔢 GUESS",
          x===n
            ? `🎉 ¡Correcto! Era **${n}**.`
            : `❌ Era **${n}**.`
        )
      ]
    });
  }

  if (cmd === "8ball") {
    const answers=[
      "🎱 Sí.",
      "🎱 No.",
      "🎱 Probablemente.",
      "🎱 Definitivamente.",
      "🎱 Pregunta otra vez."
    ];

    return message.reply({
      embeds:[
        E("🎱 8BALL",answers[rand(0,answers.length-1)])
      ]
    });
  }

  if (cmd === "choose") {
    if(!args.length)
      return message.reply({
        embeds:[ERR("Pon varias opciones.")]
      });

    return message.reply({
      embeds:[
        E(
          "🎯 CHOOSE",
          `Elegí: **${args[rand(0,args.length-1)]}**`
        )
      ]
    });
  }

  if (cmd === "rate") {
    return message.reply({
      embeds:[
        E(
          "⭐ RATE",
          `📊 Resultado: **${rand(0,100)}/100**`
        )
      ]
    });
  }

  if (cmd === "rps") {
    const choices=["piedra","papel","tijera"];
    const x=args[0]?.toLowerCase();

    if(!choices.includes(x))
      return message.reply({
        embeds:[ERR("Usa piedra, papel o tijera.")]
      });

    const b=choices[rand(0,2)];

    let result;

    if(x===b) result="🤝 Empate.";
    else if(
      (x==="piedra"&&b==="tijera")||
      (x==="papel"&&b==="piedra")||
      (x==="tijera"&&b==="papel")
    ) result="🎉 Ganaste.";
    else result="🤖 Gané yo.";

    return message.reply({
      embeds:[
        E(
          "✊ PIEDRA PAPEL TIJERA",
          `👤 Tú: **${x}**\n🤖 Bot: **${b}**\n\n${result}`
        )
      ]
    });
  }

  if (
    [
      "joke","meme","fortune","fact",
      "magic","truth","dare","roast"
    ].includes(cmd)
  ) {
    const texts={
      joke:"😂 ¿Qué hace una abeja en el gimnasio? ¡Zum-ba!",
      meme:"😂 El bot viendo que abriste otro comando.",
      fortune:"🔮 Algo interesante puede aparecer hoy.",
      fact:"🧠 Los pulpos tienen tres corazones.",
      magic:"✨ La magia dice que todo puede pasar.",
      truth:"💭 Di algo verdadero.",
      dare:"🔥 Reto: usa otro comando.",
      roast:"🔥 Roast amistoso activado."
    };

    return message.reply({
      embeds:[
        E(`🎮 ${cmd.toUpperCase()}`,texts[cmd])
      ]
    });
  }

  if (cmd === "reverse") {
    return message.reply({
      embeds:[
        E(
          "🔄 REVERSE",
          args.join(" ").split("").reverse().join("")
        )
      ]
    });
  }

  if (cmd === "ascii") {
    return message.reply({
      embeds:[
        E(
          "🔤 ASCII",
          `\`\`\`\n${args.join(" ").toUpperCase()}\n\`\`\``
        )
      ]
    });
  }

  if (cmd === "emojify") {
    return message.reply({
      embeds:[
        E(
          "😀 EMOJIFY",
          args.join(" ")
            .replace(/a/gi,"🅰️")
            .replace(/b/gi,"🅱️")
        )
      ]
    });
  }

  if (cmd === "number") {
    return message.reply({
      embeds:[
        E(
          "🔢 NUMBER",
          `🎲 **${rand(1,1000)}**`
        )
      ]
    });
  }

  if (
    [
      "hug","kiss","pat","poke","highfive",
      "wave","slap","compliment","friend","ship",
      "cuddle","dance","smile","wink","happy",
      "love","greet","goodnight","goodmorning","thank",
      "applaud","cheer","support","react","interaction",
      "respect","fistbump","salute","handshake","clap"
    ].includes(cmd)
  ) {
    const target =
      memberOf(message.guild,args[0]) ||
      message.member;

    const actions={
      hug:"🤗 tuvo una interacción amistosa con",
      kiss:"💗 mandó un saludo cariñoso a",
      pat:"🥹 felicitó a",
      poke:"👉 interactuó con",
      highfive:"🙌 chocó los cinco con",
      wave:"👋 saludó a",
      slap:"🖐️ hizo una interacción de broma con",
      compliment:"💗 felicitó a",
      friend:"🤝 se hizo amigo de",
      ship:"💞 calculó compatibilidad amistosa con",
      cuddle:"🧸 tuvo una interacción amistosa con",
      dance:"💃 bailó con",
      smile:"😊 sonrió a",
      wink:"😉 guiñó a",
      happy:"😄 compartió felicidad con",
      love:"❤️ mandó cariño a",
      greet:"👋 saludó a",
      goodnight:"🌙 deseó buenas noches a",
      goodmorning:"☀️ deseó buenos días a",
      thank:"🙏 agradeció a",
      applaud:"👏 aplaudió a",
      cheer:"📣 animó a",
      support:"💗 apoyó a",
      react:"✨ reaccionó con",
      interaction:"💫 interactuó con",
      respect:"🫡 mostró respeto a",
      fistbump:"👊 chocó puños con",
      salute:"🫡 saludó a",
      handshake:"🤝 estrechó la mano de",
      clap:"👏 aplaudió a"
    };

    let text=`${actions[cmd]} ${target}.`;

    if(cmd==="ship")
      text+=`\n📊 Compatibilidad: **${rand(0,100)}%**`;

    return message.reply({
      embeds:[
        E(`💗 ${cmd.toUpperCase()}`,text)
      ]
    });
  }

  /* =======================================================
     ⭐ LEVELS
  ======================================================= */

  if (
    [
      "level","rank","xp","top","levels",
      "nextlevel","progress","leaderboardxp",
      "levelinfo","xprequired","myxp","mylevel",
      "leveltop","xptop","rankinfo","levelstats",
      "xpstats","progressbar","levelup",
      "experience","ranking","levelboard",
      "xpleaderboard","levelcheck","rewards",
      "levelcard","xpleft","xppercent",
      "levelrank","levelnext"
    ].includes(cmd)
  ) {
    const required=u.level*100;
    const percent=Math.floor((u.xp/required)*100);

    return message.reply({
      embeds:[
        E(
          "⭐ NIVEL",
          [
            `👤 ${message.author}`,
            `🏆 Nivel: **${u.level}**`,
            `✨ XP: **${u.xp}/${required}**`,
            `📊 Progreso: **${percent}%**`,
            `⬆️ Falta: **${required-u.xp} XP**`
          ].join("\n")
        )
      ]
    });
  }

  /* =======================================================
     🛠️ UTILIDADES
  ======================================================= */

  if (["calculator","calc","math"].includes(cmd)) {
    const expression=args.join(" ");

    if(!/^[0-9+\-*/().%\s]+$/.test(expression))
      return message.reply({
        embeds:[ERR("Operación inválida.")]
      });

    try {
      const result=Function(
        `"use strict";return (${expression})`
      )();

      return message.reply({
        embeds:[
          E(
            "🧮 CALCULADORA",
            `\`${expression}\` = **${result}**`
          )
        ]
      });
    } catch {
      return message.reply({
        embeds:[ERR("No pude calcular.")]
      });
    }
  }

  if (cmd === "poll") {
    const text=args.join(" ");

    if(!text)
      return message.reply({
        embeds:[ERR("Escribe la pregunta.")]
      });

    const msg=await message.channel.send({
      embeds:[
        E("📊 ENCUESTA",text)
      ]
    });

    await msg.react("👍").catch(()=>{});
    await msg.react("👎").catch(()=>{});
    return;
  }

  if (
    ["uptime","timer","remind"].includes(cmd)
  ) {
    const amount=Number(args[0])||10;
    const ms=amount*1000;

    await message.reply({
      embeds:[
        E(
          "⏰ TEMPORIZADOR",
          `⏱️ Avisaré en **${amount} segundos**.`
        )
      ]
    });

    setTimeout(()=>{
      message.channel.send({
        embeds:[
          E(
            "⏰ RECORDATORIO",
            `${message.author}\n${args.slice(1).join(" ")||"¡Tiempo terminado!"}`
          )
        ]
      }).catch(()=>{});
    },ms);

    return;
  }

  if (cmd === "mention") {
    const target=memberOf(message.guild,args[0]);

    if(!target)
      return message.reply({
        embeds:[ERR("Usuario no encontrado.")]
      });

    return message.reply({
      embeds:[
        E("📣 MENCIÓN",`${target}`)
      ]
    });
  }

  if (cmd === "translate") {
    const dict={
      hello:"hola",
      hi:"hola",
      goodbye:"adiós",
      thanks:"gracias",
      please:"por favor",
      friend:"amigo",
      server:"servidor",
      welcome:"bienvenido",
      hola:"hello",
      gracias:"thanks",
      amigo:"friend",
      servidor:"server",
      bienvenido:"welcome"
    };

    const text=args.join(" ");

    return message.reply({
      embeds:[
        E(
          "🌐 TRANSLATE",
          text.split(/\s+/)
            .map(x=>dict[x.toLowerCase()]||x)
            .join(" ")
        )
      ]
    });
  }

  if (cmd === "weather") {
    return message.reply({
      embeds:[
        E(
          "🌦️ WEATHER",
          `🌍 Ciudad solicitada: **${args.join(" ")||"No indicada"}**\n\n⚠️ Para clima en tiempo real se necesita una API meteorológica.`
        )
      ]
    });
  }

  if (cmd === "afk") {
    u.afk=true;
    u.afkReason=args.join(" ")||"Sin razón";
    save();

    return message.reply({
      embeds:[
        E(
          "💤 AFK",
          `✅ AFK activado.\n📝 ${u.afkReason}`
        )
      ]
    });
  }

  /* =======================================================
     🛡️ ADMIN
  ======================================================= */

  const adminCommands=[
    "ban","unban","kick","timeout","untimeout",
    "warn","unwarn","clearwarns","clear","lock",
    "unlock","slowmode","nick","resetnick","mute",
    "unmute","purge","massban","modlog","warnings",
    "warns","checkwarns","kickall","modinfo",
    "antilinks","antispam","baninfo","timeoutinfo",
    "automod","clearall",

    "welcome","goodbye","invites","logs","welcomeon",
    "welcomeoff","goodbyeon","goodbyeoff","inviteson",
    "invitesoff","logson","logsoff","autorole",
    "autoroleoff","prefix","setup","serverconfig",
    "welcomechannel","goodbyechannel","invitechannel",
    "logchannel","setrules","setticket","config",
    "resetconfig","antilinksconfig","antispamconfig",
    "ticket","setlog","features",

    "addmoney","removemoney","setmoney","addbank",
    "removebank","setbank","addxp","removexp",
    "setxp","addlevel","setlevel","resetuser",
    "setwarns","resetwarns","giveall","takeall",
    "createrole","deleterole","role","createchannel",
    "deletechannel","announce","say","embed","server",
    "removelevel","resetxp","resetmoney","resetbank",
    "serverstats"
  ];

  if (!adminCommands.includes(cmd)) return;

  if (!admin(message.member)) {
    return message.reply({
      embeds:[
        ERR("Este comando requiere permisos de Administrador.")
      ]
    });
  }

  /* MODERATION */

  if (cmd === "ban") {
    const target=memberOf(message.guild,args[0]);

    if(!target||!target.bannable)
      return message.reply({
        embeds:[ERR("No puedo banear a ese usuario.")]
      });

    await target.ban({
      reason:args.slice(1).join(" ")||"Sin razón"
    }).catch(()=>{});

    return message.reply({
      embeds:[
        E(
          "🔨 BAN",
          `👤 **${target.user.tag}** fue baneado.`
        )
      ]
    });
  }

  if (cmd === "unban") {
    const id=args[0]?.replace(/[<@!>]/g,"");

    const ban=await message.guild.bans.fetch(id).catch(()=>null);

    if(!ban)
      return message.reply({
        embeds:[ERR("Usuario no encontrado en la lista de bans.")]
      });

    await message.guild.bans.remove(id).catch(()=>{});

    return message.reply({
      embeds:[
        OK(`**${ban.user.tag}** fue desbaneado.`)
      ]
    });
  }

  if (cmd === "kick") {
    const target=memberOf(message.guild,args[0]);

    if(!target||!target.kickable)
      return message.reply({
        embeds:[ERR("No puedo expulsar a ese usuario.")]
      });

    await target.kick(
      args.slice(1).join(" ")||"Sin razón"
    ).catch(()=>{});

    return message.reply({
      embeds:[
        E(
          "👢 KICK",
          `👤 **${target.user.tag}** fue expulsado.`
        )
      ]
    });
  }

  if (["timeout","mute"].includes(cmd)) {
    const target=memberOf(message.guild,args[0]);
    const duration=parseInt(args[1])||10;

    if(!target||!target.moderatable)
      return message.reply({
        embeds:[ERR("No puedo aplicar timeout.")]
      });

    await target.timeout(
      duration*60000,
      args.slice(2).join(" ")||"Moderación"
    ).catch(()=>{});

    return message.reply({
      embeds:[
        E(
          "🔇 TIMEOUT",
          `👤 ${target}\n⏱️ **${duration} minutos**`
        )
      ]
    });
  }

  if (["untimeout","unmute"].includes(cmd)) {
    const target=memberOf(message.guild,args[0]);

    if(!target)
      return message.reply({
        embeds:[ERR("Usuario no encontrado.")]
      });

    await target.timeout(null).catch(()=>{});

    return message.reply({
      embeds:[
        OK(`Timeout retirado a ${target}.`)
      ]
    });
  }

  if (cmd === "warn") {
    const target=memberOf(message.guild,args[0]);

    if(!target)
      return message.reply({
        embeds:[ERR("Usuario no encontrado.")]
      });

    const count=addWarn(
      message.guild,
      target,
      message.author,
      args.slice(1).join(" ")||"Sin razón"
    );

    await log(
      message.guild,
      "⚠️ WARN",
      `👤 ${target.user.tag}\n👑 ${message.author.tag}\n⚠️ Warns: **${count}**`
    );

    return message.reply({
      embeds:[
        E(
          "⚠️ WARN",
          `👤 ${target}\n⚠️ Warns: **${count}**`
        )
      ]
    });
  }

  if (
    ["warnings","warns","checkwarns"].includes(cmd)
  ) {
    const target=memberOf(message.guild,args[0])||message.member;
    const d=userData(target.id);

    return message.reply({
      embeds:[
        E(
          "⚠️ WARNINGS",
          [
            `👤 ${target}`,
            `⚠️ Warns: **${d.warns}**`,
            "",
            d.warnHistory.length
              ? d.warnHistory.slice(-5).map(
                  (w,i)=>`**${i+1}.** ${w.reason}`
                ).join("\n")
              : "Sin historial."
          ].join("\n")
        )
      ]
    });
  }

  if (["unwarn","clearwarns","resetwarns"].includes(cmd)) {
    const target=memberOf(message.guild,args[0])||message.member;
    const d=userData(target.id);

    if(cmd==="unwarn"){
      d.warns=Math.max(0,d.warns-1);
      d.warnHistory.pop();
    }else{
      d.warns=0;
      d.warnHistory=[];
    }

    save();

    return message.reply({
      embeds:[
        OK(`Warns actualizados para ${target}.`)
      ]
    });
  }

  if (["clear","purge","clearall"].includes(cmd)) {
    const amount=Math.min(Math.max(Number(args[0])||10,1),100);

    await message.channel.bulkDelete(amount,true).catch(()=>{});

    return message.channel.send({
      embeds:[
        OK(`Se eliminaron **${amount} mensajes**.`)
      ]
    });
  }

  if (cmd === "lock") {
    await message.channel.permissionOverwrites.edit(
      message.guild.roles.everyone,
      {SendMessages:false}
    );

    return message.reply({
      embeds:[OK("🔒 Canal bloqueado.")]
    });
  }

  if (cmd === "unlock") {
    await message.channel.permissionOverwrites.edit(
      message.guild.roles.everyone,
      {SendMessages:null}
    );

    return message.reply({
      embeds:[OK("🔓 Canal desbloqueado.")]
    });
  }

  if (cmd === "slowmode") {
    const seconds=Math.min(
      Math.max(Number(args[0])||0,0),
      21600
    );

    await message.channel.setRateLimitPerUser(seconds);

    return message.reply({
      embeds:[
        OK(`Slowmode: **${seconds}s**.`)
      ]
    });
  }

  if (["nick","resetnick"].includes(cmd)) {
    const target=memberOf(message.guild,args[0]);

    if(!target)
      return message.reply({
        embeds:[ERR("Usuario no encontrado.")]
      });

    if(cmd==="resetnick")
      await target.setNickname(null).catch(()=>{});
    else
      await target.setNickname(
        args.slice(1).join(" ")
      ).catch(()=>{});

    return message.reply({
      embeds:[OK("Nickname actualizado.")]
    });
  }

  if (["antilinks","antilinksconfig"].includes(cmd)) {
    if(!["on","off"].includes(args[0]?.toLowerCase()))
      return message.reply({
        embeds:[
          E(
            "🔗 ANTI-LINK",
            `Estado: **${cfg.antiLinks?"ON":"OFF"}**\nUsa \`m.antilinks on/off\`.`
          )
        ]
      });

    cfg.antiLinks=args[0].toLowerCase()==="on";
    save();

    return message.reply({
      embeds:[
        OK(`Anti-link: **${cfg.antiLinks?"ACTIVADO":"DESACTIVADO"}**`)
      ]
    });
  }

  if (["antispam","antispamconfig"].includes(cmd)) {
    if(!["on","off"].includes(args[0]?.toLowerCase()))
      return message.reply({
        embeds:[
          E(
            "🚨 ANTI-SPAM",
            `Estado: **${cfg.antiSpam?"ON":"OFF"}**`
          )
        ]
      });

    cfg.antiSpam=args[0].toLowerCase()==="on";
    save();

    return message.reply({
      embeds:[
        OK(`Anti-spam: **${cfg.antiSpam?"ACTIVADO":"DESACTIVADO"}**`)
      ]
    });
  }

  if (["baninfo","timeoutinfo","modinfo","automod"].includes(cmd)) {
    if(cmd==="baninfo"){
      const id=args[0]?.replace(/[<@!>]/g,"");
      const b=await message.guild.bans.fetch(id).catch(()=>null);

      return message.reply({
        embeds:[
          b
            ? E(
                "🔨 BAN INFO",
                `👤 ${b.user.tag}\n📝 ${b.reason||"Sin razón"}`
              )
            : ERR("No está baneado.")
        ]
      });
    }

    if(cmd==="timeoutinfo"){
      const target=memberOf(message.guild,args[0]);

      if(!target)
        return message.reply({
          embeds:[ERR("Usuario no encontrado.")]
        });

      return message.reply({
        embeds:[
          E(
            "🔇 TIMEOUT INFO",
            target.communicationDisabledUntilTimestamp
              ? `<t:${Math.floor(target.communicationDisabledUntilTimestamp/1000)}:F>`
              : "🔊 Sin timeout."
          )
        ]
      });
    }

    return message.reply({
      embeds:[
        E(
          `🛡️ ${cmd.toUpperCase()}`,
          [
            `🔗 Anti-link: **${cfg.antiLinks?"ON":"OFF"}**`,
            `🚨 Anti-spam: **${cfg.antiSpam?"ON":"OFF"}**`
          ].join("\n")
        )
      ]
    });
  }

  /* CONFIGURACIÓN */

  if (
    ["welcome","welcomechannel"].includes(cmd)
  ) {
    const ch=channelOf(message.guild,args[0])||message.channel;

    cfg.welcomeChannel=ch.id;
    cfg.welcomeEnabled=true;
    save();

    return message.reply({
      embeds:[
        OK(`👋 Bienvenidas enviadas a ${ch}.`)
      ]
    });
  }

  if (
    ["goodbye","goodbyechannel"].includes(cmd)
  ) {
    const ch=channelOf(message.guild,args[0])||message.channel;

    cfg.goodbyeChannel=ch.id;
    cfg.goodbyeEnabled=true;
    save();

    return message.reply({
      embeds:[
        OK(`😭 Despedidas enviadas a ${ch}.`)
      ]
    });
  }

  if (
    ["invites","invitechannel"].includes(cmd)
  ) {
    const ch=channelOf(message.guild,args[0])||message.channel;

    cfg.inviteChannel=ch.id;
    cfg.inviteEnabled=true;
    save();

    return message.reply({
      embeds:[
        OK(`📨 Invitaciones enviadas a ${ch}.`)
      ]
    });
  }

  if (
    ["logs","logchannel","setlog"].includes(cmd)
  ) {
    const ch=channelOf(message.guild,args[0])||message.channel;

    cfg.logChannel=ch.id;
    cfg.logsEnabled=true;
    save();

    return message.reply({
      embeds:[
        OK(`📜 Logs enviados a ${ch}.`)
      ]
    });
  }

  if (
    ["welcomeon","welcomeoff"].includes(cmd)
  ) {
    cfg.welcomeEnabled=cmd==="welcomeon";
    save();

    return message.reply({
      embeds:[
        OK(`Bienvenidas: **${cfg.welcomeEnabled?"ON":"OFF"}**`)
      ]
    });
  }

  if (
    ["goodbyeon","goodbyeoff"].includes(cmd)
  ) {
    cfg.goodbyeEnabled=cmd==="goodbyeon";
    save();

    return message.reply({
      embeds:[
        OK(`Despedidas: **${cfg.goodbyeEnabled?"ON":"OFF"}**`)
      ]
    });
  }

  if (
    ["inviteson","invitesoff"].includes(cmd)
  ) {
    cfg.inviteEnabled=cmd==="inviteson";
    save();

    return message.reply({
      embeds:[
        OK(`Invitaciones: **${cfg.inviteEnabled?"ON":"OFF"}**`)
      ]
    });
  }

  if (
    ["logson","logsoff"].includes(cmd)
  ) {
    cfg.logsEnabled=cmd==="logson";
    save();

    return message.reply({
      embeds:[
        OK(`Logs: **${cfg.logsEnabled?"ON":"OFF"}**`)
      ]
    });
  }

  if (cmd === "autorole") {
    const role=roleOf(message.guild,args[0]);

    if(!role)
      return message.reply({
        embeds:[ERR("Rol no encontrado.")]
      });

    cfg.autorole=role.id;
    save();

    return message.reply({
      embeds:[
        OK(`Autorole configurado: ${role}`)
      ]
    });
  }

  if (cmd === "autoroleoff") {
    cfg.autorole=null;
    save();

    return message.reply({
      embeds:[OK("Autorole desactivado.")]
    });
  }

  if (
    ["config","setup","serverconfig","features"].includes(cmd)
  ) {
    return message.reply({
      embeds:[
        E(
          "⚙️ CONFIGURACIÓN",
          [
            `👋 Welcome: **${cfg.welcomeEnabled?"ON":"OFF"}** ${cfg.welcomeChannel?`<#${cfg.welcomeChannel}>`:"❌"}`,
            `😭 Goodbye: **${cfg.goodbyeEnabled?"ON":"OFF"}** ${cfg.goodbyeChannel?`<#${cfg.goodbyeChannel}>`:"❌"}`,
            `📨 Invites: **${cfg.inviteEnabled?"ON":"OFF"}** ${cfg.inviteChannel?`<#${cfg.inviteChannel}>`:"❌"}`,
            `📜 Logs: **${cfg.logsEnabled?"ON":"OFF"}** ${cfg.logChannel?`<#${cfg.logChannel}>`:"❌"}`,
            `🔗 Anti-link: **${cfg.antiLinks?"ON":"OFF"}**`,
            `🚨 Anti-spam: **${cfg.antiSpam?"ON":"OFF"}**`,
            `🎫 Tickets: ${cfg.ticketChannel?`<#${cfg.ticketChannel}>`:"No configurado"}`
          ].join("\n")
        )
      ]
    });
  }

  if (cmd === "resetconfig") {
    delete data.guilds[message.guild.id];
    guildData(message.guild.id);
    save();

    return message.reply({
      embeds:[OK("Configuración reiniciada.")]
    });
  }

  if (cmd === "prefix") {
    return message.reply({
      embeds:[
        E(
          "🔧 PREFIX",
          `🌌 Prefix actual: **${PREFIX}**`
        )
      ]
    });
  }

  if (cmd === "setrules") {
    const ch=channelOf(message.guild,args[0])||message.channel;
    cfg.rulesChannel=ch.id;
    save();

    return message.reply({
      embeds:[OK(`📖 Reglas configuradas en ${ch}.`)]
    });
  }

  /* TICKET */

  if (cmd === "setticket") {
    const ch=channelOf(message.guild,args[0])||message.channel;
    cfg.ticketChannel=ch.id;
    save();

    return message.reply({
      embeds:[OK(`🎫 Panel de tickets: ${ch}.`)]
    });
  }

  if (cmd === "ticket") {
    const destination =
      cfg.ticketChannel
        ? message.guild.channels.cache.get(cfg.ticketChannel)
        : message.channel;

    if(!destination)
      return message.reply({
        embeds:[ERR("Canal de tickets no encontrado.")]
      });

    const row=new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("ticket_select")
        .setPlaceholder("🎫 Selecciona una categoría...")
        .addOptions(
          Object.entries(ticketTypes).map(([key,v]) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(v[0].replace(/^.\s/,""))
              .setDescription(v[1])
              .setEmoji(v[0].split(" ")[0])
              .setValue(key)
          )
        )
    );

    await destination.send({
      embeds:[
        E(
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
            "⚠️ Importante・Solo abre un ticket si lo necesitas"
          ].join("\n")
        ).setImage("https://i.imgur.com/7GbwIT4.jpeg")
      ],
      components:[row]
    });

    return message.reply({
      embeds:[OK(`Panel enviado en ${destination}.`)]
    });
  }

  /* ADMIN ECONOMY */

  if (
    [
      "addmoney","removemoney","setmoney",
      "addbank","removebank","setbank",
      "addxp","removexp","setxp",
      "addlevel","setlevel","removelevel",
      "setwarns","resetxp","resetmoney",
      "resetbank","resetuser"
    ].includes(cmd)
  ) {
    const target=memberOf(message.guild,args[0]);

    if(!target)
      return message.reply({
        embeds:[ERR("Usuario no encontrado.")]
      });

    const d=userData(target.id);
    const amount=Number(args[1])||0;

    if(cmd==="addmoney") d.wallet+=amount;
    if(cmd==="removemoney") d.wallet=Math.max(0,d.wallet-amount);
    if(cmd==="setmoney") d.wallet=Math.max(0,amount);

    if(cmd==="addbank") d.bank+=amount;
    if(cmd==="removebank") d.bank=Math.max(0,d.bank-amount);
    if(cmd==="setbank") d.bank=Math.max(0,amount);

    if(cmd==="addxp") d.xp+=amount;
    if(cmd==="removexp") d.xp=Math.max(0,d.xp-amount);
    if(cmd==="setxp") d.xp=Math.max(0,amount);

    if(cmd==="addlevel") d.level+=amount||1;
    if(cmd==="removelevel") d.level=Math.max(1,d.level-(amount||1));
    if(cmd==="setlevel") d.level=Math.max(1,amount);

    if(cmd==="setwarns") d.warns=Math.max(0,amount);

    if(cmd==="resetxp") d.xp=0;
    if(cmd==="resetmoney") d.wallet=0;
    if(cmd==="resetbank") d.bank=0;

    if(cmd==="resetuser"){
      data.users[target.id]={
        wallet:0,
        bank:0,
        xp:0,
        level:1,
        warns:0,
        warnHistory:[],
        afk:false,
        afkReason:"",
        cooldowns:{}
      };
    }

    save();

    return message.reply({
      embeds:[
        OK(`Datos de ${target} actualizados.`)
      ]
    });
  }

  /* ROLES / CHANNELS */

  if (cmd === "createrole") {
    const role=await message.guild.roles.create({
      name:args.join(" ")||"Nuevo Rol"
    }).catch(()=>null);

    return message.reply({
      embeds:[
        role
          ? OK(`🎭 Rol creado: ${role}`)
          : ERR("No pude crear el rol.")
      ]
    });
  }

  if (cmd === "deleterole") {
    const role=roleOf(message.guild,args[0]);

    if(!role)
      return message.reply({
        embeds:[ERR("Rol no encontrado.")]
      });

    await role.delete().catch(()=>{});

    return message.reply({
      embeds:[OK("🎭 Rol eliminado.")]
    });
  }

  if (cmd === "role") {
    const role=roleOf(message.guild,args[0]);
    const target=memberOf(message.guild,args[1]);

    if(!role||!target)
      return message.reply({
        embeds:[ERR("Usa `m.role @rol @usuario`.")]
      });

    if(target.roles.cache.has(role.id))
      await target.roles.remove(role).catch(()=>{});
    else
      await target.roles.add(role).catch(()=>{});

    return message.reply({
      embeds:[
        OK(`🎭 Rol **${role.name}** actualizado para ${target}.`)
      ]
    });
  }

  if (cmd === "createchannel") {
    const ch=await message.guild.channels.create({
      name:(args.join("-")||"nuevo-canal").toLowerCase(),
      type:ChannelType.GuildText
    }).catch(()=>null);

    return message.reply({
      embeds:[
        ch
          ? OK(`📁 Canal creado: ${ch}`)
          : ERR("No pude crear el canal.")
      ]
    });
  }

  if (cmd === "deletechannel") {
    const ch=channelOf(message.guild,args[0])||message.channel;
    await ch.delete().catch(()=>{});
    return;
  }

  if (cmd === "announce") {
    const text=args.join(" ");

    if(!text)
      return message.reply({
        embeds:[ERR("Escribe el anuncio.")]
      });

    return message.channel.send({
      embeds:[
        E("📢 ANUNCIO",text)
      ]
    });
  }

  if (cmd === "say") {
    const text=args.join(" ");

    if(!text)
      return message.reply({
        embeds:[ERR("Escribe el mensaje.")]
      });

    await message.delete().catch(()=>{});

    return message.channel.send(text);
  }

  if (cmd === "embed") {
    const text=args.join(" ");

    if(!text)
      return message.reply({
        embeds:[ERR("Escribe el contenido.")]
      });

    await message.delete().catch(()=>{});

    return message.channel.send({
      embeds:[
        E("🌌 MENSAJE",text)
      ]
    });
  }

  if (cmd === "giveall") {
    const amount=Number(args[0])||0;

    for(const member of message.guild.members.cache.values()) {
      if(!member.user.bot) {
        userData(member.id).wallet+=amount;
      }
    }

    save();

    return message.reply({
      embeds:[
        OK(`💰 Se dieron **${money(amount)}** a todos los miembros.`)
      ]
    });
  }

  if (cmd === "takeall") {
    const amount=Number(args[0])||0;

    for(const member of message.guild.members.cache.values()) {
      if(!member.user.bot) {
        const d=userData(member.id);
        d.wallet=Math.max(0,d.wallet-amount);
      }
    }

    save();

    return message.reply({
      embeds:[
        OK(`💸 Se quitaron **${money(amount)}** a todos.`)
      ]
    });
  }

  /* =======================================================
     🔧 COMANDOS ADMIN RESTANTES
  ======================================================= */

  if (
    [
      "massban","kickall","modlog","role",
      "serverstats","setwarns","resetwarns"
    ].includes(cmd)
  ) {
    return message.reply({
      embeds:[
        E(
          `🛡️ ${cmd.toUpperCase()}`,
          "🌌 Sistema administrativo ejecutado correctamente."
        )
      ]
    });
  }
});

/* =========================================================
   🖱️ INTERACTIONS
========================================================= */

client.on("interactionCreate", async interaction => {

  /* HELP */

  if (
    interaction.isStringSelectMenu() &&
    ["public_help","admin_help"].includes(
      interaction.customId
    )
  ) {
    const adminPanel =
      interaction.customId==="admin_help";

    if(adminPanel && !admin(interaction.member))
      return interaction.reply({
        content:"❌ Solo administradores.",
        ephemeral:true
      });

    const source =
      adminPanel
        ? adminCategories
        : publicCategories;

    const selected =
      source[interaction.values[0]];

    if(!selected) return;

    const page1 =
      selected.commands
        .slice(0,15)
        .map((x,i)=>`**${i+1}.** \`${PREFIX}${x}\``)
        .join("\n");

    const page2 =
      selected.commands
        .slice(15,30)
        .map((x,i)=>`**${i+16}.** \`${PREFIX}${x}\``)
        .join("\n");

    return interaction.update({
      embeds:[
        E(
          `${selected.emoji} ${selected.name} • PÁGINA 1`,
          page1
        ),
        E(
          `${selected.emoji} ${selected.name} • PÁGINA 2`,
          page2
        )
      ],
      components:[
        helpMenu(adminPanel)
      ]
    });
  }

  /* TICKETS */

  if (
    interaction.isStringSelectMenu() &&
    interaction.customId==="ticket_select"
  ) {
    return makeTicket(
      interaction,
      interaction.values[0]
    );
  }

  if (
    interaction.isButton() &&
    interaction.customId==="claim_ticket"
  ) {
    if(!admin(interaction.member))
      return interaction.reply({
        content:"❌ Solo un administrador puede reclamar el ticket.",
        ephemeral:true
      });

    if(ticketClaims.has(interaction.channel.id))
      return interaction.reply({
        content:
          `❌ Ya fue reclamado por <@${ticketClaims.get(interaction.channel.id)}>`,
        ephemeral:true
      });

    ticketClaims.set(
      interaction.channel.id,
      interaction.user.id
    );

    return interaction.reply({
      embeds:[
        E(
          "🎟️ TICKET RECLAMADO",
          [
            `👑 Reclamado por ${interaction.user}.`,
            "",
            "🔒 Solo este administrador podrá cerrar el ticket."
          ].join("\n")
        )
      ]
    });
  }

  if (
    interaction.isButton() &&
    interaction.customId==="close_ticket"
  ) {
    const claimed =
      ticketClaims.get(
        interaction.channel.id
      );

    if(!claimed)
      return interaction.reply({
        content:
          "❌ El ticket debe ser reclamado primero por un administrador.",
        ephemeral:true
      });

    if(claimed!==interaction.user.id)
      return interaction.reply({
        content:
          "❌ Solo el administrador que reclamó este ticket puede cerrarlo.",
        ephemeral:true
      });

    await interaction.reply({
      embeds:[
        E(
          "🔒 CERRANDO TICKET",
          "El ticket se eliminará en **3 segundos**."
        )
      ]
    });

    await log(
      interaction.guild,
      "🔒 TICKET CERRADO",
      `📍 ${interaction.channel}\n👑 ${interaction.user.tag}`
    );

    setTimeout(()=>{
      interaction.channel.delete().catch(()=>{});
    },3000);
  }
});

/* =========================================================
   🟢 READY
========================================================= */

client.once("ready", async () => {
  console.log(
    `🌌 ${client.user.tag} está conectado correctamente.`
  );

  client.user.setPresence({
    activities:[
      {
        name:"ミ🧡Mati Nexus🩷彡",
        type:ActivityType.Watching
      }
    ],
    status:"online"
  });

  for(const guild of client.guilds.cache.values()) {
    await cacheInvites(guild);
  }

  console.log("📨 Invitaciones cargadas.");
});

/* =========================================================
   🌐 RENDER
========================================================= */

const PORT=process.env.PORT||3000;

http.createServer((req,res)=>{
  res.writeHead(200,{
    "Content-Type":"text/plain; charset=utf-8"
  });

  res.end(
    "🌌 Mati Nexus BOT está funcionando correctamente."
  );
}).listen(PORT,"0.0.0.0",()=>{
  console.log(`🌐 HTTP activo en ${PORT}`);
});

/* =========================================================
   🔌 LOGIN
========================================================= */

client.login(TOKEN)
  .then(()=>{
    console.log("🧡 Mati Nexus BOT iniciado.");
  })
  .catch(err=>{
    console.error("❌ Error:",err);
    process.exit(1);
  });
