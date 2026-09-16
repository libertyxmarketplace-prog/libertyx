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
    .setAccessory(
      new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(buttonLabel)
        .setStyle(style)
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
    .setDescription('Orlando Support management.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('panel')
        .setDescription('Post the Orlando Support ticket panel.')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Target channel for the panel (default: current channel)')
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
    .setDescription('Preview the Orlando Roleplay welcome card.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('test')
        .setDescription('Send a test welcome message in this channel.')
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

// ─────────────── Client Events ───────────────
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

// Member Welcome Handler
client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const welcomeChannel = member.guild.channels.cache.find(
      (c) =>
        c.isTextBased() &&
        /(welcome|welcomes|joins|arrival|arrivals|gate)/i.test(c.name)
    );

    if (welcomeChannel) {
      const card = buildOrlandoWelcomeCard(member);
      await welcomeChannel.send({
        content: `Welcome to **Orlando Roleplay**, <@${member.id}>! ${ORLANDO_EMOJI}`,
        components: [card.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
    }
  } catch (err) {
    console.error('[Orlando] Error handling GuildMemberAdd:', err.message);
  }
});

// Interaction Handling
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // ─────────────── Slash Commands ───────────────
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'support' || interaction.commandName === 'staff') {
        const sub = interaction.options.getSubcommand();
        if (sub === 'panel') {
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

          await interaction.reply({
            content: `✅ Orlando Support panel posted in <#${targetChannel.id}>.`,
            flags: MessageFlags.Ephemeral
          });
          return;
        }
      }

      if (interaction.commandName === 'welcome') {
        const sub = interaction.options.getSubcommand();
        if (sub === 'test') {
          const card = buildOrlandoWelcomeCard(interaction.member || interaction.user);
          await interaction.channel.send({
            content: `Welcome to **Orlando Roleplay**, <@${interaction.user.id}>! ${ORLANDO_EMOJI}`,
            components: [card.toJSON()],
            flags: MessageFlags.IsComponentsV2
          });
          await interaction.reply({
            content: '✅ Test welcome message sent.',
            flags: MessageFlags.Ephemeral
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
          AttachFiles: true
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
              .setLabel('Reason for opening this ticket')
              .setPlaceholder('Describe your inquiry or issue...')
              .setStyle(TextInputStyle.Paragraph)
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

      // Check if guild has a category named TICKETS or SUPPORT
      const categoryChannel = interaction.guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildCategory && /(ticket|support|help)/i.test(c.name)
      );

      const ticketChannel = await interaction.guild.channels.create({
        name: chanName,
        type: ChannelType.GuildText,
        parent: categoryChannel ? categoryChannel.id : null,
        permissionOverwrites: [
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
              PermissionFlagsBits.AttachFiles
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
        ]
      });

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

    // Ignore status pill button clicks
    if (interaction.isButton() && interaction.customId === 'orlando_desk_status') {
      await interaction.reply({
        content: '🟢 Orlando Support Desk is currently online and accepting inquiries.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }
  } catch (err) {
    console.error('[Orlando] Error handling interaction:', err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ Something went wrong while processing your request.',
        flags: MessageFlags.Ephemeral
      }).catch(() => null);
    }
  }
});

// Start the Orlando bot
client.login(ORLANDO_TOKEN).catch((err) => {
  console.error('[Orlando] Login failed:', err.message);
});

export default client;
