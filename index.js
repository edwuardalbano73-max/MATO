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
// 🧡🩷 MATI NEXUS BOT
// ============================================================

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
  console.error("❌ Falta la variable DISCORD_TOKEN.");
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
    console.log("⚠️ data.json no pudo cargarse. Creando datos nuevos.");
  }
}

function saveData() {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(data, null, 2)
  );
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
// 🧡🩷 DECORACIONES
// ============================================================

function makeEmbed(title, description) {
  return new EmbedBuilder()
    .setColor("#ff7ac8")
    .setTitle(`🧡 ${title} 🩷`)
    .setDescription(description)
    .setFooter({
      text: "ミ🧡 Mati Nexus 🩷彡 • Nexus System"
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

// ============================================================
// 💰 UTILIDADES
// ============================================================

function money(value) {
  return `${Number(value || 0).toLocaleString("es-ES")} 💰`;
}

function random(min, max) {
  return Math.floor(
    Math.random() * (max - min + 1)
  ) + min;
}

function randomChoice(array) {
  return array[
    Math.floor(Math.random() * array.length)
  ];
}

function cooldownText(ms) {
  const seconds = Math.ceil(ms / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;

  if (!remaining) {
    return `${minutes}m`;
  }

  return `${minutes}m ${remaining}s`;
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

async function sendLog(
  guild,
  title,
  description
) {
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
        description
      )
    ]
  }).catch(() => {});
}

// ============================================================
// 📨 INVITACIONES
// ============================================================

const inviteCache = new Map();

async function loadInvites(guild) {
  try {
    const invites =
      await guild.invites.fetch();

    const inviteData = new Map();

    for (const invite of invites.values()) {
      inviteData.set(
        invite.code,
        {
          uses: invite.uses || 0,
          inviterId: invite.inviter?.id || null
        }
      );
    }

    inviteCache.set(
      guild.id,
      inviteData
    );
  } catch {}
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
      const old =
        oldInvites.get(invite.code);

      if (
        invite.uses &&
        (!old || invite.uses > old.uses)
      ) {
        usedInvite = invite;
        break;
      }
    }

    await loadInvites(guild);

    return usedInvite;
  } catch {
    return null;
  }
}

// ============================================================
// 👋 BIENVENIDAS
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

    if (config.autorole) {
      const role =
        member.guild.roles.cache.get(
          config.autorole
        );

      if (role) {
        await member.roles.add(role).catch(() => {});
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
        await channel.send({
          embeds: [
            makeEmbed(
              "╔══ 📨 INVITACIÓN ══╗",
              [
                `👤 Nuevo miembro: ${member}`,
                `👑 Invitado por: ${
                  usedInvite.inviter
                    ? `<@${usedInvite.inviter.id}>`
                    : "Desconocido"
                }`,
                `🔗 Código: \`${usedInvite.code}\``,
                `📊 Usos: **${usedInvite.uses || 0}**`
              ].join("\n")
            )
          ]
        }).catch(() => {});
      }
    }
  }
);

// ============================================================
// 😭 DESPEDIDAS
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
      `👤 ${member.user.tag}`
    );
  }
);

// ============================================================
// 🗑️ MENSAJES ELIMINADOS
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
        `👤 Autor: ${message.author || "Desconocido"}`,
        `📁 Canal: ${message.channel}`,
        "",
        `💬 Contenido: ${message.content || "Sin contenido"}`
      ].join("\n")
    );
  }
);

// ============================================================
// 📋 CATEGORÍAS PÚBLICAS
// ============================================================

const publicCategories = {

  general: {
    emoji: "🌌",
    name: "General",
    commands: [
      "help","ping","botinfo","serverinfo","userinfo",
      "avatar","banner","profile","uptime","invite",
      "servericon","membercount","channelinfo","roleinfo",
      "timestamp","whois","id","afk","serverage",
      "userage","channels","roles","emojis","boosts",
      "support",

      "date","time","guildid","botavatar","botid",
      "owner","servercreated","textchannels","voicechannels",
      "categories","online","humans","bots","rolelist",
      "channelcount"
    ]
  },

  economy: {
    emoji: "💰",
    name: "Economía",
    commands: [
      "balance","work","daily","crime","rob","beg",
      "deposit","withdraw","dep","with","pay",
      "leaderboard","richest","bank","wallet","money",
      "economy","cash","give","salary","bonus",
      "income","expenses","networth","economystats",

      "depositall","withdrawall","pocket","totalmoney",
      "mystats","cooldowns","claim","stash","spend",
      "gift","cashflow","bankbalance","walletbalance",
      "economyinfo","moneyrank"
    ]
  },

  fun: {
    emoji: "🎮",
    name: "Diversión",
    commands: [
      "slots","coinflip","dice","blackjack","guess",
      "8ball","roll","choose","rate","ship","joke",
      "meme","rps","trivia","random","reverse","sayfun",
      "ascii","emojify","color","number","fortune",
      "fact","roast","compliment",

      "magic","quote","pickone","coin","dadjoke",
      "shuffle","yesno","clap","echo","mirror",
      "dice2","number2","fortune2","randomemoji","countdown"
    ]
  },

  social: {
    emoji: "💗",
    name: "Social",
    commands: [
      "hug","kiss","pat","poke","highfive","wave",
      "slap","compliment","friend","ship","cuddle",
      "dance","smile","wink","happy","love","greet",
      "goodnight","goodmorning","thank","applaud",
      "cheer","support","react","interaction",

      "respect","bow","fistbump","salute","nod",
      "comfort","congrats","goodluck","welcome","bye",
      "hello","celebrate","cheer2","highfive2","smile2"
    ]
  },

  levels: {
    emoji: "⭐",
    name: "Niveles",
    commands: [
      "level","rank","xp","top","levels","nextlevel",
      "progress","leaderboardxp","levelinfo","xprequired",
      "myxp","mylevel","leveltop","xptop","rankinfo",
      "levelstats","xpstats","progressbar","levelup",
      "experience","ranking","levelboard","xpleaderboard",
      "levelcheck","rewards",

      "levelcard","levelgoal","xpleft","xppercent",
      "levelrequirements","myrank","serverlevel",
      "levelusers","xpusers","levelreward","nextxp",
      "currentxp","levelbar","rankposition","levelsummary"
    ]
  },

  utilities: {
    emoji: "🛠️",
    name: "Utilidades",
    commands: [
      "servericon","channelinfo","roleinfo","membercount",
      "timestamp","calculator","poll","remind","avatar",
      "banner","userinfo","serverinfo","uptime","ping",
      "say","embed","choose","roll","random","translate",
      "weather","timer","afk","help",

      "randomuser","servertime","text","count","mention",
      "channelcount","rolecount","botping","memberlist",
      "cleantext","choose3","dateutil","timeutil",
      "serverage","findmember"
    ]
  }
};

// ============================================================
// 👑 CATEGORÍAS ADMIN
// ============================================================

const adminCategories = {

  moderation: {
    emoji: "🛡️",
    name: "Moderación",
    commands: [
      "ban","unban","kick","timeout","untimeout","warn",
      "unwarn","clearwarns","clear","lock","unlock",
      "slowmode","nick","resetnick","mute","unmute",
      "purge","massban","softban","modlog","warnings",
      "warns","checkwarns","kickall","modinfo",

      "baninfo","timeoutinfo","warninfo","modstats",
      "unmuteall","lockall","unlockall","slowmodeoff",
      "nickreset","caseinfo","clearuser","rolelock",
      "roleunlock","reason","modhistory"
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
      "resetconfig",

      "welcomeconfig","goodbyeconfig","inviteconfig",
      "logsconfig","autoroleinfo","prefixinfo","configinfo",
      "welcomechanneloff","goodbyechanneloff",
      "invitechanneloff","logchanneloff","configstatus",
      "configreset","ruleschannel","ticketchannel"
    ]
  },

  administration: {
    emoji: "👑",
    name: "Administración",
    commands: [
      "addmoney","removemoney","setmoney","addbank",
      "removebank","setbank","addxp","removexp","setxp",
      "addlevel","setlevel","resetuser","setwarns",
      "resetwarns","giveall","takeall","createrole",
      "deleterole","role","createchannel","deletechannel",
      "announce","say","embed","server",

      "removelevel","resetxp","resetmoney","resetbank",
      "setwallet","setallmoney","addallbank","removeallbank",
      "setrole","removerole","renamechannel","renameguild",
      "createcategory","deletecategory","botstatus"
    ]
  }
};

// ============================================================
// 📋 MENÚS HELP
// ============================================================

function publicHelp() {
  return makeEmbed(
    "╔══ 🧡🩷 MATI NEXUS HELP ══╗",
    [
      "🌌 **General** — Información del servidor y bot.",
      "💰 **Economía** — Dinero, banco y recompensas.",
      "🎮 **Diversión** — Juegos y comandos divertidos.",
      "💗 **Social** — Interacciones con usuarios.",
      "⭐ **Niveles** — XP, niveles y rankings.",
      "🛠️ **Utilidades** — Herramientas útiles.",
      "",
      "📚 Cada categoría contiene **40 comandos**.",
      "📄 Al seleccionar una categoría aparecerán **2 páginas de 20 comandos**.",
      "",
      "🧡 Prefix: `m.`",
      "🩷 También puedes usar el sistema configurado del servidor."
    ].join("\n")
  );
}

function publicHelpMenu() {
  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("mati_public_help")
        .setPlaceholder("🧡 Selecciona una categoría")
        .addOptions(
          Object.entries(publicCategories).map(
            ([key, category]) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(category.name)
                .setDescription(
                  "Ver los 40 comandos de esta categoría"
                )
                .setEmoji(category.emoji)
                .setValue(key)
          )
        )
    );
}

function categoryEmbed(key) {
  const category =
    publicCategories[key];

  const page1 =
    category.commands.slice(0, 20);

  const page2 =
    category.commands.slice(20, 40);

  return makeEmbed(
    `╔══ ${category.emoji} ${category.name.toUpperCase()} ══╗`,
    [
      `📄 **Página 1/2 — Comandos 1-20**`,
      "",
      page1
        .map(
          (cmd, i) =>
            `\`${i + 1}.\` **m.${cmd}**`
        )
        .join("\n"),
      "",
      `📄 **Página 2/2 — Comandos 21-40**`,
      "",
      page2
        .map(
          (cmd, i) =>
            `\`${i + 21}.\` **m.${cmd}**`
        )
        .join("\n"),
      "",
      "🧡 Las dos páginas pertenecen a esta categoría."
    ].join("\n")
  );
}

function publicPageMenu(key) {
  const category =
    publicCategories[key];

  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`mati_public_page_${key}`)
        .setPlaceholder("🧡 Selecciona una página")
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel("Página 1 — Comandos 1-20")
            .setDescription("Primera página de comandos")
            .setEmoji("📄")
            .setValue("1"),
          new StringSelectMenuOptionBuilder()
            .setLabel("Página 2 — Comandos 21-40")
            .setDescription("Segunda página de comandos")
            .setEmoji("📄")
            .setValue("2")
        )
    );
}

function publicCategoryPageEmbed(
  key,
  page
) {
  const category =
    publicCategories[key];

  const start =
    page === 2 ? 20 : 0;

  const commands =
    category.commands.slice(
      start,
      start + 20
    );

  return makeEmbed(
    `╔══ ${category.emoji} ${category.name.toUpperCase()} ══╗`,
    [
      `📄 **Página ${page}/2**`,
      `🧡 Comandos ${start + 1}-${start + 20}`,
      "",
      commands
        .map(
          (cmd, i) =>
            `\`${start + i + 1}.\` **m.${cmd}**`
        )
        .join("\n")
    ].join("\n")
  );
}

// ============================================================
// 👑 ADMIN HELP
// ============================================================

function adminHelp() {
  return makeEmbed(
    "╔══ 👑 PANEL ADMIN ══╗",
    [
      "🛡️ **Moderación**",
      "⚙️ **Configuración**",
      "👑 **Administración**",
      "",
      "📚 Cada categoría contiene **40 comandos**.",
      "📄 Cada categoría tiene **2 páginas de 20 comandos**.",
      "",
      "🔐 Este panel solamente puede ser utilizado por Administradores."
    ].join("\n")
  );
}

function adminHelpMenu() {
  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("mati_admin_help")
        .setPlaceholder("👑 Selecciona una categoría")
        .addOptions(
          Object.entries(adminCategories).map(
            ([key, category]) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(category.name)
                .setDescription(
                  "Ver los 40 comandos administrativos"
                )
                .setEmoji(category.emoji)
                .setValue(key)
          )
        )
    );
}

function adminCategoryPageMenu(key) {
  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`mati_admin_page_${key}`)
        .setPlaceholder("👑 Selecciona una página")
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel("Página 1 — Comandos 1-20")
            .setDescription("Primera página")
            .setEmoji("📄")
            .setValue("1"),
          new StringSelectMenuOptionBuilder()
            .setLabel("Página 2 — Comandos 21-40")
            .setDescription("Segunda página")
            .setEmoji("📄")
            .setValue("2")
        )
    );
}

function adminCategoryPageEmbed(
  key,
  page
) {
  const category =
    adminCategories[key];

  const start =
    page === 2 ? 20 : 0;

  const commands =
    category.commands.slice(
      start,
      start + 20
    );

  return makeEmbed(
    `╔══ 👑 ${category.name.toUpperCase()} ══╗`,
    [
      `📄 **Página ${page}/2**`,
      `🧡 Comandos ${start + 1}-${start + 20}`,
      "",
      commands
        .map(
          (cmd, i) =>
            `\`${start + i + 1}.\` **m.${cmd}**`
        )
        .join("\n")
    ].join("\n")
  );
}

// ============================================================
// 🎮 COMANDOS PREFIX
// ============================================================

const cooldowns = new Map();

function getCooldownKey(userId, command) {
  return `${userId}:${command}`;
}

