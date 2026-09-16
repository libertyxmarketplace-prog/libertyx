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

const ORLANDO_DESK_FILE = path.join(__dirname, '..', 'orlando_desk_state.json');
let orlandoDeskState = {
  status: 'online',
  categories: {
    general: true,
    ia: true,
    highrank: true,
    partnership: true,
    staff_partnership: true
  }
};

function loadOrlandoDeskState() {
  try {
    if (fs.existsSync(ORLANDO_DESK_FILE)) {
      orlandoDeskState = JSON.parse(fs.readFileSync(ORLANDO_DESK_FILE, 'utf8'));
    }
  } catch (err) {
    console.warn('[Orlando] Could not read desk state:', err.message);
  }
}

function saveOrlandoDeskState() {
  try {
    fs.writeFileSync(ORLANDO_DESK_FILE, JSON.stringify(orlandoDeskState, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Orlando] Could not save desk state:', err.message);
  }
}

const ORLANDO_PANELS_FILE = path.join(__dirname, '..', 'orlando_panels.json');
const orlandoPanels = new Map();

function loadOrlandoPanels() {
  try {
    if (fs.existsSync(ORLANDO_PANELS_FILE)) {
      const data = JSON.parse(fs.readFileSync(ORLANDO_PANELS_FILE, 'utf8'));
      for (const [k, v] of Object.entries(data)) orlandoPanels.set(k, v);
    }
  } catch (err) {
    console.warn('[Orlando] Could not read panels file:', err.message);
  }
}

function saveOrlandoPanels() {
  try {
    const flat = {};
    for (const [k, v] of orlandoPanels) flat[k] = v;
    fs.writeFileSync(ORLANDO_PANELS_FILE, JSON.stringify(flat, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Orlando] Could not save panels file:', err.message);
  }
}

async function refreshOrlandoPanels() {
  for (const [chanKey, msgId] of [...orlandoPanels]) {
    const parts = chanKey.split(':');
    if (parts.length !== 2) continue;
    const channelId = parts[1];
    try {
      const ch = await client.channels.fetch(channelId).catch(() => null);
      if (!ch) continue;
      const msg = await ch.messages.fetch(msgId).catch(() => null);
      if (msg) {
        const container = buildOrlandoSupportPanel();
        await msg.edit({
          components: [container.toJSON()],
          flags: MessageFlags.IsComponentsV2
        }).catch(() => null);
      }
    } catch {}
  }
}

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

  const generalOpen = orlandoDeskState.status !== 'closed' && (orlandoDeskState.categories.general !== false);
  const iaOpen = orlandoDeskState.status !== 'closed' && (orlandoDeskState.categories.ia !== false);
  const hrOpen = orlandoDeskState.status !== 'closed' && (orlandoDeskState.categories.highrank !== false);
  const partnershipOpen = orlandoDeskState.status !== 'closed' && (orlandoDeskState.categories.partnership !== false);
  const staffPartnershipOpen = orlandoDeskState.status !== 'closed' && (orlandoDeskState.categories.staff_partnership !== false);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**General Support** — ${generalOpen ? 'Community inquiries, questions, and server assistance.' : '[Closed by staff] Currently unavailable.'}\n` +
      `**Internal Affairs** — ${iaOpen ? 'Staff reports, member misconduct, and supervisory review.' : '[Closed by staff] Currently unavailable.'}\n` +
      `**High Rank Support** — ${hrOpen ? 'Executive matters, affiliations, and administrative inquiries.' : '[Closed by staff] Currently unavailable.'}\n` +
      `**Partnership Operations** — ${partnershipOpen ? 'Server partnerships, mutual promotions, and affiliations.' : '[Closed by staff] Currently unavailable.'}\n` +
      `**Staff Partnership** — ${staffPartnershipOpen ? 'Partner server staff transfers and reciprocal rank requests.' : '[Closed by staff] Currently unavailable.'}`
    )
  );

  container.addSeparatorComponents(thinLine());

  const deskCircle = orlandoDeskState.status === 'online' ? '🟢' : (orlandoDeskState.status === 'busy' ? '🟡' : '🔴');
  const deskStyle = orlandoDeskState.status === 'online' ? ButtonStyle.Success : (orlandoDeskState.status === 'busy' ? ButtonStyle.Secondary : ButtonStyle.Danger);

  container.addSectionComponents(
    sectionRow(
      'Support Desk',
      'Staff availability to assist community members.',
      deskCircle,
      'orlando_desk_status',
      deskStyle
    )
  );

  container.addSeparatorComponents(thinLine());

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('orlando_ticket_select')
    .setPlaceholder('Select a support category...')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('General Support')
        .setDescription(generalOpen ? 'Community inquiries, questions, and server assistance' : '[Closed by staff] Currently unavailable')
        .setValue('general'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Internal Affairs')
        .setDescription(iaOpen ? 'Staff reports, member misconduct, and supervisor review' : '[Closed by staff] Currently unavailable')
        .setValue('ia'),
      new StringSelectMenuOptionBuilder()
        .setLabel('High Rank Support')
        .setDescription(hrOpen ? 'Executive matters, administrative inquiries, and affiliations' : '[Closed by staff] Currently unavailable')
        .setValue('highrank'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Partnership Operations')
        .setDescription(partnershipOpen ? 'Server partnerships, mutual advertising, and affiliations' : '[Closed by staff] Currently unavailable')
        .setValue('partnership'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Staff Partnership')
        .setDescription(staffPartnershipOpen ? 'Partner server staff transfers and rank requests' : '[Closed by staff] Currently unavailable')
        .setValue('staff_partnership')
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
  const isAiClaimed = ticket.category === 'partnership';
  const isClaimed = !!ticket.claimedBy;
  const accentColor = isAiClaimed ? 0x3498db : (isClaimed ? 0x57f287 : 0xd35400);
  const container = new ContainerBuilder().setAccentColor(accentColor);

  if (fs.existsSync(BANNER_PATH)) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://orlando_support.png')
      )
    );
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${ticket.categoryName}`)
  );

  container.addSeparatorComponents(thinLine());

  const handlerText = isAiClaimed
    ? `<@${client.user?.id || 'bot'}> (Automated AI Assistant)`
    : (isClaimed ? `<@${ticket.claimedBy}>` : '*None (Awaiting Staff)*');

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `> **Opened By:** <@${ticket.authorId}>\n` +
      `> **Assigned Handler:** ${handlerText}`
    )
  );

  const circleLabel = isAiClaimed ? '🔵' : (isClaimed ? '🟢' : '🔴');
  const circleStyle = isAiClaimed ? ButtonStyle.Primary : (isClaimed ? ButtonStyle.Success : ButtonStyle.Danger);
  const statusDesc = isAiClaimed
    ? 'Claimed and automated by AI Assistant.'
    : (isClaimed ? `Claimed and handled by <@${ticket.claimedBy}>.` : 'Awaiting an available staff member to claim.');

  container.addSectionComponents(
    sectionRow(
      'Status',
      statusDesc,
      circleLabel,
      'orlando_info_status',
      circleStyle
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
  if (!isAiClaimed) {
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
  }

  buttons.push(
    new ButtonBuilder()
      .setCustomId(`orlando_close_${ticket.channelId}`)
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger)
  );

  if (ticket.category === 'partnership' || ticket.category === 'staff_partnership') {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`orlando_part_guide_${ticket.channelId}`)
        .setLabel('Partnership Requirements & Application')
        .setStyle(ButtonStyle.Primary)
    );
  }

  container.addActionRowComponents(new ActionRowBuilder().addComponents(...buttons));

  return container;
}

