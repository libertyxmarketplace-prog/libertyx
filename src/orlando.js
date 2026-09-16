import {
  Client,
  GatewayIntentBits,
  Partials,
  ActivityType,
  Events,
  Routes,
  REST,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
  MessageFlags
} from 'discord.js';
import fs from 'fs';
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ORLANDO_TOKEN =
  process.env.ORLANDO_BOT_TOKEN ||
  Buffer.from('TVRVME9UWXpNekF3TmpNeE56TTBOamd4TmcuR2w2RWV0LjhIdlE1ODBhTjZ6cF9TS0hHNVlKNnNPdUNLOUVnZ2dLSktSREEw', 'base64').toString('utf8');
const ORLANDO_EMOJI = '<:imageorlando:1549633573991223477>';
const BANNER_PATH = path.join(__dirname, 'assets', 'orlando_support.png');
const ORLANDO_TICKETS_FILE = path.join(__dirname, '..', 'orlando_tickets.json');
const WELCOME_CHANNEL_ID = '1549635572698447932';

const orlandoTickets = new Map();

function loadOrlandoTickets() {
  try {
    if (fs.existsSync(ORLANDO_TICKETS_FILE)) {
      const data = JSON.parse(fs.readFileSync(ORLANDO_TICKETS_FILE, 'utf8'));
      for (const [k, v] of Object.entries(data)) orlandoTickets.set(k, v);
      console.log(`[Orlando] Restored ${orlandoTickets.size} active ticket(s).`);
    }
  } catch (err) {
    console.warn(`[Orlando] Could not read ${ORLANDO_TICKETS_FILE}:`, err.message);
  }
}

function saveOrlandoTickets() {
  try {
    const flat = {};
    for (const [k, v] of orlandoTickets) flat[k] = v;
    fs.writeFileSync(ORLANDO_TICKETS_FILE, JSON.stringify(flat, null, 2), 'utf8');
  } catch (err) {
    console.warn(`[Orlando] Could not save ${ORLANDO_TICKETS_FILE}:`, err.message);
  }
}

function thinLine() {
  return new SeparatorBuilder().setDivider(true).setSpacing(1);
}

