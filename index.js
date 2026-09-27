const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  PermissionsBitField,
  SlashCommandBuilder,
  ChannelType
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const http = require("http");

// ============================================================
// 🌌 MATI NEXUS BOT
// ============================================================

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
  console.error("❌ Falta DISCORD_TOKEN.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildInvites
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.GuildMember
  ]
});

// ============================================================
// 💾 DATOS
// ============================================================

const DATA_FILE = path.join(__dirname, "data.json");

const defaultData = {
  users: {},
  guilds: {}
};

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(defaultData, null, 2)
  );
}

let data;

try {
  data = JSON.parse(
    fs.readFileSync(DATA_FILE, "utf8")
  );
} catch {
  data = defaultData;

  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(data, null, 2)
  );
}

function saveData() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(data, null, 2)
    );
  } catch (err) {
    console.error("❌ Error guardando data:", err);
  }
}

function getGuildData(id) {
  if (!data.guilds[id]) {
    data.guilds[id] = {
      welcomeChannel: null,
      goodbyeChannel: null,
      inviteChannel: null,
      logChannel: null,

      welcomeEnabled: true,
      goodbyeEnabled: true,
      inviteEnabled: true,
      logsEnabled: true,

      autorole: null,
      prefix: "m."
    };

    saveData();
  }

  return data.guilds[id];
}

function getUserData(id) {
  if (!data.users[id]) {
    data.users[id] = {
      wallet: 0,
      bank: 0,

      xp: 0,
      level: 1,

      warns: 0,

      lastDaily: 0,
      lastWork: 0,
      lastCrime: 0,
      lastBeg: 0,
      lastRob: 0
    };

    saveData();
  }

  return data.users[id];
}

// ============================================================
// 🎨 DECORACIÓN
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

function success(text) {
  return makeEmbed(
    "╔════════ ✨ NEXUS ════════╗",
    `> ${text}`
  );
}

function error(text) {
  return makeEmbed(
    "╔════════ ❌ ERROR ════════╗",
    `> ${text}`
  );
}

function money(value) {
  return `${Number(value || 0).toLocaleString("es-ES")} 💰`;
}

function random(min, max) {
  return Math.floor(
    Math.random() * (max - min + 1)
  ) + min;
}

function cooldownText(ms) {
  const sec = Math.ceil(ms / 1000);

  if (sec < 60) {
    return `${sec}s`;
  }

  const min = Math.floor(sec / 60);
  const rest = sec % 60;

  return `${min}m ${rest}s`;
}

function isAdmin(member) {
  return member?.permissions?.has(
    PermissionsBitField.Flags.Administrator
  );
}

// ============================================================
// ⭐ XP
// ============================================================

function addXP(userId, amount) {
  const user = getUserData(userId);

  user.xp += amount;

  let leveled = false;

  while (user.xp >= user.level * 100) {
    user.xp -= user.level * 100;
    user.level++;
    leveled = true;
  }

  saveData();

  return leveled;
}

// ============================================================
// 📜 LOGS
// ============================================================

async function sendLog(guild, title, description) {
  const config = getGuildData(guild.id);

  if (!config.logsEnabled) return;
  if (!config.logChannel) return;

  const channel = guild.channels.cache.get(
    config.logChannel
  );

  if (!channel) return;

  await channel.send({
    embeds: [
      makeEmbed(
        `╔══ 📜 ${title} ══╗`,
        description
      )
    ]
  }).catch(() => {});
}

// ============================================================
// 📨 INVITES
// ============================================================

// Guardamos las invitaciones conocidas.
// NO actualizamos la caché antes de comprobar el invitador.
const inviteCache = new Map();

async function loadInvites(guild) {
  try {
    const invites = await guild.invites.fetch();

    const map = new Map();

    for (const invite of invites.values()) {
      map.set(invite.code, {
        uses: invite.uses || 0,
        inviterId: invite.inviter?.id || null
      });
    }

    inviteCache.set(guild.id, map);

    return map;
  } catch (err) {
    console.log(
      `⚠️ No se pudieron obtener las invitaciones de ${guild.name}.`
    );

    return null;
  }
}

async function detectInvite(guild) {
  try {
    const oldInvites =
      inviteCache.get(guild.id) ||
      new Map();

    const newInvites =
      await guild.invites.fetch();

    let usedInvite = null;

    for (const invite of newInvites.values()) {
      const old = oldInvites.get(invite.code);

      const oldUses = old?.uses || 0;
      const newUses = invite.uses || 0;

      if (newUses > oldUses) {
        usedInvite = invite;
        break;
      }
    }

    const newCache = new Map();

    for (const invite of newInvites.values()) {
      newCache.set(invite.code, {
        uses: invite.uses || 0,
        inviterId: invite.inviter?.id || null
      });
    }

    inviteCache.set(guild.id, newCache);

    return usedInvite;
  } catch {
    return null;
  }
}

// ============================================================
// 👋 BIENVENIDAS
// ============================================================

client.on("guildMemberAdd", async member => {
  const config = getGuildData(member.guild.id);

  // Detectamos primero la invitación utilizada.
  const usedInvite = await detectInvite(
    member.guild
  );

  // -------------------------
  // BIENVENIDA
  // -------------------------

  if (
    config.welcomeEnabled &&
    config.welcomeChannel
  ) {
    const channel =
      member.guild.channels.cache.get(
        config.welcomeChannel
      );

    if (channel) {
      await channel.send({
        embeds: [
          makeEmbed(
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
          ).setThumbnail(
            member.user.displayAvatarURL({
              size: 512
            })
          )
        ]
      }).catch(() => {});
    }
  }

  // -------------------------
  // AUTOROL
  // -------------------------

  if (config.autorole) {
    const role =
      member.guild.roles.cache.get(
        config.autorole
      );

    if (role) {
      await member.roles.add(role).catch(() => {});
    }
  }

  // -------------------------
  // INVITES
  // -------------------------

  if (
    config.inviteEnabled &&
    config.inviteChannel
  ) {
    const channel =
      member.guild.channels.cache.get(
        config.inviteChannel
      );

    if (channel && usedInvite) {
      const inviter =
        usedInvite.inviter;

      await channel.send({
        embeds: [
          makeEmbed(
            "╔══ 📨 INVITACIÓN ══╗",
            [
              `👤 Nuevo miembro: ${member}`,
              `📨 Invitado por: ${
                inviter
                  ? `<@${inviter.id}>`
                  : "Desconocido"
              }`,
              "",
              `🔗 Código: \`${usedInvite.code}\``,
              `📊 Usos: **${usedInvite.uses || 0}**`
            ].join("\n")
          )
        ]
      }).catch(() => {});
    }
  }
});

// ============================================================
// 😭 DESPEDIDAS
// ============================================================

client.on("guildMemberRemove", async member => {
  const config = getGuildData(member.guild.id);

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
    `😭 **${member.user.tag}** salió del servidor.`
  );
});

// ============================================================
// 🗑️ LOG MENSAJES
// ============================================================

client.on("messageDelete", async message => {
  if (!message.guild) return;
  if (message.author?.bot) return;

  await sendLog(
    message.guild,
    "MENSAJE ELIMINADO",
    [
      `👤 Autor: ${message.author || "Desconocido"}`,
      `📁 Canal: ${message.channel}`,
      "",
      message.content
        ? `💬 Contenido:\n> ${message.content.slice(0, 1000)}`
        : "💬 No había contenido visible."
    ].join("\n")
  );
});

// ============================================================
// 📚 CATEGORÍAS PÚBLICAS — 25 CADA UNA
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
      "uptime",
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
      "support"
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
      "economystats"
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
      "color",
      "number",
      "fortune",
      "fact",
      "roast",
      "compliment"
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
      "interaction"
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
      "rewards"
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
      "help"
    ]
  }
};

// ============================================================
// 👑 ADMIN — 25 CADA CATEGORÍA
// ============================================================

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
      "modinfo"
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
      "resetconfig"
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
      "server"
    ]
  }
};

// ============================================================
// 📋 HELP PÚBLICO
// ============================================================

function publicHelp() {
  return makeEmbed(
    "╔════════════════════════════╗\n║ 🌌 MATI NEXUS • HELP 🌌 ║\n╚════════════════════════════╝",
    [
      "### ✨ Centro de comandos",
      "",
      "Selecciona una categoría para ver sus **25 comandos**.",
      "",
      "🌌 **General**",
      "💰 **Economía**",
      "🎮 **Diversión**",
      "💗 **Social**",
      "⭐ **Niveles**",
      "🛠️ **Utilidades**",
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      "🧡 **Prefijos:** `Mati` y `m.`",
      "🌌 También puedes usar los comandos `/` disponibles."
    ].join("\n")
  );
}

function publicHelpMenu() {
  const menu =
    new StringSelectMenuBuilder()
      .setCustomId("mati_public_help")
      .setPlaceholder(
        "🌌 Selecciona una categoría..."
      )
      .addOptions(
        Object.entries(publicCategories)
          .map(([key, cat]) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(cat.name)
              .setDescription(
                "Ver 25 comandos"
              )
              .setValue(key)
              .setEmoji(cat.emoji)
          )
      );

  return new ActionRowBuilder()
    .addComponents(menu);
}