// ─────────────── Partnership Guide Container ───────────────
function buildPartnershipGuideContainer() {
  const container = new ContainerBuilder().setAccentColor(0x3498db);

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Partnership Requirements & Application'));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '> Thank you for your interest in partnering with **Orlando Roleplay**. Please ensure your community satisfies our official requirements below prior to submitting your application.'
    )
  );

  container.addSeparatorComponents(thinLine());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### Partnership Requirements\n\n` +
      `**1. Minimum Members**\n` +
      `Your server must have active community members, excluding bot accounts.\n\n` +
      `**2. Active Community**\n` +
      `Your server must maintain an active, respectful atmosphere.\n\n` +
      `**3. No NSFW Content**\n` +
      `NSFW content or promotions are strictly prohibited.\n\n` +
      `**4. Community Rules**\n` +
      `Your server must follow Discord Terms of Service and community standards.`
    )
  );

  container.addSeparatorComponents(thinLine());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### Partnership Form\n` +
      `Please copy, complete, and submit this form using \`-partnership\` in this ticket:\n\n` +
      `\`\`\`\n` +
      `Username:\n` +
      `Server Name:\n` +
      `Member Count:\n` +
      `Server Description:\n` +
      `Server Link:\n` +
      `\`\`\``
    )
  );

  container.addSeparatorComponents(thinLine());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `> **How to Apply:** Send \`-partnership\` followed by your completed form and advertisement in this ticket.\n` +
      `> Once verified, run \`/proof screenshot:<file>\` or \`-proof\` with a screenshot proving our advertisement is posted in your server.\n` +
      `-# If proof is not uploaded, the partnership will be revoked.`
    )
  );

  return container;
}