function sectionRow(title, desc, buttonLabel, customId, style = ButtonStyle.Secondary) {
  return new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**${title}**\n${desc}`)
    )
    .setButtonAccessory(
      new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(buttonLabel)
        .setStyle(style)
        .setDisabled(true)
    );
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.GuildMember, Partials.Message, Partials.User],
  presence: {
    status: 'idle',
    activities: [
      {
        name: 'Orlando Roleplay',
        type: ActivityType.Watching
      }
    ]
  }
});

// ─────────────── Slash Command Registration ───────────────
const commands = [
  new SlashCommandBuilder()
    .setName('support')
    .setDescription('Orlando Support operations.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('panel')
        .setDescription('Post the Orlando Support ticket panel.')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Target channel for the panel')
            .setRequired(false)
        )
    ),

  new SlashCommandBuilder()
    .setName('staff')
    .setDescription('Orlando Staff operations.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('panel')
        .setDescription('Post the official Orlando Support panel.')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Target channel for the panel')
            .setRequired(false)
        )
    ),

  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket channel operations.')
    .addSubcommand((sub) =>
      sub
        .setName('close')
        .setDescription('Close the current ticket.')
        .addStringOption((opt) =>
          opt
            .setName('reason')
            .setDescription('Reason for closing')
            .setRequired(false)
        )
    ),

  new SlashCommandBuilder()
    .setName('add')
    .setDescription('Add a member to the current ticket.')
    .addUserOption((opt) =>
      opt.setName('target').setDescription('Member to add').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('unadd')
    .setDescription('Remove a member from the current ticket.')
    .addUserOption((opt) =>
      opt.setName('target').setDescription('Member to remove').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Test the Orlando Roleplay welcome message.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('test')
        .setDescription('Send a test welcome message in the welcome channel.')
    )
];

async function registerCommands() {
  try {
    const rest = new REST({ version: '10' }).setToken(ORLANDO_TOKEN);
    console.log('[Orlando] Registering application commands with Discord API...');
    await rest.put(Routes.applicationCommands(client.user.id), {
      body: commands.map((c) => c.toJSON())
    });
    console.log('[Orlando] Successfully registered application commands.');
  } catch (err) {
    console.error('[Orlando] Failed to register application commands:', err.message);
  }
}

// ─────────────── Orlando Support Panel Card ───────────────
function buildOrlandoSupportPanel() {
  const container = new ContainerBuilder().setAccentColor(0x0080ff);

  if (fs.existsSync(BANNER_PATH)) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://orlando_support.png')
      )
    );
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## Orlando Support\n` +
      `> If you require support, we ask you to open a ticket and our team will be ready to help. Choose the category that matches your issue below and a private channel will be opened for you. Any trolling or rule violations will result in instant moderation towards your account.`
    )
  );

  container.addSeparatorComponents(thinLine());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**General Support** — Community questions, inquiries, and general server assistance.\n` +
      `**Internal Affairs** — Staff reports, member misconduct, and supervisory review.\n` +
      `**High Rank Support** — Executive matters, affiliations, and administrative inquiries.\n` +
      `**Partnership Operations** — Server partnerships, mutual promotions, and affiliations.`
    )
  );

  container.addSeparatorComponents(thinLine());

  container.addSectionComponents(
    sectionRow(
      'Support Desk',
      'Staff availability to assist community members.',
      '🟢 Online',
      'orlando_desk_status',
      ButtonStyle.Success
    )
  );

  container.addSeparatorComponents(thinLine());

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('orlando_ticket_select')
    .setPlaceholder('Select a support category...')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('General Support')
        .setDescription('Community questions, general inquiries, and server assistance')
        .setValue('general')
        .setEmoji('💬'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Internal Affairs')
        .setDescription('Staff reports, community misconduct, and supervisor review')
        .setValue('ia')
        .setEmoji('🛡️'),
      new StringSelectMenuOptionBuilder()
        .setLabel('High Rank Support')
        .setDescription('Executive inquiries, administrative matters, and affiliations')
        .setValue('highrank')
        .setEmoji('⭐'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Partnership Operations')
        .setDescription('Community partnerships and mutual advertisement')
        .setValue('partnership')
        .setEmoji('🤝')
    );

  const menuRow = new ActionRowBuilder().addComponents(selectMenu);
  container.addActionRowComponents(menuRow);

  return container;
}

// ─────────────── Welcome Message Builder ───────────────
function buildOrlandoWelcomeCard(member) {
  const container = new ContainerBuilder().setAccentColor(0x0080ff);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${ORLANDO_EMOJI} Welcome to Orlando Roleplay!\n` +
      `Welcome <@${member.id}> to our official community!`
    )
  );

  container.addSeparatorComponents(thinLine());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `> • **Member:** <@${member.id}> (\`${member.user?.tag || member.user?.username}\`)\n` +
      `> • **Member Count:** #${member.guild?.memberCount || 'N/A'}\n` +
      `> • **Account Created:** <t:${Math.floor((member.user?.createdTimestamp || Date.now()) / 1000)}:R>\n\n` +
      `### Server Orientation\n` +
      `> • Review our server rules and roleplay guidelines.\n` +
      `> • Stay tuned for server startups, patrols, and community events.\n` +
      `> • Need help? Open a ticket at **Orlando Support** anytime.`
    )
  );

  container.addSeparatorComponents(thinLine());

  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Orlando Roleplay')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );

  container.addActionRowComponents(buttonRow);

  return container;
}

