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
    ),

  new SlashCommandBuilder()
    .setName('list')
    .setDescription('Display what the Orlando Support ticket system can do.'),

  new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Claim the active ticket channel.'),

  new SlashCommandBuilder()
    .setName('unclaim')
    .setDescription('Unclaim the active ticket channel.'),

  new SlashCommandBuilder()
    .setName('proof')
    .setDescription('Submit partnership screenshot proof.')
    .addAttachmentOption((opt) =>
      opt.setName('screenshot').setDescription('Screenshot of reciprocal advertisement').setRequired(true)
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
      '🟢',
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
        .setDescription('Community inquiries, questions, and server assistance')
        .setValue('general'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Internal Affairs')
        .setDescription('Staff reports, member misconduct, and supervisor review')
        .setValue('ia'),
      new StringSelectMenuOptionBuilder()
        .setLabel('High Rank Support')
        .setDescription('Executive matters, administrative inquiries, and affiliations')
        .setValue('highrank'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Partnership Operations')
        .setDescription('Community partnerships, mutual advertising, and affiliations')
        .setValue('partnership')
    );

  const menuRow = new ActionRowBuilder().addComponents(selectMenu);
  container.addActionRowComponents(menuRow);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('-# Orlando Roleplay • Select a category above to open a ticket')
  );

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

// ─────────────── Pinned Ticket Control Card (Alabama-Style) ───────────────
function buildOrlandoTicketControlCard(ticket) {
  const isClaimed = !!ticket.claimedBy;
  const accentColor = isClaimed ? 0x57f287 : 0xd35400;
  const container = new ContainerBuilder().setAccentColor(accentColor);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${ticket.categoryName}`)
  );

  container.addSeparatorComponents(thinLine());

  const handlerText = isClaimed ? `<@${ticket.claimedBy}>` : '*None (Awaiting Staff)*';
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `> **Opened By:** <@${ticket.authorId}>\n` +
      `> **Assigned Handler:** ${handlerText}`
    )
  );

  container.addSectionComponents(
    sectionRow(
      'Status',
      isClaimed
        ? `Claimed and handled by <@${ticket.claimedBy}>.`
        : 'Awaiting an available staff member to claim.',
      isClaimed ? '🟢 Claimed' : '🔴 Unclaimed',
      'orlando_info_status',
      isClaimed ? ButtonStyle.Success : ButtonStyle.Danger
    )
  );

  if (ticket.reason) {
    container.addSeparatorComponents(thinLine());
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`> **Reason for Opening:** ${ticket.reason}`)
    );
  }

  container.addSeparatorComponents(thinLine());

  const buttons = [];
  if (isClaimed) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`orlando_unclaim_${ticket.channelId}`)
        .setLabel('Unclaim Ticket')
        .setStyle(ButtonStyle.Secondary)
    );
  } else {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`orlando_claim_${ticket.channelId}`)
        .setLabel('Claim Ticket')
        .setStyle(ButtonStyle.Success)
    );
  }

  buttons.push(
    new ButtonBuilder()
      .setCustomId(`orlando_close_${ticket.channelId}`)
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger)
  );

  container.addActionRowComponents(new ActionRowBuilder().addComponents(...buttons));

  return container;
}

// ─────────────── Command Reference List (!list) ───────────────
function buildOrlandoCommandsList() {
  const container = new ContainerBuilder().setAccentColor(0x0080ff);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## 📋 Orlando Support — Command Reference\n` +
      `Here is a complete list of commands and features available for Orlando Support and ticket management.`
    )
  );

  container.addSeparatorComponents(thinLine());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### 🎫 Support Panel Deployment\n` +
      `> • \`-panel\` or \`!panel\` — Post the official Orlando Support panel with banner and category menu.\n` +
      `> • \`-support panel\` or \`-staff panel\` — Alternative aliases to post the panel.\n` +
      `> • \`/support panel [channel]\` — Slash command to deploy the panel to any selected channel.\n\n` +
      `### 🛠️ In-Ticket Management\n` +
      `> • \`Claim Ticket\` button or \`-claim\` — Claim ticket (switches channel name to 🟢・ and status to 🟢 Claimed).\n` +
      `> • \`Unclaim Ticket\` button or \`-unclaim\` — Release ticket back to queue (🔴・ and 🔴 Unclaimed).\n` +
      `> • \`Close Ticket\` button or \`-close [reason]\` — Close and delete ticket.\n` +
      `> • \`-add @user\` or \`/add target:@user\` — Add a member to the private ticket channel.\n` +
      `> • \`-unadd @user\` or \`/unadd target:@user\` — Remove a member from the active ticket channel.\n\n` +
      `### 🤝 Partnership Operations\n` +
      `> • \`-partnership [ad text]\` — Submit your server advertisement for review.\n` +
      `> • \`/proof screenshot:<file>\` or \`-proof\` — Submit proof screenshot to approve partnership.\n\n` +
      `### 👋 Welcome & Community\n` +
      `> • \`-welcome test\` or \`/welcome test\` — Send a test welcome card to <#${WELCOME_CHANNEL_ID}>.\n` +
      `> • \`!list\` or \`-list\` — Show this command reference guide.`
    )
  );

  container.addSeparatorComponents(thinLine());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('-# Orlando Roleplay • Support Operations & Command Guide')
  );

  return container;
}