function categoryEmbed(key) {
  const category =
    publicCategories[key];

  const lines = category.commands.map(
    (command, index) =>
      `**${String(index + 1).padStart(2, "0")}** │ \`m.${command}\``
  );

  return makeEmbed(
    `╔══ ${category.emoji} ${category.name} ══╗`,
    [
      `> **25 comandos disponibles**`,
      "",
      ...lines,
      "",
      "🌌 Selecciona otra categoría abajo."
    ].join("\n")
  );
}

// ============================================================
// 👑 HELP ADMIN
// ============================================================

function adminHelp() {
  return makeEmbed(
    "╔════════════════════════════╗\n║ 👑 MATI NEXUS • ADMIN ║\n╚════════════════════════════╝",
    [
      "### 🔒 Panel administrativo",
      "",
      "Este menú solo puede ser utilizado por Administradores.",
      "",
      "🛡️ **Moderación** — 25 comandos",
      "⚙️ **Configuración** — 25 comandos",
      "👑 **Administración** — 25 comandos",
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      "🌌 Selecciona una categoría."
    ].join("\n")
  );
}

function adminHelpMenu() {
  const menu =
    new StringSelectMenuBuilder()
      .setCustomId("mati_admin_help")
      .setPlaceholder(
        "👑 Selecciona una categoría..."
      )
      .addOptions(
        Object.entries(adminCategories)
          .map(([key, cat]) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(cat.name)
              .setDescription(
                "Ver 25 comandos administrativos"
              )
              .setValue(key)
              .setEmoji(cat.emoji)
          )
      );

  return new ActionRowBuilder()
    .addComponents(menu);
}

function adminCategoryEmbed(key) {
  const category =
    adminCategories[key];

  const lines = category.commands.map(
    (command, index) =>
      `**${String(index + 1).padStart(2, "0")}** │ \`m.${command}\``
  );

  return makeEmbed(
    `╔══ ${category.emoji} ${category.name} ══╗`,
    [
      `> **25 comandos administrativos**`,
      "",
      ...lines,
      "",
      "🔒 Solo Administradores."
    ].join("\n")
  );
}

// ============================================================
// 🎮 COMANDOS PREFIX
// ============================================================