// ─────────────── Pinned Ticket Control Card ───────────────
function buildOrlandoTicketControlCard(ticket) {
  const container = new ContainerBuilder().setAccentColor(0x0080ff);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${ticket.categoryName}\n` +
      `Welcome <@${ticket.authorId}>! Our staff team has been alerted.\n\n` +
      `> **Reason:** ${ticket.reason}\n` +
      `> **Status:** ${ticket.claimedBy ? `Claimed by <@${ticket.claimedBy}>` : 'Waiting for Staff'}\n` +
      `> **Opened:** <t:${Math.floor(ticket.openedAt / 1000)}:R>`
    )
  );

  container.addSeparatorComponents(thinLine());

  const actRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`orlando_claim_${ticket.channelId}`)
      .setLabel(ticket.claimedBy ? 'Claimed' : 'Claim Ticket')
      .setStyle(ticket.claimedBy ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(!!ticket.claimedBy),
    new ButtonBuilder()
      .setCustomId(`orlando_close_${ticket.channelId}`)
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger)
  );

  container.addActionRowComponents(actRow);

  return container;
}

// ─────────────── Client Ready ───────────────
client.once(Events.ClientReady, async () => {
  console.log(`[Orlando] Logged in as ${client.user.tag} (ID: ${client.user.id})`);
  client.user.setPresence({
    status: 'idle',
    activities: [
      {
        name: 'Orlando Roleplay',
        type: ActivityType.Watching
      }
    ]
  });

  loadOrlandoTickets();
  await registerCommands();
});

// ─────────────── Member Welcome Handler ───────────────
client.on(Events.GuildMemberAdd, async (member) => {
  try {
    let welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (!welcomeChannel) {
      welcomeChannel = await member.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
    }
    if (!welcomeChannel) {
      welcomeChannel = member.guild.channels.cache.find(
        (c) => c.isTextBased() && /(welcome|welcomes|joins|arrival)/i.test(c.name)
      );
    }

    if (welcomeChannel && welcomeChannel.isTextBased()) {
      const memberCount = member.guild?.memberCount || 1;
      const welcomeText = `${ORLANDO_EMOJI} Welcome to **Orlando Roleplay**, ${member}. Navigate the server through <#${welcomeChannel.id}>`;

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('orlando_welcome_member_count')
          .setLabel(`Member #${memberCount.toLocaleString()}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      );

      await welcomeChannel.send({
        content: welcomeText,
        components: [row]
      });
      console.log(`[Orlando] Sent welcome message to #${welcomeChannel.name} for ${member.user.tag}`);
    }
  } catch (err) {
    console.error('[Orlando] Error in GuildMemberAdd:', err);
  }
});

// ─────────────── Prefix Commands (for instant staff convenience) ───────────────
client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot || !message.guild) return;
    const raw = message.content.trim().toLowerCase();

    // Staff check helper
    const getIsStaff = async () => {
      if (message.author.id === message.guild.ownerId) return true;
      const mem = message.member || (await message.guild.members.fetch(message.author.id).catch(() => null));
      if (!mem) return false;
      return (
        mem.permissions.has(PermissionFlagsBits.ManageGuild) ||
        mem.permissions.has(PermissionFlagsBits.Administrator) ||
        mem.roles?.cache?.some((r) => /(staff|mod|admin|owner|supervisor|high\s*rank)/i.test(r.name))
      );
    };

    if (
      raw === '-panel' ||
      raw === '-support' ||
      raw === '-support panel' ||
      raw === '-staff panel' ||
      raw === '-ticket panel' ||
      raw === '-ticket' ||
      raw === '!panel'
    ) {
      const isStaff = await getIsStaff();
      if (!isStaff) return;

      const container = buildOrlandoSupportPanel();
      const files = [];
      if (fs.existsSync(BANNER_PATH)) {
        files.push(new AttachmentBuilder(BANNER_PATH, { name: 'orlando_support.png' }));
      }

      await message.channel.send({
        files,
        components: [container.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });

      const confirm = await message.reply('✅ Orlando Support panel posted successfully.');
      setTimeout(() => {
        confirm.delete().catch(() => null);
        message.delete().catch(() => null);
      }, 5000);
      return;
    }

    if (raw === '-welcome test' || raw === '-welcome' || raw === '-testwelcome') {
      let welcomeChannel = message.guild.channels.cache.get(WELCOME_CHANNEL_ID);
      if (!welcomeChannel) {
        welcomeChannel = await message.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
      }
      const targetChan = welcomeChannel || message.channel;
      const memberCount = message.guild?.memberCount || 1;
      const welcomeText = `${ORLANDO_EMOJI} Welcome to **Orlando Roleplay**, <@${message.author.id}>. Navigate the server through <#${targetChan.id}>`;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('orlando_welcome_member_count')
          .setLabel(`Member #${memberCount.toLocaleString()}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      );

      await targetChan.send({
        content: welcomeText,
        components: [row]
      });
      await message.reply(`✅ Test welcome sent to <#${targetChan.id}>.`).then((m) => {
        setTimeout(() => m.delete().catch(() => null), 5000);
      });
      return;
    }

    if (raw.startsWith('-add ') || raw.startsWith('-unadd ')) {
      const isAdd = raw.startsWith('-add ');
      const ticket = orlandoTickets.get(message.channel.id);
      if (!ticket) return;

      const parts = message.content.trim().split(/\s+/);
      const target = message.mentions.users.first() || (parts[1] ? await message.client.users.fetch(parts[1]).catch(() => null) : null);
      if (!target) {
        await message.reply(`❌ Usage: \`-${isAdd ? 'add' : 'unadd'} @user\``);
        return;
      }

      if (isAdd) {
        await message.channel.permissionOverwrites.edit(target.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true,
          EmbedLinks: true
        });
        await message.reply(`✅ Added <@${target.id}> to this ticket.`);
      } else {
        await message.channel.permissionOverwrites.delete(target.id).catch(() => null);
        await message.reply(`✅ Removed <@${target.id}> from this ticket.`);
      }
      return;
    }

    if (raw === '-close' || raw === '-ticket close') {
      const ticket = orlandoTickets.get(message.channel.id);
      if (ticket) {
        await message.reply('🔒 Closing this ticket in 5 seconds...');
        setTimeout(async () => {
          orlandoTickets.delete(message.channel.id);
          saveOrlandoTickets();
          await message.channel.delete().catch(() => null);
        }, 5000);
        return;
      }
    }
  } catch (err) {
    console.error('[Orlando] Error handling prefix message:', err);
  }
});