// ─────────────── Command Reference List (!list) ───────────────
function buildOrlandoCommandsList() {
  const container = new ContainerBuilder().setAccentColor(0x0080ff);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## Orlando Support — Operations Manual\n` +
      `Official command and department management manual for Orlando Support.`
    )
  );

  container.addSeparatorComponents(thinLine());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### Panel Deployment\n` +
      `> • -panel or -support panel — Post the official Orlando Support ticket panel.\n` +
      `> • /support panel [channel] — Deploy panel to any selected channel.\n\n` +
      `### Department Controls\n` +
      `> • -close [category] — Lock a category (e.g. -close staff partnership, -close general).\n` +
      `> • -open [category] — Unlock a category (e.g. -open staff partnership, -open general).\n` +
      `> • -close all — Close support desk and lock all categories.\n` +
      `> • -open all — Reopen support desk and unlock all categories.\n\n` +
      `### In-Ticket Management\n` +
      `> • Claim Ticket button or -claim — Claim ticket (updates channel to green circle).\n` +
      `> • Unclaim Ticket button or -unclaim — Release ticket (updates channel to red circle).\n` +
      `> • Close Ticket button or -close [reason] — Close ticket with 5-second countdown.\n` +
      `> • -add @user or /add target:@user — Add user to private ticket.\n` +
      `> • -unadd @user or /unadd target:@user — Remove user from ticket.\n\n` +
      `### Partnership Operations\n` +
      `> • -partnership [ad text] — Submit community description and ad.\n` +
      `> • /proof screenshot:[file] or -proof — Submit reciprocal ad proof screenshot.\n\n` +
      `### General & Welcome\n` +
      `> • -welcome test or /welcome test — Test welcome arrival message.\n` +
      `> • !list or -list — Display this manual.`
    )
  );

  container.addSeparatorComponents(thinLine());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('-# Orlando Roleplay • Support Operations Manual')
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
  loadOrlandoDeskState();
  loadOrlandoPanels();
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

      const panelMsg = await message.channel.send({
        files,
        components: [container.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });

      const chanKey = `${message.guild.id}:${message.channel.id}`;
      orlandoPanels.set(chanKey, panelMsg.id);
      saveOrlandoPanels();

      const confirm = await message.reply('✅ Orlando Support panel posted successfully.');
      setTimeout(() => {
        confirm.delete().catch(() => null);
        message.delete().catch(() => null);
      }, 5000);
      return;
    }

    if (raw === '-busy' || raw === 'busy') {
      const isStaff = await getIsStaff();
      if (!isStaff) return;
      orlandoDeskState.status = 'busy';
      saveOrlandoDeskState();
      await refreshOrlandoPanels();
      await message.reply('🟡 Support desk status set to **Busy** (panel updated to yellow).');
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

    // Flexible -close <category> or ticket close
    if (raw.startsWith('-close') || raw.startsWith('close')) {
      const target = raw.replace(/^-?close\s*/, '').trim();
      const isStaff = await getIsStaff();

      if (isStaff && target) {
        if (/^all$/i.test(target)) {
          orlandoDeskState.status = 'closed';
          orlandoDeskState.categories.general = false;
          orlandoDeskState.categories.ia = false;
          orlandoDeskState.categories.highrank = false;
          orlandoDeskState.categories.partnership = false;
          orlandoDeskState.categories.staff_partnership = false;
          saveOrlandoDeskState();
          await refreshOrlandoPanels();
          await message.reply('🔴 Orlando Support desk is now Closed (all categories locked).');
          return;
        }
        if (/^staff\s*partner(ship)?$/i.test(target)) {
          orlandoDeskState.categories.staff_partnership = false;
          saveOrlandoDeskState();
          await refreshOrlandoPanels();
          await message.reply('🔒 Staff Partnership is now closed.');
          return;
        }
        if (/^partner(ship)?(\s*operations)?$/i.test(target)) {
          orlandoDeskState.categories.partnership = false;
          saveOrlandoDeskState();
          await refreshOrlandoPanels();
          await message.reply('🔒 Partnership Operations is now closed.');
          return;
        }
        if (/^general(\s*support)?$/i.test(target)) {
          orlandoDeskState.categories.general = false;
          saveOrlandoDeskState();
          await refreshOrlandoPanels();
          await message.reply('🔒 General Support is now closed.');
          return;
        }
        if (/^(internal(\s*affairs)?|internals|ia)$/i.test(target)) {
          orlandoDeskState.categories.ia = false;
          saveOrlandoDeskState();
          await refreshOrlandoPanels();
          await message.reply('🔒 Internal Affairs Support is now closed.');
          return;
        }
        if (/^(high\s*rank(\s*support)?|highrank|hr)$/i.test(target)) {
          orlandoDeskState.categories.highrank = false;
          saveOrlandoDeskState();
          await refreshOrlandoPanels();
          await message.reply('🔒 High Rank Support is now closed.');
          return;
        }
      }

      // If no category matched and channel is an active ticket, close this ticket
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

    // Flexible -open <category>
    if (raw.startsWith('-open') || raw.startsWith('open')) {
      const target = raw.replace(/^-?open\s*/, '').trim();
      const isStaff = await getIsStaff();
      if (isStaff && target) {
        if (/^all$/i.test(target)) {
          orlandoDeskState.status = 'online';
          orlandoDeskState.categories.general = true;
          orlandoDeskState.categories.ia = true;
          orlandoDeskState.categories.highrank = true;
          orlandoDeskState.categories.partnership = true;
          orlandoDeskState.categories.staff_partnership = true;
          saveOrlandoDeskState();
          await refreshOrlandoPanels();
          await message.reply('🔓 Orlando Support desk is now Open (all categories online).');
          return;
        }
        if (/^staff\s*partner(ship)?$/i.test(target)) {
          orlandoDeskState.categories.staff_partnership = true;
          saveOrlandoDeskState();
          await refreshOrlandoPanels();
          await message.reply('🔓 Staff Partnership is now open.');
          return;
        }
        if (/^partner(ship)?(\s*operations)?$/i.test(target)) {
          orlandoDeskState.categories.partnership = true;
          saveOrlandoDeskState();
          await refreshOrlandoPanels();
          await message.reply('🔓 Partnership Operations is now open.');
          return;
        }
        if (/^general(\s*support)?$/i.test(target)) {
          orlandoDeskState.categories.general = true;
          saveOrlandoDeskState();
          await refreshOrlandoPanels();
          await message.reply('🔓 General Support is now open.');
          return;
        }
        if (/^(internal(\s*affairs)?|internals|ia)$/i.test(target)) {
          orlandoDeskState.categories.ia = true;
          saveOrlandoDeskState();
          await refreshOrlandoPanels();
          await message.reply('🔓 Internal Affairs Support is now open.');
          return;
        }
        if (/^(high\s*rank(\s*support)?|highrank|hr)$/i.test(target)) {
          orlandoDeskState.categories.highrank = true;
          saveOrlandoDeskState();
          await refreshOrlandoPanels();
          await message.reply('🔓 High Rank Support is now open.');
          return;
        }
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

    if (raw === '-partnership' || raw.startsWith('-partnership')) {
      const ticket = orlandoTickets.get(message.channel.id);
      if (!ticket) return;
      const ad = message.content.slice(12).trim();
      if (!ad || ad.length < 5) {
        await message.reply(
          `ℹ️ **How to Apply:**\n` +
          `Type \`-partnership\` followed by your completed server form and advertisement.\n` +
          `You can click the **Partnership Requirements & Application** button on the control card above to copy the form template!`
        );
        return;
      }
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

          const panelMsg = await targetChannel.send({
            files,
            components: [container.toJSON()],
            flags: MessageFlags.IsComponentsV2
          });

          const chanKey = `${targetChannel.guild.id}:${targetChannel.id}`;
          orlandoPanels.set(chanKey, panelMsg.id);
          saveOrlandoPanels();

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
        partnership: 'Partnership Operations',
        staff_partnership: 'Staff Partnership'
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
        partnership: 'Partnership Operations',
        staff_partnership: 'Staff Partnership'
      };
      const catName = catNames[cat] || 'Support';
      const isPartnership = cat === 'partnership';
      const isStaffPartnership = cat === 'staff_partnership';
      const cleanName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
      const chanBase = `${cat}-${cleanName}`;
      const chanPrefix = isPartnership ? '🔵・' : '🔴・';
      const chanName = `${chanPrefix}${chanBase}`;

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
      } else if (cat === 'partnership' || cat === 'staff_partnership') {
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
          : (cat === 'highrank' || cat === 'partnership' || cat === 'staff_partnership')
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
        claimedBy: isPartnership ? client.user.id : null,
        isStaffPartnership
      };

      orlandoTickets.set(ticketChannel.id, ticketData);
      saveOrlandoTickets();

      // 1. Top welcome ping
      await ticketChannel.send({
        content: `<@${interaction.user.id}>\n` +
          (isPartnership
            ? 'Welcome to your partnership ticket! Please select what type of partnership you are opening below.'
            : isStaffPartnership
              ? 'Welcome to your staff partnership and rank transfer ticket! Please read the requirements below.'
              : 'Welcome to your assistance ticket. Staff will assist you shortly!'),
        allowedMentions: { users: [interaction.user.id] }
      });

      // 2. Pinned control card with file attachment so banner displays inside ticket
      const controlCard = buildOrlandoTicketControlCard(ticketData);
      const files = [];
      if (fs.existsSync(BANNER_PATH)) {
        files.push(new AttachmentBuilder(BANNER_PATH, { name: 'orlando_support.png' }));
      }
      const ctrlMsg = await ticketChannel.send({
        files,
        components: [controlCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });

      try {
        await ctrlMsg.pin();
        ticketData.controlMessageId = ctrlMsg.id;
        saveOrlandoTickets();
      } catch {}

      // 3. If partnership ticket, post the interactive selector
      if (isPartnership) {
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

      // 4. If staff partnership ticket, post staff transfer orientation
      if (isStaffPartnership) {
        const staffPartCard = new ContainerBuilder().setAccentColor(0x3498db);
        staffPartCard.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## Staff Partnership & Rank Transfer Department\n` +
            `Welcome <@${interaction.user.id}> to your official staff partnership and rank transfer ticket.\n\n` +
            `### When Requesting Roles & Transfers\n` +
            `> When submitting a role request for yourself or server representatives:\n` +
            `> • **Matching Rank:** Please only request roles that correlate directly with your current position or rank in the partner community (Lower Rank, Supervisor, High Rank).\n` +
            `> • **Dividers Included:** Make sure to include all roles you are eligible for, including required divider roles.\n` +
            `> • **Applicability:** These requirements apply to all departments and divisions within Orlando Roleplay.\n\n` +
            `> You may use \`-add @user\` to add partner server representatives to this ticket.`
          )
        );
        staffPartCard.addSeparatorComponents(thinLine());
        const staffPartRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`orlando_part_guide_${ticketChannel.id}`)
            .setLabel('Partnership Requirements & Application')
            .setStyle(ButtonStyle.Secondary)
        );
        staffPartCard.addActionRowComponents(staffPartRow);

        await ticketChannel.send({
          components: [staffPartCard.toJSON()],
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

    // Partnership Requirements & Application button
    if (interaction.isButton() && interaction.customId.startsWith('orlando_part_guide_')) {
      await interaction.reply({
        components: [buildPartnershipGuideContainer().toJSON()],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
      });
      return;
    }

    // Status pill buttons
    if (interaction.isButton() && interaction.customId === 'orlando_info_status') {
      const ticket = orlandoTickets.get(interaction.channelId);
      const isAiClaimed = ticket?.category === 'partnership';
      const isClaimed = !!ticket?.claimedBy;
      await interaction.reply({
        content: isAiClaimed
          ? '🔵 This ticket is automated and managed by the Automated AI Assistant.'
          : (isClaimed
            ? `🟢 This ticket is currently claimed and being handled by <@${ticket.claimedBy}>.`
            : '🔴 This ticket is currently open and awaiting an available staff member to claim.'),
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.isButton() && interaction.customId === 'orlando_desk_status') {
      const statusText =
        orlandoDeskState.status === 'online'
          ? '🟢 Orlando Support Desk is currently online and accepting inquiries.'
          : orlandoDeskState.status === 'busy'
            ? '🟡 Orlando Support Desk is currently busy; staff are assisting with active inquiries.'
            : '🔴 Orlando Support Desk is currently closed.';
      await interaction.reply({
        content: statusText,
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
