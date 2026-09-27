const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
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

// ╔════════════════════════════════════════════════════════════╗
// ║                    🌌 MATI NEXUS BOT 🌌                   ║
// ║                 Bot oficial de Mati Nexus                 ║
// ╚════════════════════════════════════════════════════════════╝

const TOKEN = process.env.DISCORD_TOKEN;
const PREFIXES = ["mati ", "m."];

if (!TOKEN) {
  console.error("❌ Falta la variable DISCORD_TOKEN en Render.");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────
// CLIENTE
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// DATOS
// ─────────────────────────────────────────────────────────────

const DATA_FILE = path.join(__dirname, "data.json");

const defaultData = {
  users: {},
  guilds: {}
};

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
}

let data;

try {
  data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
} catch {
  data = defaultData;
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("❌ Error guardando datos:", error);
  }
}

function getGuildData(guildId) {
  if (!data.guilds[guildId]) {
    data.guilds[guildId] = {
      welcomeChannel: null,
      goodbyeChannel: null,
      inviteChannel: null,
      logChannel: null,
      prefix: "m.",
      welcomeEnabled: true,
      goodbyeEnabled: true
    };
    saveData();
  }

  return data.guilds[guildId];
}

function getUserData(userId) {
  if (!data.users[userId]) {
    data.users[userId] = {
      wallet: 0,
      bank: 0,
      level: 1,
      xp: 0,
      lastDaily: 0,
      lastWork: 0,
      lastCrime: 0,
      lastRob: 0,
      lastBeg: 0,
      warns: 0
    };

    saveData();
  }

  return data.users[userId];
}

// ─────────────────────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────────────────────

const cooldowns = new Collection();

function money(amount) {
  return `${Number(amount).toLocaleString("es-ES")} 💰`;
}

function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatTime(ms) {
  const seconds = Math.ceil(ms / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;

  if (minutes < 60) {
    return `${minutes}m ${remaining}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${hours}h ${remainingMinutes}m`;
}

function embed(title, description) {
  return new EmbedBuilder()
    .setColor("#ff7ac8")
    .setTitle(title)
    .setDescription(description)
    .setFooter({
      text: "🌌 Mati Nexus BOT • Sistema Nexus"
    })
    .setTimestamp();
}

function errorEmbed(description) {
  return embed(
    "╔══ ❌ ERROR NEXUS ══╗",
    `> ${description}`
  );
}

function successEmbed(description) {
  return embed(
    "╔══ ✨ NEXUS COMPLETADO ══╗",
    `> ${description}`
  );
}

function adminOnly(message) {
  return message.member?.permissions.has(
    PermissionsBitField.Flags.Administrator
  );
}

function slashAdmin(interaction) {
  return interaction.memberPermissions?.has(
    PermissionsBitField.Flags.Administrator
  );
}

function parseAmount(value, max) {
  if (!value) return null;

  if (
    value.toLowerCase() === "all" ||
    value.toLowerCase() === "todo"
  ) {
    return max;
  }

  const amount = Number(value);

  if (!Number.isFinite(amount)) return null;

  return Math.floor(amount);
}

function addXP(userId, amount) {
  const user = getUserData(userId);

  user.xp += amount;

  const needed = user.level * 100;

  if (user.xp >= needed) {
    user.xp -= needed;
    user.level++;

    saveData();

    return true;
  }

  saveData();
  return false;
}

async function sendLog(guild, message) {
  const guildData = getGuildData(guild.id);

  if (!guildData.logChannel) return;

  const channel = guild.channels.cache.get(guildData.logChannel);

  if (!channel) return;

  try {
    await channel.send({
      embeds: [
        embed(
          "╔══ 📜 REGISTRO NEXUS ══╗",
          message
        )
      ]
    });
  } catch {}
}

// ─────────────────────────────────────────────────────────────
// CATEGORÍAS PÚBLICAS
// ─────────────────────────────────────────────────────────────

const categories = {
  general: {
    name: "🌌 General",
    emoji: "🌌",
    description: "Comandos generales de Mati Nexus.",
    commands: [
      "help",
      "ping",
      "botinfo",
      "serverinfo",
      "userinfo",
      "avatar",
      "banner",
      "uptime",
      "invite",
      "profile"
    ]
  },

  economy: {
    name: "💰 Economía",
    emoji: "💰",
    description: "Gana y administra tu moneda virtual.",
    commands: [
      "balance",
      "work",
      "daily",
      "crime",
      "rob",
      "beg",
      "deposit",
      "withdraw",
      "pay",
      "leaderboard"
    ]
  },

  fun: {
    name: "🎮 Diversión",
    emoji: "🎮",
    description: "Juegos y comandos para divertirte.",
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
      "ship"
    ]
  },

  social: {
    name: "💗 Social",
    emoji: "💗",
    description: "Comandos sociales.",
    commands: [
      "hug",
      "kiss",
      "pat",
      "poke",
      "highfive",
      "wave",
      "slap",
      "compliment",
      "ship",
      "friend"
    ]
  },

  levels: {
    name: "⭐ Niveles",
    emoji: "⭐",
    description: "Consulta tu progreso y experiencia.",
    commands: [
      "level",
      "rank",
      "xp",
      "top",
      "levels",
      "nextlevel",
      "progress",
      "setlevel",
      "addxp",
      "leaderboardxp"
    ]
  },

  utilities: {
    name: "🛠️ Utilidades",
    emoji: "🛠️",
    description: "Herramientas útiles.",
    commands: [
      "servericon",
      "channelinfo",
      "roleinfo",
      "membercount",
      "firstmessage",
      "timestamp",
      "calculator",
      "remind",
      "poll",
      "say"
    ]
  }
};

// ─────────────────────────────────────────────────────────────
// AYUDA
// ─────────────────────────────────────────────────────────────

function publicHelpEmbed() {
  return embed(
    "╔════════════════════════════╗\n║ 🌌 MATI NEXUS • HELP 🌌 ║\n╚════════════════════════════╝",
    [
      "### ✨ Centro de comandos",
      "",
      "Selecciona una categoría en el menú de abajo.",
      "",
      "🌌 **General** — Información y comandos básicos.",
      "💰 **Economía** — Dinero y economía virtual.",
      "🎮 **Diversión** — Juegos y entretenimiento.",
      "💗 **Social** — Interacciones sociales.",
      "⭐ **Niveles** — XP y niveles.",
      "🛠️ **Utilidades** — Herramientas útiles.",
      "",
      "╭───────────────╮",
      "│ 🌌 **Mati Nexus BOT** │",
      "╰───────────────╯"
    ].join("\n")
  );
}

function createHelpMenu() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("mati_help_menu")
    .setPlaceholder("🌌 Selecciona una categoría...")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("General")
        .setDescription("Comandos generales")
        .setValue("general")
        .setEmoji("🌌"),

      new StringSelectMenuOptionBuilder()
        .setLabel("Economía")
        .setDescription("Dinero y economía")
        .setValue("economy")
        .setEmoji("💰"),

      new StringSelectMenuOptionBuilder()
        .setLabel("Diversión")
        .setDescription("Juegos y diversión")
        .setValue("fun")
        .setEmoji("🎮"),

      new StringSelectMenuOptionBuilder()
        .setLabel("Social")
        .setDescription("Comandos sociales")
        .setValue("social")
        .setEmoji("💗"),

      new StringSelectMenuOptionBuilder()
        .setLabel("Niveles")
        .setDescription("XP y niveles")
        .setValue("levels")
        .setEmoji("⭐"),

      new StringSelectMenuOptionBuilder()
        .setLabel("Utilidades")
        .setDescription("Herramientas")
        .setValue("utilities")
        .setEmoji("🛠️")
    );

  return new ActionRowBuilder().addComponents(menu);
}

function categoryEmbed(categoryKey) {
  const category = categories[categoryKey];

  return embed(
    `╔══ ${category.emoji} ${category.name.replace(category.emoji, "").trim()} ══╗`,
    [
      `> ${category.description}`,
      "",
      ...category.commands.map(
        (command, index) =>
          `**${String(index + 1).padStart(2, "0")}.** \`m.${command}\``
      ),
      "",
      "🌌 Usa el menú para cambiar de categoría."
    ].join("\n")
  );
}

// ─────────────────────────────────────────────────────────────
// HELP ADMIN
// ─────────────────────────────────────────────────────────────