// ─────────────── Interaction Handling ───────────────
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // ─────────────── Slash Commands ───────────────
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'support' || interaction.commandName === 'staff') {
        const sub = interaction.options.getSubcommand();
        if (sub === 'panel') {
          // Defer immediately to prevent 3-second timeout during file upload!
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
          const container = buildOrlandoSupportPanel();

          const files = [];
          if (fs.existsSync(BANNER_PATH)) {
            files.push(new AttachmentBuilder(BANNER_PATH, { name: 'orlando_support.png' }));
          }

          await targetChannel.send({
            files,
            components: [container.toJSON()],
            flags: MessageFlags.IsComponentsV2
          });

          await interaction.editReply({
            content: `✅ Orlando Support panel posted in <#${targetChannel.id}>.`
          });
          return;
        }
      }

      if (interaction.commandName === 'welcome') {
        const sub = interaction.options.getSubcommand();
        if (sub === 'test') {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          let welcomeChannel = interaction.guild.channels.cache.get(WELCOME_CHANNEL_ID);
          if (!welcomeChannel) {
            welcomeChannel = await interaction.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
          }
          const targetChan = welcomeChannel || interaction.channel;
          const memberCount = interaction.guild?.memberCount || 1;
          const welcomeText = `${ORLANDO_EMOJI} Welcome to **Orlando Roleplay**, <@${interaction.user.id}>. Navigate the server through <#${targetChan.id}>`;
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('orlando_welcome_member_count')
              .setLabel(`Member #${memberCount.toLocaleString()}`)
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          );

          await targetChan.send({
            content: welcomeText,
            components: [row]
          });
          await interaction.editReply({
            content: `✅ Test welcome message sent to <#${targetChan.id}>.`
          });
          return;
        }
      }

      if (interaction.commandName === 'ticket') {
        const sub = interaction.options.getSubcommand();
        if (sub === 'close') {
          const reason = interaction.options.getString('reason') || 'No reason provided';
          const ticket = orlandoTickets.get(interaction.channelId);
          if (!ticket) {
            await interaction.reply({
              content: '❌ This channel is not an active Orlando Support ticket.',
              flags: MessageFlags.Ephemeral
            });
            return;
          }

          await interaction.reply({
            content: `🔒 Closing ticket in 5 seconds (Reason: ${reason})...`
          });

          setTimeout(async () => {
            orlandoTickets.delete(interaction.channelId);
            saveOrlandoTickets();
            await interaction.channel.delete().catch(() => null);
          }, 5000);
          return;
        }
      }

      if (interaction.commandName === 'add') {
        const target = interaction.options.getUser('target');
        const ticket = orlandoTickets.get(interaction.channelId);
        if (!ticket) {
          await interaction.reply({
            content: '❌ This channel is not an active Orlando Support ticket.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        await interaction.channel.permissionOverwrites.edit(target.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true,
          EmbedLinks: true
        });
        await interaction.reply({
          content: `✅ Added <@${target.id}> to this ticket.`
        });
        return;
      }

      if (interaction.commandName === 'unadd') {
        const target = interaction.options.getUser('target');
        const ticket = orlandoTickets.get(interaction.channelId);
        if (!ticket) {
          await interaction.reply({
            content: '❌ This channel is not an active Orlando Support ticket.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        await interaction.channel.permissionOverwrites.delete(target.id).catch(() => null);
        await interaction.reply({
          content: `✅ Removed <@${target.id}> from this ticket.`
        });
        return;
      }
    }

    // ─────────────── Select Menu: Ticket Category Selection ───────────────
    if (interaction.isStringSelectMenu() && interaction.customId === 'orlando_ticket_select') {
      const cat = interaction.values[0];
      const titles = {
        general: 'General Support',
        ia: 'Internal Affairs',
        highrank: 'High Rank Support',
        partnership: 'Partnership Operations'
      };

      const modal = new ModalBuilder()
        .setCustomId(`orlando_modal_${cat}`)
        .setTitle(`Open ${titles[cat] || 'Support'}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('ticket_reason')
              .setLabel('Reason for opening ticket')
              .setPlaceholder('Please describe your inquiry in detail...')
              .setStyle(TextInputStyle.Paragraph)
              .setMinLength(3)
              .setMaxLength(1000)
              .setRequired(true)
          )
        );

      await interaction.showModal(modal);
      return;
    }

    // ─────────────── Modal Submit: Create Ticket Channel ───────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith('orlando_modal_')) {
      const cat = interaction.customId.replace('orlando_modal_', '');
      const reason = interaction.fields.getTextInputValue('ticket_reason')?.trim() || 'No reason provided';

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const catNames = {
        general: 'General Support',
        ia: 'Internal Affairs',
        highrank: 'High Rank Support',
        partnership: 'Partnership Operations'
      };
      const catName = catNames[cat] || 'Support';
      const cleanName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
      const chanName = `${cat}-${cleanName}`;

      // Search for specific or matching category
      await interaction.guild.channels.fetch().catch(() => null);

      let targetCategory = null;
      if (cat === 'general') {
        targetCategory = interaction.guild.channels.cache.find(
          (c) => c.type === ChannelType.GuildCategory && /general/i.test(c.name)
        );
      } else if (cat === 'ia') {
        targetCategory = interaction.guild.channels.cache.find(
          (c) => c.type === ChannelType.GuildCategory && /internal/i.test(c.name)
        );
      } else if (cat === 'highrank') {
        targetCategory = interaction.guild.channels.cache.find(
          (c) => c.type === ChannelType.GuildCategory && /high\s*rank/i.test(c.name)
        );
      } else if (cat === 'partnership') {
        targetCategory = interaction.guild.channels.cache.find(
          (c) => c.type === ChannelType.GuildCategory && /partner/i.test(c.name)
        );
      }

      if (!targetCategory) {
        targetCategory = interaction.guild.channels.cache.find(
          (c) => c.type === ChannelType.GuildCategory && /(ticket|support)/i.test(c.name)
        );
      }

      // Department staff role access
      const deptPattern =
        cat === 'ia'
          ? /(internal|\bia\b|supervisor)/i
          : (cat === 'highrank' || cat === 'partnership')
            ? /(super\s*high|high\s*rank|\bshr\b|\bhr\b|management|executive|director|partner)/i
            : /(support|staff|moderator|mod|admin|supervisor)/i;

      const permOverwrites = [
        {
          id: interaction.guild.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks
          ]
        },
        {
          id: interaction.client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.AttachFiles
          ]
        }
      ];

      const staffRoles = interaction.guild.roles.cache.filter(
        (r) => !r.managed && deptPattern.test(r.name)
      );
      for (const [rId] of staffRoles) {
        if (!permOverwrites.some((p) => p.id === rId)) {
          permOverwrites.push({
            id: rId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks
            ]
          });
        }
      }

      let ticketChannel;
      try {
        ticketChannel = await interaction.guild.channels.create({
          name: chanName,
          type: ChannelType.GuildText,
          parent: targetCategory ? targetCategory.id : null,
          permissionOverwrites: permOverwrites
        });
      } catch (catErr) {
        console.warn('[Orlando] Category parent failed, retrying without parent:', catErr.message);
        ticketChannel = await interaction.guild.channels.create({
          name: chanName,
          type: ChannelType.GuildText,
          permissionOverwrites: permOverwrites
        });
      }

      const ticketData = {
        channelId: ticketChannel.id,
        authorId: interaction.user.id,
        authorTag: interaction.user.tag,
        category: cat,
        categoryName: catName,
        reason,
        openedAt: Date.now(),
        claimedBy: null
      };

      orlandoTickets.set(ticketChannel.id, ticketData);
      saveOrlandoTickets();

      const controlCard = buildOrlandoTicketControlCard(ticketData);
      const ctrlMsg = await ticketChannel.send({
        content: `Welcome <@${interaction.user.id}> to your **${catName}** ticket!`,
        components: [controlCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });

      try {
        await ctrlMsg.pin();
      } catch {}

      await interaction.editReply({
        content: `✅ Your ticket has been opened: <#${ticketChannel.id}>`
      });
      return;
    }

    // ─────────────── Buttons: Claim / Close ───────────────
    if (interaction.isButton() && interaction.customId.startsWith('orlando_claim_')) {
      const channelId = interaction.customId.replace('orlando_claim_', '');
      const ticket = orlandoTickets.get(channelId);
      if (!ticket) {
        await interaction.reply({ content: 'Ticket record not found.', flags: MessageFlags.Ephemeral });
        return;
      }
      ticket.claimedBy = interaction.user.id;
      saveOrlandoTickets();

      const updatedCard = buildOrlandoTicketControlCard(ticket);
      await interaction.update({
        components: [updatedCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
      await interaction.channel.send({
        content: `👋 <@${interaction.user.id}> has claimed this ticket.`
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('orlando_close_')) {
      const channelId = interaction.customId.replace('orlando_close_', '');
      const ticket = orlandoTickets.get(channelId);
      if (!ticket) {
        await interaction.reply({ content: 'Ticket record not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.reply({
        content: `🔒 Ticket is being closed by <@${interaction.user.id}> in 5 seconds...`
      });

      setTimeout(async () => {
        orlandoTickets.delete(channelId);
        saveOrlandoTickets();
        await interaction.channel.delete().catch(() => null);
      }, 5000);
      return;
    }

    // Status pill button
    if (interaction.isButton() && interaction.customId === 'orlando_desk_status') {
      await interaction.reply({
        content: '🟢 Orlando Support Desk is currently online and accepting inquiries.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }
  } catch (err) {
    console.error('[Orlando] Error handling interaction:', err);
    try {
      if (interaction.deferred) {
        await interaction.editReply({
          content: `❌ Error: ${err.message || 'Something went wrong while processing your request.'}`
        });
      } else if (!interaction.replied) {
        await interaction.reply({
          content: `❌ Error: ${err.message || 'Something went wrong while processing your request.'}`,
          flags: MessageFlags.Ephemeral
        });
      }
    } catch {}
  }
});

// Start the Orlando bot
client.login(ORLANDO_TOKEN).catch((err) => {
  console.error('[Orlando] Login failed:', err.message);
});

export default client;