function checkCooldown(
  userId,
  command,
  ms
) {
  const key =
    getCooldownKey(
      userId,
      command
    );

  const now = Date.now();
  const last =
    cooldowns.get(key) || 0;

  if (now - last < ms) {
    return ms - (now - last);
  }

  cooldowns.set(key, now);

  return 0;
}

function getPrefix(guild) {
  if (!guild) return "m.";

  const config =
    getGuildData(guild.id);

  return config.prefix || "m.";
}

// ============================================================
// 📊 INFORMACIÓN
// ============================================================

function getMemberTarget(
  message,
  args
) {
  if (message.mentions.members.first()) {
    return message.mentions.members.first();
  }

  if (args[0]) {
    const member =
      message.guild.members.cache.get(
        args[0]
      );

    if (member) return member;
  }

  return message.member;
}

function formatDate(date) {
  return `<t:${Math.floor(
    date.getTime() / 1000
  )}:F>`;
}

// ============================================================
// 🎰 DIVERSIÓN
// ============================================================

const coinSides = [
  "🪙 Cara",
  "🪙 Cruz"
];

// ============================================================
// 📨 MENSAJES
// ============================================================

client.on(
  "messageCreate",
  async message => {

    if (!message.guild) return;
    if (message.author.bot) return;

    const prefix =
      getPrefix(message.guild);

    if (
      !message.content.startsWith(prefix)
    ) {
      return;
    }

    const args =
      message.content
        .slice(prefix.length)
        .trim()
        .split(/\s+/);

    const command =
      args.shift()?.toLowerCase();

    if (!command) return;

    const user =
      getUserData(
        message.author.id
      );

    // ========================================================
    // ⭐ XP
    // ========================================================

    const leveledUp =
      addXP(
        message.author.id,
        random(5, 15)
      );

    if (leveledUp) {
      await message.channel.send({
        embeds: [
          success(
            `🎉 ${message.author}, ¡subiste al **nivel ${user.level}**!`
          )
        ]
      }).catch(() => {});
    }

    // ========================================================
    // 🌌 HELP
    // ========================================================

    if (command === "help") {
      await message.channel.send({
        embeds: [
          publicHelp()
        ],
        components: [
          publicHelpMenu()
        ]
      });

      return;
    }

    // ========================================================
    // 👑 HELP ADMIN
    // ========================================================

    if (
      command === "helpad" ||
      command === "adminhelp" ||
      command === "helpadmin"
    ) {
      if (!isAdmin(message.member)) {
        await message.channel.send({
          embeds: [
            error(
              "Solo los Administradores pueden utilizar este panel."
            )
          ]
        });

        return;
      }

      await message.channel.send({
        embeds: [
          adminHelp()
        ],
        components: [
          adminHelpMenu()
        ]
      });

      return;
    }

    // ========================================================
    // 🏓 PING
    // ========================================================

    if (command === "ping") {
      const sent =
        await message.channel.send({
          embeds: [
            makeEmbed(
              "╔══ 🏓 PING ══╗",
              "Calculando latencia..."
            )
          ]
        });

      const latency =
        sent.createdTimestamp -
        message.createdTimestamp;

      await sent.edit({
        embeds: [
          makeEmbed(
            "╔══ 🏓 PING ══╗",
            [
              `🏓 Bot: **${latency}ms**`,
              `💓 API: **${Math.round(client.ws.ping)}ms**`
            ].join("\n")
          )
        ]
      }).catch(() => {});

      return;
    }

    // ========================================================
    // 🤖 BOTINFO
    // ========================================================

    if (command === "botinfo") {
      const uptime =
        Math.floor(process.uptime());

      const hours =
        Math.floor(uptime / 3600);

      const minutes =
        Math.floor(
          (uptime % 3600) / 60
        );

      const seconds =
        uptime % 60;

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 🌌 BOT INFO ══╗",
            [
              `🤖 Nombre: **${client.user.username}**`,
              `🆔 ID: \`${client.user.id}\``,
              `📡 Servidores: **${client.guilds.cache.size}**`,
              `👥 Usuarios: **${client.guilds.cache.reduce(
                (a, g) => a + g.memberCount,
                0
              )}**`,
              `⏱️ Uptime: **${hours}h ${minutes}m ${seconds}s**`,
              `📦 Discord.js: **v14**`
            ].join("\n")
          )
        ]
      });

      return;
    }

    // ========================================================
    // 🏠 SERVERINFO
    // ========================================================

    if (command === "serverinfo") {
      const guild =
        message.guild;

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 🌌 SERVER INFO ══╗",
            [
              `🏠 Servidor: **${guild.name}**`,
              `🆔 ID: \`${guild.id}\``,
              `👥 Miembros: **${guild.memberCount}**`,
              `📅 Creado: ${formatDate(guild.createdAt)}`,
              `💎 Boosts: **${guild.premiumSubscriptionCount || 0}**`,
              `📁 Canales: **${guild.channels.cache.size}**`,
              `🎭 Roles: **${guild.roles.cache.size}**`
            ].join("\n")
          )
        ]
      });

      return;
    }

    // ========================================================
    // 👤 USERINFO
    // ========================================================

    if (
      command === "userinfo" ||
      command === "whois"
    ) {
      const member =
        getMemberTarget(
          message,
          args
        );

      const target =
        member.user;

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 👤 USER INFO ══╗",
            [
              `👤 Usuario: ${member}`,
              `🏷️ Tag: **${target.tag}**`,
              `🆔 ID: \`${target.id}\``,
              `📅 Cuenta creada: ${formatDate(target.createdAt)}`,
              `📥 Entró al servidor: ${
                member.joinedAt
                  ? formatDate(member.joinedAt)
                  : "Desconocido"
              }`,
              `⭐ Nivel: **${getUserData(target.id).level}**`,
              `✨ XP: **${getUserData(target.id).xp}**`
            ].join("\n")
          ).setThumbnail(
            target.displayAvatarURL({
              size: 512
            })
          )
        ]
      });

      return;
    }

    // ========================================================
    // 🖼️ AVATAR
    // ========================================================

    if (command === "avatar") {
      const member =
        getMemberTarget(
          message,
          args
        );

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 🖼️ AVATAR ══╗",
            `[🖼️ Ver avatar completo](${member.user.displayAvatarURL({
              size: 4096,
              extension: "png"
            })})`
          ).setImage(
            member.user.displayAvatarURL({
              size: 1024
            })
          )
        ]
      });

      return;
    }

    // ========================================================
    // 🆔 ID
    // ========================================================

    if (command === "id") {
      const member =
        getMemberTarget(
          message,
          args
        );

      await message.channel.send({
        embeds: [
          success(
            `🆔 El ID de ${member} es:\n\`${member.id}\``
          )
        ]
      });

      return;
    }

    // ========================================================
    // 👥 MEMBERCOUNT
    // ========================================================

    if (command === "membercount") {
      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 👥 MIEMBROS ══╗",
            `👥 Este servidor tiene **${message.guild.memberCount}** miembros.`
          )
        ]
      });

      return;
    }

    // ========================================================
    // 🎭 ROLES
    // ========================================================

    if (command === "roles") {
      const roles =
        message.guild.roles.cache
          .filter(
            role =>
              role.id !== message.guild.id
          )
          .map(
            role =>
              role.toString()
          )
          .slice(0, 50);

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 🎭 ROLES ══╗",
            roles.length
              ? roles.join(" ")
              : "No hay roles disponibles."
          )
        ]
      });

      return;
    }

    // ========================================================
    // 📁 CHANNELS
    // ========================================================

    if (command === "channels") {
      const channels =
        message.guild.channels.cache
          .map(
            channel =>
              `• ${channel.name}`
          )
          .slice(0, 50);

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 📁 CANALES ══╗",
            channels.join("\n") ||
            "No hay canales."
          )
        ]
      });

      return;
    }

    // ========================================================
    // 💎 BOOSTS
    // ========================================================

    if (command === "boosts") {
      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 💎 BOOSTS ══╗",
            `💎 Este servidor tiene **${
              message.guild.premiumSubscriptionCount || 0
            }** boosts.`
          )
        ]
      });

      return;
    }

    // ========================================================
    // ⏱️ UPTIME
    // ========================================================

    if (command === "uptime") {
      const total =
        Math.floor(
          process.uptime()
        );

      const days =
        Math.floor(
          total / 86400
        );

      const hours =
        Math.floor(
          (total % 86400) / 3600
        );

      const minutes =
        Math.floor(
          (total % 3600) / 60
        );

      const seconds =
        total % 60;

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ ⏱️ UPTIME ══╗",
            `🌌 Tiempo activo:\n**${days}d ${hours}h ${minutes}m ${seconds}s**`
          )
        ]
      });

      return;
    }

    // ========================================================
    // 💰 BALANCE
    // ========================================================

    if (
      command === "balance" ||
      command === "bal" ||
      command === "money" ||
      command === "cash"
    ) {
      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 💰 BALANCE ══╗",
            [
              `👤 Usuario: ${message.author}`,
              `💰 Billetera: **${money(user.wallet)}**`,
              `🏦 Banco: **${money(user.bank)}**`,
              `💎 Patrimonio: **${money(
                user.wallet +
                user.bank
              )}**`
            ].join("\n")
          )
        ]
      });

      return;
    }

    // ========================================================
    // 💼 WORK
    // ========================================================

    if (command === "work") {
      const remaining =
        checkCooldown(
          message.author.id,
          "work",
          30 * 1000
        );

      if (remaining) {
        await message.channel.send({
          embeds: [
            error(
              `⏳ Debes esperar **${cooldownText(remaining)}** para trabajar otra vez.`
            )
          ]
        });

        return;
      }

      const amount =
        random(100, 300);

      user.wallet += amount;

      saveData();

      await message.channel.send({
        embeds: [
          success(
            `💼 Trabajaste y recibiste **${money(amount)}**.`
          )
        ]
      });

      return;
    }

    // ========================================================
    // 🎁 DAILY
    // ========================================================

    if (command === "daily") {
      const now =
        Date.now();

      const cooldown =
        24 * 60 * 60 * 1000;

      if (
        now - user.lastDaily <
        cooldown
      ) {
        await message.channel.send({
          embeds: [
            error(
              `🎁 Ya reclamaste tu recompensa diaria.\n⏳ Vuelve en **${cooldownText(
                cooldown -
                (now - user.lastDaily)
              )}**.`
            )
          ]
        });

        return;
      }

      const amount =
        random(500, 1000);

      user.wallet += amount;
      user.lastDaily = now;

      saveData();

      await message.channel.send({
        embeds: [
          success(
            `🎁 Recompensa diaria: **${money(amount)}**`
          )
        ]
      });

      return;
    }

    // ========================================================
    // 😈 CRIME
    // ========================================================

    if (command === "crime") {
      const remaining =
        checkCooldown(
          message.author.id,
          "crime",
          2 * 60 * 1000
        );

      if (remaining) {
        await message.channel.send({
          embeds: [
            error(
              `⏳ Espera **${cooldownText(remaining)}** antes de intentarlo otra vez.`
            )
          ]
        });

        return;
      }

      const won =
        Math.random() < 0.20;

      if (won) {
        const amount =
          random(500, 700);

        user.wallet += amount;

        saveData();

        await message.channel.send({
          embeds: [
            success(
              `😈 El crimen salió bien.\n💰 Ganaste **${money(amount)}**.`
            )
          ]
        });
      } else {
        user.wallet =
          Math.max(
            0,
            user.wallet - 600
          );

        saveData();

        await message.channel.send({
          embeds: [
            error(
              `🚔 Te atraparon.\n💸 Perdiste **${money(600)}**.`
            )
          ]
        });
      }

      return;
    }

    // ========================================================
    // 🥺 BEG
    // ========================================================

    if (command === "beg") {
      const remaining =
        checkCooldown(
          message.author.id,
          "beg",
          60 * 1000
        );

      if (remaining) {
        await message.channel.send({
          embeds: [
            error(
              `⏳ Espera **${cooldownText(remaining)}**.`
            )
          ]
        });

        return;
      }

      const amount =
        random(25, 150);

      user.wallet += amount;

      saveData();

      await message.channel.send({
        embeds: [
          success(
            `🥺 Alguien tuvo piedad y te dio **${money(amount)}**.`
          )
        ]
      });

      return;
    }

    // ========================================================
    // 🏦 DEPOSIT
    // ========================================================

    if (
      command === "deposit" ||
      command === "dep"
    ) {
      const amount =
        args[0]?.toLowerCase() === "all"
          ? user.wallet
          : Number(args[0]);

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        await message.channel.send({
          embeds: [
            error(
              `Uso correcto: \`${prefix}deposit <cantidad>\``
            )
          ]
        });

        return;
      }

      if (
        amount > user.wallet
      ) {
        await message.channel.send({
          embeds: [
            error(
              "No tienes suficiente dinero en la billetera."
            )
          ]
        });

        return;
      }

      user.wallet -= amount;
      user.bank += amount;

      saveData();

      await message.channel.send({
        embeds: [
          success(
            `🏦 Depositaste **${money(amount)}** en el banco.`
          )
        ]
      });

      return;
    }

    // ========================================================
    // 🏧 WITHDRAW
    // ========================================================

    if (
      command === "withdraw" ||
      command === "with"
    ) {
      const amount =
        args[0]?.toLowerCase() === "all"
          ? user.bank
          : Number(args[0]);

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        await message.channel.send({
          embeds: [
            error(
              `Uso correcto: \`${prefix}withdraw <cantidad>\``
            )
          ]
        });

        return;
      }

      if (
        amount > user.bank
      ) {
        await message.channel.send({
          embeds: [
            error(
              "No tienes suficiente dinero en el banco."
            )
          ]
        });

        return;
      }

      user.bank -= amount;
      user.wallet += amount;

      saveData();

      await message.channel.send({
        embeds: [
          success(
            `🏧 Retiraste **${money(amount)}** del banco.`
          )
        ]
      });

      return;
    }

    // ========================================================
    // 💸 PAY / GIVE
    // ========================================================

    if (
      command === "pay" ||
      command === "give"
    ) {
      const target =
        message.mentions.users.first();

      const amount =
        Number(args[1]);

      if (
        !target ||
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        await message.channel.send({
          embeds: [
            error(
              `Uso correcto: \`${prefix}${command} @usuario <cantidad>\``
            )
          ]
        });

        return;
      }

      if (
        target.bot ||
        target.id === message.author.id
      ) {
        await message.channel.send({
          embeds: [
            error(
              "No puedes realizar ese pago."
            )
          ]
        });

        return;
      }

      if (
        amount > user.wallet
      ) {
        await message.channel.send({
          embeds: [
            error(
              "No tienes suficiente dinero."
            )
          ]
        });

        return;
      }

      const targetData =
        getUserData(target.id);

      user.wallet -= amount;
      targetData.wallet += amount;

      saveData();

      await message.channel.send({
        embeds: [
          success(
            `💸 ${message.author} envió **${money(amount)}** a ${target}.`
          )
        ]
      });

      return;
    }

    // ========================================================
    // 🎰 SLOTS
    // ========================================================

    if (command === "slots") {
      const remaining =
        checkCooldown(
          message.author.id,
          "slots",
          5000
        );

      if (remaining) {
        await message.channel.send({
          embeds: [
            error(
              `⏳ Espera **${cooldownText(remaining)}**.`
            )
          ]
        });

        return;
      }

      const symbols = [
        "🍒",
        "🍋",
        "🍇",
        "🍉",
        "⭐",
        "💎"
      ];

      const a =
        randomChoice(symbols);

      const b =
        randomChoice(symbols);

      const c =
        randomChoice(symbols);

      let reward = 0;

      if (
        a === b &&
        b === c
      ) {
        reward = 500;
      } else if (
        a === b ||
        b === c ||
        a === c
      ) {
        reward = 100;
      }

      user.wallet += reward;

      saveData();

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 🎰 SLOTS ══╗",
            [
              `🎰 **${a} │ ${b} │ ${c}**`,
              "",
              reward
                ? `🎉 Ganaste **${money(reward)}**`
                : "💔 No ganaste esta vez."
            ].join("\n")
          )
        ]
      });

      return;
    }

    // ========================================================
    // 🪙 COINFLIP
    // ========================================================

    if (command === "coinflip") {
      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 🪙 COINFLIP ══╗",
            `Resultado: **${randomChoice(
              coinSides
            )}**`
          )
        ]
      });

      return;
    }

    // ========================================================
    // 🎲 DICE / ROLL
    // ========================================================

    if (
      command === "dice" ||
      command === "roll"
    ) {
      const result =
        random(1, 6);

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 🎲 DADO ══╗",
            `🎲 Has sacado un **${result}**.`
          )
        ]
      });

      return;
    }

    // ========================================================
    // 🎱 8BALL
    // ========================================================

    if (command === "8ball") {
      const answers = [
        "✨ Sí.",
        "🌌 Definitivamente.",
        "💫 Probablemente.",
        "🤔 Puede ser.",
        "🌙 No estoy seguro.",
        "❌ No.",
        "🚫 Definitivamente no."
      ];

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 🎱 8BALL ══╗",
            randomChoice(answers)
          )
        ]
      });

      return;
    }

    // ========================================================
    // ✂️ RPS
    // ========================================================

    if (
      command === "rps" ||
      command === "ppt"
    ) {
      const choices = [
        "piedra",
        "papel",
        "tijera"
      ];

      const player =
        args[0]?.toLowerCase();

      if (
        !choices.includes(player)
      ) {
        await message.channel.send({
          embeds: [
            error(
              `Usa: \`${prefix}rps piedra\`, \`${prefix}rps papel\` o \`${prefix}rps tijera\`.`
            )
          ]
        });

        return;
      }

      const bot =
        randomChoice(choices);

      let result;

      if (player === bot) {
        result = "🤝 Empate.";
      } else if (
        (
          player === "piedra" &&
          bot === "tijera"
        ) ||
        (
          player === "papel" &&
          bot === "piedra"
        ) ||
        (
          player === "tijera" &&
          bot === "papel"
        )
      ) {
        result = "🎉 ¡Ganaste!";
      } else {
        result = "💔 Perdiste.";
      }

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ ✂️ PIEDRA PAPEL TIJERA ══╗",
            [
              `👤 Tú: **${player}**`,
              `🤖 Mati: **${bot}**`,
              "",
              result
            ].join("\n")
          )
        ]
      });

      return;
    }

    // ========================================================
    // 🎯 CHOOSE
    // ========================================================

    if (command === "choose") {
      if (!args.length) {
        await message.channel.send({
          embeds: [
            error(
              `Uso: \`${prefix}choose opción1 | opción2\``
            )
          ]
        });

        return;
      }

      const options =
        args.join(" ")
          .split("|")
          .map(
            x => x.trim()
          )
          .filter(Boolean);

      if (
        options.length < 2
      ) {
        await message.channel.send({
          embeds: [
            error(
              "Necesitas al menos 2 opciones."
            )
          ]
        });

        return;
      }

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 🎯 CHOOSE ══╗",
            `🎯 He elegido: **${randomChoice(options)}**`
          )
        ]
      });

      return;
    }

    // ========================================================
    // ⭐ LEVEL
    // ========================================================

    if (
      command === "level" ||
      command === "rank" ||
      command === "xp" ||
      command === "mylevel" ||
      command === "myxp"
    ) {
      const required =
        user.level * 100;

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ ⭐ NIVEL ══╗",
            [
              `👤 Usuario: ${message.author}`,
              `⭐ Nivel: **${user.level}**`,
              `✨ XP: **${user.xp}/${required}**`,
              `📈 Falta: **${Math.max(
                0,
                required - user.xp
              )} XP**`
            ].join("\n")
          )
        ]
      });

      return;
    }

    // ========================================================
    // 📊 PROGRESS
    // ========================================================

    if (
      command === "progress" ||
      command === "progressbar"
    ) {
      const required =
        user.level * 100;

      const percentage =
        Math.min(
          100,
          Math.floor(
            (user.xp / required) *
            100
          )
        );

      const filled =
        Math.floor(
          percentage / 10
        );

      const bar =
        "█".repeat(filled) +
        "░".repeat(10 - filled);

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 📊 PROGRESO ══╗",
            [
              `⭐ Nivel: **${user.level}**`,
              `✨ XP: **${user.xp}/${required}**`,
              "",
              `▰ ${bar} **${percentage}%**`
            ].join("\n")
          )
        ]
      });

      return;
    }

    // ========================================================
    // 🧹 CLEAR
    // ========================================================

    if (
      command === "clear" ||
      command === "purge"
    ) {
      if (
        !message.member.permissions.has(
          PermissionsBitField.Flags.ManageMessages
        )
      ) {
        await message.channel.send({
          embeds: [
            error(
              "Necesitas el permiso **Gestionar mensajes**."
            )
          ]
        });

        return;
      }

      const amount =
        Math.min(
          Math.max(
            parseInt(args[0]) || 1,
            1
          ),
          100
        );

      const deleted =
        await message.channel.bulkDelete(
          amount + 1,
          true
        ).catch(() => null);

      if (!deleted) {
        await message.channel.send({
          embeds: [
            error(
              "No pude eliminar los mensajes."
            )
          ]
        });

        return;
      }

      const msg =
        await message.channel.send({
          embeds: [
            success(
              `🗑️ Se eliminaron **${Math.max(
                0,
                deleted.size - 1
              )}** mensajes.`
            )
          ]
        });

      setTimeout(() => {
        msg.delete().catch(() => {});
      }, 5000);

      await sendLog(
        message.guild,
        "MENSAJES ELIMINADOS",
        [
          `👤 Moderador: ${message.author}`,
          `📁 Canal: ${message.channel}`,
          `🗑️ Cantidad: **${Math.max(
            0,
            deleted.size - 1
          )}**`
        ].join("\n")
      );

      return;
    }

    // ========================================================
    // 🛡️ KICK
    // ========================================================

    if (command === "kick") {
      if (!isAdmin(message.member)) {
        await message.channel.send({
          embeds: [
            error(
              "Solo los Administradores pueden utilizar este comando."
            )
          ]
        });

        return;
      }

      const target =
        message.mentions.members.first();

      if (!target) {
        await message.channel.send({
          embeds: [
            error(
              `Uso: \`${prefix}kick @usuario [razón]\``
            )
          ]
        });

        return;
      }

      if (!target.kickable) {
        await message.channel.send({
          embeds: [
            error(
              "No puedo expulsar a ese usuario."
            )
          ]
        });

        return;
      }

      const reason =
        args.slice(1).join(" ") ||
        "Sin razón especificada";

      await target.kick(reason);

      await message.channel.send({
        embeds: [
          success(
            `👢 ${target.user.tag} fue expulsado.\n📝 Razón: **${reason}**`
          )
        ]
      });

      await sendLog(
        message.guild,
        "USUARIO EXPULSADO",
        [
          `👤 Usuario: ${target.user.tag}`,
          `🛡️ Moderador: ${message.author}`,
          `📝 Razón: ${reason}`
        ].join("\n")
      );

      return;
    }

    // ========================================================
    // 🔨 BAN
    // ========================================================

    if (command === "ban") {
      if (!isAdmin(message.member)) {
        await message.channel.send({
          embeds: [
            error(
              "Solo los Administradores pueden utilizar este comando."
            )
          ]
        });

        return;
      }

      const target =
        message.mentions.members.first();

      if (!target) {
        await message.channel.send({
          embeds: [
            error(
              `Uso: \`${prefix}ban @usuario [razón]\``
            )
          ]
        });

        return;
      }

      if (!target.bannable) {
        await message.channel.send({
          embeds: [
            error(
              "No puedo banear a ese usuario."
            )
          ]
        });

        return;
      }

      const reason =
        args.slice(1).join(" ") ||
        "Sin razón especificada";

      await target.ban({
        reason
      });

      await message.channel.send({
        embeds: [
          success(
            `🔨 ${target.user.tag} fue baneado.\n📝 Razón: **${reason}**`
          )
        ]
      });

      await sendLog(
        message.guild,
        "USUARIO BANEADO",
        [
          `👤 Usuario: ${target.user.tag}`,
          `🛡️ Moderador: ${message.author}`,
          `📝 Razón: ${reason}`
        ].join("\n")
      );

      return;
    }

    // ========================================================
    // ⏳ TIMEOUT / MUTE
    // ========================================================

    if (
      command === "timeout" ||
      command === "mute"
    ) {
      if (!isAdmin(message.member)) {
        await message.channel.send({
          embeds: [
            error(
              "Solo los Administradores pueden utilizar este comando."
            )
          ]
        });

        return;
      }

      const target =
        message.mentions.members.first();

      if (!target) {
        await message.channel.send({
          embeds: [
            error(
              `Uso: \`${prefix}timeout @usuario [minutos]\``
            )
          ]
        });

        return;
      }

      const minutes =
        Math.min(
          Math.max(
            Number(args[1]) || 10,
            1
          ),
          40320
        );

      if (!target.moderatable) {
        await message.channel.send({
          embeds: [
            error(
              "No puedo aplicar timeout a ese usuario."
            )
          ]
        });

        return;
      }

      await target.timeout(
        minutes * 60 * 1000,
        `Moderador: ${message.author.tag}`
      );

      await message.channel.send({
        embeds: [
          success(
            `🔇 ${target} recibió un timeout de **${minutes} minutos**.`
          )
        ]
      });

      await sendLog(
        message.guild,
        "TIMEOUT",
        [
          `👤 Usuario: ${target.user.tag}`,
          `🛡️ Moderador: ${message.author}`,
          `⏳ Duración: **${minutes} minutos**`
        ].join("\n")
      );

      return;
    }

    // ========================================================
    // 🔊 UNTIMEOUT / UNMUTE
    // ========================================================

    if (
      command === "untimeout" ||
      command === "unmute"
    ) {
      if (!isAdmin(message.member)) {
        await message.channel.send({
          embeds: [
            error(
              "Solo los Administradores pueden utilizar este comando."
            )
          ]
        });

        return;
      }

      const target =
        message.mentions.members.first();

      if (!target) {
        await message.channel.send({
          embeds: [
            error(
              `Uso: \`${prefix}${command} @usuario\``
            )
          ]
        });

        return;
      }

      await target.timeout(
        null
      ).catch(() => {});

      await message.channel.send({
        embeds: [
          success(
            `🔊 Se retiró el timeout de ${target}.`
          )
        ]
      });

      return;
    }

    // ========================================================
    // ⚠️ WARN
    // ========================================================

    if (command === "warn") {
      if (!isAdmin(message.member)) {
        await message.channel.send({
          embeds: [
            error(
              "Solo los Administradores pueden utilizar este comando."
            )
          ]
        });

        return;
      }

      const target =
        message.mentions.members.first();

      if (!target) {
        await message.channel.send({
          embeds: [
            error(
              `Uso: \`${prefix}warn @usuario [razón]\``
            )
          ]
        });

        return;
      }

      const reason =
        args.slice(1).join(" ") ||
        "Sin razón especificada";

      const targetData =
        getUserData(target.id);

      targetData.warns++;

      saveData();

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ ⚠️ WARN ══╗",
            [
              `👤 Usuario: ${target}`,
              `⚠️ Advertencias: **${targetData.warns}**`,
              `📝 Razón: **${reason}**`
            ].join("\n")
          )
        ]
      });

      await sendLog(
        message.guild,
        "ADVERTENCIA",
        [
          `👤 Usuario: ${target.user.tag}`,
          `🛡️ Moderador: ${message.author}`,
          `⚠️ Warns: **${targetData.warns}**`,
          `📝 Razón: ${reason}`
        ].join("\n")
      );

      return;
    }

    // ========================================================
    // ❌ WARNS
    // ========================================================

    if (
      command === "clearwarns" ||
      command === "unwarn" ||
      command === "resetwarns" ||
      command === "warns" ||
      command === "warnings" ||
      command === "checkwarns"
    ) {
      const adminCommands = [
        "clearwarns",
        "unwarn",
        "resetwarns"
      ];

      if (
        adminCommands.includes(command) &&
        !isAdmin(message.member)
      ) {
        await message.channel.send({
          embeds: [
            error(
              "Solo Administradores."
            )
          ]
        });

        return;
      }

      const target =
        message.mentions.members.first() ||
        message.member;

      const targetData =
        getUserData(target.id);

      if (
        command === "warns" ||
        command === "warnings" ||
        command === "checkwarns"
      ) {
        await message.channel.send({
          embeds: [
            makeEmbed(
              "╔══ ⚠️ ADVERTENCIAS ══╗",
              [
                `👤 Usuario: ${target}`,
                `⚠️ Warns: **${targetData.warns}**`
              ].join("\n")
            )
          ]
        });

        return;
      }

      if (command === "unwarn") {
        targetData.warns =
          Math.max(
            0,
            targetData.warns - 1
          );
      } else {
        targetData.warns = 0;
      }

      saveData();

      await message.channel.send({
        embeds: [
          success(
            `⚠️ Advertencias de ${target} actualizadas.\n📊 Warns: **${targetData.warns}**`
          )
        ]
      });

      return;
    }

    // ========================================================
    // 🔒 LOCK
    // ========================================================

    if (command === "lock") {
      if (!isAdmin(message.member)) {
        await message.channel.send({
          embeds: [
            error("Solo Administradores.")
          ]
        });

        return;
      }

      await message.channel.permissionOverwrites.edit(
        message.guild.roles.everyone,
        {
          SendMessages: false
        }
      );

      await message.channel.send({
        embeds: [
          success(
            "🔒 Este canal ha sido bloqueado."
          )
        ]
      });

      return;
    }

    // ========================================================
    // 🔓 UNLOCK
    // ========================================================

    if (command === "unlock") {
      if (!isAdmin(message.member)) {
        await message.channel.send({
          embeds: [
            error("Solo Administradores.")
          ]
        });

        return;
      }

      await message.channel.permissionOverwrites.edit(
        message.guild.roles.everyone,
        {
          SendMessages: null
        }
      );

      await message.channel.send({
        embeds: [
          success(
            "🔓 Este canal ha sido desbloqueado."
          )
        ]
      });

      return;
    }

    // ========================================================
    // 🐌 SLOWMODE
    // ========================================================

    if (command === "slowmode") {
      if (!isAdmin(message.member)) {
        await message.channel.send({
          embeds: [
            error("Solo Administradores.")
          ]
        });

        return;
      }

      const seconds =
        Math.min(
          Math.max(
            Number(args[0]) || 0,
            0
          ),
          21600
        );

      await message.channel.setRateLimitPerUser(
        seconds
      );

      await message.channel.send({
        embeds: [
          success(
            seconds
              ? `🐌 Slowmode establecido en **${seconds}s**.`
              : "🐌 Slowmode desactivado."
          )
        ]
      });

      return;
    }

    // ========================================================
    // 📝 NICK
    // ========================================================

    if (command === "nick") {
      if (!isAdmin(message.member)) {
        await message.channel.send({
          embeds: [
            error("Solo Administradores.")
          ]
        });

        return;
      }

      const target =
        message.mentions.members.first();

      const nickname =
        args.slice(1).join(" ");

      if (!target || !nickname) {
        await message.channel.send({
          embeds: [
            error(
              `Uso: \`${prefix}nick @usuario nuevo_nombre\``
            )
          ]
        });

        return;
      }

      await target.setNickname(
        nickname
      );

      await message.channel.send({
        embeds: [
          success(
            `🏷️ Nuevo nombre de ${target}: **${nickname}**`
          )
        ]
      });

      return;
    }

    // ========================================================
    // ⚙️ WELCOME
    // ========================================================

    if (
      command === "welcome" ||
      command === "welcomechannel"
    ) {
      if (!isAdmin(message.member)) {
        await message.channel.send({
          embeds: [
            error("Solo Administradores.")
          ]
        });

        return;
      }

      const channel =
        message.mentions.channels.first();

      if (!channel) {
        await message.channel.send({
          embeds: [
            error(
              `Uso: \`${prefix}welcome #canal\``
            )
          ]
        });

        return;
      }

      const config =
        getGuildData(
          message.guild.id
        );

      config.welcomeChannel =
        channel.id;

      config.welcomeEnabled =
        true;

      saveData();

      await message.channel.send({
        embeds: [
          success(
            `👋 Canal de bienvenida establecido en ${channel}.`
          )
        ]
      });

      await sendLog(
        message.guild,
        "CONFIGURACIÓN",
        `👋 Canal de bienvenida establecido en ${channel} por ${message.author}.`
      );

      return;
    }

    // ========================================================
    // 😭 GOODBYE
    // ========================================================

    if (
      command === "goodbye" ||
      command === "goodbyechannel"
    ) {
      if (!isAdmin(message.member)) {
        await message.channel.send({
          embeds: [
            error("Solo Administradores.")
          ]
        });

        return;
      }

      const channel =
        message.mentions.channels.first();

      if (!channel) {
        await message.channel.send({
          embeds: [
            error(
              `Uso: \`${prefix}goodbye #canal\``
            )
          ]
        });

        return;
      }

      const config =
        getGuildData(
          message.guild.id
        );

      config.goodbyeChannel =
        channel.id;

      config.goodbyeEnabled =
        true;

      saveData();

      await message.channel.send({
        embeds: [
          success(
            `😭 Canal de despedidas establecido en ${channel}.`
          )
        ]
      });

      return;
    }

    // ========================================================
    // 📨 INVITES
    // ========================================================

    if (
      command === "invites" ||
      command === "invitechannel"
    ) {
      if (!isAdmin(message.member)) {
        await message.channel.send({
          embeds: [
            error("Solo Administradores.")
          ]
        });

        return;
      }

      const channel =
        message.mentions.channels.first();

      if (!channel) {
        await message.channel.send({
          embeds: [
            error(
              `Uso: \`${prefix}invites #canal\``
            )
          ]
        });

        return;
      }

      const config =
        getGuildData(
          message.guild.id
        );

      config.inviteChannel =
        channel.id;

      config.inviteEnabled =
        true;

      saveData();

      await message.channel.send({
        embeds: [
          success(
            `📨 Canal de invitaciones establecido en ${channel}.`
          )
        ]
      });

      return;
    }

    // ========================================================
    // 📜 LOGS
    // ========================================================

    if (
      command === "logs" ||
      command === "logchannel"
    ) {
      if (!isAdmin(message.member)) {
        await message.channel.send({
          embeds: [
            error("Solo Administradores.")
          ]
        });

        return;
      }

      const channel =
        message.mentions.channels.first();

      if (!channel) {
        await message.channel.send({
          embeds: [
            error(
              `Uso: \`${prefix}logs #canal\``
            )
          ]
        });

        return;
      }

      const config =
        getGuildData(
          message.guild.id
        );

      config.logChannel =
        channel.id;

      config.logsEnabled =
        true;

      saveData();

      await message.channel.send({
        embeds: [
          success(
            `📜 Canal de logs establecido en ${channel}.`
          )
        ]
      });

      return;
    }

    // ========================================================
    // 🟢 / 🔴 CONFIG ON/OFF
    // ========================================================

    const toggleConfig = {
      welcomeon: [
        "welcomeEnabled",
        true,
        "👋 Bienvenidas activadas."
      ],
      welcomeoff: [
        "welcomeEnabled",
        false,
        "👋 Bienvenidas desactivadas."
      ],
      goodbyeon: [
        "goodbyeEnabled",
        true,
        "😭 Despedidas activadas."
      ],
      goodbyeoff: [
        "goodbyeEnabled",
        false,
        "😭 Despedidas desactivadas."
      ],
      inviteson: [
        "inviteEnabled",
        true,
        "📨 Sistema de invitaciones activado."
      ],
      invitesoff: [
        "inviteEnabled",
        false,
        "📨 Sistema de invitaciones desactivado."
      ],
      logson: [
        "logsEnabled",
        true,
        "📜 Logs activados."
      ],
      logsoff: [
        "logsEnabled",
        false,
        "📜 Logs desactivados."
      ]
    };

    if (toggleConfig[command]) {
      if (!isAdmin(message.member)) {
        await message.channel.send({
          embeds: [
            error("Solo Administradores.")
          ]
        });

        return;
      }

      const config =
        getGuildData(
          message.guild.id
        );

      const [
        property,
        value,
        text
      ] = toggleConfig[command];

      config[property] = value;

      saveData();

      await message.channel.send({
        embeds: [
          success(text)
        ]
      });

      return;
    }

    // ========================================================
    // 🤖 AUTOROLE
    // ========================================================

    if (command === "autorole") {
      if (!isAdmin(message.member)) {
        await message.channel.send({
          embeds: [
            error("Solo Administradores.")
          ]
        });

        return;
      }

      const role =
        message.mentions.roles.first();

      if (!role) {
        await message.channel.send({
          embeds: [
            error(
              `Uso: \`${prefix}autorole @rol\``
            )
          ]
        });

        return;
      }

      const config =
        getGuildData(
          message.guild.id
        );

      config.autorole =
        role.id;

      saveData();

      await message.channel.send({
        embeds: [
          success(
            `🤖 Autorol establecido: ${role}`
          )
        ]
      });

      return;
    }

    // ========================================================
    // 🚫 AUTOROLE OFF
    // ========================================================

    if (command === "autoroleoff") {
      if (!isAdmin(message.member)) {
        await message.channel.send({
          embeds: [
            error("Solo Administradores.")
          ]
        });

        return;
      }

      const config =
        getGuildData(
          message.guild.id
        );

      config.autorole =
        null;

      saveData();

      await message.channel.send({
        embeds: [
          success(
            "🤖 Autorol desactivado."
          )
        ]
      });

      return;
    }

    // ========================================================
    // 🔧 PREFIX
    // ========================================================

    if (command === "prefix") {
      if (!isAdmin(message.member)) {
        await message.channel.send({
          embeds: [
            error("Solo Administradores.")
          ]
        });

        return;
      }

      const newPrefix =
        args[0];

      if (
        !newPrefix ||
        newPrefix.length > 5
      ) {
        await message.channel.send({
          embeds: [
            error(
              `Uso: \`${prefix}prefix <nuevo prefijo>\``
            )
          ]
        });

        return;
      }

      const config =
        getGuildData(
          message.guild.id
        );

      config.prefix =
        newPrefix;

      saveData();

      await message.channel.send({
        embeds: [
          success(
            `⚙️ El nuevo prefijo es **${newPrefix}**`
          )
        ]
      });

      return;
    }

    // ========================================================
    // 📢 SAY
    // ========================================================

    if (command === "say") {
      if (!isAdmin(message.member)) {
        await message.channel.send({
          embeds: [
            error("Solo Administradores.")
          ]
        });

        return;
      }

      const text =
        args.join(" ");

      if (!text) {
        await message.channel.send({
          embeds: [
            error(
              `Uso: \`${prefix}say <mensaje>\``
            )
          ]
        });

        return;
      }

      await message.delete()
        .catch(() => {});

      await message.channel.send({
        content: text
      });

      return;
    }

    // ========================================================
    // 📢 ANNOUNCE
    // ========================================================

    if (command === "announce") {
      if (!isAdmin(message.member)) {
        await message.channel.send({
          embeds: [
            error("Solo Administradores.")
          ]
        });

        return;
      }

      const text =
        args.join(" ");

      if (!text) {
        await message.channel.send({
          embeds: [
            error(
              `Uso: \`${prefix}announce <mensaje>\``
            )
          ]
        });

        return;
      }

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 📢 ANUNCIO ══╗",
            text
          )
        ]
      });

      return;
    }

    // ========================================================
    // 🧮 CALCULATOR
    // ========================================================

    if (command === "calculator") {
      const expression =
        args.join(" ");

      if (!expression) {
        await message.channel.send({
          embeds: [
            error(
              `Uso: \`${prefix}calculator 10 + 5\``
            )
          ]
        });

        return;
      }

      if (
        !/^[0-9+\-*/().%\s]+$/.test(
          expression
        )
      ) {
        await message.channel.send({
          embeds: [
            error(
              "Solo se permiten operaciones matemáticas básicas."
            )
          ]
        });

        return;
      }

      try {
        const result =
          Function(
            `"use strict"; return (${expression})`
          )();

        if (!Number.isFinite(result)) {
          throw new Error();
        }

        await message.channel.send({
          embeds: [
            makeEmbed(
              "╔══ 🧮 CALCULADORA ══╗",
              [
                `📥 Operación: \`${expression}\``,
                `📤 Resultado: **${result}**`
              ].join("\n")
            )
          ]
        });
      } catch {
        await message.channel.send({
          embeds: [
            error(
              "No pude calcular esa operación."
            )
          ]
        });
      }

      return;
    }

    // ========================================================
    // 🎲 RANDOM
    // ========================================================

    if (command === "random") {
      const min =
        Number(args[0]) || 1;

      const max =
        Number(args[1]) || 100;

      if (min >= max) {
        await message.channel.send({
          embeds: [
            error(
              "El mínimo debe ser menor que el máximo."
            )
          ]
        });

        return;
      }

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 🎲 RANDOM ══╗",
            `🎲 Resultado: **${random(
              min,
              max
            )}**`
          )
        ]
      });

      return;
    }

    // ========================================================
    // 😎 GREET
    // ========================================================

    if (command === "greet") {
      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 👋 SALUDO ══╗",
            "Hola\nBienvenido"
          )
        ]
      });

      return;
    }

    // ========================================================
    // 😂 JOKE
    // ========================================================

    if (command === "joke") {
      const jokes = [
        "¿Qué hace una abeja en el gimnasio? ¡Zum-ba!",
        "¿Qué le dijo un techo a otro? Techo de menos.",
        "¿Cuál es el colmo de un jardinero? Que siempre lo dejen plantado.",
        "¿Qué hace una computadora cuando tiene frío? Cierra Windows."
      ];

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 😂 CHISTE ══╗",
            randomChoice(jokes)
          )
        ]
      });

      return;
    }

    // ========================================================
    // 💗 COMPLIMENT
    // ========================================================

    if (command === "compliment") {
      const target =
        message.mentions.users.first();

      const compliments = [
        "✨ Tienes una energía increíble.",
        "🌌 Eres una persona genial.",
        "💗 Tu presencia alegra el servidor.",
        "⭐ Hoy estás brillando."
      ];

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 💗 COMPLIMENTO ══╗",
            `${target || message.author} — ${randomChoice(
              compliments
            )}`
          )
        ]
      });

      return;
    }

    // ========================================================
    // 🤗 HUG
    // ========================================================

    if (command === "hug") {
      const target =
        message.mentions.users.first();

      if (!target) {
        await message.channel.send({
          embeds: [
            error(
              `Menciona a alguien: \`${prefix}hug @usuario\``
            )
          ]
        });

        return;
      }

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 🤗 HUG ══╗",
            `🤗 ${message.author} le manda un abrazo a ${target}.`
          )
        ]
      });

      return;
    }

    // ========================================================
    // 👋 WAVE
    // ========================================================

    if (command === "wave") {
      const target =
        message.mentions.users.first();

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 👋 WAVE ══╗",
            `👋 ${message.author} saluda a ${
              target || "todos"
            }.`
          )
        ]
      });

      return;
    }

    // ========================================================
    // 💃 DANCE
    // ========================================================

    if (command === "dance") {
      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 💃 DANCE ══╗",
            `💃 ${message.author} está bailando.`
          )
        ]
      });

      return;
    }

    // ========================================================
    // 🌅 GOOD MORNING
    // ========================================================

    if (command === "goodmorning") {
      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 🌅 GOOD MORNING ══╗",
            "🌅 ¡Buenos días! Que tengas un excelente día."
          )
        ]
      });

      return;
    }

    // ========================================================
    // 🌙 GOOD NIGHT
    // ========================================================

    if (command === "goodnight") {
      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 🌙 GOOD NIGHT ══╗",
            "🌙 ¡Buenas noches! Que descanses."
          )
        ]
      });

      return;
    }

    // ========================================================
    // 🏆 TOP XP
    // ========================================================

    if (
      command === "top" ||
      command === "leaderboardxp" ||
      command === "leveltop"
    ) {
      const ranking =
        Object.entries(
          data.users
        )
          .sort((a, b) => {
            const A =
              data.users[a[0]];

            const B =
              data.users[b[0]];

            return (
              (B.level * 100 + B.xp) -
              (A.level * 100 + A.xp)
            );
          })
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
          message.guild.members.cache.get(
            id
          );

        lines.push(
          `**${i + 1}.** ${
            member
              ? member.user.tag
              : `<@${id}>`
          } — Nivel **${info.level}** • ${info.xp} XP`
        );
      }

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 🏆 TOP NIVELES ══╗",
            lines.join("\n") ||
            "Todavía no hay datos."
          )
        ]
      });

      return;
    }

    // ========================================================
    // 💰 RICHEST
    // ========================================================

    if (
      command === "richest" ||
      command === "networth"
    ) {
      const ranking =
        Object.entries(
          data.users
        )
          .sort((a, b) => {
            const A =
              data.users[a[0]];

            const B =
              data.users[b[0]];

            return (
              (B.wallet + B.bank) -
              (A.wallet + A.bank)
            );
          })
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
          message.guild.members.cache.get(
            id
          );

        lines.push(
          `**${i + 1}.** ${
            member
              ? member.user.tag
              : `<@${id}>`
          } — **${money(
            info.wallet +
            info.bank
          )}**`
        );
      }

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 💰 MÁS RICOS ══╗",
            lines.join("\n") ||
            "Todavía no hay datos."
          )
        ]
      });

      return;
    }

    // ========================================================
    // 🛠️ CONFIG
    // ========================================================

    if (
      command === "config" ||
      command === "serverconfig"
    ) {
      if (!isAdmin(message.member)) {
        await message.channel.send({
          embeds: [
            error("Solo Administradores.")
          ]
        });

        return;
      }

      const config =
        getGuildData(
          message.guild.id
        );

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ ⚙️ CONFIGURACIÓN ══╗",
            [
              `👋 Bienvenidas: ${
                config.welcomeEnabled
                  ? "🟢 Activadas"
                  : "🔴 Desactivadas"
              }`,
              `😭 Despedidas: ${
                config.goodbyeEnabled
                  ? "🟢 Activadas"
                  : "🔴 Desactivadas"
              }`,
              `📨 Invitaciones: ${
                config.inviteEnabled
                  ? "🟢 Activadas"
                  : "🔴 Desactivadas"
              }`,
              `📜 Logs: ${
                config.logsEnabled
                  ? "🟢 Activados"
                  : "🔴 Desactivados"
              }`,
              `🤖 Autorol: ${
                config.autorole
                  ? `<@&${config.autorole}>`
                  : "No configurado"
              }`,
              `🔤 Prefijo: \`${config.prefix}\``
            ].join("\n")
          )
        ]
      });

      return;
    }

    // ========================================================
    // 🧩 NUEVOS COMANDOS PÚBLICOS
    // ========================================================

    if (
      command === "date" ||
      command === "dateutil"
    ) {
      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 📅 FECHA ══╗",
            `📅 ${new Date().toLocaleDateString("es-ES", {
              dateStyle: "full"
            })}`
          )
        ]
      });

      return;
    }

    if (
      command === "time" ||
      command === "servertime" ||
      command === "timeutil"
    ) {
      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 🕐 HORA ══╗",
            `🕐 ${new Date().toLocaleTimeString("es-ES")}`
          )
        ]
      });

      return;
    }

    if (
      command === "guildid"
    ) {
      await message.channel.send({
        embeds: [
          success(
            `🆔 ID del servidor:\n\`${message.guild.id}\``
          )
        ]
      });

      return;
    }

    if (
      command === "botid"
    ) {
      await message.channel.send({
        embeds: [
          success(
            `🤖 ID del bot:\n\`${client.user.id}\``
          )
        ]
      });

      return;
    }

    if (
      command === "botavatar"
    ) {
      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 🤖 AVATAR DEL BOT ══╗",
            `[🖼️ Abrir avatar](${client.user.displayAvatarURL({
              size: 4096
            })})`
          ).setImage(
            client.user.displayAvatarURL({
              size: 1024
            })
          )
        ]
      });

      return;
    }

    if (
      command === "servericon"
    ) {
      const icon =
        message.guild.iconURL({
          size: 4096
        });

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 🏠 ICONO ══╗",
            icon
              ? `[🖼️ Ver icono](${icon})`
              : "Este servidor no tiene icono."
          ).setImage(
            icon || null
          )
        ]
      });

      return;
    }

    if (
      command === "servercreated" ||
      command === "serverage"
    ) {
      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 📅 ANTIGÜEDAD ══╗",
            [
              `🏠 Servidor: **${message.guild.name}**`,
              `📅 Creado: ${formatDate(
                message.guild.createdAt
              )}`
            ].join("\n")
          )
        ]
      });

      return;
    }

    if (
      command === "channelinfo"
    ) {
      const channel =
        message.mentions.channels.first() ||
        message.channel;

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 📁 CANAL ══╗",
            [
              `📁 Canal: ${channel}`,
              `🆔 ID: \`${channel.id}\``,
              `📌 Nombre: **${channel.name}**`,
              `📂 Tipo: **${channel.type}**`
            ].join("\n")
          )
        ]
      });

      return;
    }

    if (
      command === "roleinfo"
    ) {
      const role =
        message.mentions.roles.first();

      if (!role) {
        await message.channel.send({
          embeds: [
            error(
              `Uso: \`${prefix}roleinfo @rol\``
            )
          ]
        });

        return;
      }

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 🎭 ROLE INFO ══╗",
            [
              `🎭 Rol: ${role}`,
              `🆔 ID: \`${role.id}\``,
              `👥 Miembros: **${role.members.size}**`,
              `📌 Posición: **${role.position}**`
            ].join("\n")
          )
        ]
      });

      return;
    }

    if (
      command === "textchannels"
    ) {
      const amount =
        message.guild.channels.cache.filter(
          c =>
            c.type === ChannelType.GuildText
        ).size;

      await message.channel.send({
        embeds: [
          success(
            `💬 Canales de texto: **${amount}**`
          )
        ]
      });

      return;
    }

    if (
      command === "voicechannels"
    ) {
      const amount =
        message.guild.channels.cache.filter(
          c =>
            c.type === ChannelType.GuildVoice
        ).size;

      await message.channel.send({
        embeds: [
          success(
            `🔊 Canales de voz: **${amount}**`
          )
        ]
      });

      return;
    }

    if (
      command === "categories"
    ) {
      const amount =
        message.guild.channels.cache.filter(
          c =>
            c.type === ChannelType.GuildCategory
        ).size;

      await message.channel.send({
        embeds: [
          success(
            `📂 Categorías: **${amount}**`
          )
        ]
      });

      return;
    }

    if (
      command === "channelcount"
    ) {
      await message.channel.send({
        embeds: [
          success(
            `📁 Canales totales: **${message.guild.channels.cache.size}**`
          )
        ]
      });

      return;
    }

    if (
      command === "rolelist"
    ) {
      const roles =
        message.guild.roles.cache
          .filter(
            r =>
              r.id !== message.guild.id
          )
          .map(
            r =>
              `• ${r}`
          )
          .slice(0, 50);

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 🎭 LISTA DE ROLES ══╗",
            roles.join("\n") ||
            "No hay roles."
          )
        ]
      });

      return;
    }

    if (
      command === "emojis"
    ) {
      const emojis =
        message.guild.emojis.cache
          .map(
            e =>
              e.toString()
          )
          .slice(0, 100);

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 😀 EMOJIS ══╗",
            emojis.join(" ") ||
            "No hay emojis."
          )
        ]
      });

      return;
    }

    if (
      command === "online" ||
      command === "humans" ||
      command === "bots"
    ) {
      const members =
        message.guild.members.cache;

      let amount = 0;

      if (command === "online") {
        amount =
          members.filter(
            m =>
              m.presence?.status &&
              m.presence.status !== "offline"
          ).size;
      }

      if (command === "humans") {
        amount =
          members.filter(
            m =>
              !m.user.bot
          ).size;
      }

      if (command === "bots") {
        amount =
          members.filter(
            m =>
              m.user.bot
          ).size;
      }

      await message.channel.send({
        embeds: [
          success(
            `👥 Resultado: **${amount}**`
          )
        ]
      });

      return;
    }

    if (
      command === "owner"
    ) {
      const owner =
        await message.guild.fetchOwner();

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 👑 OWNER ══╗",
            `👑 Propietario: ${owner}`
          )
        ]
      });

      return;
    }

    if (
      command === "botinfo" ||
      command === "profile"
    ) {
      // El comando profile se maneja aquí como perfil personal.
      if (command === "profile") {
        await message.channel.send({
          embeds: [
            makeEmbed(
              "╔══ 👤 PERFIL ══╗",
              [
                `👤 Usuario: ${message.author}`,
                `⭐ Nivel: **${user.level}**`,
                `✨ XP: **${user.xp}**`,
                `💰 Dinero: **${money(
                  user.wallet
                )}**`
              ].join("\n")
            )
          ]
        });

        return;
      }
    }

    if (
      command === "date" ||
      command === "timestamp"
    ) {
      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ ⏱️ TIMESTAMP ══╗",
            `🕐 ${formatDate(new Date())}`
          )
        ]
      });

      return;
    }

    if (
      command === "text"
    ) {
      const text =
        args.join(" ");

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 📝 TEXTO ══╗",
            text || "Escribe un texto."
          )
        ]
      });

      return;
    }

    if (
      command === "count"
    ) {
      await message.channel.send({
        embeds: [
          success(
            `🔢 Has escrito **${args.length}** argumentos.`
          )
        ]
      });

      return;
    }

    if (
      command === "mention"
    ) {
      const target =
        message.mentions.users.first() ||
        message.author;

      await message.channel.send({
        embeds: [
          success(
            `📣 Mención: ${target}`
          )
        ]
      });

      return;
    }

    if (
      command === "rolecount"
    ) {
      await message.channel.send({
        embeds: [
          success(
            `🎭 Roles: **${message.guild.roles.cache.size - 1}**`
          )
        ]
      });

      return;
    }

    if (
      command === "botping"
    ) {
      await message.channel.send({
        embeds: [
          success(
            `💓 API Ping: **${Math.round(
              client.ws.ping
            )}ms**`
          )
        ]
      });

      return;
    }

    if (
      command === "memberlist"
    ) {
      const list =
        message.guild.members.cache
          .map(
            m =>
              `• ${m.user.tag}`
          )
          .slice(0, 50);

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 👥 MIEMBROS ══╗",
            list.join("\n") ||
            "No hay miembros."
          )
        ]
      });

      return;
    }

    if (
      command === "findmember"
    ) {
      const query =
        args.join(" ").toLowerCase();

      if (!query) {
        await message.channel.send({
          embeds: [
            error(
              `Uso: \`${prefix}findmember nombre\``
            )
          ]
        });

        return;
      }

      const found =
        message.guild.members.cache
          .filter(
            m =>
              m.user.username
                .toLowerCase()
                .includes(query) ||
              m.user.tag
                .toLowerCase()
                .includes(query)
          )
          .first();

      await message.channel.send({
        embeds: [
          found
            ? success(
                `👤 Encontrado: ${found}`
              )
            : error(
                "No encontré ese miembro."
              )
        ]
      });

      return;
    }

    // ========================================================
    // 💰 NUEVOS COMANDOS ECONOMÍA
    // ========================================================

    if (
      command === "pocket" ||
      command === "walletbalance"
    ) {
      await message.channel.send({
        embeds: [
          success(
            `💰 Billetera: **${money(user.wallet)}**`
          )
        ]
      });

      return;
    }

    if (
      command === "bankbalance"
    ) {
      await message.channel.send({
        embeds: [
          success(
            `🏦 Banco: **${money(user.bank)}**`
          )
        ]
      });

      return;
    }

    if (
      command === "totalmoney"
    ) {
      await message.channel.send({
        embeds: [
          success(
            `💎 Patrimonio total: **${money(
              user.wallet +
              user.bank
            )}**`
          )
        ]
      });

      return;
    }

    if (
      command === "mystats" ||
      command === "economystats" ||
      command === "economyinfo"
    ) {
      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 💰 ECONOMÍA ══╗",
            [
              `💰 Billetera: **${money(user.wallet)}**`,
              `🏦 Banco: **${money(user.bank)}**`,
              `💎 Total: **${money(
                user.wallet +
                user.bank
              )}**`
            ].join("\n")
          )
        ]
      });

      return;
    }

    if (
      command === "salary" ||
      command === "bonus" ||
      command === "income"
    ) {
      const amount =
        random(100, 300);

      user.wallet += amount;

      saveData();

      await message.channel.send({
        embeds: [
          success(
            `💵 Recibiste **${money(amount)}**.`
          )
        ]
      });

      return;
    }

    if (
      command === "expenses"
    ) {
      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 💸 GASTOS ══╗",
            "📊 Tus gastos registrados actualmente: **0 💰**"
          )
        ]
      });

      return;
    }

    if (
      command === "depositall"
    ) {
      if (user.wallet <= 0) {
        await message.channel.send({
          embeds: [
            error(
              "No tienes dinero en la billetera."
            )
          ]
        });

        return;
      }

      const amount =
        user.wallet;

      user.wallet = 0;
      user.bank += amount;

      saveData();

      await message.channel.send({
        embeds: [
          success(
            `🏦 Depositaste todo: **${money(amount)}**`
          )
        ]
      });

      return;
    }

    if (
      command === "withdrawall"
    ) {
      if (user.bank <= 0) {
        await message.channel.send({
          embeds: [
            error(
              "No tienes dinero en el banco."
            )
          ]
        });

        return;
      }

      const amount =
        user.bank;

      user.bank = 0;
      user.wallet += amount;

      saveData();

      await message.channel.send({
        embeds: [
          success(
            `🏧 Retiraste todo: **${money(amount)}**`
          )
        ]
      });

      return;
    }

    if (
      command === "cooldowns"
    ) {
      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ ⏳ COOLDOWNS ══╗",
            [
              "💼 Work: 30 segundos",
              "🥺 Beg: 1 minuto",
              "😈 Crime: 2 minutos",
              "🎰 Slots: 5 segundos"
            ].join("\n")
          )
        ]
      });

      return;
    }

    if (
      command === "claim" ||
      command === "stash"
    ) {
      const amount =
        random(50, 150);

      user.wallet += amount;

      saveData();

      await message.channel.send({
        embeds: [
          success(
            `🎁 Recibiste **${money(amount)}**.`
          )
        ]
      });

      return;
    }

    if (
      command === "spend"
    ) {
      const amount =
        Number(args[0]);

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        await message.channel.send({
          embeds: [
            error(
              `Uso: \`${prefix}spend <cantidad>\``
            )
          ]
        });

        return;
      }

      if (amount > user.wallet) {
        await message.channel.send({
          embeds: [
            error(
              "No tienes suficiente dinero."
            )
          ]
        });

        return;
      }

      user.wallet -= amount;

      saveData();

      await message.channel.send({
        embeds: [
          success(
            `🛍️ Gastaste **${money(amount)}**.`
          )
        ]
      });

      return;
    }

    if (
      command === "gift"
    ) {
      const target =
        message.mentions.users.first();

      const amount =
        Number(args[1]);

      if (
        !target ||
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        await message.channel.send({
          embeds: [
            error(
              `Uso: \`${prefix}gift @usuario cantidad\``
            )
          ]
        });

        return;
      }

      if (amount > user.wallet) {
        await message.channel.send({
          embeds: [
            error(
              "No tienes suficiente dinero."
            )
          ]
        });

        return;
      }

      const targetData =
        getUserData(target.id);

      user.wallet -= amount;
      targetData.wallet += amount;

      saveData();

      await message.channel.send({
        embeds: [
          success(
            `🎁 Regalaste **${money(amount)}** a ${target}.`
          )
        ]
      });

      return;
    }

    if (
      command === "cashflow"
    ) {
      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 💸 CASHFLOW ══╗",
            `💰 Dinero disponible: **${money(
              user.wallet +
              user.bank
            )}**`
          )
        ]
      });

      return;
    }

    if (
      command === "moneyrank"
    ) {
      const ranking =
        Object.entries(data.users)
          .sort(
            (a, b) =>
              (
                b[1].wallet +
                b[1].bank
              ) -
              (
                a[1].wallet +
                a[1].bank
              )
          )
          .slice(0, 10);

      const lines =
        ranking.map(
          ([id, info], i) =>
            `**${i + 1}.** <@${id}> — ${money(
              info.wallet +
              info.bank
            )}`
        );

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 🏆 MONEY RANK ══╗",
            lines.join("\n") ||
            "Sin datos."
          )
        ]
      });

      return;
    }

    // ========================================================
    // 🎮 NUEVOS COMANDOS DIVERSIÓN
    // ========================================================

    if (
      command === "magic" ||
      command === "quote" ||
      command === "fortune" ||
      command === "fortune2"
    ) {
      const phrases = [
        "✨ Todo puede mejorar.",
        "🌌 Hoy puede ser un buen día.",
        "💫 Sigue adelante.",
        "🧡 Algo interesante puede suceder pronto.",
        "🩷 Nunca sabes qué puede pasar."
      ];

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 🔮 MAGIC ══╗",
            randomChoice(phrases)
          )
        ]
      });

      return;
    }

    if (
      command === "pickone"
    ) {
      if (args.length < 2) {
        await message.channel.send({
          embeds: [
            error(
              `Uso: \`${prefix}pickone uno dos tres\``
            )
          ]
        });

        return;
      }

      await message.channel.send({
        embeds: [
          success(
            `🎯 Elegí: **${randomChoice(args)}**`
          )
        ]
      });

      return;
    }

    if (
      command === "coin"
    ) {
      await message.channel.send({
        embeds: [
          success(
            `🪙 ${randomChoice(coinSides)}`
          )
        ]
      });

      return;
    }

    if (
      command === "dadjoke"
    ) {
      const jokes = [
        "¿Qué hace una abeja en el gimnasio? Zum-ba.",
        "¿Qué le dijo un semáforo a otro? No me mires que me estoy cambiando.",
        "¿Qué hace un pez? Nada."
      ];

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 😂 DAD JOKE ══╗",
            randomChoice(jokes)
          )
        ]
      });

      return;
    }

    if (
      command === "shuffle"
    ) {
      const shuffled =
        [...args].sort(
          () => Math.random() - 0.5
        );

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 🔀 SHUFFLE ══╗",
            shuffled.join(" ") ||
            "Nada que mezclar."
          )
        ]
      });

      return;
    }

    if (
      command === "yesno"
    ) {
      await message.channel.send({
        embeds: [
          success(
            randomChoice([
              "✅ Sí",
              "❌ No"
            ])
          )
        ]
      });

      return;
    }

    if (
      command === "clap"
    ) {
      await message.channel.send({
        embeds: [
          success(
            `👏 ${message.author} 👏`
          )
        ]
      });

      return;
    }

    if (
      command === "echo"
    ) {
      const text =
        args.join(" ");

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 🔊 ECHO ══╗",
            text || "..."
          )
        ]
      });

      return;
    }

    if (
      command === "mirror"
    ) {
      const text =
        args.join(" ");

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 🪞 MIRROR ══╗",
            text
              .split("")
              .reverse()
              .join("") ||
              "..."
          )
        ]
      });

      return;
    }

    if (
      command === "dice2"
    ) {
      await message.channel.send({
        embeds: [
          success(
            `🎲 Resultado: **${random(
              1,
              20
            )}**`
          )
        ]
      });

      return;
    }

    if (
      command === "number" ||
      command === "number2"
    ) {
      await message.channel.send({
        embeds: [
          success(
            `🔢 Número aleatorio: **${random(
              1,
              100
            )}**`
          )
        ]
      });

      return;
    }

    if (
      command === "randomemoji"
    ) {
      const emojis = [
        "😀","😂","😎","🤖","🌌",
        "🧡","🩷","⭐","🎮","💰",
        "🔥","✨","🎉","😈","🐰"
      ];

      await message.channel.send({
        embeds: [
          success(
            randomChoice(emojis)
          )
        ]
      });

      return;
    }

    if (
      command === "countdown"
    ) {
      const seconds =
        Math.min(
          Math.max(
            Number(args[0]) || 5,
            1
          ),
          10
        );

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ ⏳ COUNTDOWN ══╗",
            `⏳ Cuenta regresiva: **${seconds}s**`
          )
        ]
      });

      return;
    }

    if (
      command === "reverse"
    ) {
      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 🔄 REVERSE ══╗",
            args.join(" ")
              .split("")
              .reverse()
              .join("") ||
            "..."
          )
        ]
      });

      return;
    }

    if (
      command === "sayfun"
    ) {
      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 🎮 SAY FUN ══╗",
            args.join(" ") ||
            "¡Mati Nexus!"
          )
        ]
      });

      return;
    }

    if (
      command === "ascii"
    ) {
      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 🔤 ASCII ══╗",
            `\`\`\`\n${args.join(" ") || "Mati Nexus"}\n\`\`\``
          )
        ]
      });

      return;
    }

    if (
      command === "emojify"
    ) {
      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 😀 EMOJIFY ══╗",
            `✨ ${args.join(" ")
              .split("")
              .map(
                char =>
                  char === " "
                    ? "   "
                    : `:${char}:`
              )
              .join(" ")}`
          )
        ]
      });

      return;
    }

    if (
      command === "color"
    ) {
      await message.channel.send({
        embeds: [
          success(
            `🎨 Color aleatorio: **#${Math.floor(
              Math.random() *
              16777215
            ).toString(16).padStart(6, "0")}**`
          )
        ]
      });

      return;
    }

    if (
      command === "fact"
    ) {
      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 🧠 DATO ══╗",
            randomChoice([
              "🌌 El universo contiene una enorme cantidad de galaxias.",
              "🐙 Los pulpos tienen tres corazones.",
              "⚡ La luz viaja extremadamente rápido."
            ])
          )
        ]
      });

      return;
    }

    if (
      command === "roast"
    ) {
      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 🔥 ROAST ══╗",
            "🔥 Este roast viene con cariño: necesitas actualizar tu sentido del humor."
          )
        ]
      });

      return;
    }

    // ========================================================
    // 💗 NUEVOS COMANDOS SOCIAL
    // ========================================================

    const socialMessages = {
      kiss: "💋 manda un beso a",
      pat: "🫳 acaricia a",
      poke: "👉 toca a",
      highfive: "✋ choca los cinco con",
      slap: "🖐️ hace una palmada de broma a",
      cuddle: "🤗 se acurruca con",
      smile: "😊 sonríe a",
      wink: "😉 le guiña el ojo a",
      friend: "🤝 considera amigo a",
      love: "💗 manda cariño a",
      thank: "🙏 agradece a",
      applaud: "👏 aplaude a",
      cheer: "📣 anima a",
      react: "✨ reacciona a",
      respect: "🫡 muestra respeto a",
      bow: "🙇 hace una reverencia a",
      fistbump: "👊 choca el puño con",
      salute: "🫡 saluda a",
      nod: "🙂 asiente con",
      comfort: "🤗 le da apoyo a",
      congrats: "🎉 felicita a",
      goodluck: "🍀 desea suerte a",
      welcome: "👋 da la bienvenida a",
      bye: "👋 se despide de",
      hello: "👋 dice hola a",
      celebrate: "🎉 celebra con",
      cheer2: "📣 anima a",
      highfive2: "✋ choca los cinco con",
      smile2: "😊 sonríe a"
    };

    if (
      socialMessages[command]
    ) {
      const target =
        message.mentions.users.first();

      if (!target) {
        await message.channel.send({
          embeds: [
            error(
              `Menciona a alguien: \`${prefix}${command} @usuario\``
            )
          ]
        });

        return;
      }

      await message.channel.send({
        embeds: [
          makeEmbed(
            `╔══ 💗 ${command.toUpperCase()} ══╗`,
            `${socialMessages[command]} ${target}.`
          )
        ]
      });

      return;
    }

    if (
      command === "interaction"
    ) {
      const target =
        message.mentions.users.first();

      await message.channel.send({
        embeds: [
          success(
            `${message.author} interactúa con ${
              target || "el servidor"
            }.`
          )
        ]
      });

      return;
    }

    if (
      command === "happy"
    ) {
      await message.channel.send({
        embeds: [
          success(
            `😊 ${message.author} está feliz.`
          )
        ]
      });

      return;
    }

    // ========================================================
    // ⭐ NUEVOS COMANDOS DE NIVELES
    // ========================================================

    if (
      command === "levelcard" ||
      command === "levelinfo" ||
      command === "levelstats"
    ) {
      const required =
        user.level * 100;

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ ⭐ LEVEL CARD ══╗",
            [
              `👤 ${message.author}`,
              `⭐ Nivel: **${user.level}**`,
              `✨ XP: **${user.xp}/${required}**`,
              `📈 Progreso: **${Math.floor(
                user.xp / required * 100
              )}%**`
            ].join("\n")
          )
        ]
      });

      return;
    }

    if (
      command === "levelgoal" ||
      command === "xprequired" ||
      command === "nextxp"
    ) {
      const required =
        user.level * 100;

      await message.channel.send({
        embeds: [
          success(
            `🎯 Necesitas **${Math.max(
              0,
              required - user.xp
            )} XP** para completar el nivel.`
          )
        ]
      });

      return;
    }

    if (
      command === "xpleft" ||
      command === "currentxp"
    ) {
      await message.channel.send({
        embeds: [
          success(
            `✨ XP actual: **${user.xp}**`
          )
        ]
      });

      return;
    }

    if (
      command === "xppercent" ||
      command === "levelbar"
    ) {
      const required =
        user.level * 100;

      const percentage =
        Math.floor(
          user.xp /
          required *
          100
        );

      const filled =
        Math.floor(
          percentage / 10
        );

      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 📊 XP ══╗",
            `▰ ${"█".repeat(
              filled
            )}${"░".repeat(
              10 - filled
            )} **${percentage}%**`
          )
        ]
      });

      return;
    }

    if (
      command === "myrank" ||
      command === "rankposition"
    ) {
      const sorted =
        Object.entries(data.users)
          .sort(
            (a, b) =>
              (
                b[1].level * 100 +
                b[1].xp
              ) -
              (
                a[1].level * 100 +
                a[1].xp
              )
          );

      const position =
        sorted.findIndex(
          ([id]) =>
            id === message.author.id
        ) + 1;

      await message.channel.send({
        embeds: [
          success(
            `🏆 Tu posición es **#${position || "?"}**`
          )
        ]
      });

      return;
    }

    if (
      command === "serverlevel" ||
      command === "levelusers" ||
      command === "xpusers"
    ) {
      await message.channel.send({
        embeds: [
          success(
            `👥 Usuarios con datos de XP: **${Object.keys(
              data.users
            ).length}**`
          )
        ]
      });

      return;
    }

    if (
      command === "levelreward" ||
      command === "rewards"
    ) {
      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 🎁 RECOMPENSAS ══╗",
            "⭐ Las recompensas de nivel se pueden ampliar en futuras configuraciones."
          )
        ]
      });

      return;
    }

    if (
      command === "levelrequirements"
    ) {
      await message.channel.send({
        embeds: [
          success(
            `⭐ Nivel ${user.level}: **${user.level * 100} XP**`
          )
        ]
      });

      return;
    }

    if (
      command === "levelsummary"
    ) {
      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ ⭐ RESUMEN ══╗",
            [
              `⭐ Nivel: **${user.level}**`,
              `✨ XP: **${user.xp}**`,
              `🎯 Próximo nivel: **${user.level + 1}**`
            ].join("\n")
          )
        ]
      });

      return;
    }

    // ========================================================
    // 🛠️ UTILIDADES EXTRA
    // ========================================================

    if (
      command === "choose3"
    ) {
      const choices =
        args.filter(Boolean);

      if (choices.length < 2) {
        await message.channel.send({
          embeds: [
            error(
              `Uso: \`${prefix}choose3 opción1 opción2\``
            )
          ]
        });

        return;
      }

      await message.channel.send({
        embeds: [
          success(
            `🎯 Elegí: **${randomChoice(
              choices
            )}**`
          )
        ]
      });

      return;
    }

    if (
      command === "cleantext"
    ) {
      await message.channel.send({
        embeds: [
          makeEmbed(
            "╔══ 🧹 CLEAN TEXT ══╗",
            args.join(" ")
              .replace(
                /\s+/g,
                " "
              )
              .trim() ||
            "..."
          )
        ]
      });

      return;
    }

    if (
      command === "randomuser"
    ) {
      const members =
        message.guild.members.cache
          .filter(
            m =>
              !m.user.bot
          )
          .map(
            m =>
              m
          );

      const target =
        randomChoice(
          members
        );

      await message.channel.send({
        embeds: [
          success(
            target
              ? `🎲 Usuario elegido: ${target}`
              : "No hay usuarios disponibles."
          )
        ]
      });

      return;
    }

    // ========================================================
    // 🛡️ COMANDOS ADMIN EXTRA
    // ========================================================

    const adminOnlyExtra = [
      "baninfo",
      "timeoutinfo",
      "warninfo",
      "modstats",
      "unmuteall",
      "lockall",
      "unlockall",
      "slowmodeoff",
      "nickreset",
      "caseinfo",
      "clearuser",
      "rolelock",
      "roleunlock",
      "reason",
      "modhistory",
      "welcomeconfig",
      "goodbyeconfig",
      "inviteconfig",
      "logsconfig",
      "autoroleinfo",
      "prefixinfo",
      "configinfo",
      "welcomechanneloff",
      "goodbyechanneloff",
      "invitechanneloff",
      "logchanneloff",
      "configstatus",
      "configreset",
      "ruleschannel",
      "ticketchannel"
    ];

    if (
      adminOnlyExtra.includes(command)
    ) {
      if (!isAdmin(message.member)) {
        await message.channel.send({
          embeds: [
            error(
              "Solo Administradores."
            )
          ]
        });

        return;
      }

      const config =
        getGuildData(
          message.guild.id
        );

      if (
        command === "baninfo" ||
        command === "timeoutinfo" ||
        command === "warninfo" ||
        command === "caseinfo" ||
        command === "reason" ||
        command === "modhistory"
      ) {
        await message.channel.send({
          embeds: [
            makeEmbed(
              "╔══ 🛡️ INFORMACIÓN DE MODERACIÓN ══╗",
              [
                `👤 Moderador: ${message.author}`,
                `📜 Logs: ${
                  config.logsEnabled
                    ? "🟢 Activos"
                    : "🔴 Inactivos"
                }`,
                "📊 Usa los comandos de moderación para generar nuevos registros."
              ].join("\n")
            )
          ]
        });

        return;
      }

      if (
        command === "modstats"
      ) {
        await message.channel.send({
          embeds: [
            makeEmbed(
              "╔══ 🛡️ MOD STATS ══╗",
              [
                `📜 Logs: ${
                  config.logsEnabled
                    ? "🟢"
                    : "🔴"
                }`,
                `👋 Bienvenidas: ${
                  config.welcomeEnabled
                    ? "🟢"
                    : "🔴"
                }`,
                `😭 Despedidas: ${
                  config.goodbyeEnabled
                    ? "🟢"
                    : "🔴"
                }`
              ].join("\n")
            )
          ]
        });

        return;
      }

      if (
        command === "unmuteall"
      ) {
        for (
          const member
          of message.guild.members.cache.values()
        ) {
          if (
            member.communicationDisabledUntilTimestamp
          ) {
            await member.timeout(
              null
            ).catch(() => {});
          }
        }

        await message.channel.send({
          embeds: [
            success(
              "🔊 Se retiraron los timeouts posibles."
            )
          ]
        });

        return;
      }

      if (
        command === "slowmodeoff"
      ) {
        await message.channel.setRateLimitPerUser(
          0
        );

        await message.channel.send({
          embeds: [
            success(
              "🐌 Slowmode desactivado."
            )
          ]
        });

        return;
      }

      if (
        command === "nickreset"
      ) {
        const target =
          message.mentions.members.first();

        if (!target) {
          await message.channel.send({
            embeds: [
              error(
                `Uso: \`${prefix}nickreset @usuario\``
              )
            ]
          });

          return;
        }

        await target.setNickname(
          null
        );

        await message.channel.send({
          embeds: [
            success(
              `🏷️ Nickname de ${target} restablecido.`
            )
          ]
        });

        return;
      }

      if (
        command === "rolelock"
      ) {
        await message.channel.permissionOverwrites.edit(
          message.guild.roles.everyone,
          {
            SendMessages: false
          }
        );

        await message.channel.send({
          embeds: [
            success(
              "🔒 Canal bloqueado."
            )
          ]
        });

        return;
      }

      if (
        command === "roleunlock"
      ) {
        await message.channel.permissionOverwrites.edit(
          message.guild.roles.everyone,
          {
            SendMessages: null
          }
        );

        await message.channel.send({
          embeds: [
            success(
              "🔓 Canal desbloqueado."
            )
          ]
        });

        return;
      }

      if (
        command === "welcomechanneloff"
      ) {
        config.welcomeChannel =
          null;

        saveData();

        await message.channel.send({
          embeds: [
            success(
              "👋 Canal de bienvenida eliminado."
            )
          ]
        });

        return;
      }

      if (
        command === "goodbyechanneloff"
      ) {
        config.goodbyeChannel =
          null;

        saveData();

        await message.channel.send({
          embeds: [
            success(
              "😭 Canal de despedida eliminado."
            )
          ]
        });

        return;
      }

      if (
        command === "invitechanneloff"
      ) {
        config.inviteChannel =
          null;

        saveData();

        await message.channel.send({
          embeds: [
            success(
              "📨 Canal de invitaciones eliminado."
            )
          ]
        });

        return;
      }

      if (
        command === "logchanneloff"
      ) {
        config.logChannel =
          null;

        saveData();

        await message.channel.send({
          embeds: [
            success(
              "📜 Canal de logs eliminado."
            )
          ]
        });

        return;
      }

      if (
        command === "autoroleinfo"
      ) {
        await message.channel.send({
          embeds: [
            success(
              config.autorole
                ? `🤖 Autorol: <@&${config.autorole}>`
                : "🤖 Autorol no configurado."
            )
          ]
        });

        return;
      }

      if (
        command === "prefixinfo"
      ) {
        await message.channel.send({
          embeds: [
            success(
              `🔤 Prefijo actual: \`${config.prefix}\``
            )
          ]
        });

        return;
      }

      if (
        command === "configinfo" ||
        command === "configstatus"
      ) {
        await message.channel.send({
          embeds: [
            makeEmbed(
              "╔══ ⚙️ CONFIG STATUS ══╗",
              [
                `👋 Welcome: ${
                  config.welcomeEnabled
                    ? "🟢"
                    : "🔴"
                }`,
                `😭 Goodbye: ${
                  config.goodbyeEnabled
                    ? "🟢"
                    : "🔴"
                }`,
                `📨 Invites: ${
                  config.inviteEnabled
                    ? "🟢"
                    : "🔴"
                }`,
                `📜 Logs: ${
                  config.logsEnabled
                    ? "🟢"
                    : "🔴"
                }`,
                `🤖 Autorol: ${
                  config.autorole
                    ? "🟢"
                    : "🔴"
                }`
              ].join("\n")
            )
          ]
        });

        return;
      }

      if (
        command === "welcomeconfig"
      ) {
        await message.channel.send({
          embeds: [
            success(
              config.welcomeChannel
                ? `👋 Canal: <#${config.welcomeChannel}>`
                : "👋 Canal no configurado."
            )
          ]
        });

        return;
      }

      if (
        command === "goodbyeconfig"
      ) {
        await message.channel.send({
          embeds: [
            success(
              config.goodbyeChannel
                ? `😭 Canal: <#${config.goodbyeChannel}>`
                : "😭 Canal no configurado."
            )
          ]
        });

        return;
      }

      if (
        command === "inviteconfig"
      ) {
        await message.channel.send({
          embeds: [
            success(
              config.inviteChannel
                ? `📨 Canal: <#${config.inviteChannel}>`
                : "📨 Canal no configurado."
            )
          ]
        });

        return;
      }

      if (
        command === "logsconfig"
      ) {
        await message.channel.send({
          embeds: [
            success(
              config.logChannel
                ? `📜 Canal: <#${config.logChannel}>`
                : "📜 Canal no configurado."
            )
          ]
        });

        return;
      }

      if (
        command === "configreset" ||
        command === "resetconfig"
      ) {
        data.guilds[
          message.guild.id
        ] = {
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

        await message.channel.send({
          embeds: [
            success(
              "⚙️ Configuración restablecida."
            )
          ]
        });

        return;
      }

      if (
        command === "ruleschannel" ||
        command === "setrules"
      ) {
        const channel =
          message.mentions.channels.first();

        if (!channel) {
          await message.channel.send({
            embeds: [
              error(
                `Uso: \`${prefix}${command} #canal\``
              )
            ]
          });

          return;
        }

        await message.channel.send({
          embeds: [
            success(
              `📖 Canal de reglas indicado: ${channel}`
            )
          ]
        });

        return;
      }

      if (
        command === "ticketchannel" ||
        command === "setticket"
      ) {
        const channel =
          message.mentions.channels.first();

        if (!channel) {
          await message.channel.send({
            embeds: [
              error(
                `Uso: \`${prefix}${command} #canal\``
              )
            ]
          });

          return;
        }

        await message.channel.send({
          embeds: [
            success(
              `🎫 Canal de tickets indicado: ${channel}`
            )
          ]
        });

        return;
      }
    }

    // ========================================================
    // 👑 ADMINISTRACIÓN EXTRA
    // ========================================================

    const adminManagement =
      [
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
        "removelevel",
        "resetxp",
        "resetmoney",
        "resetbank",
        "setwallet",
        "setallmoney",
        "addallbank",
        "removeallbank"
      ];

    if (
      adminManagement.includes(
        command
      )
    ) {
      if (!isAdmin(message.member)) {
        await message.channel.send({
          embeds: [
            error(
              "Solo Administradores."
            )
          ]
        });

        return;
      }

      const target =
        message.mentions.users.first();

      if (
        [
          "giveall",
          "takeall",
          "setallmoney",
          "addallbank",
          "removeallbank"
        ].includes(command)
      ) {
        const amount =
          Number(args[0]);

        if (
          !Number.isFinite(amount) ||
          amount < 0
        ) {
          await message.channel.send({
            embeds: [
              error(
                `Uso: \`${prefix}${command} cantidad\``
              )
            ]
          });

          return;
        }

        for (
          const id
          of Object.keys(data.users)
        ) {
          const u =
            getUserData(id);

          if (
            command === "giveall" ||
            command === "setallmoney"
          ) {
            if (
              command === "giveall"
            ) {
              u.wallet += amount;
            } else {
              u.wallet = amount;
            }
          }

          if (
            command === "takeall"
          ) {
            u.wallet =
              Math.max(
                0,
                u.wallet - amount
              );
          }

          if (
            command === "addallbank"
          ) {
            u.bank += amount;
          }

          if (
            command === "removeallbank"
          ) {
            u.bank =
              Math.max(
                0,
                u.bank - amount
              );
          }
        }

        saveData();

        await message.channel.send({
          embeds: [
            success(
              `👑 Operación **${command}** realizada para los usuarios registrados.`
            )
          ]
        });

        return;
      }

      if (!target) {
        await message.channel.send({
          embeds: [
            error(
              `Menciona a un usuario: \`${prefix}${command} @usuario cantidad\``
            )
          ]
        });

        return;
      }

      const targetData =
        getUserData(target.id);

      const amount =
        Number(args[1]);

      if (
        [
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
          "setwarns"
        ].includes(command) &&
        (
          !Number.isFinite(amount) ||
          amount < 0
        )
      ) {
        await message.channel.send({
          embeds: [
            error(
              "La cantidad debe ser válida."
            )
          ]
        });

        return;
      }

      if (
        command === "addmoney"
      ) {
        targetData.wallet += amount;
      }

      if (
        command === "removemoney" ||
        command === "removemoney"
      ) {
        targetData.wallet =
          Math.max(
            0,
            targetData.wallet - amount
          );
      }

      if (
        command === "setmoney" ||
        command === "setwallet"
      ) {
        targetData.wallet =
          amount;
      }

      if (
        command === "addbank"
      ) {
        targetData.bank += amount;
      }

      if (
        command === "removebank"
      ) {
        targetData.bank =
          Math.max(
            0,
            targetData.bank - amount
          );
      }

      if (
        command === "setbank"
      ) {
        targetData.bank =
          amount;
      }

      if (
        command === "addxp"
      ) {
        targetData.xp += amount;

        while (
          targetData.xp >=
          targetData.level * 100
        ) {
          targetData.xp -=
            targetData.level * 100;

          targetData.level++;
        }
      }

      if (
        command === "removexp"
      ) {
        targetData.xp =
          Math.max(
            0,
            targetData.xp - amount
          );
      }

      if (
        command === "setxp"
      ) {
        targetData.xp =
          amount;
      }

      if (
        command === "addlevel"
      ) {
        targetData.level +=
          amount;
      }

      if (
        command === "setlevel"
      ) {
        targetData.level =
          Math.max(
            1,
            amount
          );
      }

      if (
        command === "setwarns"
      ) {
        targetData.warns =
          amount;
      }

      if (
        command === "resetwarns"
      ) {
        targetData.warns =
          0;
      }

      if (
        command === "resetxp"
      ) {
        targetData.xp =
          0;
      }

      if (
        command === "removelevel"
      ) {
        targetData.level =
          Math.max(
            1,
            targetData.level - amount
          );
      }

      if (
        command === "resetmoney"
      ) {
        targetData.wallet =
          0;
      }

      if (
        command === "resetbank"
      ) {
        targetData.bank =
          0;
      }

      if (
        command === "resetuser"
      ) {
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
      }

      saveData();

      await message.channel.send({
        embeds: [
          success(
            `👑 Operación **${command}** realizada sobre ${target}.`
          )
        ]
      });

      return;
    }

    // ========================================================
    // 🎭 ADMIN ROLES / CANALES
    // ========================================================

    if (
      [
        "createrole",
        "deleterole",
        "role",
        "setrole",
        "removerole"
      ].includes(command)
    ) {
      if (!isAdmin(message.member)) {
        await message.channel.send({
          embeds: [
            error(
              "Solo Administradores."
            )
          ]
        });

        return;
      }

      if (
        command === "createrole"
      ) {
        const name =
          args.join(" ");

        if (!name) {
          await message.channel.send({
            embeds: [
              error(
                `Uso: \`${prefix}createrole nombre\``
              )
            ]
          });

          return;
        }

        const role =
          await message.guild.roles.create({
            name
          }).catch(() => null);

        await message.channel.send({
          embeds: [
            role
              ? success(
                  `🎭 Rol creado: ${role}`
                )
              : error(
                  "No pude crear el rol."
                )
          ]
        });

        return;
      }

      const role =
        message.mentions.roles.first();

      if (!role) {
        await message.channel.send({
          embeds: [
            error(
              `Menciona un rol: \`${prefix}${command} @rol\``
            )
          ]
        });

        return;
      }

      if (
        command === "deleterole"
      ) {
        await role.delete()
          .catch(() => {});

        await message.channel.send({
          embeds: [
            success(
              "🗑️ Rol eliminado."
            )
          ]
        });

        return;
      }

      await message.channel.send({
        embeds: [
          success(
            `🎭 Rol seleccionado: ${role}`
          )
        ]
      });

      return;
    }

    if (
      [
        "createchannel",
        "deletechannel",
        "renamechannel",
        "createcategory",
        "deletecategory",
        "renameguild"
      ].includes(command)
    ) {
      if (!isAdmin(message.member)) {
        await message.channel.send({
          embeds: [
            error(
              "Solo Administradores."
            )
          ]
        });

        return;
      }

      if (
        command === "createchannel"
      ) {
        const name =
          args.join("-");

        if (!name) {
          await message.channel.send({
            embeds: [
              error(
                `Uso: \`${prefix}createchannel nombre\``
              )
            ]
          });

          return;
        }

        const channel =
          await message.guild.channels.create({
            name,
            type: ChannelType.GuildText
          }).catch(() => null);

        await message.channel.send({
          embeds: [
            channel
              ? success(
                  `📁 Canal creado: ${channel}`
                )
              : error(
                  "No pude crear el canal."
                )
          ]
        });

        return;
      }

      if (
        command === "deletechannel"
      ) {
        const channel =
          message.mentions.channels.first();

        if (!channel) {
          await message.channel.send({
            embeds: [
              error(
                `Uso: \`${prefix}deletechannel #canal\``
              )
            ]
          });

          return;
        }

        await channel.delete()
          .catch(() => {});

        return;
      }

      if (
        command === "renamechannel"
      ) {
        const channel =
          message.mentions.channels.first();

        const name =
          args.slice(1).join("-");

        if (!channel || !name) {
          await message.channel.send({
            embeds: [
              error(
                `Uso: \`${prefix}renamechannel #canal nuevo-nombre\``
              )
            ]
          });

          return;
        }

        await channel.setName(
          name
        );

        await message.channel.send({
          embeds: [
            success(
              `📁 Canal renombrado a **${name}**.`
            )
          ]
        });

        return;
      }

      if (
        command === "renameguild"
      ) {
        const name =
          args.join(" ");

        if (!name) {
          await message.channel.send({
            embeds: [
              error(
                `Uso: \`${prefix}renameguild nuevo nombre\``
              )
            ]
          });

          return;
        }

        await message.guild.setName(
          name
        );

        await message.channel.send({
          embeds: [
            success(
              `🏠 Servidor renombrado a **${name}**.`
            )
          ]
        });

        return;
      }

      if (
        command === "createcategory"
      ) {
        const name =
          args.join(" ");

        if (!name) {
          await message.channel.send({
            embeds: [
              error(
                `Uso: \`${prefix}createcategory nombre\``
              )
            ]
          });

          return;
        }

        const category =
          await message.guild.channels.create({
            name,
            type: ChannelType.GuildCategory
          }).catch(() => null);

        await message.channel.send({
          embeds: [
            category
              ? success(
                  `📂 Categoría creada: **${name}**`
                )
              : error(
                  "No pude crear la categoría."
                )
          ]
        });

        return;
      }

      if (
        command === "deletecategory"
      ) {
        const channel =
          message.mentions.channels.first();

        if (
          !channel ||
          channel.type !==
            ChannelType.GuildCategory
        ) {
          await message.channel.send({
            embeds: [
              error(
                "Menciona una categoría válida."
              )
            ]
          });

          return;
        }

        await channel.delete()
          .catch(() => {});

        return;
      }
    }

    // ========================================================
    // 🤖 BOT STATUS
    // ========================================================

    if (
      command === "botstatus"
    ) {
      if (!isAdmin(message.member)) {
        await message.channel.send({
          embeds: [
            error(
              "Solo Administradores."
            )
          ]
        });

        return;
      }

      const status =
        args.join(" ") ||
        "Mati Nexus • m.help";

      client.user.setPresence({
        activities: [
          {
            name: status,
            type: 3
          }
        ],
        status: "online"
      });

      await message.channel.send({
        embeds: [
          success(
            `🤖 Estado actualizado a: **${status}**`
          )
        ]
      });

      return;
    }

    // ========================================================
    // ❓ COMANDO DESCONOCIDO
    // ========================================================

    await message.channel.send({
      embeds: [
        error(
          `No existe el comando \`${command}\`.\nUsa \`${prefix}help\` para ver los comandos disponibles.`
        )
      ]
    }).catch(() => {});
  }
);