const adminCategories = {
  moderation: {
    name: "🛡️ Moderación",
    commands: [
      "ban",
      "unban",
      "kick",
      "timeout",
      "untimeout",
      "warn",
      "unwarn",
      "clear",
      "lock",
      "unlock"
    ]
  },

  configuration: {
    name: "⚙️ Configuración",
    commands: [
      "welcome",
      "goodbye",
      "invites",
      "logs",
      "prefix",
      "autorole",
      "setup",
      "server",
      "welcomechannel",
      "goodbyechannel"
    ]
  },

  administration: {
    name: "👑 Administración",
    commands: [
      "role",
      "createrole",
      "deleterole",
      "createchannel",
      "deletechannel",
      "slowmode",
      "nick",
      "announce",
      "say",
      "helpad"
    ]
  }
};

function adminHelpEmbed() {
  return embed(
    "╔════════════════════════════╗\n║ 👑 MATI NEXUS • ADMIN ║\n╚════════════════════════════╝",
    [
      "### 🛡️ Panel administrativo",
      "",
      "Estos comandos están reservados para administradores.",
      "",
      "🛡️ **Moderación**",
      "`ban` `unban` `kick` `timeout` `untimeout`",
      "`warn` `unwarn` `clear` `lock` `unlock`",
      "",
      "⚙️ **Configuración**",
      "`welcome` `goodbye` `invites` `logs` `prefix`",
      "`autorole` `setup` `server` `welcomechannel` `goodbyechannel`",
      "",
      "👑 **Administración**",
      "`role` `createrole` `deleterole`",
      "`createchannel` `deletechannel` `slowmode`",
      "`nick` `announce` `say`",
      "",
      "🔒 **Panel exclusivo para Administradores**"
    ].join("\n")
  );
}

function createAdminMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("mati_admin_menu")
      .setPlaceholder("👑 Selecciona una categoría...")
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("Moderación")
          .setDescription("Comandos de moderación")
          .setValue("moderation")
          .setEmoji("🛡️"),

        new StringSelectMenuOptionBuilder()
          .setLabel("Configuración")
          .setDescription("Configura Mati Nexus")
          .setValue("configuration")
          .setEmoji("⚙️"),

        new StringSelectMenuOptionBuilder()
          .setLabel("Administración")
          .setDescription("Administración del servidor")
          .setValue("administration")
          .setEmoji("👑")
      )
  );
}

// ─────────────────────────────────────────────────────────────
// INVITES
// ─────────────────────────────────────────────────────────────

const inviteCache = new Map();

async function cacheInvites(guild) {
  try {
    const invites = await guild.invites.fetch();

    const uses = new Map();

    invites.forEach(invite => {
      uses.set(invite.code, invite.uses || 0);
    });

    inviteCache.set(guild.id, uses);
  } catch {}
}

// ─────────────────────────────────────────────────────────────
// COMANDOS PREFIX
// ─────────────────────────────────────────────────────────────