// ─────────────── Partnership Proof Handler ───────────────
async function handleOrlandoProof(interactionOrMessage, isSlash, screenshotUrl) {
  const channel = interactionOrMessage.channel;
  const ticket = orlandoTickets.get(channel.id);
  const author = isSlash ? interactionOrMessage.user : interactionOrMessage.author;

  if (!ticket || ticket.category !== 'partnership') {
    const msg = '❌ This command can only be used inside an active partnership ticket channel.';
    if (isSlash) {
      return interactionOrMessage.reply({ content: msg, flags: MessageFlags.Ephemeral });
    }
    return interactionOrMessage.reply(msg);
  }

  ticket.partnershipStep = 'completed';
  saveOrlandoTickets();

  // Forward screenshot to proof channel if exists
  const guild = interactionOrMessage.guild;
  const proofChan = guild.channels.cache.find(
    (c) => c.isTextBased() && /(proof|partner-proof|partnership-proof)/i.test(c.name)
  );
  if (proofChan && screenshotUrl) {
    try {
      const proofCard = new ContainerBuilder().setAccentColor(0x3498db);
      proofCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Partnership Proof Submitted'));
      proofCard.addSeparatorComponents(thinLine());
      proofCard.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `> **Representative:** <@${author.id}>\n` +
          `> **Ticket Channel:** <#${channel.id}>\n` +
          `> **Status:** Verification Passed\n` +
          `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:F>`
        )
      );
      proofCard.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(screenshotUrl))
      );
      await proofChan.send({
        components: [proofCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
    } catch {}
  }

  // Forward ad to partnerships channel if exists
  const publishChan = guild.channels.cache.find(
    (c) => c.isTextBased() && /(partnership|partnerships|affiliates|partner-ads)/i.test(c.name)
  );
  if (publishChan && ticket.partnerAd) {
    try {
      const plainAd =
        `# Community Partnership\n` +
        `> **Representative:** <@${author.id}>\n` +
        `> **Date:** <t:${Math.floor(Date.now() / 1000)}:d>\n` +
        `───────────────────────────────────────\n\n` +
        `${ticket.partnerAd}\n\n` +
        `───────────────────────────────────────\n` +
        `-# Orlando Roleplay • Official Partnership`;
      await publishChan.send({
        content: plainAd.slice(0, 2000),
        allowedMentions: { parse: [] }
      });
    } catch {}
  }

  const confirmCard = new ContainerBuilder().setAccentColor(0x3498db);
  confirmCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Partnership Approved & Published!'));
  confirmCard.addSeparatorComponents(thinLine());
  confirmCard.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `> **Status:** Passed & Approved\n` +
      `> Your proof screenshot has been recorded and verified.\n` +
      `> Your community partnership advertisement has been published.\n\n` +
      `**Thank you for partnering with Orlando Roleplay!**\n\n` +
      `⏱️ *This ticket is finished and will automatically close in **5 minutes** if not closed below.*`
    )
  );
  confirmCard.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`orlando_close_${ticket.channelId}`)
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Danger)
    )
  );

  if (isSlash) {
    await interactionOrMessage.reply({
      components: [confirmCard.toJSON()],
      flags: MessageFlags.IsComponentsV2
    });
  } else {
    await channel.send({
      components: [confirmCard.toJSON()],
      flags: MessageFlags.IsComponentsV2
    });
  }

  // 5-minute auto close timer
  setTimeout(async () => {
    try {
      const curTicket = orlandoTickets.get(ticket.channelId);
      if (curTicket) {
        await channel.send('⏱️ **5-minute completion window reached.** Closing ticket now...').catch(() => null);
        orlandoTickets.delete(ticket.channelId);
        saveOrlandoTickets();
        await channel.delete().catch(() => null);
      }
    } catch {}
  }, 5 * 60 * 1000);
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

    if (raw === '!list' || raw === '-list' || raw === '!help' || raw === '-help') {
      const listContainer = buildOrlandoCommandsList();
      await message.reply({
        components: [listContainer.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
      return;
    }

    if (raw === '-claim' || raw === '-ticket claim') {
      const ticket = orlandoTickets.get(message.channel.id);
      if (!ticket) return;
      const isStaff = await getIsStaff();
      if (!isStaff) return;
      ticket.claimedBy = message.author.id;
      saveOrlandoTickets();
      await message.channel.setName(`🟢・${ticket.chanBase || ticket.category}`).catch(() => null);
      const updatedCard = buildOrlandoTicketControlCard(ticket);
      const pinned = await message.channel.messages.fetchPinned().catch(() => null);
      const ctrlMsg = pinned?.find((m) => m.author.id === client.user.id && m.flags?.has?.(MessageFlags.IsComponentsV2));
      if (ctrlMsg) {
        await ctrlMsg.edit({ components: [updatedCard.toJSON()], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
      }
      await message.reply(`👋 <@${message.author.id}> has claimed this ticket.`);
      return;
    }

    if (raw === '-unclaim' || raw === '-ticket unclaim') {
      const ticket = orlandoTickets.get(message.channel.id);
      if (!ticket) return;
      const isStaff = await getIsStaff();
      if (!isStaff) return;
      ticket.claimedBy = null;
      saveOrlandoTickets();
      await message.channel.setName(`🔴・${ticket.chanBase || ticket.category}`).catch(() => null);
      const updatedCard = buildOrlandoTicketControlCard(ticket);
      const pinned = await message.channel.messages.fetchPinned().catch(() => null);
      const ctrlMsg = pinned?.find((m) => m.author.id === client.user.id && m.flags?.has?.(MessageFlags.IsComponentsV2));
      if (ctrlMsg) {
        await ctrlMsg.edit({ components: [updatedCard.toJSON()], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
      }
      await message.reply(`🔄 <@${message.author.id}> has unclaimed this ticket.`);
      return;
    }

    if (raw.startsWith('-partnership ')) {
      const ticket = orlandoTickets.get(message.channel.id);
      if (!ticket) return;
      const ad = message.content.slice(13).trim();
      ticket.partnerAd = ad;
      saveOrlandoTickets();
      await message.reply('✅ Partner advertisement recorded! Now please post our advertisement in your community and run `/proof <screenshot>` or `-proof` (with screenshot attachment).');
      return;
    }

    if (raw === '-proof' || raw.startsWith('-proof ')) {
      const attachment = message.attachments.first()?.url || message.content.split(/\s+/)[1];
      if (!attachment) {
        await message.reply('❌ Please attach a screenshot: `-proof` (with attached image)');
        return;
      }
      await handleOrlandoProof(message, false, attachment);
      return;
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

      if (interaction.commandName === 'list') {
        const listContainer = buildOrlandoCommandsList();
        await interaction.reply({
          components: [listContainer.toJSON()],
          flags: MessageFlags.IsComponentsV2
        });
        return;
      }

      if (interaction.commandName === 'claim') {
        const ticket = orlandoTickets.get(interaction.channelId);
        if (!ticket) {
          await interaction.reply({
            content: '❌ This channel is not an active Orlando Support ticket.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        ticket.claimedBy = interaction.user.id;
        saveOrlandoTickets();
        await interaction.channel.setName(`🟢・${ticket.chanBase || ticket.category}`).catch(() => null);
        const updatedCard = buildOrlandoTicketControlCard(ticket);
        await interaction.reply({
          content: `👋 <@${interaction.user.id}> has claimed this ticket.`
        });
        const pinned = await interaction.channel.messages.fetchPinned().catch(() => null);
        const ctrlMsg = pinned?.find((m) => m.author.id === client.user.id && m.flags?.has?.(MessageFlags.IsComponentsV2));
        if (ctrlMsg) {
          await ctrlMsg.edit({ components: [updatedCard.toJSON()], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
        }
        return;
      }

      if (interaction.commandName === 'unclaim') {
        const ticket = orlandoTickets.get(interaction.channelId);
        if (!ticket) {
          await interaction.reply({
            content: '❌ This channel is not an active Orlando Support ticket.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        ticket.claimedBy = null;
        saveOrlandoTickets();
        await interaction.channel.setName(`🔴・${ticket.chanBase || ticket.category}`).catch(() => null);
        const updatedCard = buildOrlandoTicketControlCard(ticket);
        await interaction.reply({
          content: `🔄 <@${interaction.user.id}> has unclaimed this ticket.`
        });
        const pinned = await interaction.channel.messages.fetchPinned().catch(() => null);
        const ctrlMsg = pinned?.find((m) => m.author.id === client.user.id && m.flags?.has?.(MessageFlags.IsComponentsV2));
        if (ctrlMsg) {
          await ctrlMsg.edit({ components: [updatedCard.toJSON()], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
        }
        return;
      }

      if (interaction.commandName === 'proof') {
        const attachment = interaction.options.getAttachment('screenshot', true);
        await handleOrlandoProof(interaction, true, attachment.url);
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
      const chanBase = `${cat}-${cleanName}`;
      const chanName = `🔴・${chanBase}`;

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
        chanBase,
        reason,
        openedAt: Date.now(),
        claimedBy: null
      };

      orlandoTickets.set(ticketChannel.id, ticketData);
      saveOrlandoTickets();

      // 1. Top welcome ping
      await ticketChannel.send({
        content: `<@${interaction.user.id}>\n` +
          (cat === 'partnership'
            ? 'Welcome to your partnership ticket! Please select what type of partnership you are opening below.'
            : 'Welcome to your assistance ticket. Staff will assist you shortly!'),
        allowedMentions: { users: [interaction.user.id] }
      });

      // 2. Pinned control card
      const controlCard = buildOrlandoTicketControlCard(ticketData);
      const ctrlMsg = await ticketChannel.send({
        components: [controlCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });

      try {
        await ctrlMsg.pin();
        ticketData.controlMessageId = ctrlMsg.id;
        saveOrlandoTickets();
      } catch {}

      // 3. If partnership ticket, post the interactive selector
      if (cat === 'partnership') {
        const selectTypeCard = new ContainerBuilder().setAccentColor(0x3498db);
        selectTypeCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Select Partnership Type'));
        selectTypeCard.addSeparatorComponents(thinLine());
        selectTypeCard.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `Welcome <@${interaction.user.id}>! Please choose which partnership path you would like to pursue:\n\n` +
            `• **Regular Partnership**\n` +
            `> Mutual advertisement exchange for active community servers.\n\n` +
            `• **Paid Partnership**\n` +
            `> Direct promotion game passes for communities seeking advertising with here or everyone ping tiers.\n\n` +
            `• **Staff Partnership & Transfers**\n` +
            `> Reciprocal staff transfers and rank correlation for partner community staff members.`
          )
        );
        selectTypeCard.addSeparatorComponents(thinLine());
        const selectTypeRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`orlando_part_regular_${ticketChannel.id}`)
            .setLabel('Regular Partnership')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`orlando_part_paid_${ticketChannel.id}`)
            .setLabel('Paid Partnership')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`orlando_part_staff_${ticketChannel.id}`)
            .setLabel('Staff Partnership')
            .setStyle(ButtonStyle.Success)
        );
        selectTypeCard.addActionRowComponents(selectTypeRow);

        await ticketChannel.send({
          components: [selectTypeCard.toJSON()],
          flags: MessageFlags.IsComponentsV2
        });
      }

      await interaction.editReply({
        content: `✅ Your ticket has been opened: <#${ticketChannel.id}>`
      });
      return;
    }

    // ─────────────── Buttons: Claim / Unclaim / Close / Partnership ───────────────
    if (interaction.isButton() && interaction.customId.startsWith('orlando_claim_')) {
      const channelId = interaction.customId.replace('orlando_claim_', '');
      const ticket = orlandoTickets.get(channelId);
      if (!ticket) {
        await interaction.reply({ content: 'Ticket record not found.', flags: MessageFlags.Ephemeral });
        return;
      }
      ticket.claimedBy = interaction.user.id;
      saveOrlandoTickets();

      await interaction.channel.setName(`🟢・${ticket.chanBase || ticket.category}`).catch(() => null);

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

    if (interaction.isButton() && interaction.customId.startsWith('orlando_unclaim_')) {
      const channelId = interaction.customId.replace('orlando_unclaim_', '');
      const ticket = orlandoTickets.get(channelId);
      if (!ticket) {
        await interaction.reply({ content: 'Ticket record not found.', flags: MessageFlags.Ephemeral });
        return;
      }
      ticket.claimedBy = null;
      saveOrlandoTickets();

      await interaction.channel.setName(`🔴・${ticket.chanBase || ticket.category}`).catch(() => null);

      const updatedCard = buildOrlandoTicketControlCard(ticket);
      await interaction.update({
        components: [updatedCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
      await interaction.channel.send({
        content: `🔄 <@${interaction.user.id}> has unclaimed this ticket. It is now open for any staff member.`
      });
      return;
    }

    // Partnership Type Selection Buttons
    if (interaction.isButton() && interaction.customId.startsWith('orlando_part_regular_')) {
      const channelId = interaction.customId.replace('orlando_part_regular_', '');
      const ticket = orlandoTickets.get(channelId);
      if (ticket) {
        ticket.partnershipType = 'regular';
        ticket.partnershipStep = 'awaiting_ad';
        saveOrlandoTickets();
      }

      const regularCard = new ContainerBuilder().setAccentColor(0x3498db);
      regularCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Regular Partnership Selected'));
      regularCard.addSeparatorComponents(thinLine());
      regularCard.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `> **Tier:** Mutual Community Advertising Exchange\n` +
          `> **Requirement:** Active community server\n` +
          `> **Placement:** Reciprocal advertisement placement in our partnerships channel.\n\n` +
          `### Next Steps & Advertisement Submission\n` +
          `> **1. Submit Server Advertisement**\n` +
          `> Send your community description and Discord invite in this channel using:\n` +
          `> \`-partnership [Your Server Details & Ad Message]\`\n\n` +
          `> **2. Reciprocal Advertisement**\n` +
          `> Once reviewed, post our official server advertisement in your community.\n\n` +
          `> **3. Proof Submission**\n` +
          `> After posting our ad in your server, run \`/proof screenshot:<file>\` or \`-proof\` (with screenshot attachment) to confirm reciprocal posting.`
        )
      );
      await interaction.update({
        components: [regularCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('orlando_part_paid_')) {
      const channelId = interaction.customId.replace('orlando_part_paid_', '');
      const ticket = orlandoTickets.get(channelId);
      if (ticket) {
        ticket.partnershipType = 'paid';
        saveOrlandoTickets();
      }

      const paidCard = new ContainerBuilder().setAccentColor(0x3498db);
      paidCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Paid Partnership Selected'));
      paidCard.addSeparatorComponents(thinLine());
      paidCard.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `> **Tier:** Paid Community Promotion & Advertising Tiers\n\n` +
          `### Available Options\n` +
          `> • **Tier 1:** Standard partner ad with \`@here\` ping.\n` +
          `> • **Tier 2:** Highlighted partner ad with \`@everyone\` ping.\n\n` +
          `Please provide your server invite, description, and link to game pass / proof of support in this channel for staff review.`
        )
      );
      await interaction.update({
        components: [paidCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('orlando_part_staff_')) {
      const channelId = interaction.customId.replace('orlando_part_staff_', '');
      const ticket = orlandoTickets.get(channelId);
      if (ticket) {
        ticket.partnershipType = 'staff';
        saveOrlandoTickets();
      }

      const staffCard = new ContainerBuilder().setAccentColor(0x3498db);
      staffCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Staff Partnership & Transfers'));
      staffCard.addSeparatorComponents(thinLine());
      staffCard.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `> **Tier:** Partner Server Staff Transfers & Reciprocal Rank Correlation\n\n` +
          `### Requirements\n` +
          `> • Please only request roles corresponding to your verified rank in the partner community.\n` +
          `> • You may use \`-add @user\` to add partner server representatives to this ticket.\n\n` +
          `Staff will review your rank transfers and assist you shortly.`
        )
      );
      await interaction.update({
        components: [staffCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
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

    // Status pill buttons
    if (interaction.isButton() && interaction.customId === 'orlando_info_status') {
      const ticket = orlandoTickets.get(interaction.channelId);
      const isClaimed = !!ticket?.claimedBy;
      await interaction.reply({
        content: isClaimed
          ? `🟢 This ticket is currently claimed and being handled by <@${ticket.claimedBy}>.`
          : '🔴 This ticket is currently open and awaiting an available staff member to claim.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

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