// ============================================================
// 🎛️ MENÚS DEL HELP
// ============================================================

client.on(
  "interactionCreate",
  async interaction => {

    // ========================================================
    // 📋 MENÚ PÚBLICO
    // ========================================================

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId ===
        "mati_public_help"
    ) {
      const key =
        interaction.values[0];

      if (!publicCategories[key]) {
        await interaction.reply({
          content:
            "❌ Categoría no válida.",
          ephemeral: true
        });

        return;
      }

      await interaction.update({
        embeds: [
          publicCategoryPageEmbed(
            key,
            1
          )
        ],
        components: [
          publicPageMenu(key)
        ]
      });

      return;
    }

    // ========================================================
    // 📄 PÁGINAS PÚBLICAS
    // ========================================================

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId.startsWith(
        "mati_public_page_"
      )
    ) {
      const key =
        interaction.customId.replace(
          "mati_public_page_",
          ""
        );

      const page =
        Number(
          interaction.values[0]
        );

      if (!publicCategories[key]) {
        await interaction.reply({
          content:
            "❌ Categoría no válida.",
          ephemeral: true
        });

        return;
      }

      await interaction.update({
        embeds: [
          publicCategoryPageEmbed(
            key,
            page
          )
        ],
        components: [
          publicPageMenu(key)
        ]
      });

      return;
    }

    // ========================================================
    // 👑 MENÚ ADMIN
    // ========================================================

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId ===
        "mati_admin_help"
    ) {
      if (
        !interaction.memberPermissions?.has(
          PermissionsBitField.Flags.Administrator
        )
      ) {
        await interaction.reply({
          content:
            "❌ Solo Administradores pueden utilizar este menú.",
          ephemeral: true
        });

        return;
      }

      const key =
        interaction.values[0];

      if (!adminCategories[key]) {
        await interaction.reply({
          content:
            "❌ Categoría no válida.",
          ephemeral: true
        });

        return;
      }

      await interaction.update({
        embeds: [
          adminCategoryPageEmbed(
            key,
            1
          )
        ],
        components: [
          adminCategoryPageMenu(key)
        ]
      });

      return;
    }

    // ========================================================
    // 📄 PÁGINAS ADMIN
    // ========================================================

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId.startsWith(
        "mati_admin_page_"
      )
    ) {
      if (
        !interaction.memberPermissions?.has(
          PermissionsBitField.Flags.Administrator
        )
      ) {
        await interaction.reply({
          content:
            "❌ Solo Administradores pueden utilizar este menú.",
          ephemeral: true
        });

        return;
      }

      const key =
        interaction.customId.replace(
          "mati_admin_page_",
          ""
        );

      const page =
        Number(
          interaction.values[0]
        );

      if (!adminCategories[key]) {
        await interaction.reply({
          content:
            "❌ Categoría no válida.",
          ephemeral: true
        });

        return;
      }

      await interaction.update({
        embeds: [
          adminCategoryPageEmbed(
            key,
            page
          )
        ],
        components: [
          adminCategoryPageMenu(key)
        ]
      });

      return;
    }
  }
);

// ============================================================
// 📨 INVITACIONES — CARGA INICIAL
// ============================================================

client.once(
  "ready",
  async () => {

    console.log(
      `🧡 ${client.user.tag} está conectado correctamente.`
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
      const guild
      of client.guilds.cache.values()
    ) {
      await loadInvites(
        guild
      );
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
// 📨 ACTUALIZAR INVITES CUANDO SE CREA UNO
// ============================================================

client.on(
  "inviteCreate",
  async invite => {
    await loadInvites(
      invite.guild
    );
  }
);

// ============================================================
// 📨 ACTUALIZAR INVITES CUANDO SE BORRA UNO
// ============================================================

client.on(
  "inviteDelete",
  async invite => {
    await loadInvites(
      invite.guild
    );
  }
);

// ============================================================
// 🌐 SERVIDOR HTTP PARA RENDER
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
        "🧡 Mati Nexus Bot está funcionando correctamente."
      );
    }
  );

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `🌐 Servidor HTTP activo en el puerto ${PORT}.`
    );
  }
);

// ============================================================
// 🚀 LOGIN
// ============================================================

client.login(
  TOKEN
).catch(
  err => {
    console.error(
      "❌ Error iniciando sesión:",
      err
    );
  }
);