async function executeCommand(message, command, args) {
  const user = getUserData(message.author.id);
  const guildData = getGuildData(message.guild.id);

  // HELP
  if (command === "help") {
    return message.reply({
      embeds: [publicHelpEmbed()],
      components: [createHelpMenu()]
    });
  }

  if (command === "helpad") {
    if (!adminOnly(message)) {
      return message.reply({
        embeds: [errorEmbed("Solo los Administradores pueden usar este panel.")]
      });
    }

    return message.reply({
      embeds: [adminHelpEmbed()],
      components: [createAdminMenu()]
    });
  }

  // GENERAL
  if (command === "ping") {
    return message.reply({
      embeds: [
        successEmbed(
          `🏓 Pong!\n\nLatencia: **${client.ws.ping}ms**`
        )
      ]
    });
  }

  if (command === "botinfo") {
    return message.reply({
      embeds: [
        embed(
          "╔══ 🤖 MATI NEXUS BOT ══╗",
          [
            "🌌 **Bot oficial de Mati Nexus**",
            "",
            `👑 Servidores: **${client.guilds.cache.size}**`,
            `👥 Usuarios: **${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)}**`,
            `📡 Ping: **${client.ws.ping}ms**`,
            `⚙️ Discord.js: **v14**`,
            "",
            "✨ Sistema Nexus activo."
          ].join("\n")
        )
      ]
    });
  }

  if (command === "serverinfo") {
    const guild = message.guild;

    return message.reply({
      embeds: [
        embed(
          "╔══ 🌌 INFORMACIÓN DEL SERVIDOR ══╗",
          [
            `🏠 Nombre: **${guild.name}**`,
            `👥 Miembros: **${guild.memberCount}**`,
            `📁 Canales: **${guild.channels.cache.size}**`,
            `🎭 Roles: **${guild.roles.cache.size}**`,
            `🆔 ID: \`${guild.id}\``
          ].join("\n")
        )
      ]
    });
  }

  if (command === "userinfo") {
    const target =
      message.mentions.members.first() ||
      message.member;

    return message.reply({
      embeds: [
        embed(
          "╔══ 👤 USUARIO ══╗",
          [
            `👤 Usuario: ${target}`,
            `🆔 ID: \`${target.id}\``,
            `📅 Cuenta: <t:${Math.floor(target.user.createdTimestamp / 1000)}:D>`,
            `📥 Entró: ${
              target.joinedTimestamp
                ? `<t:${Math.floor(target.joinedTimestamp / 1000)}:D>`
                : "Desconocido"
            }`
          ].join("\n")
        ).setThumbnail(target.user.displayAvatarURL({ size: 512 }))
      ]
    });
  }

  if (command === "avatar") {
    const target =
      message.mentions.users.first() ||
      message.author;

    return message.reply({
      embeds: [
        embed(
          "╔══ 🖼️ AVATAR ══╗",
          `[Abrir avatar](${target.displayAvatarURL({
            size: 1024,
            extension: "png"
          })})`
        ).setImage(
          target.displayAvatarURL({
            size: 1024,
            extension: "png"
          })
        )
      ]
    });
  }

  if (command === "banner") {
    const target =
      message.mentions.users.first() ||
      message.author;

    const fetched = await client.users.fetch(target.id, {
      force: true
    });

    if (!fetched.banner) {
      return message.reply({
        embeds: [errorEmbed("Ese usuario no tiene banner.")]
      });
    }

    return message.reply({
      embeds: [
        embed(
          "╔══ 🌌 BANNER ══╗",
          `[Abrir banner](${fetched.bannerURL({
            size: 1024,
            extension: "png"
          })})`
        ).setImage(
          fetched.bannerURL({
            size: 1024,
            extension: "png"
          })
        )
      ]
    });
  }

  if (command === "uptime") {
    return message.reply({
      embeds: [
        successEmbed(
          `⏱️ Llevo conectado:\n**${formatTime(client.uptime)}**`
        )
      ]
    });
  }

  if (command === "invite") {
    return message.reply({
      embeds: [
        embed(
          "╔══ 🔗 INVITACIÓN ══╗",
          "Usa el enlace de invitación configurado para añadir a Mati Nexus a tu servidor."
        )
      ]
    });
  }

  if (command === "profile") {
    return message.reply({
      embeds: [
        embed(
          "╔══ 🌌 TU PERFIL NEXUS ══╗",
          [
            `👤 Usuario: ${message.author}`,
            `💰 Billetera: ${money(user.wallet)}`,
            `🏦 Banco: ${money(user.bank)}`,
            `⭐ Nivel: **${user.level}**`,
            `✨ XP: **${user.xp}/${user.level * 100}**`,
            `⚠️ Warns: **${user.warns}**`
          ].join("\n")
        )
      ]
    });
  }

  // ECONOMÍA
  if (command === "balance") {
    return message.reply({
      embeds: [
        embed(
          "╔══ 💰 BALANCE NEXUS ══╗",
          [
            `👤 ${message.author}`,
            "",
            `💵 Billetera: **${money(user.wallet)}**`,
            `🏦 Banco: **${money(user.bank)}**`,
            "",
            `💎 Total: **${money(user.wallet + user.bank)}**`
          ].join("\n")
        )
      ]
    });
  }

  if (command === "work") {
    const now = Date.now();
    const cooldown = 30 * 1000;

    if (now - user.lastWork < cooldown) {
      return message.reply({
        embeds: [
          errorEmbed(
            `Debes esperar **${formatTime(cooldown - (now - user.lastWork))}** para volver a trabajar.`
          )
        ]
      });
    }

    const amount = random(100, 300);

    user.wallet += amount;
    user.lastWork = now;

    const leveled = addXP(message.author.id, random(10, 25));

    saveData();

    return message.reply({
      embeds: [
        successEmbed(
          `💼 Trabajaste y recibiste **${money(amount)}**.\n\n💰 Billetera: **${money(user.wallet)}**${leveled ? "\n\n⭐ ¡Subiste de nivel!" : ""}`
        )
      ]
    });
  }

  if (command === "daily") {
    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000;

    if (now - user.lastDaily < cooldown) {
      return message.reply({
        embeds: [
          errorEmbed(
            `Ya reclamaste tu recompensa diaria.\n\n⏳ Disponible en **${formatTime(cooldown - (now - user.lastDaily))}**.`
          )
        ]
      });
    }

    const amount = random(500, 1000);

    user.wallet += amount;
    user.lastDaily = now;

    saveData();

    return message.reply({
      embeds: [
        successEmbed(
          `🎁 Recompensa diaria recibida.\n\n💰 Ganaste **${money(amount)}**.`
        )
      ]
    });
  }

  if (command === "crime") {
    const now = Date.now();
    const cooldown = 2 * 60 * 1000;

    if (now - user.lastCrime < cooldown) {
      return message.reply({
        embeds: [
          errorEmbed(
            `Debes esperar **${formatTime(cooldown - (now - user.lastCrime))}**.`
          )
        ]
      });
    }

    user.lastCrime = now;

    if (Math.random() < 0.5) {
      const amount = random(500, 700);
      user.wallet += amount;

      saveData();

      return message.reply({
        embeds: [
          successEmbed(
            `🕶️ La misión salió bien.\n\n💰 Ganaste **${money(amount)}**.`
          )
        ]
      });
    }

    const amount = random(100, 300);
    user.wallet = Math.max(0, user.wallet - amount);

    saveData();

    return message.reply({
      embeds: [
        errorEmbed(
          `🚨 La misión salió mal.\n\nPerdiste **${money(amount)}**.`
        )
      ]
    });
  }

  if (command === "beg") {
    const now = Date.now();
    const cooldown = 30 * 1000;

    if (now - user.lastBeg < cooldown) {
      return message.reply({
        embeds: [
          errorEmbed(
            `Espera **${formatTime(cooldown - (now - user.lastBeg))}**.`
          )
        ]
      });
    }

    user.lastBeg = now;

    const amount = random(25, 150);
    user.wallet += amount;

    saveData();

    return message.reply({
      embeds: [
        successEmbed(
          `🥺 Alguien decidió ayudarte.\n\n💰 Recibiste **${money(amount)}**.`
        )
      ]
    });
  }

  if (command === "rob") {
    const target = message.mentions.users.first();

    if (!target || target.id === message.author.id) {
      return message.reply({
        embeds: [errorEmbed("Menciona a alguien para intentar robarle.")]
      });
    }

    const victim = getUserData(target.id);

    if (victim.wallet < 50) {
      return message.reply({
        embeds: [errorEmbed("Esa persona no tiene suficiente dinero en su billetera.")]
      });
    }

    const now = Date.now();
    const cooldown = 2 * 60 * 1000;

    if (now - user.lastRob < cooldown) {
      return message.reply({
        embeds: [
          errorEmbed(
            `Espera **${formatTime(cooldown - (now - user.lastRob))}**.`
          )
        ]
      });
    }

    user.lastRob = now;

    if (Math.random() < 0.4) {
      const amount = random(25, Math.min(300, victim.wallet));

      victim.wallet -= amount;
      user.wallet += amount;

      saveData();

      return message.reply({
        embeds: [
          successEmbed(
            `🕵️ Conseguido.\n\nRobaste **${money(amount)}** a ${target}.`
          )
        ]
      });
    }

    saveData();

    return message.reply({
      embeds: [
        errorEmbed(
          `🚨 Te descubrieron intentando robar a ${target}.`
        )
      ]
    });
  }

  if (command === "deposit" || command === "dep") {
    const amount = parseAmount(args[0], user.wallet);

    if (amount === null || amount < 1) {
      return message.reply({
        embeds: [
          errorEmbed(
            "Usa `Mati deposit cantidad`, `Mati deposit all` o `Mati dep all`."
          )
        ]
      });
    }

    if (amount > user.wallet) {
      return message.reply({
        embeds: [errorEmbed("No tienes esa cantidad en tu billetera.")]
      });
    }

    user.wallet -= amount;
    user.bank += amount;

    saveData();

    return message.reply({
      embeds: [
        successEmbed(
          `🏦 Depositaste **${money(amount)}**.\n\n🏦 Banco: **${money(user.bank)}**`
        )
      ]
    });
  }

  if (command === "withdraw" || command === "with") {
    const amount = parseAmount(args[0], user.bank);

    if (amount === null || amount < 1) {
      return message.reply({
        embeds: [
          errorEmbed(
            "Usa `Mati withdraw cantidad`, `Mati withdraw all` o `Mati with all`."
          )
        ]
      });
    }

    if (amount > user.bank) {
      return message.reply({
        embeds: [errorEmbed("No tienes esa cantidad en el banco.")]
      });
    }

    user.bank -= amount;
    user.wallet += amount;

    saveData();

    return message.reply({
      embeds: [
        successEmbed(
          `💵 Retiraste **${money(amount)}**.\n\n💵 Billetera: **${money(user.wallet)}**`
        )
      ]
    });
  }

  if (command === "pay") {
    const target = message.mentions.users.first();
    const amount = Number(args[1]);

    if (!target || !Number.isInteger(amount) || amount < 1) {
      return message.reply({
        embeds: [
          errorEmbed(
            "Usa `Mati pay @usuario cantidad`."
          )
        ]
      });
    }

    if (amount > user.wallet) {
      return message.reply({
        embeds: [errorEmbed("No tienes suficiente dinero.")]
      });
    }

    const targetData = getUserData(target.id);

    user.wallet -= amount;
    targetData.wallet += amount;

    saveData();

    return message.reply({
      embeds: [
        successEmbed(
          `💸 Enviaste **${money(amount)}** a ${target}.`
        )
      ]
    });
  }

  if (command === "leaderboard") {
    const sorted = Object.entries(data.users)
      .sort((a, b) =>
        (b[1].wallet + b[1].bank) -
        (a[1].wallet + a[1].bank)
      )
      .slice(0, 10);

    const lines = [];

    for (let i = 0; i < sorted.length; i++) {
      const [id, info] = sorted[i];

      const member = await message.guild.members
        .fetch(id)
        .catch(() => null);

      lines.push(
        `**${i + 1}.** ${member ? member.user.username : "Usuario"} — ${money(info.wallet + info.bank)}`
      );
    }

    return message.reply({
      embeds: [
        embed(
          "╔══ 🏆 TOP ECONOMÍA ══╗",
          lines.length
            ? lines.join("\n")
            : "Todavía no hay datos."
        )
      ]
    });
  }

  // FUN
  if (command === "slots") {
    const symbols = ["🍒", "🍋", "⭐", "💎", "7️⃣"];

    const result = [
      symbols[random(0, symbols.length - 1)],
      symbols[random(0, symbols.length - 1)],
      symbols[random(0, symbols.length - 1)]
    ];

    return message.reply({
      embeds: [
        embed(
          "╔══ 🎰 NEXUS SLOTS ══╗",
          [
            "```",
            `${result.join(" │ ")}`,
            "```",
            "",
            "🎮 Juego visual con moneda ficticia del servidor.",
            "",
            result[0] === result[1] && result[1] === result[2]
              ? "✨ ¡Tres iguales!"
              : "🌌 Inténtalo otra vez."
          ].join("\n")
        )
      ]
    });
  }

  if (command === "coinflip") {
    const result = Math.random() < 0.5 ? "🪙 Cara" : "🪙 Cruz";

    return message.reply({
      embeds: [
        successEmbed(`La moneda cayó en:\n\n# ${result}`)
      ]
    });
  }

  if (command === "dice") {
    const result = random(1, 6);

    return message.reply({
      embeds: [
        successEmbed(
          `🎲 Lanzaste el dado.\n\n# ${result}`
        )
      ]
    });
  }

  if (command === "blackjack") {
    const player = random(15, 21);
    const dealer = random(14, 21);

    return message.reply({
      embeds: [
        embed(
          "╔══ 🃏 NEXUS BLACKJACK ══╗",
          [
            `👤 Tu puntuación: **${player}**`,
            `🤖 Dealer: **${dealer}**`,
            "",
            player > dealer
              ? "✨ Resultado: ganaste la ronda."
              : player === dealer
                ? "🤝 Resultado: empate."
                : "🌌 Resultado: ganó el dealer.",
            "",
            "🎮 Juego con moneda ficticia del servidor."
          ].join("\n")
        )
      ]
    });
  }

  if (command === "guess") {
    const number = random(1, 5);
    const guess = Number(args[0]);

    if (!Number.isInteger(guess) || guess < 1 || guess > 5) {
      return message.reply({
        embeds: [errorEmbed("Elige un número del **1 al 5**.")]
      });
    }

    return message.reply({
      embeds: [
        embed(
          "╔══ 🔮 ADIVINA ══╗",
          `Tu número: **${guess}**\nNúmero Nexus: **${number}**\n\n${
            guess === number
              ? "✨ ¡Acertaste!"
              : "🌌 No acertaste esta vez."
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
        embed(
          "╔══ 🔮 NEXUS 8BALL ══╗",
          answers[random(0, answers.length - 1)]
        )
      ]
    });
  }

  if (command === "roll") {
    const max = Number(args[0]) || 100;

    if (max < 2 || max > 100000) {
      return message.reply({
        embeds: [errorEmbed("El máximo permitido es 100.000.")]
      });
    }

    return message.reply({
      embeds: [
        successEmbed(
          `🎲 Resultado: **${random(1, max)}**`
        )
      ]
    });
  }

  if (command === "choose") {
    if (args.length < 2) {
      return message.reply({
        embeds: [errorEmbed("Escribe al menos dos opciones separadas por `|`.")]
      });
    }

    const options = message.content
      .split(/\s+/)
      .slice(2)
      .join(" ")
      .split("|")
      .map(x => x.trim())
      .filter(Boolean);

    if (options.length < 2) {
      return message.reply({
        embeds: [errorEmbed("Necesito al menos dos opciones separadas por `|`.")]
      });
    }

    return message.reply({
      embeds: [
        successEmbed(
          `🎯 He elegido:\n\n# ${options[random(0, options.length - 1)]}`
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
        embed(
          "╔══ ⭐ NEXUS RATE ══╗",
          `${target} recibe una puntuación completamente aleatoria de **${random(1, 100)}/100**.`
        )
      ]
    });
  }

  if (command === "ship") {
    const users = message.mentions.users;

    if (users.size < 2) {
      return message.reply({
        embeds: [
          errorEmbed("Menciona a dos usuarios.")
        ]
      });
    }

    const [a, b] = [...users.values()].slice(0, 2);

    return message.reply({
      embeds: [
        embed(
          "╔══ 💗 NEXUS SHIP ══╗",
          `${a} × ${b}\n\n💗 Compatibilidad de amistad: **${random(1, 100)}%**`
        )
      ]
    });
  }

  // SOCIAL
  const socialMessages = {
    hug: "🤗 le manda un abrazo amistoso a",
    kiss: "😊 le manda un saludo cariñoso a",
    pat: "🐾 le da unas palmaditas amistosas a",
    poke: "👉 le da un toque amistoso a",
    highfive: "🙌 choca la mano con",
    wave: "👋 saluda a",
    slap: "😤 le da un golpecito de broma a",
    compliment: "✨ le deja un cumplido a",
    friend: "🤝 quiere ser amigo de"
  };

  if (socialMessages[command]) {
    const target = message.mentions.users.first();

    if (!target) {
      return message.reply({
        embeds: [
          errorEmbed("Menciona a alguien.")
        ]
      });
    }

    return message.reply({
      embeds: [
        embed(
          `╔══ 💗 ${command.toUpperCase()} ══╗`,
          `${message.author} ${socialMessages[command]} ${target} 💫`
        )
      ]
    });
  }

  // LEVELS
  if (
    command === "level" ||
    command === "rank" ||
    command === "xp" ||
    command === "progress"
  ) {
    const needed = user.level * 100;

    return message.reply({
      embeds: [
        embed(
          "╔══ ⭐ PROGRESO NEXUS ══╗",
          [
            `👤 ${message.author}`,
            "",
            `⭐ Nivel: **${user.level}**`,
            `✨ XP: **${user.xp}/${needed}**`,
            `📊 Progreso: **${Math.floor((user.xp / needed) * 100)}%**`,
            "",
            "💫 Sigue usando el bot para ganar experiencia."
          ].join("\n")
        )
      ]
    });
  }

  if (command === "nextlevel") {
    return message.reply({
      embeds: [
        successEmbed(
          `⭐ Te faltan **${user.level * 100 - user.xp} XP** para llegar al nivel ${user.level + 1}.`
        )
      ]
    });
  }

  if (command === "levels") {
    return message.reply({
      embeds: [
        embed(
          "╔══ ⭐ SISTEMA DE NIVELES ══╗",
          "Gana XP usando diferentes comandos de Mati Nexus y sube de nivel."
        )
      ]
    });
  }

  if (command === "top" || command === "leaderboardxp") {
    const sorted = Object.entries(data.users)
      .sort((a, b) => {
        const levelA = a[1].level * 100000 + a[1].xp;
        const levelB = b[1].level * 100000 + b[1].xp;

        return levelB - levelA;
      })
      .slice(0, 10);

    const lines = [];

    for (let i = 0; i < sorted.length; i++) {
      const [id, info] = sorted[i];

      const member = await message.guild.members
        .fetch(id)
        .catch(() => null);

      lines.push(
        `**${i + 1}.** ${member ? member.user.username : "Usuario"} — Nivel ${info.level} (${info.xp} XP)`
      );
    }

    return message.reply({
      embeds: [
        embed(
          "╔══ 🏆 TOP NIVELES ══╗",
          lines.length ? lines.join("\n") : "No hay datos todavía."
        )
      ]
    });
  }

  if (command === "setlevel" || command === "addxp") {
    if (!adminOnly(message)) {
      return message.reply({
        embeds: [errorEmbed("Solo Administradores.")]
      });
    }

    const target = message.mentions.users.first();

    if (!target) {
      return message.reply({
        embeds: [errorEmbed("Menciona a un usuario.")]
      });
    }

    const amount = Number(args[1]);

    if (!Number.isInteger(amount) || amount < 1) {
      return message.reply({
        embeds: [errorEmbed("Indica una cantidad válida.")]
      });
    }

    const targetData = getUserData(target.id);

    if (command === "setlevel") {
      targetData.level = amount;
      targetData.xp = 0;
    } else {
      targetData.xp += amount;
    }

    saveData();

    return message.reply({
      embeds: [
        successEmbed(
          `⭐ Datos actualizados para ${target}.`
        )
      ]
    });
  }

  // UTILIDADES
  if (command === "servericon") {
    return message.reply({
      embeds: [
        embed(
          "╔══ 🖼️ ICONO ══╗",
          `[Abrir icono](${message.guild.iconURL({
            size: 1024
          }) || "https://discord.com"})`
        ).setImage(
          message.guild.iconURL({
            size: 1024
          })
        )
      ]
    });
  }

  if (command === "channelinfo") {
    const channel =
      message.mentions.channels.first() ||
      message.channel;

    return message.reply({
      embeds: [
        embed(
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
    const role = message.mentions.roles.first();

    if (!role) {
      return message.reply({
        embeds: [errorEmbed("Menciona un rol.")]
      });
    }

    return message.reply({
      embeds: [
        embed(
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

  if (command === "membercount") {
    return message.reply({
      embeds: [
        successEmbed(
          `👥 Este servidor tiene **${message.guild.memberCount} miembros**.`
        )
      ]
    });
  }

  if (command === "timestamp") {
    return message.reply({
      embeds: [
        successEmbed(
          `🕐 Timestamp actual:\n<t:${Math.floor(Date.now() / 1000)}:F>`
        )
      ]
    });
  }

  if (command === "calculator") {
    const expression = args.join(" ");

    if (!expression) {
      return message.reply({
        embeds: [errorEmbed("Escribe una operación.")]
      });
    }

    if (!/^[0-9+\-*/().%\s]+$/.test(expression)) {
      return message.reply({
        embeds: [errorEmbed("La calculadora solo acepta operaciones matemáticas básicas.")]
      });
    }

    try {
      const result = Function(`"use strict"; return (${expression})`)();

      if (!Number.isFinite(result)) {
        throw new Error();
      }

      return message.reply({
        embeds: [
          successEmbed(
            `🧮 Operación:\n\`${expression}\`\n\nResultado:\n# ${result}`
          )
        ]
      });
    } catch {
      return message.reply({
        embeds: [errorEmbed("No pude calcular esa operación.")]
      });
    }
  }

  if (command === "poll") {
    if (!args.length) {
      return message.reply({
        embeds: [errorEmbed("Escribe la pregunta de la encuesta.")]
      });
    }

    const question = args.join(" ");

    const poll = await message.channel.send({
      embeds: [
        embed(
          "╔══ 📊 ENCUESTA NEXUS ══╗",
          `**${question}**\n\n👍 Sí\n👎 No`
        )
      ]
    });

    await poll.react("👍");
    await poll.react("👎");

    return;
  }

  if (command === "say") {
    if (!adminOnly(message)) {
      return message.reply({
        embeds: [errorEmbed("Solo Administradores.")]
      });
    }

    const text = args.join(" ");

    if (!text) {
      return message.reply({
        embeds: [errorEmbed("Escribe el mensaje.")]
      });
    }

    await message.delete().catch(() => {});

    return message.channel.send(text);
  }

  // ADMIN
  if (
    [
      "ban",
      "unban",
      "kick",
      "timeout",
      "untimeout",
      "warn",
      "unwarn",
      "clear",
      "lock",
      "unlock",
      "welcome",
      "goodbye",
      "invites",
      "logs",
      "prefix",
      "autorole",
      "setup",
      "server",
      "welcomechannel",
      "goodbyechannel",
      "role",
      "createrole",
      "deleterole",
      "createchannel",
      "deletechannel",
      "slowmode",
      "nick",
      "announce"
    ].includes(command)
  ) {
    if (!adminOnly(message)) {
      return message.reply({
        embeds: [
          errorEmbed(
            "🔒 Este comando está disponible únicamente para Administradores."
          )
        ]
      });
    }
  }

  if (command === "welcome" || command === "welcomechannel") {
    const channel =
      message.mentions.channels.first() ||
      message.guild.channels.cache.get(args[0]);

    if (!channel || channel.type !== ChannelType.GuildText) {
      return message.reply({
        embeds: [errorEmbed("Menciona un canal de texto válido.")]
      });
    }

    guildData.welcomeChannel = channel.id;
    guildData.welcomeEnabled = true;

    saveData();

    return message.reply({
      embeds: [
        successEmbed(
          `👋 Las bienvenidas se enviarán en ${channel}.`
        )
      ]
    });
  }

  if (command === "goodbye" || command === "goodbyechannel") {
    const channel =
      message.mentions.channels.first() ||
      message.guild.channels.cache.get(args[0]);

    if (!channel || channel.type !== ChannelType.GuildText) {
      return message.reply({
        embeds: [errorEmbed("Menciona un canal de texto válido.")]
      });
    }

    guildData.goodbyeChannel = channel.id;
    guildData.goodbyeEnabled = true;

    saveData();

    return message.reply({
      embeds: [
        successEmbed(
          `😭 Las despedidas se enviarán en ${channel}.`
        )
      ]
    });
  }

  if (command === "invites") {
    const channel =
      message.mentions.channels.first() ||
      message.guild.channels.cache.get(args[0]);

    if (!channel || channel.type !== ChannelType.GuildText) {
      return message.reply({
        embeds: [errorEmbed("Menciona un canal de texto válido.")]
      });
    }

    guildData.inviteChannel = channel.id;

    saveData();

    return message.reply({
      embeds: [
        successEmbed(
          `📨 El registro de invitaciones se enviará en ${channel}.`
        )
      ]
    });
  }

  if (command === "logs") {
    const channel =
      message.mentions.channels.first() ||
      message.guild.channels.cache.get(args[0]);

    if (!channel || channel.type !== ChannelType.GuildText) {
      return message.reply({
        embeds: [errorEmbed("Menciona un canal de texto válido.")]
      });
    }

    guildData.logChannel = channel.id;

    saveData();

    return message.reply({
      embeds: [
        successEmbed(
          `📜 Los registros se enviarán en ${channel}.`
        )
      ]
    });
  }

  if (command === "prefix") {
    return message.reply({
      embeds: [
        embed(
          "╔══ ⚙️ PREFIJOS ══╗",
          [
            "🌌 Prefijo principal: `m.`",
            "✨ Prefijo alternativo: `Mati`",
            "",
            "Ejemplos:",
            "`m.help`",
            "`Mati help`"
          ].join("\n")
        )
      ]
    });
  }

  if (command === "setup") {
    return message.reply({
      embeds: [
        embed(
          "╔══ ⚙️ SETUP NEXUS ══╗",
          [
            "Configura rápidamente:",
            "",
            "👋 `Mati welcome #canal`",
            "😭 `Mati goodbye #canal`",
            "📨 `Mati invites #canal`",
            "📜 `Mati logs #canal`",
            "",
            "✨ ¡Mati Nexus quedará listo!"
          ].join("\n")
        )
      ]
    });
  }

  if (command === "server") {
    return message.reply({
      embeds: [
        embed(
          "╔══ ⚙️ CONFIGURACIÓN ══╗",
          [
            `👋 Bienvenidas: ${guildData.welcomeChannel ? `<#${guildData.welcomeChannel}>` : "❌ No configurado"}`,
            `😭 Despedidas: ${guildData.goodbyeChannel ? `<#${guildData.goodbyeChannel}>` : "❌ No configurado"}`,
            `📨 Invitaciones: ${guildData.inviteChannel ? `<#${guildData.inviteChannel}>` : "❌ No configurado"}`,
            `📜 Logs: ${guildData.logChannel ? `<#${guildData.logChannel}>` : "❌ No configurado"}`
          ].join("\n")
        )
      ]
    });
  }

  if (command === "autorole") {
    return message.reply({
      embeds: [
        errorEmbed(
          "El sistema de autorol está reservado para una próxima configuración."
        )
      ]
    });
  }

  if (command === "ban") {
    const target = message.mentions.members.first();

    if (!target) {
      return message.reply({
        embeds: [errorEmbed("Menciona al usuario que quieres banear.")]
      });
    }

    if (!target.bannable) {
      return message.reply({
        embeds: [errorEmbed("No puedo banear a ese usuario.")]
      });
    }

    await target.ban({
      reason: `Mati Nexus • ${message.author.tag}`
    });

    await sendLog(
      message.guild,
      `🔨 ${message.author} baneó a **${target.user.tag}**.`
    );

    return message.reply({
      embeds: [
        successEmbed(
          `🔨 **${target.user.tag}** fue baneado correctamente.`
        )
      ]
    });
  }

  if (command === "kick") {
    const target = message.mentions.members.first();

    if (!target) {
      return message.reply({
        embeds: [errorEmbed("Menciona al usuario.")]
      });
    }

    if (!target.kickable) {
      return message.reply({
        embeds: [errorEmbed("No puedo expulsar a ese usuario.")]
      });
    }

    await target.kick(
      `Mati Nexus • ${message.author.tag}`
    );

    await sendLog(
      message.guild,
      `👢 ${message.author} expulsó a **${target.user.tag}**.`
    );

    return message.reply({
      embeds: [
        successEmbed(
          `👢 **${target.user.tag}** fue expulsado.`
        )
      ]
    });
  }

  if (command === "timeout") {
    const target = message.mentions.members.first();
    const minutes = Number(args[1]) || 10;

    if (!target) {
      return message.reply({
        embeds: [errorEmbed("Menciona al usuario.")]
      });
    }

    if (!target.moderatable) {
      return message.reply({
        embeds: [errorEmbed("No puedo aplicar timeout a ese usuario.")]
      });
    }

    await target.timeout(
      Math.min(minutes, 40320) * 60 * 1000,
      `Mati Nexus • ${message.author.tag}`
    );

    await sendLog(
      message.guild,
      `🔇 ${message.author} puso en timeout a **${target.user.tag}** durante ${minutes} minutos.`
    );

    return message.reply({
      embeds: [
        successEmbed(
          `🔇 ${target.user.tag} recibió timeout durante **${minutes} minutos**.`
        )
      ]
    });
  }

  if (command === "untimeout") {
    const target = message.mentions.members.first();

    if (!target) {
      return message.reply({
        embeds: [errorEmbed("Menciona al usuario.")]
      });
    }

    await target.timeout(null);

    return message.reply({
      embeds: [
        successEmbed(
          `🔊 Se quitó el timeout a ${target}.`
        )
      ]
    });
  }

  if (command === "warn") {
    const target = message.mentions.users.first();

    if (!target) {
      return message.reply({
        embeds: [errorEmbed("Menciona al usuario.")]
      });
    }

    const targetData = getUserData(target.id);
    targetData.warns++;

    saveData();

    await sendLog(
      message.guild,
      `⚠️ ${message.author} advirtió a **${target.tag}**. Warns: ${targetData.warns}`
    );

    return message.reply({
      embeds: [
        successEmbed(
          `⚠️ ${target} recibió una advertencia.\n\nTotal: **${targetData.warns}**`
        )
      ]
    });
  }

  if (command === "unwarn") {
    const target = message.mentions.users.first();

    if (!target) {
      return message.reply({
        embeds: [errorEmbed("Menciona al usuario.")]
      });
    }

    const targetData = getUserData(target.id);

    targetData.warns = Math.max(
      0,
      targetData.warns - 1
    );

    saveData();

    return message.reply({
      embeds: [
        successEmbed(
          `✅ Se quitó una advertencia a ${target}.`
        )
      ]
    });
  }

  if (command === "clear") {
    const amount = Number(args[0]);

    if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
      return message.reply({
        embeds: [
          errorEmbed("Indica una cantidad entre 1 y 100.")
        ]
      });
    }

    const deleted = await message.channel.bulkDelete(
      amount,
      true
    );

    const response = await message.channel.send({
      embeds: [
        successEmbed(
          `🧹 Se eliminaron **${deleted.size} mensajes**.`
        )
      ]
    });

    setTimeout(() => response.delete().catch(() => {}), 5000);

    return;
  }

  if (command === "lock") {
    await message.channel.permissionOverwrites.edit(
      message.guild.roles.everyone,
      {
        SendMessages: false
      }
    );

    return message.reply({
      embeds: [
        successEmbed(
          "🔒 Este canal ha sido bloqueado."
        )
      ]
    });
  }

  if (command === "unlock") {
    await message.channel.permissionOverwrites.edit(
      message.guild.roles.everyone,
      {
        SendMessages: null
      }
    );

    return message.reply({
      embeds: [
        successEmbed(
          "🔓 Este canal ha sido desbloqueado."
        )
      ]
    });
  }

  if (command === "role") {
    const target = message.mentions.members.first();
    const role = message.mentions.roles.first();

    if (!target || !role) {
      return message.reply({
        embeds: [
          errorEmbed("Usa `Mati role @usuario @rol`.")
        ]
      });
    }

    await target.roles.add(role);

    return message.reply({
      embeds: [
        successEmbed(
          `🎭 Se añadió ${role} a ${target}.`
        )
      ]
    });
  }

  if (command === "createrole") {
    const name = args.join(" ");

    if (!name) {
      return message.reply({
        embeds: [errorEmbed("Indica el nombre del rol.")]
      });
    }

    const role = await message.guild.roles.create({
      name,
      reason: `Mati Nexus • ${message.author.tag}`
    });

    return message.reply({
      embeds: [
        successEmbed(
          `🎭 Rol creado: ${role}`
        )
      ]
    });
  }

  if (command === "deleterole") {
    const role = message.mentions.roles.first();

    if (!role) {
      return message.reply({
        embeds: [errorEmbed("Menciona un rol.")]
      });
    }

    await role.delete();

    return message.reply({
      embeds: [
        successEmbed(
          "🗑️ Rol eliminado correctamente."
        )
      ]
    });
  }

  if (command === "createchannel") {
    const name = args.join("-").toLowerCase();

    if (!name) {
      return message.reply({
        embeds: [errorEmbed("Indica el nombre del canal.")]
      });
    }

    const channel = await message.guild.channels.create({
      name,
      type: ChannelType.GuildText
    });

    return message.reply({
      embeds: [
        successEmbed(
          `📁 Canal creado: ${channel}`
        )
      ]
    });
  }

  if (command === "deletechannel") {
    const channel =
      message.mentions.channels.first() ||
      message.channel;

    await channel.delete();

    return;
  }

  if (command === "slowmode") {
    const seconds = Number(args[0]);

    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) {
      return message.reply({
        embeds: [
          errorEmbed("Usa un valor entre 0 y 21600 segundos.")
        ]
      });
    }

    await message.channel.setRateLimitPerUser(seconds);

    return message.reply({
      embeds: [
        successEmbed(
          `🐌 Slowmode establecido en **${seconds}s**.`
        )
      ]
    });
  }

  if (command === "nick") {
    const target = message.mentions.members.first();
    const nickname = args.slice(1).join(" ");

    if (!target || !nickname) {
      return message.reply({
        embeds: [
          errorEmbed("Usa `Mati nick @usuario nuevo-nombre`.")
        ]
      });
    }

    await target.setNickname(nickname);

    return message.reply({
      embeds: [
        successEmbed(
          `✏️ Nuevo nombre de ${target}: **${nickname}**`
        )
      ]
    });
  }

  if (command === "announce") {
    const text = args.join(" ");

    if (!text) {
      return message.reply({
        embeds: [errorEmbed("Escribe el anuncio.")]
      });
    }

    return message.channel.send({
      embeds: [
        embed(
          "╔══ 📢 ANUNCIO NEXUS ══╗",
          text
        )
      ]
    });
  }
}

// ─────────────────────────────────────────────────────────────
// MENSAJES
// ─────────────────────────────────────────────────────────────

client.on("messageCreate", async message => {
  if (message.author.bot || !message.guild) return;

  const content = message.content.trim();

  let prefix = null;

  if (content.toLowerCase().startsWith("mati ")) {
    prefix = content.slice(0, 5);
  } else if (content.toLowerCase().startsWith("m.")) {
    prefix = content.slice(0, 2);
  }

  if (!prefix) return;

  const args = content
    .slice(prefix.length)
    .trim()
    .split(/\s+/);

  const command = args.shift()?.toLowerCase();

  if (!command) return;

  try {
    await executeCommand(message, command, args);
  } catch (error) {
    console.error(`Error en ${command}:`, error);

    await message.reply({
      embeds: [
        errorEmbed(
          "Ocurrió un error ejecutando el comando. Revisa los permisos del bot."
        )
      ]
    }).catch(() => {});
  }
});

// ─────────────────────────────────────────────────────────────
// MENÚS
// ─────────────────────────────────────────────────────────────

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "mati_help_menu") {
        const category = interaction.values[0];

        return interaction.update({
          embeds: [categoryEmbed(category)],
          components: [createHelpMenu()]
        });
      }

      if (interaction.customId === "mati_admin_menu") {
        if (!slashAdmin(interaction)) {
          return interaction.reply({
            embeds: [
              errorEmbed(
                "🔒 Solo Administradores."
              )
            ],
            ephemeral: true
          });
        }

        const category = interaction.values[0];
        const info = adminCategories[category];

        return interaction.update({
          embeds: [
            embed(
              `╔══ ${info.name} ══╗`,
              info.commands
                .map(
                  (cmd, i) =>
                    `**${String(i + 1).padStart(2, "0")}.** \`m.${cmd}\``
                )
                .join("\n")
            )
          ],
          components: [createAdminMenu()]
        });
      }
    }

    // ───────────────────────────────────────────────────────
    // SLASH HELP
    // ───────────────────────────────────────────────────────

    if (!interaction.isChatInputCommand()) return;

    const command = interaction.commandName;

    if (command === "help") {
      return interaction.reply({
        embeds: [publicHelpEmbed()],
        components: [createHelpMenu()]
      });
    }

    if (command === "helpad") {
      if (!slashAdmin(interaction)) {
        return interaction.reply({
          embeds: [
            errorEmbed(
              "🔒 Solo los Administradores pueden utilizar este panel."
            )
          ],
          ephemeral: true
        });
      }

      return interaction.reply({
        embeds: [adminHelpEmbed()],
        components: [createAdminMenu()]
      });
    }

    if (command === "ping") {
      return interaction.reply({
        embeds: [
          successEmbed(
            `🏓 Pong!\n\nLatencia: **${client.ws.ping}ms**`
          )
        ]
      });
    }

    if (command === "balance") {
      const user = getUserData(interaction.user.id);

      return interaction.reply({
        embeds: [
          embed(
            "╔══ 💰 BALANCE NEXUS ══╗",
            [
              `👤 ${interaction.user}`,
              "",
              `💵 Billetera: **${money(user.wallet)}**`,
              `🏦 Banco: **${money(user.bank)}**`,
              `💎 Total: **${money(user.wallet + user.bank)}**`
            ].join("\n")
          )
        ]
      });
    }

    if (command === "work") {
      const user = getUserData(interaction.user.id);
      const now = Date.now();
      const cooldown = 30000;

      if (now - user.lastWork < cooldown) {
        return interaction.reply({
          embeds: [
            errorEmbed(
              `Espera **${formatTime(cooldown - (now - user.lastWork))}**.`
            )
          ],
          ephemeral: true
        });
      }

      const amount = random(100, 300);

      user.wallet += amount;
      user.lastWork = now;

      addXP(interaction.user.id, random(10, 25));
      saveData();

      return interaction.reply({
        embeds: [
          successEmbed(
            `💼 Trabajaste y recibiste **${money(amount)}**.`
          )
        ]
      });
    }

    if (command === "daily") {
      const user = getUserData(interaction.user.id);
      const now = Date.now();
      const cooldown = 86400000;

      if (now - user.lastDaily < cooldown) {
        return interaction.reply({
          embeds: [
            errorEmbed(
              `Ya reclamaste tu recompensa.\n\n⏳ **${formatTime(cooldown - (now - user.lastDaily))}**`
            )
          ],
          ephemeral: true
        });
      }

      const amount = random(500, 1000);

      user.wallet += amount;
      user.lastDaily = now;

      saveData();

      return interaction.reply({
        embeds: [
          successEmbed(
            `🎁 Recibiste **${money(amount)}** como recompensa diaria.`
          )
        ]
      });
    }

    if (command === "profile") {
      const user = getUserData(interaction.user.id);

      return interaction.reply({
        embeds: [
          embed(
            "╔══ 🌌 PERFIL NEXUS ══╗",
            [
              `👤 ${interaction.user}`,
              `💰 Dinero: **${money(user.wallet)}**`,
              `🏦 Banco: **${money(user.bank)}**`,
              `⭐ Nivel: **${user.level}**`,
              `✨ XP: **${user.xp}/${user.level * 100}**`
            ].join("\n")
          )
        ]
      });
    }

    if (command === "userinfo") {
      const target =
        interaction.options.getUser("usuario") ||
        interaction.user;

      return interaction.reply({
        embeds: [
          embed(
            "╔══ 👤 USUARIO ══╗",
            [
              `👤 Usuario: ${target}`,
              `🆔 ID: \`${target.id}\``,
              `📅 Cuenta: <t:${Math.floor(target.createdTimestamp / 1000)}:D>`
            ].join("\n")
          ).setThumbnail(
            target.displayAvatarURL({ size: 512 })
          )
        ]
      });
    }

    if (command === "serverinfo") {
      const guild = interaction.guild;

      return interaction.reply({
        embeds: [
          embed(
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

    // ───────────────────────────────────────────────────────
    // ADMIN SLASH
    // ───────────────────────────────────────────────────────

    const adminSlashCommands = [
      "welcome",
      "goodbye",
      "invites",
      "logs",
      "ban",
      "kick",
      "timeout",
      "clear",
      "warn",
      "lock",
      "unlock",
      "setup",
      "server"
    ];

    if (adminSlashCommands.includes(command)) {
      if (!slashAdmin(interaction)) {
        return interaction.reply({
          embeds: [
            errorEmbed(
              "🔒 Este comando es exclusivo para Administradores."
            )
          ],
          ephemeral: true
        });
      }
    }

    if (
      command === "welcome" ||
      command === "goodbye" ||
      command === "invites" ||
      command === "logs"
    ) {
      const channel =
        interaction.options.getChannel("canal");

      const guildData = getGuildData(interaction.guild.id);

      if (!channel || channel.type !== ChannelType.GuildText) {
        return interaction.reply({
          embeds: [
            errorEmbed("Selecciona un canal de texto válido.")
          ],
          ephemeral: true
        });
      }

      if (command === "welcome") {
        guildData.welcomeChannel = channel.id;
        guildData.welcomeEnabled = true;
      }

      if (command === "goodbye") {
        guildData.goodbyeChannel = channel.id;
        guildData.goodbyeEnabled = true;
      }

      if (command === "invites") {
        guildData.inviteChannel = channel.id;
      }

      if (command === "logs") {
        guildData.logChannel = channel.id;
      }

      saveData();

      return interaction.reply({
        embeds: [
          successEmbed(
            `⚙️ Configuración actualizada correctamente.\n\nCanal: ${channel}`
          )
        ]
      });
    }

    if (command === "ban") {
      const member =
        interaction.options.getMember("usuario");

      if (!member || !member.bannable) {
        return interaction.reply({
          embeds: [
            errorEmbed("No puedo banear a ese usuario.")
          ],
          ephemeral: true
        });
      }

      await member.ban({
        reason: `Mati Nexus • ${interaction.user.tag}`
      });

      return interaction.reply({
        embeds: [
          successEmbed(
            `🔨 ${member.user.tag} fue baneado correctamente.`
          )
        ]
      });
    }

    if (command === "kick") {
      const member =
        interaction.options.getMember("usuario");

      if (!member || !member.kickable) {
        return interaction.reply({
          embeds: [
            errorEmbed("No puedo expulsar a ese usuario.")
          ],
          ephemeral: true
        });
      }

      await member.kick(
        `Mati Nexus • ${interaction.user.tag}`
      );

      return interaction.reply({
        embeds: [
          successEmbed(
            `👢 ${member.user.tag} fue expulsado.`
          )
        ]
      });
    }

    if (command === "timeout") {
      const member =
        interaction.options.getMember("usuario");

      const minutes =
        interaction.options.getInteger("minutos") || 10;

      if (!member || !member.moderatable) {
        return interaction.reply({
          embeds: [
            errorEmbed("No puedo aplicar timeout.")
          ],
          ephemeral: true
        });
      }

      await member.timeout(
        Math.min(minutes, 40320) * 60000,
        `Mati Nexus • ${interaction.user.tag}`
      );

      return interaction.reply({
        embeds: [
          successEmbed(
            `🔇 ${member.user.tag} recibió timeout durante ${minutes} minutos.`
          )
        ]
      });
    }

    if (command === "clear") {
      const amount =
        interaction.options.getInteger("cantidad");

      if (!amount || amount < 1 || amount > 100) {
        return interaction.reply({
          embeds: [
            errorEmbed("La cantidad debe estar entre 1 y 100.")
          ],
          ephemeral: true
        });
      }

      const deleted =
        await interaction.channel.bulkDelete(
          amount,
          true
        );

      return interaction.reply({
        embeds: [
          successEmbed(
            `🧹 Eliminados **${deleted.size} mensajes**.`
          )
        ],
        ephemeral: true
      });
    }

    if (command === "warn") {
      const target =
        interaction.options.getUser("usuario");

      if (!target) {
        return interaction.reply({
          embeds: [
            errorEmbed("Selecciona un usuario.")
          ],
          ephemeral: true
        });
      }

      const targetData = getUserData(target.id);
      targetData.warns++;

      saveData();

      return interaction.reply({
        embeds: [
          successEmbed(
            `⚠️ ${target} recibió una advertencia.\n\nTotal: **${targetData.warns}**`
          )
        ]
      });
    }

    if (command === "lock") {
      await interaction.channel.permissionOverwrites.edit(
        interaction.guild.roles.everyone,
        {
          SendMessages: false
        }
      );

      return interaction.reply({
        embeds: [
          successEmbed("🔒 Canal bloqueado.")
        ]
      });
    }

    if (command === "unlock") {
      await interaction.channel.permissionOverwrites.edit(
        interaction.guild.roles.everyone,
        {
          SendMessages: null
        }
      );

      return interaction.reply({
        embeds: [
          successEmbed("🔓 Canal desbloqueado.")
        ]
      });
    }

    if (command === "setup") {
      return interaction.reply({
        embeds: [
          embed(
            "╔══ ⚙️ SETUP NEXUS ══╗",
            [
              "👋 `/welcome canal`",
              "😭 `/goodbye canal`",
              "📨 `/invites canal`",
              "📜 `/logs canal`",
              "",
              "🌌 Configuración lista."
            ].join("\n")
          )
        ]
      });
    }

    if (command === "server") {
      const guildData = getGuildData(
        interaction.guild.id
      );

      return interaction.reply({
        embeds: [
          embed(
            "╔══ ⚙️ CONFIGURACIÓN ══╗",
            [
              `👋 Bienvenidas: ${guildData.welcomeChannel ? `<#${guildData.welcomeChannel}>` : "❌"}`,
              `😭 Despedidas: ${guildData.goodbyeChannel ? `<#${guildData.goodbyeChannel}>` : "❌"}`,
              `📨 Invitaciones: ${guildData.inviteChannel ? `<#${guildData.inviteChannel}>` : "❌"}`,
              `📜 Logs: ${guildData.logChannel ? `<#${guildData.logChannel}>` : "❌"}`
            ].join("\n")
          )
        ]
      });
    }
  } catch (error) {
    console.error("Error en interacción:", error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            "Ocurrió un error ejecutando esta acción."
          )
        ],
        ephemeral: true
      }).catch(() => {});
    }
  }
});

// ─────────────────────────────────────────────────────────────
// BIENVENIDAS
// ─────────────────────────────────────────────────────────────

client.on("guildMemberAdd", async member => {
  const guildData = getGuildData(member.guild.id);

  if (
    guildData.welcomeEnabled &&
    guildData.welcomeChannel
  ) {
    const channel =
      member.guild.channels.cache.get(
        guildData.welcomeChannel
      );

    if (channel) {
      await channel.send({
        embeds: [
          embed(
            "╔══ 👋 ¡BIENVENIDO! ══╗",
            [
              `👋 ¡Bienvenido ${member}! 🎉`,
              "",
              `🌌 Ahora formas parte de **${member.guild.name}**.`,
              "",
              "📖 Lee las reglas del servidor.",
              "🎫 Si necesitas ayuda, abre un ticket.",
              "",
              "💗 ¡Esperamos que disfrutes tu estancia!"
            ].join("\n")
          ).setThumbnail(
            member.user.displayAvatarURL({ size: 512 })
          )
        ]
      });
    }
  }

  // Actualizar cache de invitaciones
  await cacheInvites(member.guild);
});

// ─────────────────────────────────────────────────────────────
// DESPEDIDAS
// ─────────────────────────────────────────────────────────────

client.on("guildMemberRemove", async member => {
  const guildData = getGuildData(member.guild.id);

  if (
    guildData.goodbyeEnabled &&
    guildData.goodbyeChannel
  ) {
    const channel =
      member.guild.channels.cache.get(
        guildData.goodbyeChannel
      );

    if (channel) {
      await channel.send({
        embeds: [
          embed(
            "╔══ 😭 DESPEDIDA ══╗",
            [
              `😭 Nuestro miembro **${member.user.tag}** nos ha dejado..`,
              "",
              "🌌 Esperamos volver a verte algún día."
            ].join("\n")
          )
        ]
      });
    }
  }
});

// ─────────────────────────────────────────────────────────────
// LOGS DE MENSAJES
// ─────────────────────────────────────────────────────────────

client.on("messageDelete", async message => {
  if (!message.guild || message.author?.bot) return;

  const guildData = getGuildData(message.guild.id);

  if (!guildData.logChannel) return;

  const channel =
    message.guild.channels.cache.get(
      guildData.logChannel
    );

  if (!channel) return;

  await channel.send({
    embeds: [
      embed(
        "╔══ 🗑️ MENSAJE ELIMINADO ══╗",
        [
          `👤 Autor: ${message.author || "Desconocido"}`,
          `📁 Canal: ${message.channel}`,
          "",
          message.content
            ? `💬 Contenido:\n> ${message.content.slice(0, 1000)}`
            : "💬 Sin contenido visible."
        ].join("\n")
      )
    ]
  }).catch(() => {});
});

// ─────────────────────────────────────────────────────────────
// SLASH COMMANDS
// ─────────────────────────────────────────────────────────────

const slashCommands = [

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("🌌 Abre el menú de ayuda."),

  new SlashCommandBuilder()
    .setName("helpad")
    .setDescription("👑 Abre el panel administrativo."),

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("🏓 Comprueba la latencia."),

  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("💰 Mira tu balance."),

  new SlashCommandBuilder()
    .setName("work")
    .setDescription("💼 Trabaja y gana dinero."),

  new SlashCommandBuilder()
    .setName("daily")
    .setDescription("🎁 Reclama tu recompensa diaria."),

  new SlashCommandBuilder()
    .setName("profile")
    .setDescription("🌌 Mira tu perfil."),

  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("👤 Mira información de un usuario.")
    .addUserOption(option =>
      option
        .setName("usuario")
        .setDescription("Usuario")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("🌌 Mira información del servidor."),

  new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("👋 Configura las bienvenidas.")
    .addChannelOption(option =>
      option
        .setName("canal")
        .setDescription("Canal de bienvenida")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("goodbye")
    .setDescription("😭 Configura las despedidas.")
    .addChannelOption(option =>
      option
        .setName("canal")
        .setDescription("Canal de despedidas")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("invites")
    .setDescription("📨 Configura el registro de invitaciones.")
    .addChannelOption(option =>
      option
        .setName("canal")
        .setDescription("Canal de invitaciones")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("logs")
    .setDescription("📜 Configura los logs.")
    .addChannelOption(option =>
      option
        .setName("canal")
        .setDescription("Canal de logs")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("🔨 Banea un usuario.")
    .addUserOption(option =>
      option
        .setName("usuario")
        .setDescription("Usuario a banear")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("👢 Expulsa un usuario.")
    .addUserOption(option =>
      option
        .setName("usuario")
        .setDescription("Usuario a expulsar")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("🔇 Aplica timeout.")
    .addUserOption(option =>
      option
        .setName("usuario")
        .setDescription("Usuario")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("minutos")
        .setDescription("Duración en minutos")
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("🧹 Elimina mensajes.")
    .addIntegerOption(option =>
      option
        .setName("cantidad")
        .setDescription("Cantidad")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("⚠️ Advierte a un usuario.")
    .addUserOption(option =>
      option
        .setName("usuario")
        .setDescription("Usuario")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("🔒 Bloquea el canal."),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("🔓 Desbloquea el canal."),

  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("⚙️ Muestra la configuración rápida."),

  new SlashCommandBuilder()
    .setName("server")
    .setDescription("⚙️ Muestra la configuración del servidor.")

].map(command => command.toJSON());

// ─────────────────────────────────────────────────────────────
// READY
// ─────────────────────────────────────────────────────────────

client.once("ready", async () => {
  console.log("══════════════════════════════════════");
  console.log("🌌 MATI NEXUS BOT");
  console.log(`🤖 Conectado como ${client.user.tag}`);
  console.log(`🌐 Servidores: ${client.guilds.cache.size}`);
  console.log("══════════════════════════════════════");

  client.user.setPresence({
    activities: [
      {
        name: "🌌 Mati Nexus",
        type: 3
      }
    ],
    status: "online"
  });

  try {
    await client.application.commands.set(
      slashCommands
    );

    console.log("✅ Slash commands registrados.");
  } catch (error) {
    console.error(
      "❌ Error registrando slash commands:",
      error
    );
  }

  for (const guild of client.guilds.cache.values()) {
    await cacheInvites(guild);
  }
});

// ─────────────────────────────────────────────────────────────
// SERVIDOR HTTP PARA RENDER
// ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8"
  });

  res.end("🌌 Mati Nexus BOT está funcionando correctamente.");
}).listen(PORT, () => {
  console.log(`🌐 Servidor HTTP activo en el puerto ${PORT}`);
});

// ─────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────

client.login(TOKEN);