async function executeCommand(
  message,
  command,
  args
) {

  const guild = message.guild;
  const config = getGuildData(guild.id);
  const user = getUserData(
    message.author.id
  );

  // ==========================================================
  // HELP
  // ==========================================================

  if (command === "help") {
    return message.reply({
      embeds: [publicHelp()],
      components: [publicHelpMenu()]
    });
  }

  if (
    command === "helpad" ||
    command === "adminhelp"
  ) {

    if (!isAdmin(message.member)) {
      return message.reply({
        embeds: [
          error(
            "🔒 Solo los Administradores pueden abrir este panel."
          )
        ]
      });
    }

    return message.reply({
      embeds: [adminHelp()],
      components: [adminHelpMenu()]
    });
  }

  // ==========================================================
  // 🌌 GENERAL
  // ==========================================================

  if (command === "ping") {
    return message.reply({
      embeds: [
        success(
          `🏓 Pong!\n\nLatencia: **${client.ws.ping}ms**`
        )
      ]
    });
  }

  if (command === "botinfo") {
    return message.reply({
      embeds: [
        makeEmbed(
          "╔══ 🤖 MATI NEXUS BOT ══╗",
          [
            "🌌 **Bot oficial de Mati Nexus**",
            "",
            `🏠 Servidores: **${client.guilds.cache.size}**`,
            `👥 Usuarios: **${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)}**`,
            `📡 Ping: **${client.ws.ping}ms**`,
            `⚙️ Discord.js: **v14**`,
            "",
            "🧡 Sistema Nexus activo."
          ].join("\n")
        )
      ]
    });
  }

  if (command === "serverinfo") {
    return message.reply({
      embeds: [
        makeEmbed(
          "╔══ 🌌 INFORMACIÓN ══╗",
          [
            `🏠 **${guild.name}**`,
            "",
            `👥 Miembros: **${guild.memberCount}**`,
            `📁 Canales: **${guild.channels.cache.size}**`,
            `🎭 Roles: **${guild.roles.cache.size}**`,
            `😀 Emojis: **${guild.emojis.cache.size}**`,
            `🚀 Boosts: **${guild.premiumSubscriptionCount || 0}**`
          ].join("\n")
        )
      ]
    });
  }

  if (
    command === "userinfo" ||
    command === "whois"
  ) {

    const target =
      message.mentions.members.first() ||
      message.member;

    return message.reply({
      embeds: [
        makeEmbed(
          "╔══ 👤 USUARIO ══╗",
          [
            `👤 Usuario: ${target}`,
            `🆔 ID: \`${target.id}\``,
            `📅 Cuenta: <t:${Math.floor(target.user.createdTimestamp / 1000)}:D>`,
            `📥 Entrada: ${
              target.joinedTimestamp
                ? `<t:${Math.floor(target.joinedTimestamp / 1000)}:D>`
                : "Desconocida"
            }`
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
    command === "avatar"
  ) {

    const target =
      message.mentions.users.first() ||
      message.author;

    const url =
      target.displayAvatarURL({
        size: 1024,
        extension: "png"
      });

    return message.reply({
      embeds: [
        makeEmbed(
          "╔══ 🖼️ AVATAR ══╗",
          `[Abrir avatar](${url})`
        ).setImage(url)
      ]
    });
  }

  if (command === "banner") {
    const target =
      message.mentions.users.first() ||
      message.author;

    const fetched =
      await client.users.fetch(
        target.id,
        { force: true }
      );

    if (!fetched.banner) {
      return message.reply({
        embeds: [
          error(
            "Ese usuario no tiene banner."
          )
        ]
      });
    }

    const url =
      fetched.bannerURL({
        size: 1024,
        extension: "png"
      });

    return message.reply({
      embeds: [
        makeEmbed(
          "╔══ 🌌 BANNER ══╗",
          `[Abrir banner](${url})`
        ).setImage(url)
      ]
    });
  }

  if (
    command === "profile"
  ) {

    return message.reply({
      embeds: [
        makeEmbed(
          "╔══ 🌌 PERFIL NEXUS ══╗",
          [
            `👤 ${message.author}`,
            "",
            `💰 Billetera: **${money(user.wallet)}**`,
            `🏦 Banco: **${money(user.bank)}**`,
            `⭐ Nivel: **${user.level}**`,
            `✨ XP: **${user.xp}/${user.level * 100}**`,
            `⚠️ Warns: **${user.warns}**`
          ].join("\n")
        )
      ]
    });
  }

  if (command === "balance") {
    return message.reply({
      embeds: [
        makeEmbed(
          "╔══ 💰 BALANCE ══╗",
          [
            `💵 Billetera: **${money(user.wallet)}**`,
            `🏦 Banco: **${money(user.bank)}**`,
            "",
            `💎 Patrimonio: **${money(user.wallet + user.bank)}**`
          ].join("\n")
        )
      ]
    });
  }

  if (
    command === "uptime"
  ) {
    return message.reply({
      embeds: [
        success(
          `⏱️ Mati Nexus lleva conectado:\n**${cooldownText(client.uptime)}**`
        )
      ]
    });
  }

  if (
    command === "membercount"
  ) {
    return message.reply({
      embeds: [
        success(
          `👥 Este servidor tiene **${guild.memberCount} miembros**.`
        )
      ]
    });
  }

  if (command === "servericon") {
    const url = guild.iconURL({
      size: 1024
    });

    return message.reply({
      embeds: [
        makeEmbed(
          "╔══ 🖼️ ICONO ══╗",
          url
            ? `[Abrir icono](${url})`
            : "El servidor no tiene icono."
        ).setImage(url)
      ]
    });
  }

  if (command === "channelinfo") {
    const channel =
      message.mentions.channels.first() ||
      message.channel;

    return message.reply({
      embeds: [
        makeEmbed(
          "╔══ 📁 CANAL ══╗",
          [
            `📁 Nombre: **${channel.name}**`,
            `🆔 ID: \`${channel.id}\``,
            `📌 Tipo: **${channel.type}**`
          ].join("\n")
        )
      ]
    });
  }

  if (command === "roleinfo") {
    const role =
      message.mentions.roles.first();

    if (!role) {
      return message.reply({
        embeds: [
          error(
            "Menciona un rol."
          )
        ]
      });
    }

    return message.reply({
      embeds: [
        makeEmbed(
          "╔══ 🎭 ROL ══╗",
          [
            `🎭 Rol: ${role}`,
            `🆔 ID: \`${role.id}\``,
            `👥 Miembros: **${role.members.size}**`
          ].join("\n")
        )
      ]
    });
  }

  if (command === "roles") {
    return message.reply({
      embeds: [
        success(
          `🎭 Este servidor tiene **${guild.roles.cache.size} roles**.`
        )
      ]
    });
  }

  if (command === "channels") {
    return message.reply({
      embeds: [
        success(
          `📁 Este servidor tiene **${guild.channels.cache.size} canales**.`
        )
      ]
    });
  }

  if (command === "emojis") {
    return message.reply({
      embeds: [
        success(
          `😀 Este servidor tiene **${guild.emojis.cache.size} emojis**.`
        )
      ]
    });
  }

  if (command === "boosts") {
    return message.reply({
      embeds: [
        success(
          `🚀 Boosts actuales: **${guild.premiumSubscriptionCount || 0}**`
        )
      ]
    });
  }

  if (
    command === "timestamp"
  ) {
    return message.reply({
      embeds: [
        success(
          `🕐 <t:${Math.floor(Date.now() / 1000)}:F>`
        )
      ]
    });
  }

  if (
    command === "id"
  ) {
    const target =
      message.mentions.users.first() ||
      message.author;

    return message.reply({
      embeds: [
        success(
          `🆔 ID de ${target}: \`${target.id}\``
        )
      ]
    });
  }

  if (
    command === "support"
  ) {
    return message.reply({
      embeds: [
        makeEmbed(
          "╔══ 🧡 SOPORTE ══╗",
          "🎫 Si necesitas ayuda, utiliza el sistema de tickets del servidor."
        )
      ]
    });
  }

  // ==========================================================
  // 💰 ECONOMÍA
  // ==========================================================

  if (command === "work") {

    const now = Date.now();

    if (
      now - user.lastWork <
      30_000
    ) {
      return message.reply({
        embeds: [
          error(
            `⏳ Espera **${cooldownText(30_000 - (now - user.lastWork))}**.`
          )
        ]
      });
    }

    const amount =
      random(100, 300);

    user.wallet += amount;
    user.lastWork = now;

    const levelUp =
      addXP(
        message.author.id,
        random(10, 25)
      );

    saveData();

    return message.reply({
      embeds: [
        success(
          [
            `💼 Trabajaste y ganaste **${money(amount)}**.`,
            "",
            `💰 Billetera: **${money(user.wallet)}**`,
            levelUp
              ? "⭐ ¡Subiste de nivel!"
              : ""
          ].join("\n")
        )
      ]
    });
  }

  if (command === "daily") {

    const now = Date.now();
    const cd = 86_400_000;

    if (
      now - user.lastDaily < cd
    ) {
      return message.reply({
        embeds: [
          error(
            `🎁 Ya reclamaste tu recompensa.\n\n⏳ Disponible en **${cooldownText(cd - (now - user.lastDaily))}**.`
          )
        ]
      });
    }

    const amount =
      random(500, 1000);

    user.wallet += amount;
    user.lastDaily = now;

    saveData();

    return message.reply({
      embeds: [
        success(
          `🎁 Recompensa diaria: **${money(amount)}**`
        )
      ]
    });
  }

  if (command === "beg") {

    const now = Date.now();
    const cd = 30_000;

    if (
      now - user.lastBeg < cd
    ) {
      return message.reply({
        embeds: [
          error(
            `🥺 Espera **${cooldownText(cd - (now - user.lastBeg))}**.`
          )
        ]
      });
    }

    const amount =
      random(25, 150);

    user.wallet += amount;
    user.lastBeg = now;

    saveData();

    return message.reply({
      embeds: [
        success(
          `🥺 Alguien te dio **${money(amount)}**.`
        )
      ]
    });
  }

  if (command === "crime") {

    const now = Date.now();
    const cd = 120_000;

    if (
      now - user.lastCrime < cd
    ) {
      return message.reply({
        embeds: [
          error(
            `🕶️ Espera **${cooldownText(cd - (now - user.lastCrime))}**.`
          )
        ]
      });
    }

    user.lastCrime = now;

    if (Math.random() < 0.5) {

      const amount =
        random(500, 700);

      user.wallet += amount;

      saveData();

      return message.reply({
        embeds: [
          success(
            `🕶️ La misión salió bien.\n\n💰 Ganaste **${money(amount)}**.`
          )
        ]
      });
    }

    const lost =
      random(100, 300);

    user.wallet =
      Math.max(
        0,
        user.wallet - lost
      );

    saveData();

    return message.reply({
      embeds: [
        error(
          `🚨 La misión salió mal.\n\nPerdiste **${money(lost)}**.`
        )
      ]
    });
  }

  if (command === "rob") {

    const target =
      message.mentions.users.first();

    if (
      !target ||
      target.id === message.author.id
    ) {
      return message.reply({
        embeds: [
          error(
            "Menciona a otro usuario."
          )
        ]
      });
    }

    const victim =
      getUserData(target.id);

    if (victim.wallet < 50) {
      return message.reply({
        embeds: [
          error(
            "Ese usuario no tiene suficiente dinero."
          )
        ]
      });
    }

    const now = Date.now();
    const cd = 120_000;

    if (
      now - user.lastRob < cd
    ) {
      return message.reply({
        embeds: [
          error(
            `⏳ Espera **${cooldownText(cd - (now - user.lastRob))}**.`
          )
        ]
      });
    }

    user.lastRob = now;

    if (Math.random() < 0.4) {

      const amount =
        random(
          25,
          Math.min(300, victim.wallet)
        );

      victim.wallet -= amount;
      user.wallet += amount;

      saveData();

      return message.reply({
        embeds: [
          success(
            `🕵️ Robaste **${money(amount)}** a ${target}.`
          )
        ]
      });
    }

    saveData();

    return message.reply({
      embeds: [
        error(
          `🚨 Te descubrieron intentando robar a ${target}.`
        )
      ]
    });
  }

  if (
    command === "deposit" ||
    command === "dep"
  ) {

    let amount;

    if (
      !args[0] ||
      args[0].toLowerCase() === "all"
    ) {
      amount = user.wallet;
    } else {
      amount = Number(args[0]);
    }

    if (
      !Number.isInteger(amount) ||
      amount <= 0
    ) {
      return message.reply({
        embeds: [
          error(
            "Usa `m.dep all` o `m.deposit cantidad`."
          )
        ]
      });
    }

    if (amount > user.wallet) {
      return message.reply({
        embeds: [
          error(
            "No tienes esa cantidad."
          )
        ]
      });
    }

    user.wallet -= amount;
    user.bank += amount;

    saveData();

    return message.reply({
      embeds: [
        success(
          `🏦 Depositaste **${money(amount)}**.`
        )
      ]
    });
  }

  if (
    command === "withdraw" ||
    command === "with"
  ) {

    let amount;

    if (
      !args[0] ||
      args[0].toLowerCase() === "all"
    ) {
      amount = user.bank;
    } else {
      amount = Number(args[0]);
    }

    if (
      !Number.isInteger(amount) ||
      amount <= 0
    ) {
      return message.reply({
        embeds: [
          error(
            "Usa `m.with all` o `m.withdraw cantidad`."
          )
        ]
      });
    }

    if (amount > user.bank) {
      return message.reply({
        embeds: [
          error(
            "No tienes esa cantidad en el banco."
          )
        ]
      });
    }

    user.bank -= amount;
    user.wallet += amount;

    saveData();

    return message.reply({
      embeds: [
        success(
          `💵 Retiraste **${money(amount)}**.`
        )
      ]
    });
  }

  if (command === "pay") {

    const target =
      message.mentions.users.first();

    const amount =
      Number(args[1]);

    if (
      !target ||
      !Number.isInteger(amount) ||
      amount <= 0
    ) {
      return message.reply({
        embeds: [
          error(
            "Usa `m.pay @usuario cantidad`."
          )
        ]
      });
    }

    if (amount > user.wallet) {
      return message.reply({
        embeds: [
          error(
            "No tienes suficiente dinero."
          )
        ]
      });
    }

    const targetData =
      getUserData(target.id);

    user.wallet -= amount;
    targetData.wallet += amount;

    saveData();

    return message.reply({
      embeds: [
        success(
          `💸 Enviaste **${money(amount)}** a ${target}.`
        )
      ]
    });
  }

  if (
    command === "bank" ||
    command === "wallet" ||
    command === "money" ||
    command === "cash"
  ) {

    return message.reply({
      embeds: [
        makeEmbed(
          "╔══ 💰 DINERO ══╗",
          [
            `💵 Billetera: **${money(user.wallet)}**`,
            `🏦 Banco: **${money(user.bank)}**`,
            `💎 Total: **${money(user.wallet + user.bank)}**`
          ].join("\n")
        )
      ]
    });
  }

  if (
    command === "richest" ||
    command === "leaderboard"
  ) {

    const ranking =
      Object.entries(data.users)
        .sort(
          (a, b) =>
            (b[1].wallet + b[1].bank) -
            (a[1].wallet + a[1].bank)
        )
        .slice(0, 10);

    const lines = [];

    for (
      let i = 0;
      i < ranking.length;
      i++
    ) {

      const [
        id,
        info
      ] = ranking[i];

      const member =
        await guild.members
          .fetch(id)
          .catch(() => null);

      lines.push(
        `**${i + 1}.** ${
          member
            ? member.user.username
            : "Usuario"
        } — ${money(
          info.wallet + info.bank
        )}`
      );
    }

    return message.reply({
      embeds: [
        makeEmbed(
          "╔══ 🏆 TOP ECONOMÍA ══╗",
          lines.length
            ? lines.join("\n")
            : "Todavía no hay datos."
        )
      ]
    });
  }

  if (
    command === "networth" ||
    command === "economy" ||
    command === "economystats"
  ) {

    return message.reply({
      embeds: [
        makeEmbed(
          "╔══ 💎 ESTADÍSTICAS ══╗",
          [
            `💵 Wallet: **${money(user.wallet)}**`,
            `🏦 Bank: **${money(user.bank)}**`,
            `💎 Net Worth: **${money(user.wallet + user.bank)}**`
          ].join("\n")
        )
      ]
    });
  }

  if (
    command === "salary" ||
    command === "bonus" ||
    command === "income"
  ) {

    const amount =
      random(50, 150);

    user.wallet += amount;

    saveData();

    return message.reply({
      embeds: [
        success(
          `💰 Recibiste **${money(amount)}**.`
        )
      ]
    });
  }

  if (
    command === "give"
  ) {

    const target =
      message.mentions.users.first();

    const amount =
      Number(args[1]);

    if (
      !target ||
      !Number.isInteger(amount) ||
      amount <= 0
    ) {
      return message.reply({
        embeds: [
          error(
            "Usa `m.give @usuario cantidad`."
          )
        ]
      });
    }

    if (amount > user.wallet) {
      return message.reply({
        embeds: [
          error(
            "No tienes suficiente dinero."
          )
        ]
      });
    }

    const targetData =
      getUserData(target.id);

    user.wallet -= amount;
    targetData.wallet += amount;

    saveData();

    return message.reply({
      embeds: [
        success(
          `💸 Enviaste ${money(amount)} a ${target}.`
        )
      ]
    });
  }

  // ==========================================================
  // 🎮 DIVERSIÓN
  // ==========================================================

  if (command === "slots") {

    const symbols = [
      "🍒",
      "🍋",
      "⭐",
      "💎",
      "7️⃣"
    ];

    const result = [
      symbols[random(0, 4)],
      symbols[random(0, 4)],
      symbols[random(0, 4)]
    ];

    return message.reply({
      embeds: [
        makeEmbed(
          "╔══ 🎰 NEXUS SLOTS ══╗",
          [
            "```",
            result.join(" │ "),
            "```",
            "",
            result[0] === result[1] &&
            result[1] === result[2]
              ? "✨ ¡Tres iguales!"
              : "🌌 Resultado aleatorio."
          ].join("\n")
        )
      ]
    });
  }

  if (command === "coinflip") {

    return message.reply({
      embeds: [
        success(
          `🪙 Salió:\n\n# ${
            Math.random() < 0.5
              ? "CARA"
              : "CRUZ"
          }`
        )
      ]
    });
  }

  if (command === "dice") {

    return message.reply({
      embeds: [
        success(
          `🎲 Resultado: **${random(1, 6)}**`
        )
      ]
    });
  }

  if (command === "blackjack") {

    const player =
      random(15, 21);

    const dealer =
      random(14, 21);

    return message.reply({
      embeds: [
        makeEmbed(
          "╔══ 🃏 BLACKJACK ══╗",
          [
            `👤 Tú: **${player}**`,
            `🤖 Dealer: **${dealer}**`,
            "",
            player > dealer
              ? "✨ Ganaste la ronda."
              : player === dealer
                ? "🤝 Empate."
                : "🌌 Dealer gana."
          ].join("\n")
        )
      ]
    });
  }

  if (command === "guess") {

    const number =
      random(1, 5);

    const guess =
      Number(args[0]);

    if (
      !Number.isInteger(guess) ||
      guess < 1 ||
      guess > 5
    ) {
      return message.reply({
        embeds: [
          error(
            "Adivina un número del 1 al 5."
          )
        ]
      });
    }

    return message.reply({
      embeds: [
        success(
          `🔮 Número Nexus: **${number}**\nTu número: **${guess}**\n\n${
            number === guess
              ? "✨ ¡Acertaste!"
              : "🌌 No acertaste."
          }`
        )
      ]
    });
  }

  if (command === "8ball") {

    const answers = [
      "✨ Sí.",
      "🌌 Probablemente.",
      "💫 Puede ser.",
      "🌙 No.",
      "🔮 No parece.",
      "⭐ Definitivamente."
    ];

    return message.reply({
      embeds: [
        makeEmbed(
          "╔══ 🔮 NEXUS 8BALL ══╗",
          answers[
            random(
              0,
              answers.length - 1
            )
          ]
        )
      ]
    });
  }

  if (command === "roll") {

    const max =
      Number(args[0]) || 100;

    if (
      max < 2 ||
      max > 100000
    ) {
      return message.reply({
        embeds: [
          error(
            "El máximo es 100000."
          )
        ]
      });
    }

    return message.reply({
      embeds: [
        success(
          `🎲 Resultado: **${random(1, max)}**`
        )
      ]
    });
  }

  if (command === "choose") {

    const options =
      message.content
        .split("|")
        .slice(1)
        .map(x => x.trim())
        .filter(Boolean);

    if (options.length < 2) {
      return message.reply({
        embeds: [
          error(
            "Usa `m.choose opción 1 | opción 2`."
          )
        ]
      });
    }

    return message.reply({
      embeds: [
        success(
          `🎯 Elegí:\n\n# ${
            options[
              random(
                0,
                options.length - 1
              )
            ]
          }`
        )
      ]
    });
  }

  if (command === "rate") {

    const target =
      message.mentions.users.first() ||
      message.author;

    return message.reply({
      embeds: [
        success(
          `⭐ ${target} recibe **${random(1, 100)}/100**.`
        )
      ]
    });
  }

  if (command === "ship") {

    const users =
      [...message.mentions.users.values()];

    if (users.length < 2) {
      return message.reply({
        embeds: [
          error(
            "Menciona a dos usuarios."
          )
        ]
      });
    }

    return message.reply({
      embeds: [
        makeEmbed(
          "╔══ 💗 SHIP NEXUS ══╗",
          [
            `${users[0]} × ${users[1]}`,
            "",
            `💗 Compatibilidad: **${random(1, 100)}%**`
          ].join("\n")
        )
      ]
    });
  }

  if (
    command === "joke"
  ) {

    const jokes = [
      "😂 ¿Qué hace un bot en vacaciones? Se va al servidor.",
      "🌌 ¿Por qué el bot cruzó el canal? Porque tenía permisos.",
      "🤖 Error 404: chiste demasiado bueno."
    ];

    return message.reply({
      embeds: [
        success(
          jokes[random(0, jokes.length - 1)]
        )
      ]
    });
  }

  if (
    command === "fact"
  ) {

    const facts = [
      "🌌 El espacio no tiene aire como la atmósfera terrestre.",
      "🤖 Discord usa una arquitectura distribuida para sus servicios.",
      "⭐ Las estrellas pueden tener tamaños y temperaturas muy diferentes."
    ];

    return message.reply({
      embeds: [
        makeEmbed(
          "╔══ 🧠 DATO NEXUS ══╗",
          facts[
            random(0, facts.length - 1)
          ]
        )
      ]
    });
  }

  if (
    command === "number"
  ) {

    return message.reply({
      embeds: [
        success(
          `🔢 Número aleatorio: **${random(1, 100000)}**`
        )
      ]
    });
  }

  if (
    command === "fortune"
  ) {

    const fortunes = [
      "✨ Hoy puede ser un buen día para empezar algo nuevo.",
      "🌌 Sigue avanzando.",
      "⭐ Una pequeña acción puede generar un gran cambio."
    ];

    return message.reply({
      embeds: [
        makeEmbed(
          "╔══ 🔮 FORTUNA ══╗",
          fortunes[
            random(0, fortunes.length - 1)
          ]
        )
      ]
    });
  }

  if (
    command === "compliment"
  ) {

    const target =
      message.mentions.users.first() ||
      message.author;

    return message.reply({
      embeds: [
        makeEmbed(
          "╔══ 💗 CUMPLIDO ══╗",
          `✨ ${target} tiene una energía increíble.`
        )
      ]
    });
  }

  if (
    command === "roast"
  ) {

    const target =
      message.mentions.users.first();

    if (!target) {
      return message.reply({
        embeds: [
          error(
            "Menciona a alguien."
          )
        ]
      });
    }

    return message.reply({
      embeds: [
        makeEmbed(
          "╔══ 🔥 ROAST ══╗",
          `${target}, tu WiFi tiene más personalidad que tú 😂`
        )
      ]
    });
  }

  // ==========================================================
  // 💗 SOCIAL
  // ==========================================================

  const socialActions = {
    hug: "🤗 le da un abrazo amistoso a",
    kiss: "😊 le manda un saludo cariñoso a",
    pat: "🐾 le da unas palmaditas amistosas a",
    poke: "👉 le da un toque amistoso a",
    highfive: "🙌 choca la mano con",
    wave: "👋 saluda a",
    slap: "😤 le da un golpecito de broma a",
    friend: "🤝 quiere ser amigo de",
    cuddle: "🧸 se acurruca amistosamente con",
    dance: "💃 baila con",
    smile: "😊 sonríe a",
    wink: "😉 le guiña el ojo amistosamente a",
    happy: "✨ comparte felicidad con",
    love: "💗 manda cariño amistoso a",
    greet: "👋 le da la bienvenida a",
    goodnight: "🌙 le desea buenas noches a",
    goodmorning: "☀️ le desea buenos días a",
    thank: "🙏 le da las gracias a",
    applaud: "👏 aplaude a",
    cheer: "📣 anima a",
    support: "🧡 apoya a",
    react: "✨ reacciona a",
    interaction: "🌌 interactúa con"
  };

  if (socialActions[command]) {

    const target =
      message.mentions.users.first();

    if (!target) {
      return message.reply({
        embeds: [
          error(
            "Menciona a alguien."
          )
        ]
      });
    }

    return message.reply({
      embeds: [
        makeEmbed(
          `╔══ 💗 ${command.toUpperCase()} ══╗`,
          `${message.author} ${socialActions[command]} ${target} ✨`
        )
      ]
    });
  }

  // ==========================================================
  // ⭐ NIVELES
  // ==========================================================

  if (
    [
      "level",
      "rank",
      "xp",
      "progress",
      "myxp",
      "mylevel",
      "levelinfo",
      "levelstats",
      "xpstats",
      "progressbar",
      "experience",
      "levelcheck"
    ].includes(command)
  ) {

    const needed =
      user.level * 100;

    const percent =
      Math.floor(
        (user.xp / needed) * 100
      );

    return message.reply({
      embeds: [
        makeEmbed(
          "╔══ ⭐ NEXUS LEVEL ══╗",
          [
            `👤 ${message.author}`,
            "",
            `⭐ Nivel: **${user.level}**`,
            `✨ XP: **${user.xp}/${needed}**`,
            `📊 Progreso: **${percent}%**`,
            "",
            `▰`.repeat(
              Math.floor(percent / 10)
            ) +
            `▱`.repeat(
              10 -
              Math.floor(percent / 10)
            )
          ].join("\n")
        )
      ]
    });
  }

  if (
    command === "nextlevel" ||
    command === "xprequired"
  ) {

    const needed =
      user.level * 100 -
      user.xp;

    return message.reply({
      embeds: [
        success(
          `⭐ Te faltan **${needed} XP** para el nivel **${user.level + 1}**.`
        )
      ]
    });
  }

  if (
    [
      "top",
      "leaderboardxp",
      "leveltop",
      "xptop",
      "ranking",
      "levelboard",
      "xpleaderboard"
    ].includes(command)
  ) {

    const ranking =
      Object.entries(data.users)
        .sort(
          (a, b) =>
            (b[1].level * 100000 + b[1].xp) -
            (a[1].level * 100000 + a[1].xp)
        )
        .slice(0, 10);

    const lines = [];

    for (
      let i = 0;
      i < ranking.length;
      i++
    ) {

      const [
        id,
        info
      ] = ranking[i];

      const member =
        await guild.members
          .fetch(id)
          .catch(() => null);

      lines.push(
        `**${i + 1}.** ${
          member
            ? member.user.username
            : "Usuario"
        } — Nivel **${info.level}** • ${info.xp} XP`
      );
    }

    return message.reply({
      embeds: [
        makeEmbed(
          "╔══ 🏆 TOP NIVELES ══╗",
          lines.length
            ? lines.join("\n")
            : "No hay datos."
        )
      ]
    });
  }

  if (
    command === "levels" ||
    command === "levelup" ||
    command === "rewards"
  ) {

    return message.reply({
      embeds: [
        makeEmbed(
          "╔══ ⭐ SISTEMA DE NIVELES ══╗",
          [
            "✨ Gana XP usando Mati Nexus.",
            "",
            "⭐ Cada nivel requiere más XP.",
            "🎁 Los niveles forman parte del sistema Nexus."
          ].join("\n")
        )
      ]
    });
  }

  // ==========================================================
  // 🛠️ UTILIDADES
  // ==========================================================

  if (
    command === "calculator"
  ) {

    const expression =
      args.join(" ");

    if (!expression) {
      return message.reply({
        embeds: [
          error(
            "Escribe una operación."
          )
        ]
      });
    }

    if (
      !/^[0-9+\-*/().%\s]+$/.test(
        expression
      )
    ) {
      return message.reply({
        embeds: [
          error(
            "Solo se permiten operaciones matemáticas básicas."
          )
        ]
      });
    }

    try {

      const result =
        Function(
          `"use strict"; return (${expression})`
        )();

      if (
        !Number.isFinite(result)
      ) {
        throw new Error();
      }

      return message.reply({
        embeds: [
          success(
            `🧮 \`${expression}\`\n\n# ${result}`
          )
        ]
      });

    } catch {

      return message.reply({
        embeds: [
          error(
            "No pude calcular esa operación."
          )
        ]
      });
    }
  }

  if (
    command === "poll"
  ) {

    const question =
      args.join(" ");

    if (!question) {
      return message.reply({
        embeds: [
          error(
            "Escribe una pregunta."
          )
        ]
      });
    }

    const poll =
      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 📊 ENCUESTA ══╗",
            `**${question}**\n\n👍 Sí\n👎 No`
          )
        ]
      });

    await poll.react("👍");
    await poll.react("👎");

    return;
  }

  if (
    command === "say"
  ) {

    if (!isAdmin(message.member)) {
      return message.reply({
        embeds: [
          error(
            "🔒 Solo Administradores."
          )
        ]
      });
    }

    const text =
      args.join(" ");

    if (!text) return;

    await message.delete()
      .catch(() => {});

    return message.channel.send(text);
  }

  if (
    command === "embed"
  ) {

    if (!isAdmin(message.member)) {
      return message.reply({
        embeds: [
          error(
            "🔒 Solo Administradores."
          )
        ]
      });
    }

    const text =
      args.join(" ");

    return message.channel.send({
      embeds: [
        makeEmbed(
          "╔══ 🌌 MATI NEXUS ══╗",
          text || "Mensaje Nexus."
        )
      ]
    });
  }

  // ==========================================================
  // 👑 ADMINISTRACIÓN
  // ==========================================================

  const adminCommands = new Set(
    Object.values(adminCategories)
      .flatMap(cat => cat.commands)
  );

  if (adminCommands.has(command)) {

    if (!isAdmin(message.member)) {
      return message.reply({
        embeds: [
          error(
            "🔒 Este comando es exclusivo para Administradores."
          )
        ]
      });
    }
  }

  // ----------------------------------------------------------
  // 💰 ADMIN ECONOMY
  // ----------------------------------------------------------

  if (
    command === "addmoney"
  ) {

    const target =
      message.mentions.users.first();

    const amount =
      Number(args[1]);

    if (
      !target ||
      !Number.isInteger(amount) ||
      amount <= 0
    ) {
      return message.reply({
        embeds: [
          error(
            "Usa `m.addmoney @usuario cantidad`."
          )
        ]
      });
    }

    const targetData =
      getUserData(target.id);

    targetData.wallet += amount;

    saveData();

    await sendLog(
      guild,
      "DINERO AÑADIDO",
      `👑 ${message.author} añadió **${money(amount)}** a ${target}.`
    );

    return message.reply({
      embeds: [
        success(
          `💰 Añadiste **${money(amount)}** a ${target}.`
        )
      ]
    });
  }

  if (
    command === "removemoney"
  ) {

    const target =
      message.mentions.users.first();

    const amount =
      Number(args[1]);

    if (
      !target ||
      !Number.isInteger(amount) ||
      amount <= 0
    ) {
      return message.reply({
        embeds: [
          error(
            "Usa `m.removemoney @usuario cantidad`."
          )
        ]
      });
    }

    const targetData =
      getUserData(target.id);

    targetData.wallet =
      Math.max(
        0,
        targetData.wallet - amount
      );

    saveData();

    return message.reply({
      embeds: [
        success(
          `💸 Quitaste **${money(amount)}** a ${target}.`
        )
      ]
    });
  }

  if (
    command === "setmoney"
  ) {

    const target =
      message.mentions.users.first();

    const amount =
      Number(args[1]);

    if (
      !target ||
      !Number.isInteger(amount) ||
      amount < 0
    ) {
      return message.reply({
        embeds: [
          error(
            "Usa `m.setmoney @usuario cantidad`."
          )
        ]
      });
    }

    const targetData =
      getUserData(target.id);

    targetData.wallet =
      amount;

    saveData();

    return message.reply({
      embeds: [
        success(
          `💰 El dinero de ${target} ahora es **${money(amount)}**.`
        )
      ]
    });
  }

  if (
    command === "addbank" ||
    command === "removebank" ||
    command === "setbank"
  ) {

    const target =
      message.mentions.users.first();

    const amount =
      Number(args[1]);

    if (
      !target ||
      !Number.isInteger(amount) ||
      amount < 0
    ) {
      return message.reply({
        embeds: [
          error(
            `Usa \`m.${command} @usuario cantidad\`.`
          )
        ]
      });
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
          targetData.bank - amount
        );
    }

    if (command === "setbank") {
      targetData.bank = amount;
    }

    saveData();

    return message.reply({
      embeds: [
        success(
          `🏦 Banco actualizado para ${target}.`
        )
      ]
    });
  }

  // ----------------------------------------------------------
  // ⭐ ADMIN XP
  // ----------------------------------------------------------

  if (
    command === "addxp" ||
    command === "removexp" ||
    command === "setxp"
  ) {

    const target =
      message.mentions.users.first();

    const amount =
      Number(args[1]);

    if (
      !target ||
      !Number.isInteger(amount) ||
      amount < 0
    ) {
      return message.reply({
        embeds: [
          error(
            `Usa \`m.${command} @usuario cantidad\`.`
          )
        ]
      });
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
          targetData.xp - amount
        );
    }

    if (command === "setxp") {
      targetData.xp = amount;
    }

    saveData();

    return message.reply({
      embeds: [
        success(
          `⭐ XP actualizada para ${target}.`
        )
      ]
    });
  }

  if (
    command === "addlevel" ||
    command === "setlevel"
  ) {

    const target =
      message.mentions.users.first();

    const amount =
      Number(args[1]);

    if (
      !target ||
      !Number.isInteger(amount) ||
      amount < 1
    ) {
      return message.reply({
        embeds: [
          error(
            `Usa \`m.${command} @usuario nivel\`.`
          )
        ]
      });
    }

    const targetData =
      getUserData(target.id);

    if (command === "addlevel") {
      targetData.level += amount;
    } else {
      targetData.level = amount;
    }

    saveData();

    return message.reply({
      embeds: [
        success(
          `⭐ Nivel de ${target}: **${targetData.level}**`
        )
      ]
    });
  }

  if (
    command === "resetuser"
  ) {

    const target =
      message.mentions.users.first();

    if (!target) {
      return message.reply({
        embeds: [
          error(
            "Menciona un usuario."
          )
        ]
      });
    }

    data.users[target.id] = {
      wallet: 0,
      bank: 0,
      xp: 0,
      level: 1,
      warns: 0,
      lastDaily: 0,
      lastWork: 0,
      lastCrime: 0,
      lastBeg: 0,
      lastRob: 0
    };

    saveData();

    return message.reply({
      embeds: [
        success(
          `♻️ Los datos de ${target} fueron reiniciados.`
        )
      ]
    });
  }

  if (
    command === "setwarns"
  ) {

    const target =
      message.mentions.users.first();

    const amount =
      Number(args[1]);

    if (
      !target ||
      !Number.isInteger(amount) ||
      amount < 0
    ) {
      return message.reply({
        embeds: [
          error(
            "Usa `m.setwarns @usuario cantidad`."
          )
        ]
      });
    }

    const targetData =
      getUserData(target.id);

    targetData.warns =
      amount;

    saveData();

    return message.reply({
      embeds: [
        success(
          `⚠️ Warns de ${target}: **${amount}**`
        )
      ]
    });
  }

  if (
    command === "resetwarns"
  ) {

    const target =
      message.mentions.users.first();

    if (!target) {
      return message.reply({
        embeds: [
          error(
            "Menciona un usuario."
          )
        ]
      });
    }

    const targetData =
      getUserData(target.id);

    targetData.warns = 0;

    saveData();

    return message.reply({
      embeds: [
        success(
          `✅ Warns de ${target} reiniciados.`
        )
      ]
    });
  }

  // ----------------------------------------------------------
  // 🛡️ MODERACIÓN
  // ----------------------------------------------------------

  if (
    command === "ban"
  ) {

    const target =
      message.mentions.members.first();

    if (!target) {
      return message.reply({
        embeds: [
          error(
            "Menciona al usuario."
          )
        ]
      });
    }

    if (!target.bannable) {
      return message.reply({
        embeds: [
          error(
            "No puedo banear a ese usuario."
          )
        ]
      });
    }

    await target.ban({
      reason:
        `Mati Nexus • ${message.author.tag}`
    });

    await sendLog(
      guild,
      "BAN",
      `🔨 ${message.author} baneó a **${target.user.tag}**.`
    );

    return message.reply({
      embeds: [
        success(
          `🔨 **${target.user.tag}** fue baneado.`
        )
      ]
    });
  }

  if (
    command === "kick"
  ) {

    const target =
      message.mentions.members.first();

    if (!target) {
      return message.reply({
        embeds: [
          error(
            "Menciona al usuario."
          )
        ]
      });
    }

    if (!target.kickable) {
      return message.reply({
        embeds: [
          error(
            "No puedo expulsar a ese usuario."
          )
        ]
      });
    }

    await target.kick(
      `Mati Nexus • ${message.author.tag}`
    );

    return message.reply({
      embeds: [
        success(
          `👢 **${target.user.tag}** fue expulsado.`
        )
      ]
    });
  }

  if (
    command === "timeout" ||
    command === "mute"
  ) {

    const target =
      message.mentions.members.first();

    const minutes =
      Number(args[1]) || 10;

    if (!target) {
      return message.reply({
        embeds: [
          error(
            "Menciona al usuario."
          )
        ]
      });
    }

    if (!target.moderatable) {
      return message.reply({
        embeds: [
          error(
            "No puedo aplicar timeout."
          )
        ]
      });
    }

    await target.timeout(
      Math.min(
        minutes,
        40320
      ) * 60_000,
      `Mati Nexus • ${message.author.tag}`
    );

    return message.reply({
      embeds: [
        success(
          `🔇 ${target} recibió timeout durante **${minutes} minutos**.`
        )
      ]
    });
  }

  if (
    command === "untimeout" ||
    command === "unmute"
  ) {

    const target =
      message.mentions.members.first();

    if (!target) {
      return message.reply({
        embeds: [
          error(
            "Menciona al usuario."
          )
        ]
      });
    }

    await target.timeout(null);

    return message.reply({
      embeds: [
        success(
          `🔊 Timeout eliminado a ${target}.`
        )
      ]
    });
  }

  if (
    command === "warn"
  ) {

    const target =
      message.mentions.users.first();

    if (!target) {
      return message.reply({
        embeds: [
          error(
            "Menciona al usuario."
          )
        ]
      });
    }

    const targetData =
      getUserData(target.id);

    targetData.warns++;

    saveData();

    await sendLog(
      guild,
      "WARN",
      `⚠️ ${message.author} advirtió a ${target}. Total: **${targetData.warns}**`
    );

    return message.reply({
      embeds: [
        success(
          `⚠️ ${target} recibió un warn.\n\nTotal: **${targetData.warns}**`
        )
      ]
    });
  }

  if (
    command === "unwarn"
  ) {

    const target =
      message.mentions.users.first();

    if (!target) {
      return message.reply({
        embeds: [
          error(
            "Menciona al usuario."
          )
        ]
      });
    }

    const targetData =
      getUserData(target.id);

    targetData.warns =
      Math.max(
        0,
        targetData.warns - 1
      );

    saveData();

    return message.reply({
      embeds: [
        success(
          `✅ Se quitó un warn a ${target}.`
        )
      ]
    });
  }

  if (
    command === "clearwarns"
  ) {

    const target =
      message.mentions.users.first();

    if (!target) {
      return message.reply({
        embeds: [
          error(
            "Menciona al usuario."
          )
        ]
      });
    }

    const targetData =
      getUserData(target.id);

    targetData.warns = 0;

    saveData();

    return message.reply({
      embeds: [
        success(
          `🧹 Warns eliminados de ${target}.`
        )
      ]
    });
  }

  if (
    command === "warnings" ||
    command === "warns" ||
    command === "checkwarns"
  ) {

    const target =
      message.mentions.users.first() ||
      message.author;

    const targetData =
      getUserData(target.id);

    return message.reply({
      embeds: [
        makeEmbed(
          "╔══ ⚠️ WARNS ══╗",
          `${target} tiene **${targetData.warns}** advertencias.`
        )
      ]
    });
  }

  if (
    command === "clear" ||
    command === "purge"
  ) {

    const amount =
      Number(args[0]);

    if (
      !Number.isInteger(amount) ||
      amount < 1 ||
      amount > 100
    ) {
      return message.reply({
        embeds: [
          error(
            "Indica una cantidad entre 1 y 100."
          )
        ]
      });
    }

    const deleted =
      await message.channel.bulkDelete(
        amount,
        true
      );

    const msg =
      await message.channel.send({
        embeds: [
          success(
            `🧹 Eliminados **${deleted.size} mensajes**.`
          )
        ]
      });

    setTimeout(
      () => msg.delete().catch(() => {}),
      5000
    );

    return;
  }

  if (
    command === "lock"
  ) {

    await message.channel.permissionOverwrites.edit(
      guild.roles.everyone,
      {
        SendMessages: false
      }
    );

    return message.reply({
      embeds: [
        success(
          "🔒 Canal bloqueado."
        )
      ]
    });
  }

  if (
    command === "unlock"
  ) {

    await message.channel.permissionOverwrites.edit(
      guild.roles.everyone,
      {
        SendMessages: null
      }
    );

    return message.reply({
      embeds: [
        success(
          "🔓 Canal desbloqueado."
        )
      ]
    });
  }

  if (
    command === "slowmode"
  ) {

    const seconds =
      Number(args[0]);

    if (
      !Number.isInteger(seconds) ||
      seconds < 0 ||
      seconds > 21600
    ) {
      return message.reply({
        embeds: [
          error(
            "Usa un valor entre 0 y 21600 segundos."
          )
        ]
      });
    }

    await message.channel
      .setRateLimitPerUser(seconds);

    return message.reply({
      embeds: [
        success(
          `🐌 Slowmode: **${seconds}s**`
        )
      ]
    });
  }

  if (
    command === "nick"
  ) {

    const target =
      message.mentions.members.first();

    const nickname =
      args.slice(1).join(" ");

    if (
      !target ||
      !nickname
    ) {
      return message.reply({
        embeds: [
          error(
            "Usa `m.nick @usuario nombre`."
          )
        ]
      });
    }

    await target.setNickname(
      nickname
    );

    return message.reply({
      embeds: [
        success(
          `✏️ Nuevo nombre: **${nickname}**`
        )
      ]
    });
  }

  if (
    command === "resetnick"
  ) {

    const target =
      message.mentions.members.first();

    if (!target) {
      return message.reply({
        embeds: [
          error(
            "Menciona al usuario."
          )
        ]
      });
    }

    await target.setNickname(null);

    return message.reply({
      embeds: [
        success(
          `✏️ Nickname restaurado para ${target}.`
        )
      ]
    });
  }

  // ----------------------------------------------------------
  // ⚙️ CONFIGURACIÓN
  // ----------------------------------------------------------

  if (
    command === "welcome" ||
    command === "welcomechannel"
  ) {

    const channel =
      message.mentions.channels.first();

    if (
      !channel ||
      channel.type !== ChannelType.GuildText
    ) {
      return message.reply({
        embeds: [
          error(
            "Menciona un canal de texto."
          )
        ]
      });
    }

    config.welcomeChannel =
      channel.id;

    config.welcomeEnabled =
      true;

    saveData();

    return message.reply({
      embeds: [
        success(
          `👋 Bienvenidas configuradas en ${channel}.`
        )
      ]
    });
  }

  if (
    command === "goodbye" ||
    command === "goodbyechannel"
  ) {

    const channel =
      message.mentions.channels.first();

    if (
      !channel ||
      channel.type !== ChannelType.GuildText
    ) {
      return message.reply({
        embeds: [
          error(
            "Menciona un canal de texto."
          )
        ]
      });
    }

    config.goodbyeChannel =
      channel.id;

    config.goodbyeEnabled =
      true;

    saveData();

    return message.reply({
      embeds: [
        success(
          `😭 Despedidas configuradas en ${channel}.`
        )
      ]
    });
  }

  if (
    command === "invites" ||
    command === "invitechannel"
  ) {

    const channel =
      message.mentions.channels.first();

    if (
      !channel ||
      channel.type !== ChannelType.GuildText
    ) {
      return message.reply({
        embeds: [
          error(
            "Menciona un canal de texto."
          )
        ]
      });
    }

    config.inviteChannel =
      channel.id;

    config.inviteEnabled =
      true;

    saveData();

    // Cargamos la caché después de configurar.
    await loadInvites(guild);

    return message.reply({
      embeds: [
        success(
          `📨 Registro de invitaciones configurado en ${channel}.`
        )
      ]
    });
  }

  if (
    command === "logs" ||
    command === "logchannel"
  ) {

    const channel =
      message.mentions.channels.first();

    if (
      !channel ||
      channel.type !== ChannelType.GuildText
    ) {
      return message.reply({
        embeds: [
          error(
            "Menciona un canal de texto."
          )
        ]
      });
    }

    config.logChannel =
      channel.id;

    config.logsEnabled =
      true;

    saveData();

    return message.reply({
      embeds: [
        success(
          `📜 Logs configurados correctamente en ${channel}.`
        )
      ]
    });
  }

  if (
    command === "welcomeon"
  ) {
    config.welcomeEnabled = true;
    saveData();

    return message.reply({
      embeds: [
        success(
          "👋 Bienvenidas activadas."
        )
      ]
    });
  }

  if (
    command === "welcomeoff"
  ) {
    config.welcomeEnabled = false;
    saveData();

    return message.reply({
      embeds: [
        success(
          "👋 Bienvenidas desactivadas."
        )
      ]
    });
  }

  if (
    command === "goodbyeon"
  ) {
    config.goodbyeEnabled = true;
    saveData();

    return message.reply({
      embeds: [
        success(
          "😭 Despedidas activadas."
        )
      ]
    });
  }

  if (
    command === "goodbyeoff"
  ) {
    config.goodbyeEnabled = false;
    saveData();

    return message.reply({
      embeds: [
        success(
          "😭 Despedidas desactivadas."
        )
      ]
    });
  }

  if (
    command === "inviteson"
  ) {
    config.inviteEnabled = true;
    saveData();

    return message.reply({
      embeds: [
        success(
          "📨 Sistema de invitaciones activado."
        )
      ]
    });
  }

  if (
    command === "invitesoff"
  ) {
    config.inviteEnabled = false;
    saveData();

    return message.reply({
      embeds: [
        success(
          "📨 Sistema de invitaciones desactivado."
        )
      ]
    });
  }

  if (
    command === "logson"
  ) {
    config.logsEnabled = true;
    saveData();

    return message.reply({
      embeds: [
        success(
          "📜 Logs activados."
        )
      ]
    });
  }

  if (
    command === "logsoff"
  ) {
    config.logsEnabled = false;
    saveData();

    return message.reply({
      embeds: [
        success(
          "📜 Logs desactivados."
        )
      ]
    });
  }

  if (
    command === "autorole"
  ) {

    const role =
      message.mentions.roles.first();

    if (!role) {
      return message.reply({
        embeds: [
          error(
            "Menciona el rol que quieres configurar."
          )
        ]
      });
    }

    config.autorole =
      role.id;

    saveData();

    return message.reply({
      embeds: [
        success(
          `🎭 Autorol configurado: ${role}`
        )
      ]
    });
  }

  if (
    command === "autoroleoff"
  ) {

    config.autorole = null;

    saveData();

    return message.reply({
      embeds: [
        success(
          "🎭 Autorol desactivado."
        )
      ]
    });
  }

  if (
    command === "prefix"
  ) {

    return message.reply({
      embeds: [
        makeEmbed(
          "╔══ ⚙️ PREFIJOS ══╗",
          [
            "🌌 `Mati help`",
            "✨ `m.help`",
            "",
            "Los dos funcionan."
          ].join("\n")
        )
      ]
    });
  }

  if (
    command === "setup" ||
    command === "serverconfig" ||
    command === "config" ||
    command === "server"
  ) {

    return message.reply({
      embeds: [
        makeEmbed(
          "╔══ ⚙️ CONFIGURACIÓN ══╗",
          [
            `👋 Bienvenidas: ${
              config.welcomeChannel
                ? `<#${config.welcomeChannel}>`
                : "❌"
            }`,
            `😭 Despedidas: ${
              config.goodbyeChannel
                ? `<#${config.goodbyeChannel}>`
                : "❌"
            }`,
            `📨 Invitaciones: ${
              config.inviteChannel
                ? `<#${config.inviteChannel}>`
                : "❌"
            }`,
            `📜 Logs: ${
              config.logChannel
                ? `<#${config.logChannel}>`
                : "❌"
            }`,
            `🎭 Autorol: ${
              config.autorole
                ? `<@&${config.autorole}>`
                : "❌"
            }`
          ].join("\n")
        )
      ]
    });
  }

  if (
    command === "resetconfig"
  ) {

    data.guilds[guild.id] = {
      welcomeChannel: null,
      goodbyeChannel: null,
      inviteChannel: null,
      logChannel: null,

      welcomeEnabled: true,
      goodbyeEnabled: true,
      inviteEnabled: true,
      logsEnabled: true,

      autorole: null,
      prefix: "m."
    };

    saveData();

    return message.reply({
      embeds: [
        success(
          "♻️ Configuración reiniciada."
        )
      ]
    });
  }

  // ----------------------------------------------------------
  // 👑 ADMIN EXTRA
  // ----------------------------------------------------------

  if (
    command === "createrole"
  ) {

    const name =
      args.join(" ");

    if (!name) {
      return message.reply({
        embeds: [
          error(
            "Indica el nombre."
          )
        ]
      });
    }

    const role =
      await guild.roles.create({
        name,
        reason:
          `Mati Nexus • ${message.author.tag}`
      });

    return message.reply({
      embeds: [
        success(
          `🎭 Rol creado: ${role}`
        )
      ]
    });
  }

  if (
    command === "deleterole"
  ) {

    const role =
      message.mentions.roles.first();

    if (!role) {
      return message.reply({
        embeds: [
          error(
            "Menciona un rol."
          )
        ]
      });
    }

    await role.delete();

    return message.reply({
      embeds: [
        success(
          "🗑️ Rol eliminado."
        )
      ]
    });
  }

  if (
    command === "role"
  ) {

    const target =
      message.mentions.members.first();

    const role =
      message.mentions.roles.first();

    if (!target || !role) {
      return message.reply({
        embeds: [
          error(
            "Usa `m.role @usuario @rol`."
          )
        ]
      });
    }

    await target.roles.add(role);

    return message.reply({
      embeds: [
        success(
          `🎭 ${role} añadido a ${target}.`
        )
      ]
    });
  }

  if (
    command === "createchannel"
  ) {

    const name =
      args.join("-")
        .toLowerCase();

    if (!name) {
      return message.reply({
        embeds: [
          error(
            "Indica un nombre."
          )
        ]
      });
    }

    const channel =
      await guild.channels.create({
        name,
        type: ChannelType.GuildText
      });

    return message.reply({
      embeds: [
        success(
          `📁 Canal creado: ${channel}.`
        )
      ]
    });
  }

  if (
    command === "deletechannel"
  ) {

    const channel =
      message.mentions.channels.first() ||
      message.channel;

    await channel.delete();

    return;
  }

  if (
    command === "announce"
  ) {

    const text =
      args.join(" ");

    if (!text) {
      return message.reply({
        embeds: [
          error(
            "Escribe el anuncio."
          )
        ]
      });
    }

    return message.channel.send({
      embeds: [
        makeEmbed(
          "╔══ 📢 ANUNCIO NEXUS ══╗",
          text
        )
      ]
    });
  }

  if (
    command === "giveall"
  ) {

    const amount =
      Number(args[0]);

    if (
      !Number.isInteger(amount) ||
      amount <= 0
    ) {
      return message.reply({
        embeds: [
          error(
            "Usa `m.giveall cantidad`."
          )
        ]
      });
    }

    for (
      const member of guild.members.cache.values()
    ) {
      if (member.user.bot) continue;

      const memberData =
        getUserData(member.id);

      memberData.wallet += amount;
    }

    saveData();

    return message.reply({
      embeds: [
        success(
          `💰 Se añadieron **${money(amount)}** a los miembros del servidor.`
        )
      ]
    });
  }

  if (
    command === "takeall"
  ) {

    const amount =
      Number(args[0]);

    if (
      !Number.isInteger(amount) ||
      amount <= 0
    ) {
      return message.reply({
        embeds: [
          error(
            "Usa `m.takeall cantidad`."
          )
        ]
      });
    }

    for (
      const member of guild.members.cache.values()
    ) {
      if (member.user.bot) continue;

      const memberData =
        getUserData(member.id);

      memberData.wallet =
        Math.max(
          0,
          memberData.wallet - amount
        );
    }

    saveData();

    return message.reply({
      embeds: [
        success(
          `💸 Se quitaron hasta **${money(amount)}** a los miembros.`
        )
      ]
    });
  }

  if (
    command === "say"
  ) {

    const text =
      args.join(" ");

    if (!text) return;

    await message.delete()
      .catch(() => {});

    return message.channel.send(text);
  }

  if (
    command === "modinfo"
  ) {

    return message.reply({
      embeds: [
        makeEmbed(
          "╔══ 🛡️ MOD INFO ══╗",
          [
            "🌌 Mati Nexus Moderation",
            "",
            "🛡️ Sistema administrativo activo.",
            "📜 Logs disponibles.",
            "⚠️ Sistema de advertencias disponible.",
            "🔇 Timeout disponible."
          ].join("\n")
        )
      ]
    });
  }
}

// ============================================================
// 💬 MESSAGE CREATE
// ============================================================

client.on(
  "messageCreate",
  async message => {

    if (
      message.author.bot ||
      !message.guild
    ) return;

    const content =
      message.content.trim();

    let body = null;

    // Mati help
    if (
      content
        .toLowerCase()
        .startsWith("mati ")
    ) {
      body =
        content.slice(5).trim();
    }

    // m.help
    else if (
      content
        .toLowerCase()
        .startsWith("m.")
    ) {
      body =
        content.slice(2).trim();
    }

    if (!body) return;

    const parts =
      body.split(/\s+/);

    const command =
      parts.shift()
        ?.toLowerCase();

    if (!command) return;

    const args = parts;

    try {

      await executeCommand(
        message,
        command,
        args
      );

    } catch (err) {

      console.error(
        `❌ Error en ${command}:`,
        err
      );

      await message.reply({
        embeds: [
          error(
            "Ocurrió un error ejecutando el comando. Comprueba los permisos del bot."
          )
        ]
      }).catch(() => {});
    }
  }
);

// ============================================================
// 🖱️ MENÚS
// ============================================================

client.on(
  "interactionCreate",
  async interaction => {

    try {

      if (
        interaction.isStringSelectMenu()
      ) {

        if (
          interaction.customId ===
          "mati_public_help"
        ) {

          const key =
            interaction.values[0];

          return interaction.update({
            embeds: [
              categoryEmbed(key)
            ],
            components: [
              publicHelpMenu()
            ]
          });
        }

        if (
          interaction.customId ===
          "mati_admin_help"
        ) {

          if (
            !interaction.memberPermissions?.has(
              PermissionsBitField.Flags.Administrator
            )
          ) {

            return interaction.reply({
              embeds: [
                error(
                  "🔒 Solo Administradores."
                )
              ],
              ephemeral: true
            });
          }

          const key =
            interaction.values[0];

          return interaction.update({
            embeds: [
              adminCategoryEmbed(key)
            ],
            components: [
              adminHelpMenu()
            ]
          });
        }
      }

      if (
        !interaction.isChatInputCommand()
      ) return;

      // ======================================================
      // SLASH
      // ======================================================

      if (
        interaction.commandName === "help"
      ) {

        return interaction.reply({
          embeds: [publicHelp()],
          components: [
            publicHelpMenu()
          ]
        });
      }

      if (
        interaction.commandName ===
        "helpad"
      ) {

        if (
          !interaction.memberPermissions?.has(
            PermissionsBitField.Flags.Administrator
          )
        ) {

          return interaction.reply({
            embeds: [
              error(
                "🔒 Solo Administradores."
              )
            ],
            ephemeral: true
          });
        }

        return interaction.reply({
          embeds: [adminHelp()],
          components: [
            adminHelpMenu()
          ]
        });
      }

      if (
        interaction.commandName ===
        "ping"
      ) {

        return interaction.reply({
          embeds: [
            success(
              `🏓 Pong!\n\n**${client.ws.ping}ms**`
            )
          ]
        });
      }

      if (
        interaction.commandName ===
        "balance"
      ) {

        const user =
          getUserData(
            interaction.user.id
          );

        return interaction.reply({
          embeds: [
            makeEmbed(
              "╔══ 💰 BALANCE ══╗",
              [
                `💵 Billetera: **${money(user.wallet)}**`,
                `🏦 Banco: **${money(user.bank)}**`,
                `💎 Total: **${money(user.wallet + user.bank)}**`
              ].join("\n")
            )
          ]
        });
      }

      if (
        interaction.commandName ===
        "profile"
      ) {

        const user =
          getUserData(
            interaction.user.id
          );

        return interaction.reply({
          embeds: [
            makeEmbed(
              "╔══ 🌌 PERFIL ══╗",
              [
                `👤 ${interaction.user}`,
                `💰 ${money(user.wallet)}`,
                `🏦 ${money(user.bank)}`,
                `⭐ Nivel ${user.level}`,
                `✨ ${user.xp}/${user.level * 100} XP`
              ].join("\n")
            )
          ]
        });
      }

      if (
        interaction.commandName ===
        "serverinfo"
      ) {

        const guild =
          interaction.guild;

        return interaction.reply({
          embeds: [
            makeEmbed(
              "╔══ 🌌 SERVIDOR ══╗",
              [
                `🏠 ${guild.name}`,
                `👥 ${guild.memberCount} miembros`,
                `📁 ${guild.channels.cache.size} canales`,
                `🎭 ${guild.roles.cache.size} roles`
              ].join("\n")
            )
          ]
        });
      }

      if (
        interaction.commandName ===
        "userinfo"
      ) {

        const target =
          interaction.options.getUser(
            "usuario"
          ) ||
          interaction.user;

        return interaction.reply({
          embeds: [
            makeEmbed(
              "╔══ 👤 USUARIO ══╗",
              [
                `👤 ${target}`,
                `🆔 \`${target.id}\``,
                `📅 <t:${Math.floor(target.createdTimestamp / 1000)}:D>`
              ].join("\n")
            ).setThumbnail(
              target.displayAvatarURL({
                size: 512
              })
            )
          ]
        });
      }

      if (
        interaction.commandName ===
        "work"
      ) {

        const user =
          getUserData(
            interaction.user.id
          );

        const now =
          Date.now();

        if (
          now - user.lastWork <
          30_000
        ) {

          return interaction.reply({
            embeds: [
              error(
                `⏳ Espera **${cooldownText(30_000 - (now - user.lastWork))}**.`
              )
            ],
            ephemeral: true
          });
        }

        const amount =
          random(100, 300);

        user.wallet += amount;
        user.lastWork = now;

        addXP(
          interaction.user.id,
          random(10, 25)
        );

        saveData();

        return interaction.reply({
          embeds: [
            success(
              `💼 Trabajaste y ganaste **${money(amount)}**.`
            )
          ]
        });
      }

      if (
        interaction.commandName ===
        "daily"
      ) {

        const user =
          getUserData(
            interaction.user.id
          );

        const now =
          Date.now();

        const cd =
          86_400_000;

        if (
          now - user.lastDaily <
          cd
        ) {

          return interaction.reply({
            embeds: [
              error(
                `🎁 Disponible en **${cooldownText(cd - (now - user.lastDaily))}**.`
              )
            ],
            ephemeral: true
          });
        }

        const amount =
          random(500, 1000);

        user.wallet += amount;
        user.lastDaily = now;

        saveData();

        return interaction.reply({
          embeds: [
            success(
              `🎁 Recibiste **${money(amount)}**.`
            )
          ]
        });
      }

    } catch (err) {

      console.error(
        "❌ Interaction error:",
        err
      );

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {

        await interaction.reply({
          embeds: [
            error(
              "Ocurrió un error ejecutando esta acción."
            )
          ],
          ephemeral: true
        }).catch(() => {});
      }
    }
  }
);

// ============================================================
// 🚀 READY
// ============================================================

client.once(
  "ready",
  async () => {

    console.log(
      "════════════════════════════════════"
    );

    console.log(
      "🌌 MATI NEXUS BOT"
    );

    console.log(
      `🤖 Conectado como ${client.user.tag}`
    );

    console.log(
      `🌐 Servidores: ${client.guilds.cache.size}`
    );

    console.log(
      "════════════════════════════════════"
    );

    client.user.setPresence({
      activities: [
        {
          name: "🌌 Mati Nexus",
          type: 3
        }
      ],
      status: "online"
    });

    // Cargar invitaciones de todos los servidores
    // cuando el bot inicia.
    for (
      const guild of client.guilds.cache.values()
    ) {
      await loadInvites(guild);
    }

    console.log(
      "📨 Caché de invitaciones cargada."
    );
  }
);

// ============================================================
// 🌐 RENDER
// ============================================================

const PORT =
  process.env.PORT || 3000;

http
  .createServer(
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
  )
  .listen(
    PORT,
    () => {
      console.log(
        `🌐 Servidor HTTP activo en puerto ${PORT}`
      );
    }
  );

// ============================================================
// 🔑 LOGIN
// ============================================================

client.login(TOKEN);
