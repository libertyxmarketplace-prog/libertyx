import 'dotenv/config';
import axios from 'axios';
import fs from 'node:fs';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  AuditLogEvent,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  ContainerBuilder,
  Events,
  GatewayIntentBits,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  REST,
  Routes,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  TextDisplayBuilder,
  ThumbnailBuilder
} from 'discord.js';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import path from 'node:path';

/**
 * ─────────────────────────────────────────────────────────────────────
 *  SERVER CONFIG ─ edit this block to match YOUR community.
 *  Everything here is hardcoded so you don't need .env for session data.
 * ─────────────────────────────────────────────────────────────────────
 */
const SERVER = {
  // In-game private server name (as shown on the join page).
  name: 'Alabama State Roleplay',

  // Server owner display name + their Roblox profile URL.
  ownerName: '✿ Rose <3',
  ownerUrl: 'https://www.roblox.com/users/2747528505/profile',

  // The private server code (JoinKey).
  code: 'ALABAM',

  // Join link for the Quick Join button.
  joinUrl: 'https://policeroleplay.community/join/ALABAM',

  // Banner image shown at the top of the session embed (set to '' to hide).
  bannerUrl:
    'https://media.discordapp.net/attachments/1543836515656802504/1548516038650630164/image.png?ex=6aa75771&is=6aa605f1&hm=9ecfd8ab0cecf813953d81e7dbf75fdd0941eb84b64f6cdb36a74ecee22d0ecb&=&format=webp&quality=lossless',

  // Small icon next to the author name (set to '' to hide).
  logoUrl: 'https://cdn.discordapp.com/emojis/1536900254304174080.webp?size=40',

  // The role given to users who click "Session Notification".
  pingRoleId: '1341965116098351165',

  // Embed accent color (0xRRGGBB). Session bar auto-switches green/red by status.
  color: 0x2b2d31,

  // Original intro paragraph for the session card.
  description:
    'Alabama State Roleplay runs live, staff-supervised operations. Hop into the private server for structured patrols, realistic calls, and a respectful community atmosphere.',

  // Shown on the red "Session Closed" card posted by /session shutdown.
  shutdownText:
    "The staff team has wrapped up tonight's session and the server is now closed. This can happen when staff availability drops, the player count gets low, or the session simply runs its course. If you're still in-game, please head out - and we'll see you at the next one!",

  // Banner image shown at the top of the session vote card.
  voteBannerUrl:
    'https://cdn.discordapp.com/attachments/1543836515656802504/1548635509864013904/vote_banner.png?ex=6aa7c6b5&is=6aa67535&hm=24f16b550d56360950f9d64bddad1a4711b6cad836e0bf5da94873c83c5afabe&',

  // Small strip image at the BOTTOM of the Session Closed card (no top banner).
  shutdownBannerUrl:
    'https://cdn.discordapp.com/attachments/1543836515656802504/1548521705939533824/image-removebg-preview_9.png?ex=6aa75cb8&is=6aa60b38&hm=2d442eec01099be7b0f251c26b31aad53e76b0c4e84d559fad3f4c6ace0a64bd&'
};

/**
 * They belong in .env (they are secrets / account-specific).
 * Only DISCORD_TOKEN, CLIENT_ID and GUILD_ID are required.
 * SESSION_CHANNEL_ID and the ERLC_* variables are optional.
 */
function cleanEnv(val, fallback = '') {
  if (!val) return fallback;
  return String(val).trim().replace(/[\r\n\t\s]+/g, '');
}

const config = {
  token: cleanEnv(process.env.DISCORD_TOKEN),
  clientId: cleanEnv(process.env.CLIENT_ID) === 'CLIENT_ID' || !cleanEnv(process.env.CLIENT_ID) ? '1402908543488626729' : cleanEnv(process.env.CLIENT_ID),
  guildId: cleanEnv(process.env.GUILD_ID) === 'GUILD_ID' || !cleanEnv(process.env.GUILD_ID) ? '1232495211490443284' : cleanEnv(process.env.GUILD_ID),
  sessionChannelId: cleanEnv(process.env.SESSION_CHANNEL_ID),
  apiKey: cleanEnv(process.env.ERLC_API_KEY),
  apiUrl: (process.env.ERLC_API_URL || '').trim().replace(/[\r\n\t\s]+/g, ''),
  serverCode: (process.env.ERLC_SERVER_CODE || '').trim(),
  bannerUrl: (process.env.SESSION_BANNER_URL || '').trim(),
  voteBannerUrl: (process.env.VOTE_BANNER_URL || '').trim(),
  pingRoleId: cleanEnv(process.env.SESSION_PING_ROLE_ID)
};

const requiredSecrets = ['DISCORD_TOKEN'];
const missingSecrets = requiredSecrets.filter((name) => !config.token);
if (missingSecrets.length) {
  throw new Error(`Missing environment variables: ${missingSecrets.join(', ')}`);
}

const sessionCommand = new SlashCommandBuilder()
  .setName('session')
  .setDescription('Alabama State Roleplay session tools.')
  .addSubcommand((sub) =>
    sub
      .setName('panel')
      .setDescription('Post the live session panel.')
      .addRoleOption((opt) =>
        opt
          .setName('ping_role')
          .setDescription('Role to ping at the top of the panel (hidden spoiler ping).')
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('vote')
      .setDescription('Open a live vote - when enough members join, the host can launch the session.')
      .addIntegerOption((opt) =>
        opt
          .setName('required')
          .setDescription('How many votes are needed to start the session.')
          .setRequired(true)
          .setMinValue(2)
          .setMaxValue(200)
      )
      .addStringOption((opt) =>
        opt
          .setName('duration')
          .setDescription('How long the vote stays open.')
          .setRequired(true)
          .addChoices(
            { name: '30 minutes', value: '30m' },
            { name: '1 hour', value: '1h' },
            { name: '2 hours', value: '2h' },
            { name: '5 hours', value: '5h' }
          )
      )
      .addRoleOption((opt) =>
        opt
          .setName('ping_role')
          .setDescription('Role to ping when the session is ready.')
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('shutdown')
      .setDescription('Close the session - red Session Closed card, panel goes down, voters get a DM.')
  );

const ticketCommand = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Assistance ticket tools.')
  .addSubcommand((sub) =>
    sub
      .setName('panel')
      .setDescription('Post the assistance ticket panel.')
  );

const staffCommand = new SlashCommandBuilder()
  .setName('staff')
  .setDescription('Alabama State Roleplay staff management commands.')
  .addSubcommand((sub) =>
    sub
      .setName('panel')
      .setDescription('Post the live session / staff panel.')
      .addRoleOption((opt) =>
        opt
          .setName('ping_role')
          .setDescription('Role to ping at the top of the panel (hidden spoiler ping).')
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('promotion')
      .setDescription('Post an official staff promotion notice.')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('Staff member being promoted').setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName('new_rank').setDescription('Their new staff rank / position').setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName('previous_rank').setDescription('Their previous staff rank').setRequired(true)
      )
      .addRoleOption((opt) =>
        opt.setName('give_role').setDescription('Role to automatically assign to this member (optional)').setRequired(false)
      )
      .addRoleOption((opt) =>
        opt.setName('remove_role').setDescription('Old role to automatically remove from member (optional)').setRequired(false)
      )
      .addStringOption((opt) =>
        opt.setName('reason').setDescription('Reason or commendation for the promotion').setRequired(false)
      )
      .addStringOption((opt) =>
        opt.setName('notes').setDescription('Optional extra notes or instructions').setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('derank')
      .setDescription('Post a staff demotion notice and automatically remove their role.')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('Staff member being demoted / deranked').setRequired(true)
      )
      .addRoleOption((opt) =>
        opt.setName('remove_role').setDescription('Role to remove from this member').setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName('new_rank').setDescription('New status or rank (e.g. Demoted, Suspended, or new rank)').setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName('reason').setDescription('Reason for the demotion / infraction').setRequired(true)
      )
      .addRoleOption((opt) =>
        opt.setName('give_role').setDescription('New lower role to give to member (optional)').setRequired(false)
      )
      .addStringOption((opt) =>
        opt.setName('notes').setDescription('Optional notes or appeal instructions').setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('feedback')
      .setDescription('Submit feedback and a star rating for a staff member.')
      .addUserOption((opt) =>
        opt.setName('staff').setDescription('The staff member to give feedback on').setRequired(true)
      )
      .addIntegerOption((opt) =>
        opt
          .setName('rating')
          .setDescription('Star rating (1 to 5 stars)')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(5)
      )
      .addStringOption((opt) =>
        opt.setName('comments').setDescription('Your feedback and comments').setRequired(true)
      )
      .addBooleanOption((opt) =>
        opt.setName('anonymous').setDescription('Submit feedback anonymously? (optional)').setRequired(false)
      )
  )
  .addSubcommandGroup((grp) =>
    grp
      .setName('application')
      .setDescription('Staff application panel commands.')
      .addSubcommand((sub) =>
        sub
          .setName('panel')
          .setDescription('Post the staff application desk panel.')
          .addChannelOption((opt) =>
            opt.setName('channel').setDescription('Channel to post panel into (defaults to #applications)').setRequired(false)
          )
      )
  );

const appealCommand = new SlashCommandBuilder()
  .setName('appeal')
  .setDescription('Submit an official appeal for an Alabama State Roleplay in-game ban.');

const suggestionCommand = new SlashCommandBuilder()
  .setName('suggestion')
  .setDescription('Alabama State Roleplay community suggestion tools.')
  .addSubcommand((sub) =>
    sub
      .setName('submit')
      .setDescription('Submit a community suggestion.')
      .addStringOption((opt) =>
        opt.setName('suggestion').setDescription('Your suggestion idea or feature').setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('top')
      .setDescription('View the highest-rated community suggestion.')
  );

const suggestCommand = new SlashCommandBuilder()
  .setName('suggest')
  .setDescription('Quickly submit a community suggestion.')
  .addStringOption((opt) =>
    opt.setName('suggestion').setDescription('Your suggestion idea or feature').setRequired(true)
  );

const proofCommand = new SlashCommandBuilder()
  .setName('proof')
  .setDescription('Submit verification proof for operations.')
  .addSubcommand((sub) =>
    sub
      .setName('partnership')
      .setDescription('Upload screenshot proof of Alabama State Roleplay advertisement in your server.')
      .addAttachmentOption((opt) =>
        opt
          .setName('screenshot')
          .setDescription('Screenshot showing our advertisement posted in your server.')
          .setRequired(true)
      )
  );

const banCommand = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Ban a user from the server.')
  .addUserOption((opt) =>
    opt.setName('target').setDescription('User to ban').setRequired(true)
  )
  .addStringOption((opt) =>
    opt.setName('reason').setDescription('Reason for the ban').setRequired(false)
  )
  .addIntegerOption((opt) =>
    opt
      .setName('delete_days')
      .setDescription('Days of message history to delete (0-7)')
      .setMinValue(0)
      .setMaxValue(7)
      .setRequired(false)
  );

const kickCommand = new SlashCommandBuilder()
  .setName('kick')
  .setDescription('Kick a member from the server.')
  .addUserOption((opt) =>
    opt.setName('target').setDescription('Member to kick').setRequired(true)
  )
  .addStringOption((opt) =>
    opt.setName('reason').setDescription('Reason for the kick').setRequired(false)
  );

const timeoutCommand = new SlashCommandBuilder()
  .setName('timeout')
  .setDescription('Timeout/mute a member.')
  .addUserOption((opt) =>
    opt.setName('target').setDescription('Member to timeout').setRequired(true)
  )
  .addStringOption((opt) =>
    opt
      .setName('duration')
      .setDescription('Duration of timeout (e.g. 5m, 10m, 1h, 1d, 1w)')
      .setRequired(true)
      .addChoices(
        { name: '60 seconds', value: '60s' },
        { name: '5 minutes', value: '5m' },
        { name: '10 minutes', value: '10m' },
        { name: '1 hour', value: '1h' },
        { name: '1 day', value: '1d' },
        { name: '1 week', value: '1w' }
      )
  )
  .addStringOption((opt) =>
    opt.setName('reason').setDescription('Reason for timeout').setRequired(false)
  );

const purgeCommand = new SlashCommandBuilder()
  .setName('purge')
  .setDescription('Bulk delete messages from this channel.')
  .addIntegerOption((opt) =>
    opt
      .setName('amount')
      .setDescription('Number of messages to delete (1-100)')
      .setMinValue(1)
      .setMaxValue(100)
      .setRequired(true)
  )
  .addUserOption((opt) =>
    opt.setName('user').setDescription('Only delete messages from this user (optional)').setRequired(false)
  );

const antiNukeCommand = new SlashCommandBuilder()
  .setName('antinuke')
  .setDescription('Server security and anti-nuke management.')
  .addSubcommand((sub) =>
    sub.setName('status').setDescription('View anti-nuke defense status, thresholds, and incident history.')
  )
  .addSubcommand((sub) =>
    sub.setName('snapshot').setDescription('Take an instant backup snapshot of all channels and roles.')
  )
  .addSubcommand((sub) =>
    sub
      .setName('restore')
      .setDescription('Restore recently deleted channels or roles.')
      .addStringOption((opt) =>
        opt
          .setName('type')
          .setDescription('Select what to restore')
          .setRequired(true)
          .addChoices(
            { name: 'Deleted Channels', value: 'channels' },
            { name: 'Deleted Roles', value: 'roles' }
          )
      )
  );

const verifyCommand = new SlashCommandBuilder()
  .setName('verify')
  .setDescription('Roblox verification tools.')
  .addSubcommand((sub) =>
    sub.setName('panel').setDescription('Post the official Roblox verification panel.')
  );

const erlcCommand = new SlashCommandBuilder()
  .setName('erlc')
  .setDescription('ER:LC in-game moderation and enforcement tools.')
  .addSubcommand((sub) =>
    sub.setName('scan').setDescription('Manually trigger an in-game scan for suspicious outfits and non-Discord players.')
  )
  .addSubcommand((sub) =>
    sub.setName('status').setDescription('View in-game anti-exploiter and VC enforcement tracker status.')
  )
  .addSubcommand((sub) =>
    sub
      .setName('pm')
      .setDescription('Send an in-game private message to a player.')
      .addStringOption((opt) =>
        opt.setName('player').setDescription('Roblox username of the player').setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName('message').setDescription('Message to send (auto-sanitized for Roblox filter)').setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('jail')
      .setDescription('Jail a player in the ER:LC private server.')
      .addStringOption((opt) =>
        opt.setName('player').setDescription('Roblox username to jail').setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('unjail')
      .setDescription('Unjail a player in the ER:LC private server.')
      .addStringOption((opt) =>
        opt.setName('player').setDescription('Roblox username to unjail').setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('kick')
      .setDescription('Kick a player from the ER:LC private server.')
      .addStringOption((opt) =>
        opt.setName('player').setDescription('Roblox username to kick').setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName('reason').setDescription('Reason for the in-game kick').setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('ban')
      .setDescription('Ban a player from the ER:LC private server.')
      .addStringOption((opt) =>
        opt.setName('player').setDescription('Roblox username to ban').setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName('duration').setDescription('Ban duration (e.g. 1h, 24h, 7d, perm)').setRequired(false)
      )
      .addStringOption((opt) =>
        opt.setName('reason').setDescription('Reason for the in-game ban').setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('unban')
      .setDescription('Unban a player from the ER:LC private server.')
      .addStringOption((opt) =>
        opt.setName('player').setDescription('Roblox username to unban').setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('message')
      .setDescription('Send a server-wide broadcast announcement (:m).')
      .addStringOption((opt) =>
        opt.setName('message').setDescription('Announcement text').setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('hint')
      .setDescription('Send a server-wide top hint banner (:h).')
      .addStringOption((opt) =>
        opt.setName('message').setDescription('Hint text').setRequired(true)
      )
  );

const jailCommand = new SlashCommandBuilder()
  .setName('jail')
  .setDescription('Jail a player in the ER:LC private server.')
  .addStringOption((opt) =>
    opt.setName('player').setDescription('Roblox username to jail').setRequired(true)
  );

const unjailCommand = new SlashCommandBuilder()
  .setName('unjail')
  .setDescription('Unjail a player in the ER:LC private server.')
  .addStringOption((opt) =>
    opt.setName('player').setDescription('Roblox username to unjail').setRequired(true)
  );

const unbanCommand = new SlashCommandBuilder()
  .setName('unban')
  .setDescription('Unban a player in-game or unban a user from the Discord server.')
  .addStringOption((opt) =>
    opt.setName('target').setDescription('Roblox username (for in-game) or Discord User ID (for Discord)').setRequired(true)
  )
  .addStringOption((opt) =>
    opt.setName('reason').setDescription('Reason for the unban').setRequired(false)
  );

const safezoneCommand = new SlashCommandBuilder()
  .setName('safezone')
  .setDescription('Manage Safe Zone shooting violations and strike escalations.')
  .addSubcommand((sub) =>
    sub
      .setName('strike')
      .setDescription('Apply a safe zone shooting strike (warn+jail -> kick -> ban).')
      .addStringOption((opt) => opt.setName('player').setDescription('Roblox username').setRequired(true))
      .addStringOption((opt) => opt.setName('reason').setDescription('Safe zone location / reason').setRequired(false))
  )
  .addSubcommand((sub) =>
    sub
      .setName('status')
      .setDescription('Check safe zone strike history for a player.')
      .addStringOption((opt) => opt.setName('player').setDescription('Roblox username').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('clear')
      .setDescription('Clear safe zone strikes for a player.')
      .addStringOption((opt) => opt.setName('player').setDescription('Roblox username').setRequired(true))
  );

const retriggerCommand = new SlashCommandBuilder()
  .setName('retrigger')
  .setDescription('Emergency reboot & re-sync: restarts commands, live panels, buttons, and background loops.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

const commandsCommand = new SlashCommandBuilder()
  .setName('commands')
  .setDescription('Display the complete, beautifully organized guide of all bot commands.');

const addCommand = new SlashCommandBuilder()
  .setName('add')
  .setDescription('Add a user to the current ticket.')
  .addUserOption((opt) =>
    opt.setName('user').setDescription('The user to add to this ticket').setRequired(true)
  );

const unaddCommand = new SlashCommandBuilder()
  .setName('unadd')
  .setDescription('Remove a user from the current ticket.')
  .addUserOption((opt) =>
    opt.setName('user').setDescription('The user to remove from this ticket').setRequired(true)
  );

const STAFF_CONFIG = {
  color: 0xd69a5c,
  promotionChannelId: '1235012588505665557',
  derankChannelId: '1235012685968572538',
  promotionBannerUrl:
    'https://media.discordapp.net/attachments/1547880674361344001/1548799456424763442/content.png?ex=6aa85f65&is=6aa70de5&hm=228d8f5a55850a4ef5e615ef0e5e3aa53c3f3da6fccf9d4afc5658d0387bfdb9&=&format=webp&quality=lossless&width=512&height=171',
  derankBannerUrl:
    'https://media.discordapp.net/attachments/1232495213986058283/1536858351894265962/content.png?ex=6aa7c720&is=6aa675a0&hm=a8224cffd6e693462aaf5ed1e9482c38d437b7e7d60a7065d2011ca7e702789d&=&format=webp&quality=lossless'
};


const TICKET_CONFIG = {
  bannerUrl:
    'https://media.discordapp.net/attachments/1360798150910021735/1548379423554666608/Assistance.webp?ex=6aa780f6&is=6aa62f76&hm=901437d700dad110b02fb8363c482457e212cc5b7c9031fa411c739884a4b410&=&format=webp',
  categories: {
    general: {
      id: 'general',
      name: 'Alabama General Support',
      shortName: 'General Support',
      categoryId: '1344840586984689755',
      desc: 'General community-related inquiries, questions, and assistance with shop purchases.'
    },
    ia: {
      id: 'ia',
      name: 'Alabama Internal Affairs Support',
      shortName: 'Internal Affairs',
      categoryId: '1344841023259414598',
      desc: 'Reporting concerns involving staff members or community members. Requires a Supervisor.'
    },
    highrank: {
      id: 'highrank',
      name: 'Alabama High Rank Support',
      shortName: 'High Rank Support',
      categoryId: '1344841230504169482',
      desc: 'Affiliations, IA+ reports, high-ranking staff concerns, and payments.'
    },
    partnership: {
      id: 'partnership',
      name: 'Alabama Partnership Operations',
      shortName: 'Partnership',
      categoryId: '1548838707530833970',
      desc: 'Server partnerships, mutual advertising, and community affiliations.'
    },
    staff_partnership: {
      id: 'staff_partnership',
      name: 'Alabama Staff Partnership & Transfers',
      shortName: 'Staff Partnership',
      categoryId: '1548838707530833970',
      desc: 'Partner server staff transfers, reciprocal rank requests, and mergers.'
    }
  }
};

// /server removed - only /session panel remains.

/** Base URL for the ER:LC API - honours ERLC_API_URL from .env. */
function erlcBase() {
  const raw = (config.apiUrl || '').trim().replace(/\/+$/, '');
  if (raw) {
    // Old domains are dead - api.policeroleplay.community and api.erlc.dev
    // both fail. Force the official api.erlc.gg instead.
    if (/policeroleplay\.community/i.test(raw) || /api\.erlc\.dev/i.test(raw)) {
      return 'https://api.erlc.gg/v1';
    }
    return raw.replace(/\/server(\/.*)?$/i, '');
  }
  return 'https://api.erlc.gg/v1';
}

/**
 * Pulls live ER:LC server statistics from the PRC (ERLC) API.
 * Keeps the last good numbers so the card NEVER snaps back to 0
 * while the server is actually online.
 */
let lastGoodStats = null;
async function fetchServerStats() {
  const nowTs = Math.floor(Date.now() / 1000);
  // Clone the cache so "Last updated" ticks forward on EVERY refresh -
  // the old code reused the same object, which is why Discord kept showing
  // "7 minutes ago" even though the timer was running.
  const fallback = lastGoodStats
    ? { ...lastGoodStats, updatedAt: nowTs }
    : {
      serverName: SERVER.name,
      ownerName: SERVER.ownerName,
      players: 0,
      maxPlayers: 50,
      queue: 0,
      staff: 0,
      online: false,
      updatedAt: nowTs
    };

  if (!config.apiKey) return fallback;

  // PRC/ERLC API authenticates with the `Server-Key` header.
  const base = erlcBase();
  const headers = { 'Server-Key': config.apiKey };
  try {
    const [serverRes, playersRes, queueRes, staffRes] = await Promise.all([
      axios.get(`${base}/server`, {
        headers,
        timeout: 10000
      }),
      // Player list is the SOURCE OF TRUTH for the in-game count -
      // /server alone can report 0 / stale CurrentPlayers.
      axios
        .get(`${base}/server/players`, {
          headers,
          timeout: 10000
        })
        .catch(() => ({ data: null })),
      axios
        .get(`${base}/server/queue`, {
          headers,
          timeout: 10000
        })
        .catch(() => ({ data: [] })),
      axios
        .get(`${base}/server/staff`, {
          headers,
          timeout: 10000
        })
        .catch(() => ({ data: [] }))
    ]);

    // Some ERLC responses wrap in { data: {...} } - unwrap once.
    const unwrap = (v) => (v && typeof v === 'object' && 'data' in v && v.data && typeof v.data === 'object' && !Array.isArray(v.data) && ('Name' in v.data || 'name' in v.data || 'CurrentPlayers' in v.data || 'currentPlayers' in v.data) ? v.data : v);
    const server = unwrap(serverRes.data) ?? {};
    const unwrapList = (v) => {
      if (Array.isArray(v)) return v;
      if (v && typeof v === 'object' && Array.isArray(v.data)) return v.data;
      if (v && typeof v === 'object' && Array.isArray(v.players)) return v.players;
      if (v && typeof v === 'object' && Array.isArray(v.queue)) return v.queue;
      if (v && typeof v === 'object' && Array.isArray(v.staff)) return v.staff;
      return v;
    };
    const playersList = unwrapList(playersRes.data);
    const queueList = unwrapList(queueRes.data);
    const staffList = unwrapList(staffRes.data);

    const pickNum = (...vals) => {
      for (const v of vals) {
        const n = Number(v);
        if (Number.isFinite(n)) return n;
      }
      return null;
    };

    // Players: prefer the live /players array length (never stuck at 0
    // when you're actually in-game), then any CurrentPlayers-style field.
    let current = null;
    if (Array.isArray(playersList)) {
      current = playersList.length;
    }
    if (current === null || current === 0) {
      const fromField = pickNum(
        server.CurrentPlayers,
        server.currentPlayers,
        server.PlayerCount,
        server.playerCount,
        server.PlayersCount,
        server.playersCount,
        server.Count,
        server.count,
        Array.isArray(server.Players) ? server.Players.length : null,
        Array.isArray(server.players) ? server.players.length : null,
        server.players,
        server.Players
      );
      if (fromField !== null && !(current > 0)) current = fromField;
      if (current === null) current = 0;
    }
    const max =
      pickNum(
        server.MaxPlayers,
        server.maxPlayers,
        server.Max,
        server.max,
        fallback.maxPlayers
      ) ?? 50;
    const queue = Array.isArray(queueList)
      ? queueList.length
      : (typeof queueList === 'number' ? queueList : (pickNum(server.Queue, server.queue, server.QueueCount, fallback.queue) ?? 0));

    // In-game staff: count players currently in the server whose Permission is staff
    let inGameStaffCount = 0;
    if (Array.isArray(playersList)) {
      inGameStaffCount = playersList.filter((p) => {
        if (!p || typeof p !== 'object') return false;
        const perm = (p.Permission || p.permission || '').toLowerCase();
        return /(admin|moderator|mod\b|owner|co-owner)/i.test(perm);
      }).length;
    } else if (Array.isArray(staffList)) {
      inGameStaffCount = staffList.length;
    } else {
      inGameStaffCount = pickNum(server.Staff, server.staff, server.StaffCount, fallback.staff) ?? 0;
    }
    const staff = inGameStaffCount;
    const players = Number(current) || 0;

    // Server is "online" when the API answers successfully - NOT only when
    // a player happens to be inside. Fixes "stuck on Server Offline".
    const joinKey = server.JoinKey || server.joinKey || server.JoinCode || null;
    const stats = {
      serverName: server.Name || server.name || fallback.serverName,
      ownerName:
        server.OwnerUsername ||
        server.Owner ||
        server.owner ||
        fallback.ownerName,
      players,
      maxPlayers: max,
      queue: Number(queue) || 0,
      staff: Number(staff) || 0,
      online: true,
      joinKey,
      updatedAt: Math.floor(Date.now() / 1000)
    };
    if (joinKey) {
      console.log(`ERLC live: ${players}/${max} on ${stats.serverName} (JoinKey ${joinKey})`);
    }
    lastGoodStats = stats;
    return stats;
  } catch (error) {
    const status = error?.response?.status;
    if (status === 401 || status === 403) {
      console.error(
        'ERLC API key rejected (401/403). Check ERLC_API_KEY - keeping last good stats.'
      );
    } else {
      console.error('Unable to fetch ER:LC stats:', error.message);
    }
    return fallback;
  }
}

// ── helpers ──
function sessionCode() {
  // Prefer the live JoinKey from the API (lastGoodStats) over the hardcoded
  // fallback, so the card never shows a stale code for the wrong server.
  if (lastGoodStats?.joinKey) return lastGoodStats.joinKey;
  return config.serverCode || SERVER.code;
}

function bannerUrl() {
  return config.bannerUrl || SERVER.bannerUrl;
}

function voteBannerUrl() {
  return config.voteBannerUrl || SERVER.voteBannerUrl || bannerUrl();
}

function formatRoleMention(roleId, guildId) {
  if (!roleId) return null;
  if (roleId === guildId || roleId === '@everyone') return '@everyone';
  return `<@&${roleId}>`;
}

function joinUrl() {
  return `https://policeroleplay.community/join/${sessionCode()}`;
}

function playersText(stats) {
  const cur = typeof stats.players === 'number' ? stats.players : 0;
  const max = stats.maxPlayers ?? 40;
  const isFull = cur >= max && max > 0;
  return isFull ? `${cur}/${max} (Full)` : `${cur}/${max}`;
}

function queueText(stats) {
  const q = Number(stats?.queue) || 0;
  const cur = typeof stats?.players === 'number' ? stats.players : 0;
  const max = stats?.maxPlayers ?? 40;
  const isFull = cur >= max && max > 0;
  if (q > 0) return `${q} waiting`;
  if (isFull) return 'Full (0 in queue)';
  return '0';
}

/**
 * Population status used for the /session status pill + session alerts.
 *  offline (API down or 0 players) → Server Offline (red)
 *  online + full                   → Server Full    (red)
 *  online + 1..max                 → Server Online  (green)
 */
function serverStatus(stats) {
  const players = Number(stats?.players) || 0;
  if (!stats?.online || players <= 0) return { label: 'Server Offline', style: ButtonStyle.Danger };
  const max = Number(stats.maxPlayers) || 40;
  if (players >= max) return { label: 'Server Full', style: ButtonStyle.Danger };
  return { label: 'Server Online', style: ButtonStyle.Success };
}

/**
 * Plain-text fallback (exported for tests). No emojis, no duplicates -
 * each value appears once, inside the Section pill.
 */
function buildSessionText(stats) {
  const code = sessionCode();
  return [
    'Session Information',
    SERVER.description,
    `Server Name - ${stats.serverName}`,
    `Server Owner - ${stats.ownerName}`,
    `Server Code - ${code}`,
    `Players - ${playersText(stats)}`,
    `Queue - ${stats.queue}`,
    `Staff - ${stats.staff}`
  ].join('\n');
}

/**
 * Components V2 payload: one Container holds
 * [Media Gallery banner] + [Text Display body] + [Action Row buttons].
 * This keeps banner, text and buttons inside a single card.
 */
function thinLine() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

function buildPill(label, id, style = ButtonStyle.Secondary) {
  return new ButtonBuilder()
    .setCustomId(id)
    .setLabel(String(label).slice(0, 80) || '-')
    .setStyle(style)
    .setDisabled(true);
}

function sectionRow(title, subtitle, pillLabel, pillId, pillStyle) {
  return new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**${title}**\n${subtitle}`)
    )
    .setButtonAccessory(buildPill(pillLabel, pillId, pillStyle));
}

// Staff = Discord members holding mod/admin/owner/co-owner roles. Counted from
// the member cache (fast, in-memory) so it survives API inaccuracy.
function staffRoleCount(guildId) {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild || !guild.members) return null;
    const isStaff = (name) => /(moderator|mod|admin|owner)/i.test(name ?? '');
    let count = 0;
    for (const m of guild.members.cache.values()) {
      if (m.roles?.cache?.values?.()?.some((r) => isStaff(r.name))) count += 1;
    }
    return count;
  } catch {
    return null;
  }
}

function buildContainer(stats, opts = {}) {
  const isShutdown = !!opts.isShutdown;
  const status = isShutdown
    ? { label: 'Server Offline • Do Not Join', style: ButtonStyle.Danger }
    : serverStatus(stats);
  const live = !isShutdown && !!opts.sessionLive; // vote started → force orange "session on"
  const curPlayers = Number(stats?.players) || 0;
  const maxPlayers = Number(stats?.maxPlayers) || 40;
  const isFull = curPlayers >= maxPlayers && maxPlayers > 0;
  const container = new ContainerBuilder().setAccentColor(
    isShutdown ? 0xed4245 : (isFull ? 0xed4245 : (live ? 0xff7700 : 0x2b2d31))
  );
  if (opts.pingMention) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`||${opts.pingMention}||`)
    );
  }
  const link = joinUrl();
  const url = bannerUrl();
  if (url) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(url))
    );
  }

  // ── Header ──
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('## Session Information')
  );
  const formattedDesc = SERVER.description.startsWith('>')
    ? SERVER.description
    : `> ${SERVER.description}`;
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(formattedDesc)
  );
  if (isShutdown) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        curPlayers > 0
          ? `> 🛑 **Server Offline • Do Not Join** — Session has ended. In-game players (${curPlayers}), please exit.`
          : '> 🛑 **Server Offline • Do Not Join** (Session ended by staff team)'
      )
    );
  } else if (live) {
    // Orange alert line - the vote started, the session is ON.
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        isFull
          ? '> ⚠️ **The server is currently FULL!** Join queue or wait for open slots.'
          : '> **The session is LIVE**, hop into the server!'
      )
    );
  } else if (isFull) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('> ⚠️ **The server is currently FULL!**')
    );
  }

  container.addSeparatorComponents(thinLine());

  // ── Label (left) + value pill (right) rows (rewritten captions) ──
  container.addSectionComponents(
    sectionRow('Server Name', 'Join with this private server name.', stats.serverName, 'info_name')
  );
  container.addSectionComponents(
    sectionRow('Server Owner', 'Host of this in-game private server.', stats.ownerName, 'info_owner')
  );
  container.addSectionComponents(
    sectionRow('Server Code', 'Enter this code on the join page.', sessionCode(), 'info_code')
  );

  container.addSeparatorComponents(thinLine());

  container.addSectionComponents(
    sectionRow('Players', 'How many players are in-game right now.', playersText(stats), 'info_players')
  );
  container.addSectionComponents(
    sectionRow('Queue', 'Players currently waiting to get in.', queueText(stats), 'info_queue')
  );
  container.addSectionComponents(
    sectionRow('Staff', 'Staff members active in-game.', String(stats.staff), 'info_staff')
  );

  container.addSeparatorComponents(thinLine());

  // ── Bottom buttons: notification + quick join + live status ──
  const statusButtonLabel = isShutdown
    ? 'Server Offline • Do Not Join'
    : (live
      ? (isFull ? 'Session On • Full' : 'Session On')
      : (isFull ? 'Server Full' : status.label));
  const statusButtonStyle = isShutdown
    ? ButtonStyle.Danger
    : (live
      ? (isFull ? ButtonStyle.Danger : ButtonStyle.Success)
      : (isFull ? ButtonStyle.Danger : status.style));

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('session_notify').setLabel('Session Notification').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setLabel('Join Server').setStyle(ButtonStyle.Link).setURL(link),
      new ButtonBuilder()
        .setCustomId('server_status')
        .setLabel(statusButtonLabel)
        .setStyle(statusButtonStyle)
        .setDisabled(true)
    )
  );

  container.addSeparatorComponents(thinLine());

  // Always a real relative timestamp so it never freezes.
  const updatedTs =
    typeof stats.updatedAt === 'number'
      ? stats.updatedAt
      : Math.floor(Date.now() / 1000);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Last updated: <t:${updatedTs}:R>`)
  );

  return container;
}

// Refresh every 30s so "Last updated" + counts stay fresh without
// hammering the ERLC rate limit.
const REFRESH_EVERY_MS = 30_000;
const liveSessions = new Map();
// Remembers the newest panel per guild:channel so a fresh /session panel
// replaces (deletes) the previous one instead of piling up dead cards.
const lastPanelByChannel = new Map();
// Remembers newest ticket panel per guild:channel so a fresh /ticket panel replaces the old one.
const lastTicketPanelByChannel = new Map();
// Remembers spoiler ping mention per panel so live refresh preserves it until shutdown.
const panelPingMentionByChannel = new Map();
// Panels flipped green by a started session - the refresh loop keeps them
// green ("Session On") until /session shutdown clears the flag.
const sessionLivePanels = new Set();
// Voters of the most recent vote per guild:channel - /session shutdown DMs
// these members the red "Session Closed" card.
const lastVoteVotersByChannel = new Map();
const sessionShutdownByChannel = new Map();

function liveKey(guildId, channelId, messageId) {
  return `${guildId}:${channelId}:${messageId}`;
}

function stopLive(key) {
  const t = liveSessions.get(key);
  if (t) {
    clearInterval(t);
    liveSessions.delete(key);
  }
}

// Edits the actual posted MESSAGE (not the interaction reply, which
// expires after ~15 min). Stops retrying once the message is deleted.
// Runs continuously 24/7 so the timestamp and counts never freeze.
function startLiveRefresh(key, message, channelId) {
  stopLive(key);
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const fresh = await fetchServerStats();
      const parts = key.split(':');
      const gid = parts[0];
      const cid = parts[1];
      const chanKey = `${gid}:${cid}`;
      const isShutdown = sessionShutdownByChannel.get(chanKey) || false;
      const pingMention = panelPingMentionByChannel.get(chanKey) ?? null;
      await message.edit({
        components: [
          buildContainer(fresh, {
            sessionLive: !isShutdown && sessionLivePanels.has(key),
            isShutdown,
            pingMention
          }).toJSON()
        ],
        flags: MessageFlags.IsComponentsV2
      });
    } catch (err) {
      // Unknown Message (10008) = card was deleted → stop the timer.
      if (err?.code === 10008) stopLive(key);
      else console.error('Live session refresh failed (' + err.message + ').');
    } finally {
      busy = false;
    }
  }, REFRESH_EVERY_MS);
  liveSessions.set(key, timer);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration
  ]
});

// ═══════════════════════ /suggestion - Community Suggestions Engine ═══════════════════════
const SUGGESTIONS_FILE = fileURLToPath(new URL('../suggestions.json', import.meta.url));
const activeSuggestions = new Map();
const SUGGESTION_CHANNEL_ID = '1343769737439608853';

function saveSuggestions() {
  try {
    const arr = [...activeSuggestions.values()];
    fs.writeFileSync(SUGGESTIONS_FILE, JSON.stringify(arr, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save suggestions.json:', err.message);
  }
}

function loadSuggestions() {
  try {
    if (!fs.existsSync(SUGGESTIONS_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(SUGGESTIONS_FILE, 'utf8'));
    if (Array.isArray(raw)) {
      for (const s of raw) {
        if (s && s.id) activeSuggestions.set(String(s.id), s);
      }
    }
    console.log(`Restored ${activeSuggestions.size} suggestion(s) from suggestions.json.`);
  } catch (err) {
    console.error('Failed to load suggestions.json:', err.message);
  }
}

function buildSuggestionBar(upvotes, downvotes) {
  return '';
}

function buildSuggestionContainer(sug, discordClient = null) {
  const card = new ContainerBuilder().setAccentColor(0x2b2d31);
  card.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## Community Suggestion #${sug.id}`)
  );
  card.addSeparatorComponents(thinLine());

  const infoText =
    `**Submitted by:** <@${sug.authorId}>\n\n` +
    `**Suggestion**\n` +
    `### ${sug.text}`;

  const avatarUrl =
    sug.authorAvatar ||
    (discordClient?.users?.cache?.get(sug.authorId)?.displayAvatarURL({ size: 128 })) ||
    'https://cdn.discordapp.com/embed/avatars/0.png';

  card.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(infoText))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
  );
  card.addSeparatorComponents(thinLine());

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sug_up_${sug.id}`)
      .setStyle(ButtonStyle.Success)
      .setLabel(String(sug.upvoters.length))
      .setEmoji('<:checkmark:1549230329418485832>'),
    new ButtonBuilder()
      .setCustomId(`sug_down_${sug.id}`)
      .setStyle(ButtonStyle.Danger)
      .setLabel(String(sug.downvoters.length))
      .setEmoji('<:wrong:1549230458070507552>'),
    new ButtonBuilder()
      .setCustomId(`sug_voters_${sug.id}`)
      .setStyle(ButtonStyle.Secondary)
      .setLabel('Voters')
  );

  card.addActionRowComponents(row);
  card.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Suggestion #${sug.id} • Posted <t:${Math.floor(sug.createdAt / 1000)}:R>`)
  );
  return card;
}

// ═══════════════════════ /session vote - persistent engine ═══════════════════════
// State survives bot restarts via votes.json; timers are rebuilt on boot.

const VOTES_FILE = fileURLToPath(new URL('../votes.json', import.meta.url));
const PANELS_FILE = fileURLToPath(new URL('../panels.json', import.meta.url));
const activeVotes = new Map();
// Non-persisted runtime handles (timers) live here so JSON stays clean.
const voteTimers = new Map();

const VOTE_DURATIONS = { '30m': 30 * 60_000, '1h': 60 * 60_000, '2h': 120 * 60_000, '5h': 300 * 60_000 };
const VOTE_COLOR = { open: 0x5865f2, ready: 0x57f287, expired: 0x99aab5 };

function saveVotes() {
  try {
    const flat = {};
    for (const [id, v] of activeVotes) flat[id] = { ...v };
    fs.writeFileSync(VOTES_FILE, JSON.stringify(flat, null, 2));
  } catch (err) {
    console.error('Failed to save votes.json:', err.message);
  }
}

function loadVotes() {
  try {
    if (!fs.existsSync(VOTES_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(VOTES_FILE, 'utf8'));
    for (const [id, v] of Object.entries(raw)) {
      // Never resurrect dead votes.
      if (v.started || v.expired || v.cancelled) continue;
      activeVotes.set(id, v);
    }
    console.log(`Restored ${activeVotes.size} active vote(s) from votes.json.`);
  } catch (err) {
    console.error('Failed to load votes.json:', err.message);
  }
  // Panels: their refresh timers died with the last restart - persist the
  // newest panel per channel so boot can re-attach them (fixes the frozen
  // "Last updated: X minutes ago" card).
  try {
    if (!fs.existsSync(PANELS_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(PANELS_FILE, 'utf8'));
    for (const [key, messageId] of Object.entries(raw)) lastPanelByChannel.set(key, messageId);
    console.log(`Restored ${lastPanelByChannel.size} session panel(s) from panels.json.`);
  } catch (err) {
    console.error('Failed to load panels.json:', err.message);
  }
}

function savePanels() {
  try {
    const flat = {};
    for (const [key, messageId] of lastPanelByChannel) flat[key] = messageId;
    fs.writeFileSync(PANELS_FILE, JSON.stringify(flat, null, 2));
  } catch (err) {
    console.error('Failed to save panels.json:', err.message);
  }
}

async function dmUser(discordClient, userId, payload) {
  try {
    const user = await discordClient.users.fetch(userId);
    await user.send(payload);
    return true;
  } catch {
    return false; // DMs closed / left the server - never crash.
  }
}

function voteVotersLine(vote) {
  const ids = Object.keys(vote.voters ?? {});
  if (!ids.length) return '> No votes yet - hit **Vote** to join in.';
  const mentions = ids.map((id) => `<@${id}>`).join(' ');
  return ids.length <= 20 ? `> Ready: ${mentions}` : `> Ready: ${ids.length} members voted.`;
}

/**
 * The vote card. The ONLY interactive element is the Vote button -
 * the count pill is a DISABLED button (rendered like a label, not clickable).
 */
function buildVoteContainer(vote) {
  const count = Object.keys(vote.voters ?? {}).length;
  const done = count >= vote.needed;
  const dead = vote.expired || vote.started || vote.cancelled;
  const box = new ContainerBuilder().setAccentColor(
    vote.started ? VOTE_COLOR.ready : vote.expired ? VOTE_COLOR.expired : done ? VOTE_COLOR.ready : VOTE_COLOR.open
  );
  const banner = voteBannerUrl();
  if (banner) {
    box.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(banner))
    );
  }
  box.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      vote.started ? '## Session Starting' : vote.expired ? '## Session Vote Expired' : '## Session Vote'
    )
  );
  box.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      vote.started
        ? '> The session is starting now - check your DMs.'
        : vote.expired
          ? `> This vote closed without reaching **${vote.needed}** votes.`
          : `> <@${vote.hostId}> needs **${vote.needed}** members to launch the session.\n> Time remaining: <t:${Math.floor(vote.endTs / 1000)}:R>\n> Ping role: ${formatRoleMention(vote.roleId, vote.guildId)}`
    )
  );
  box.addSeparatorComponents(thinLine());
  // Vote count - rendered as a DISABLED pill: visible, NEVER clickable.
  box.addSectionComponents(
    sectionRow(
      'Votes',
      'Members ready to join.',
      `${count}/${vote.needed}`,
      `vote_count_${vote.id}`,
      done ? ButtonStyle.Success : ButtonStyle.Secondary
    )
  );
  box.addTextDisplayComponents(new TextDisplayBuilder().setContent(voteVotersLine(vote)));
  if (vote.postponed && !dead) {
    box.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('> **Postponed** - timer reset. Vote stays open!')
    );
  }
  if (done && !vote.started && !vote.expired) {
    box.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `> **Goal reached!** The host has been notified - ${formatRoleMention(vote.roleId, vote.guildId)} get ready.`
      )
    );
  }
  box.addSeparatorComponents(thinLine());
  box.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`vote_click_${vote.id}`)
        .setLabel(vote.started ? 'Started' : vote.expired ? 'Expired' : done ? 'Goal Reached' : 'Vote')
        .setStyle(done && !vote.started && !vote.expired ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(dead || done),
      new ButtonBuilder()
        .setCustomId('session_notify')
        .setLabel('Session Notification')
        .setStyle(ButtonStyle.Secondary)
    )
  );
  box.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('-# Vote once - click again to remove your vote.')
  );
  return box;
}

// Dark gray "Session Closed" card posted by /session shutdown - NO banner at the bottom per user request.
function buildShutdownNotice(stats) {
  const curPlayers = Number(stats?.players) || 0;
  const card = new ContainerBuilder().setAccentColor(0x2b2d31);
  card.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('## Session Closed')
  );
  card.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`> ${SERVER.shutdownText}`)
  );
  card.addSeparatorComponents(thinLine());
  card.addSectionComponents(
    sectionRow(
      'Players',
      curPlayers > 0 ? 'Players remaining in-game.' : 'All players have exited the server.',
      playersText(stats),
      'info_players',
      curPlayers > 0 ? ButtonStyle.Danger : ButtonStyle.Secondary
    )
  );
  card.addSectionComponents(
    sectionRow('Session Code', 'Use this code to join the next session.', sessionCode(), 'info_code')
  );
  card.addSeparatorComponents(thinLine());
  const closedTs =
    typeof stats.updatedAt === 'number' ? stats.updatedAt : Math.floor(Date.now() / 1000);
  card.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Session Ended • Live Status: <t:${closedTs}:R>`)
  );
  return card;
}

// Dark gray DM card sent to voters when the session shuts down - dark gray side bar,
// red Session Ended pill, NO Join Server (the session is over).
function buildSessionClosedDM(stats) {
  const card = new ContainerBuilder().setAccentColor(0x2b2d31);
  card.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('## Session Closed')
  );
  card.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '> The session you voted for has ended. Thanks for voting, see you at the next one!'
    )
  );
  card.addSeparatorComponents(thinLine());
  card.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      buildPill(`Players in-game: ${playersText(stats)}`, 'info_players'),
      buildPill('Session Ended', 'info_ended', ButtonStyle.Danger)
    )
  );
  return card;
}

// ═══════════════════════ Staff Engine (Promotion & Demotion Cards) ═══════════════════════
function isStaffMember(member) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  if (member.permissions?.has(PermissionFlagsBits.ManageRoles)) return true;
  if (member.permissions?.has(PermissionFlagsBits.ModerateMembers)) return true;
  if (member.roles?.cache?.some((r) => /(staff|moderator|mod|admin|supervisor|lead|management|high rank|hr|owner|co-owner)/i.test(r.name))) return true;
  return false;
}

function buildPromotionContainer({ targetUser, targetMember, newRank, previousRank, reason, notes, moderator }) {
  const container = new ContainerBuilder().setAccentColor(STAFF_CONFIG.color || 0xd69a5c);

  if (STAFF_CONFIG.promotionBannerUrl) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(STAFF_CONFIG.promotionBannerUrl))
    );
  }

  const displayName = targetMember?.displayName || targetUser.globalName || targetUser.username;

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Staff Promotion Notice'));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `> Congratulations to <@${targetUser.id}> (${displayName}) on their advancement in **Alabama State Roleplay**! We appreciate your commitment and service.`
    )
  );

  container.addSeparatorComponents(thinLine());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**Staff Member:** <@${targetUser.id}> (${displayName})\n` +
      `**Previous Rank:** ${previousRank}\n` +
      `**New Rank:** ${newRank}\n` +
      `**Approved By:** <@${moderator.id}>`
    )
  );

  if (reason) {
    container.addSeparatorComponents(thinLine());
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Reason & Commendation**\n> ${reason}`)
    );
  }

  if (notes) {
    container.addSeparatorComponents(thinLine());
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Additional Notes**\n> ${notes}`)
    );
  }

  container.addSeparatorComponents(thinLine());

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('promo_status_btn')
        .setLabel('Promotion Approved')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    )
  );

  const nowTs = Math.floor(Date.now() / 1000);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Official Promotion • <t:${nowTs}:F>`)
  );

  return container;
}

function buildDerankContainer({ targetUser, targetMember, removeRole, newRank, reason, notes, moderator }) {
  const container = new ContainerBuilder().setAccentColor(STAFF_CONFIG.color || 0xd69a5c);

  if (STAFF_CONFIG.derankBannerUrl) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(STAFF_CONFIG.derankBannerUrl))
    );
  }

  const displayName = targetMember?.displayName || targetUser.globalName || targetUser.username;
  const removedRoleName = removeRole ? removeRole.name : 'Staff Role';

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Staff Demotion Notice'));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `> An official rank adjustment notice has been issued for <@${targetUser.id}> (${displayName}) in **Alabama State Roleplay**.`
    )
  );

  container.addSeparatorComponents(thinLine());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**Staff Member:** <@${targetUser.id}> (${displayName})\n` +
      `**Role Removed:** ${removedRoleName}\n` +
      `**New Status / Rank:** ${newRank}\n` +
      `**Issued By:** <@${moderator.id}>`
    )
  );

  container.addSeparatorComponents(thinLine());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`**Reason for Action**\n> ${reason}`)
  );

  if (notes) {
    container.addSeparatorComponents(thinLine());
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Notes & Appeal Instructions**\n> ${notes}`)
    );
  }

  container.addSeparatorComponents(thinLine());

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('derank_status_btn')
        .setLabel('Demotion Notice')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    )
  );

  const nowTs = Math.floor(Date.now() / 1000);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Official Staff Action • <t:${nowTs}:F>`)
  );

  return container;
}

async function handlePromotionCommand(interaction) {
  const member = interaction.member || (await interaction.guild?.members.fetch(interaction.user.id).catch(() => null));
  if (!isStaffMember(member)) {
    await interaction.reply({
      content: '❌ You must have staff permissions to issue promotions.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const targetUser = interaction.options.getUser('user', true);
  const newRank = interaction.options.getString('new_rank', true).trim();
  const previousRank = interaction.options.getString('previous_rank', true).trim();
  const giveRole = interaction.options.getRole('give_role') || null;
  const removeRole = interaction.options.getRole('remove_role') || null;
  const reason = interaction.options.getString('reason')?.trim() || null;
  const notes = interaction.options.getString('notes')?.trim() || null;

  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  if (targetMember) {
    if (giveRole && !targetMember.roles.cache.has(giveRole.id)) {
      await targetMember.roles.add(giveRole.id).catch((err) => {
        console.warn(`Could not assign role ${giveRole.name}: ${err.message}`);
      });
    }
    if (removeRole && targetMember.roles.cache.has(removeRole.id)) {
      await targetMember.roles.remove(removeRole.id).catch((err) => {
        console.warn(`Could not remove old role ${removeRole.name}: ${err.message}`);
      });
    }
  }

  const targetChannel = await interaction.guild.channels.fetch(STAFF_CONFIG.promotionChannelId).catch(() => null);
  if (!targetChannel) {
    await interaction.editReply({
      content: `❌ Could not find promotion channel (<#${STAFF_CONFIG.promotionChannelId}> / \`${STAFF_CONFIG.promotionChannelId}\`). Ensure the channel exists and I have permission to view and send messages there.`
    });
    return;
  }

  const container = buildPromotionContainer({
    targetUser,
    targetMember,
    newRank,
    previousRank,
    reason,
    notes,
    moderator: interaction.user
  });

  try {
    await targetChannel.send({
      components: [container.toJSON()],
      flags: MessageFlags.IsComponentsV2
    });
    await interaction.editReply({
      content: `✅ Promotion notice for <@${targetUser.id}> successfully posted in <#${STAFF_CONFIG.promotionChannelId}>!`
    });
  } catch (err) {
    console.error('Failed to post promotion notice:', err);
    await interaction.editReply({
      content: `❌ Failed to post promotion card in <#${STAFF_CONFIG.promotionChannelId}>: ${err.message}`
    });
  }
}

async function handleDerankCommand(interaction) {
  const member = interaction.member || (await interaction.guild?.members.fetch(interaction.user.id).catch(() => null));
  if (!isStaffMember(member)) {
    await interaction.reply({
      content: '❌ You must have staff permissions to issue demotions.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const targetUser = interaction.options.getUser('user', true);
  const removeRole = interaction.options.getRole('remove_role', true);
  const newRank = interaction.options.getString('new_rank', true).trim();
  const reason = interaction.options.getString('reason', true).trim();
  const giveRole = interaction.options.getRole('give_role') || null;
  const notes = interaction.options.getString('notes')?.trim() || null;

  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  let roleRemoved = false;
  let roleRemoveError = null;

  if (targetMember && removeRole) {
    if (targetMember.roles.cache.has(removeRole.id)) {
      try {
        await targetMember.roles.remove(removeRole.id);
        roleRemoved = true;
      } catch (err) {
        console.warn(`Could not remove role ${removeRole.name}: ${err.message}`);
        roleRemoveError = err.message;
      }
    }
    if (giveRole && !targetMember.roles.cache.has(giveRole.id)) {
      try {
        await targetMember.roles.add(giveRole.id);
      } catch (err) {
        console.warn(`Could not assign new role ${giveRole.name}: ${err.message}`);
      }
    }
  }

  const targetChannel = await interaction.guild.channels.fetch(STAFF_CONFIG.derankChannelId).catch(() => null);
  if (!targetChannel) {
    await interaction.editReply({
      content: `❌ Could not find derank channel (<#${STAFF_CONFIG.derankChannelId}> / \`${STAFF_CONFIG.derankChannelId}\`). Ensure the channel exists and I have permission to view and send messages there.`
    });
    return;
  }

  const container = buildDerankContainer({
    targetUser,
    targetMember,
    removeRole,
    newRank,
    reason,
    notes,
    moderator: interaction.user
  });

  try {
    await targetChannel.send({
      components: [container.toJSON()],
      flags: MessageFlags.IsComponentsV2
    });

    let confirmation = `⚠️ Demotion notice for <@${targetUser.id}> successfully posted in <#${STAFF_CONFIG.derankChannelId}>!`;
    if (roleRemoved) {
      confirmation += `\n> Removed role: **@${removeRole.name}**`;
    } else if (roleRemoveError) {
      confirmation += `\n> ⚠️ Note: Could not automatically remove **@${removeRole.name}** (${roleRemoveError}). Ensure my bot role is placed higher than **@${removeRole.name}** in Server Settings > Roles.`;
    }
    await interaction.editReply({ content: confirmation });
  } catch (err) {
    console.error('Failed to post derank notice:', err);
    await interaction.editReply({
      content: `❌ Failed to post demotion card in <#${STAFF_CONFIG.derankChannelId}>: ${err.message}`
    });
  }
}

async function handleStaffFeedbackCommand(interaction) {
  const BOT_COMMANDS_CHANNEL_ID = '1232495212555927608';
  const STAFF_FEEDBACK_CHANNEL_ID = '1277418675430883378';

  if (interaction.channelId !== BOT_COMMANDS_CHANNEL_ID) {
    await interaction.reply({
      content: `❌ This command can only be used in <#${BOT_COMMANDS_CHANNEL_ID}>.`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const staffUser = interaction.options.getUser('staff', true);
  if (staffUser.bot) {
    await interaction.reply({
      content: '❌ You cannot submit staff feedback for a bot.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const rating = interaction.options.getInteger('rating', true);
  const comments = interaction.options.getString('comments', true).trim();
  const anonymous = interaction.options.getBoolean('anonymous') ?? false;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let feedbackChannel = null;
  try {
    feedbackChannel = await client.channels.fetch(STAFF_FEEDBACK_CHANNEL_ID).catch(() => null);
  } catch (err) {
    console.warn('Failed to fetch staff feedback channel:', err.message);
  }

  if (!feedbackChannel) {
    await interaction.editReply({
      content: `❌ Staff feedback channel (<#${STAFF_FEEDBACK_CHANNEL_ID}>) could not be found or accessed.`
    });
    return;
  }

  const starEmoji = '<:Star:1549231587131007066>';
  const starDisplay = starEmoji.repeat(Math.max(1, Math.min(5, rating))) + ` (${rating}/5 Stars)`;
  const submitterDisplay = anonymous
    ? '*Anonymous Community Member*'
    : `@${interaction.user.username}`;
  const submitterAvatar = anonymous
    ? 'https://cdn.discordapp.com/embed/avatars/0.png'
    : interaction.user.displayAvatarURL({ size: 128 });

  const card = new ContainerBuilder().setAccentColor(0x2b2d31);
  card.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('## Staff Member Feedback')
  );
  card.addSeparatorComponents(thinLine());

  const infoSection =
    `**Submitted By**\n${submitterDisplay}\n\n` +
    `**Staff Member**\n<@${staffUser.id}>`;

  card.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(infoSection))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(submitterAvatar))
  );

  card.addSeparatorComponents(thinLine());

  card.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**Rating**\n${starDisplay}\n\n` +
      `**Feedback**\n${comments}`
    )
  );

  card.addSeparatorComponents(thinLine());
  card.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('-# Alabama State Roleplay • Official Staff Feedback System')
  );

  try {
    await feedbackChannel.send({
      components: [card.toJSON()],
      flags: MessageFlags.IsComponentsV2
    });

    await interaction.editReply({
      content: `✅ Your feedback for <@${staffUser.id}> has been posted in <#${STAFF_FEEDBACK_CHANNEL_ID}> with a ${rating}-star rating!`
    });
  } catch (err) {
    console.error('Failed to post staff feedback:', err);
    await interaction.editReply({
      content: `❌ Failed to post feedback to <#${STAFF_FEEDBACK_CHANNEL_ID}>: ${err.message}`
    });
  }
}

async function handleSuggestionCommand(interaction) {
  let sub = null;
  try {
    sub = interaction.options.getSubcommand();
  } catch {
    sub = null;
  }

  if (sub === 'top') {
    if (activeSuggestions.size === 0) {
      await interaction.reply({
        content: 'No community suggestions have been submitted yet.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    const sorted = [...activeSuggestions.values()].sort((a, b) => {
      const netA = a.upvoters.length - a.downvoters.length;
      const netB = b.upvoters.length - b.downvoters.length;
      if (netB !== netA) return netB - netA;
      return b.upvoters.length - a.upvoters.length;
    });
    const top = sorted[0];
    const topCard = new ContainerBuilder().setAccentColor(0x2b2d31);
    topCard.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## 🏆 Top Community Suggestion (#${top.id})`)
    );
    topCard.addSeparatorComponents(thinLine());
    topCard.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `> **Submitted by:** <@${top.authorId}>\n` +
        `> **Votes:** **${top.upvoters.length}** Upvotes • **${top.downvoters.length}** Downvotes\n\n` +
        `**Suggestion**\n` +
        `${top.text}\n\n` +
        (top.messageId && top.channelId && top.guildId
          ? `> **Jump to Message:** [View Original Suggestion](https://discord.com/channels/${top.guildId}/${top.channelId}/${top.messageId})`
          : '')
      )
    );
    await interaction.reply({
      components: [topCard.toJSON()],
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
    return;
  }

  const suggestionText = interaction.options.getString('suggestion', true).trim();
  if (!suggestionText) {
    await interaction.reply({ content: '❌ Suggestion cannot be empty.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let targetChannel = null;
  try {
    targetChannel = await client.channels.fetch(SUGGESTION_CHANNEL_ID).catch(() => null);
  } catch {
    targetChannel = null;
  }
  if (!targetChannel) {
    targetChannel = interaction.channel;
  }

  const nextId = activeSuggestions.size > 0
    ? Math.max(...[...activeSuggestions.values()].map((s) => Number(s.id) || 0)) + 1
    : 1;

  const sug = {
    id: String(nextId),
    guildId: interaction.guildId,
    channelId: targetChannel.id,
    messageId: null,
    authorId: interaction.user.id,
    authorAvatar: interaction.user.displayAvatarURL({ size: 128 }),
    text: suggestionText,
    upvoters: [],
    downvoters: [],
    createdAt: Date.now()
  };

  let postedMsg;
  try {
    postedMsg = await targetChannel.send({
      components: [buildSuggestionContainer(sug, interaction.client).toJSON()],
      flags: MessageFlags.IsComponentsV2
    });
  } catch (err) {
    await interaction.editReply({
      content: `❌ Could not post suggestion to <#${targetChannel.id}> (${err.message}).`
    });
    return;
  }

  sug.messageId = postedMsg.id;
  activeSuggestions.set(sug.id, sug);
  saveSuggestions();

  // Automatically start a discussion thread on the suggestion message!
  try {
    const threadTitle = `Suggestion #${sug.id} - ${sug.text.slice(0, 30).replace(/[\r\n]+/g, ' ')}`;
    const thread = await postedMsg.startThread({
      name: threadTitle,
      autoArchiveDuration: 1440
    });
    if (thread) {
      await thread.send({
        content: `💬 **Discussion for Suggestion #${sug.id}**\nShare your thoughts, feedback, or suggestions for refinement below!`
      }).catch(() => null);
    }
  } catch (err) {
    console.warn(`Could not start discussion thread for suggestion #${sug.id}:`, err.message);
  }

  await interaction.editReply({
    content: `✅ Your suggestion has been posted in <#${targetChannel.id}>! Discussion thread created.`
  });
}

// ═══════════════════════ Roblox Verification Dashboard ═══════════════════════
function buildVerificationContainer(bannerAttachmentName = null) {
  const container = new ContainerBuilder();

  if (bannerAttachmentName) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(`attachment://${bannerAttachmentName}`)
      )
    );
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('## <:roblox:1345920815983759460> Verification')
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `> Greetings, this is the **Alabama State Roleplay** verification dashboard. With the button below, our bot will verify your Discord account and link it to your Roblox account as well. Once you verify, you will gain access to the rest of the server and in-game operations!`
    )
  );

  container.addSeparatorComponents(thinLine());

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('roblox_verify_action')
        .setLabel('Verify')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('1345920815983759460')
    )
  );

  return container;
}

async function handleVerifyCommand(interaction) {
  const member = interaction.member || (await interaction.guild?.members.fetch(interaction.user.id).catch(() => null));
  if (!isStaffMember(member)) {
    await interaction.reply({ content: '❌ You must have staff permissions to post the verification panel.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const bannerPath = fileURLToPath(new URL('./assets/verification_banner.jpg', import.meta.url));
  const hasLocalBanner = fs.existsSync(bannerPath);

  const files = [];
  let bannerName = null;
  if (hasLocalBanner) {
    bannerName = 'alabama_verification.jpg';
    files.push(new AttachmentBuilder(bannerPath, { name: bannerName }));
  }

  const container = buildVerificationContainer(bannerName);

  try {
    await interaction.channel.send({
      components: [container.toJSON()],
      files,
      flags: MessageFlags.IsComponentsV2
    });
    await interaction.editReply({ content: '✅ Verification dashboard successfully posted!' });
  } catch (err) {
    console.error('Failed to post verification panel:', err);
    await interaction.editReply({ content: `❌ Failed to post verification dashboard: ${err.message}` });
  }
}

// ═══════════════════════ Moderation & Anti-Nuke Engine ═══════════════════════
const ANTINUKE_CONFIG = {
  logChannelId: '1548842139495170118',
  alertTargets: {
    // Lowest group: Assistant Director, Deputy Director
    lowest: ['1546706186047590451', '1341931746949857353'],
    // Full group: All plus Director, Executive
    full: ['1546706186047590451', '1341931746949857353', '1341931438043430953', '1341931745351700534']
  },
  thresholds: {
    channelDeleteMinor: 2,
    channelDeleteMajor: 4,
    roleDeleteMinor: 2,
    roleDeleteMajor: 4,
    banMinor: 2,
    banMajor: 3,
    kickMinor: 3,
    kickMajor: 5
  }
};

const channelBackupCache = new Map();
const roleBackupCache = new Map();
const recentlyDeletedChannels = new Map();
const recentlyDeletedRoles = new Map();
const strippedMemberRoles = new Map();
const recentIncidents = new Map();
const executorActionBuckets = new Map();

async function backupGuildState(guild) {
  if (!guild) return;
  try {
    for (const [id, ch] of guild.channels.cache) {
      channelBackupCache.set(id, {
        id,
        name: ch.name,
        type: ch.type,
        parentId: ch.parentId,
        position: ch.position,
        topic: ch.topic || null,
        permissionOverwrites: ch.permissionOverwrites?.cache?.map((po) => ({
          id: po.id,
          allow: po.allow.toArray(),
          deny: po.deny.toArray()
        })) || []
      });
    }
    for (const [id, r] of guild.roles.cache) {
      if (r.id === guild.id) continue;
      roleBackupCache.set(id, {
        id,
        name: r.name,
        color: r.color,
        hoist: r.hoist,
        position: r.position,
        mentionable: r.mentionable,
        permissions: r.permissions.toArray()
      });
    }
    console.log(`[Anti-Nuke] Backed up ${channelBackupCache.size} channels and ${roleBackupCache.size} roles for guild ${guild.name} (${guild.id}).`);
  } catch (err) {
    console.warn(`[Anti-Nuke] Snapshot error: ${err.message}`);
  }
}

async function sendSecurityLog(guild, container) {
  try {
    let logChan = await client.channels.fetch('1277365829247307857').catch(() => null); // Security-Logs
    if (!logChan && guild) {
      logChan = await guild.channels.fetch(ANTINUKE_CONFIG.logChannelId).catch(() => null) ||
        guild.channels.cache.get('1232495213986058286') || // Discord-Logs
        guild.channels.cache.get('1232495214162214924');   // Command-Logs
    }
    if (logChan) {
      await logChan.send({
        components: [container.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
    } else {
      console.warn(`[Security Log] Could not locate an active log channel.`);
    }
  } catch (err) {
    console.error('Failed to post to security log channel:', err.message);
  }
}

async function sendGameLog(guild, container) {
  try {
    let logChan = await client.channels.fetch('1232495213986058287').catch(() => null); // Game-Logs
    if (!logChan) {
      logChan = await client.channels.fetch('1277365829247307857').catch(() => null); // Security-Logs
    }
    if (!logChan && guild) {
      logChan = guild.channels.cache.get('1232495214162214924') || // Command-Logs
        guild.channels.cache.get('1232495213986058286');   // Discord-Logs
    }
    if (logChan) {
      await logChan.send({
        components: [container.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
    } else {
      console.warn(`[Game Log] Could not locate an active game log channel.`);
    }
  } catch (err) {
    console.error('Failed to post to game log channel:', err.message);
  }
}

async function getAlertRecipients(guild, severity) {
  const targetIds = severity === 'minor'
    ? ANTINUKE_CONFIG.alertTargets.lowest
    : ANTINUKE_CONFIG.alertTargets.full;

  const recipients = new Map();

  for (const id of targetIds) {
    const role = guild.roles.cache.get(id) || (await guild.roles.fetch(id).catch(() => null));
    if (role && role.members?.size) {
      for (const m of role.members.values()) {
        recipients.set(m.id, m.user);
      }
      continue;
    }

    const member = guild.members.cache.get(id) || (await guild.members.fetch(id).catch(() => null));
    if (member) {
      recipients.set(member.id, member.user);
      continue;
    }

    const user = await client.users.fetch(id).catch(() => null);
    if (user) {
      recipients.set(user.id, user);
    }
  }

  if (severity === 'major' && guild.ownerId) {
    const owner = await client.users.fetch(guild.ownerId).catch(() => null);
    if (owner) recipients.set(owner.id, owner);
  }

  return [...recipients.values()];
}

async function handleAntiNukeTrigger({ guild, executor, actionType, targetName, targetId }) {
  const now = Date.now();
  let bucket = executorActionBuckets.get(executor.id) || [];
  bucket = bucket.filter((item) => now - item.timestamp < 60000);
  bucket.push({ actionType, targetName, targetId, timestamp: now });
  executorActionBuckets.set(executor.id, bucket);

  const countForType = bucket.filter((item) => item.actionType === actionType).length;
  const totalActions = bucket.length;

  let severity = null;
  let actionDescription = '';

  if (actionType === 'channel_delete') {
    if (countForType >= ANTINUKE_CONFIG.thresholds.channelDeleteMajor || totalActions >= 6) severity = 'major';
    else if (countForType >= ANTINUKE_CONFIG.thresholds.channelDeleteMinor) severity = 'minor';
    actionDescription = `Channel Deletions (${countForType} deleted within 60s)`;
  } else if (actionType === 'role_delete') {
    if (countForType >= ANTINUKE_CONFIG.thresholds.roleDeleteMajor || totalActions >= 6) severity = 'major';
    else if (countForType >= ANTINUKE_CONFIG.thresholds.roleDeleteMinor) severity = 'minor';
    actionDescription = `Role Deletions (${countForType} deleted within 60s)`;
  } else if (actionType === 'member_ban') {
    if (countForType >= ANTINUKE_CONFIG.thresholds.banMajor || totalActions >= 5) severity = 'major';
    else if (countForType >= ANTINUKE_CONFIG.thresholds.banMinor) severity = 'minor';
    actionDescription = `Mass Bans (${countForType} members banned within 60s)`;
  } else if (actionType === 'member_kick') {
    if (countForType >= ANTINUKE_CONFIG.thresholds.kickMajor || totalActions >= 6) severity = 'major';
    else if (countForType >= ANTINUKE_CONFIG.thresholds.kickMinor) severity = 'minor';
    actionDescription = `Mass Kicks (${countForType} members kicked within 60s)`;
  }

  if (!severity) return;

  let rolesStripped = false;
  if (severity === 'major') {
    try {
      const member = await guild.members.fetch(executor.id).catch(() => null);
      if (member && member.manageable) {
        const currentRoles = member.roles.cache
          .filter((r) => r.id !== guild.id && !r.managed)
          .map((r) => r.id);
        strippedMemberRoles.set(executor.id, currentRoles);

        await member.roles.set([], 'Anti-Nuke: Mass unauthorized actions detected').catch(() => null);
        await member.timeout(28 * 24 * 60 * 60 * 1000, 'Anti-Nuke Containment').catch(() => null);
        rolesStripped = true;
      }
    } catch (err) {
      console.error('Anti-nuke containment error:', err.message);
    }
  }

  const incidentId = 'inc_' + Date.now().toString(36);
  recentIncidents.set(incidentId, {
    id: incidentId,
    guildId: guild.id,
    executorId: executor.id,
    executorTag: executor.tag || executor.username,
    severity,
    actionType,
    actionDescription,
    targetName,
    timestamp: now,
    rolesStripped
  });

  const alertCard = new ContainerBuilder().setAccentColor(0x2b2d31);
  alertCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🚨 Anti-Nuke Emergency Security Alert'));
  alertCard.addSeparatorComponents(thinLine());
  alertCard.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `> **Rogue Actor:** <@${executor.id}> (\`${executor.tag || executor.username}\` • \`${executor.id}\`)\n` +
      `> **Threat Level:** ${severity === 'major' ? '🔴 **CRITICAL MASS ATTACK**' : '🟠 **SUSPICIOUS ACTIVITY (Minor)**'}\n` +
      `> **Incident Summary:** ${actionDescription}\n` +
      `> **Target Affected:** \`${targetName}\` (\`${targetId}\`)\n` +
      `> **Automated Containment:** ${rolesStripped ? '⚠️ **All administrative roles stripped & member quarantined!**' : '⚠️ Action rate logged and monitored.'}\n` +
      `> **Incident ID:** \`${incidentId}\`\n` +
      `> **Timestamp:** <t:${Math.floor(now / 1000)}:F>`
    )
  );
  alertCard.addSeparatorComponents(thinLine());

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`antinuke_restore_roles_${incidentId}`)
      .setLabel("Restore User's Roles")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`antinuke_ban_${incidentId}`)
      .setLabel('Ban Rogue Member')
      .setStyle(ButtonStyle.Danger)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`antinuke_restore_channels_${incidentId}`)
      .setLabel('Auto-Restore Channels')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`antinuke_restore_server_roles_${incidentId}`)
      .setLabel('Auto-Restore Roles')
      .setStyle(ButtonStyle.Primary)
  );

  alertCard.addActionRowComponents(row1, row2);
  alertCard.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('-# Alabama State Roleplay • Automated Anti-Nuke Security Engine')
  );

  const recipients = await getAlertRecipients(guild, severity);
  for (const user of recipients) {
    try {
      await user.send({
        components: [alertCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
    } catch (dmErr) {
      console.warn(`Could not DM alert to ${user.id}: ${dmErr.message}`);
    }
  }

  await sendSecurityLog(guild, alertCard);
}

async function handleAntiNukeButton(interaction) {
  const customId = interaction.customId;
  const parts = customId.split('_');
  const incidentId = parts.slice(-1)[0];

  const incident = recentIncidents.get(incidentId);
  const guild = interaction.guild || client.guilds.cache.get(incident?.guildId) || client.guilds.cache.first();

  if (!guild) {
    await interaction.reply({ content: '❌ Could not find target guild.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (customId.startsWith('antinuke_restore_roles_')) {
    const executorId = incident?.executorId;
    const savedRoles = strippedMemberRoles.get(executorId);
    if (!executorId || !savedRoles || !savedRoles.length) {
      await interaction.reply({
        content: '⚠️ No saved roles found for this user, or roles have already been restored.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    try {
      const member = await guild.members.fetch(executorId).catch(() => null);
      if (member) {
        await member.roles.add(savedRoles, `Roles restored after Anti-Nuke incident by ${interaction.user.tag}`);
        await member.timeout(null, 'Quarantine lifted');
        strippedMemberRoles.delete(executorId);
      }
      await interaction.reply({
        content: `✅ **Roles Restored:** <@${executorId}> has been restored with all previous roles and quarantine was removed.`
      });

      const logCard = new ContainerBuilder().setAccentColor(0x2b2d31);
      logCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🛡️ Anti-Nuke Action Resolved'));
      logCard.addSeparatorComponents(thinLine());
      logCard.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `> **Action:** User Roles Restored\n` +
          `> **Target:** <@${executorId}>\n` +
          `> **Authorized By:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
          `> **Incident ID:** \`${incidentId}\``
        )
      );
      await sendSecurityLog(guild, logCard);
    } catch (err) {
      await interaction.reply({ content: `❌ Failed to restore roles: ${err.message}`, flags: MessageFlags.Ephemeral });
    }
    return;
  }

  if (customId.startsWith('antinuke_ban_')) {
    const executorId = incident?.executorId;
    if (!executorId) {
      await interaction.reply({ content: '⚠️ Incident details expired or not found.', flags: MessageFlags.Ephemeral });
      return;
    }

    try {
      await guild.members.ban(executorId, {
        reason: `Anti-Nuke: Banned by ${interaction.user.tag} (${interaction.user.id}) for incident ${incidentId}`
      });
      await interaction.reply({
        content: `🔨 **Banned:** Rogue actor <@${executorId}> has been permanently banned from the server.`
      });

      const logCard = new ContainerBuilder().setAccentColor(0x2b2d31);
      logCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🔨 Rogue Member Banned'));
      logCard.addSeparatorComponents(thinLine());
      logCard.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `> **Action:** Permanent Ban Issued\n` +
          `> **Target:** <@${executorId}>\n` +
          `> **Executed By:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
          `> **Reason:** Confirmed Anti-Nuke violation (${incident?.actionDescription || 'Nuke attempt'})\n` +
          `> **Incident ID:** \`${incidentId}\``
        )
      );
      await sendSecurityLog(guild, logCard);
    } catch (err) {
      await interaction.reply({ content: `❌ Failed to ban user: ${err.message}`, flags: MessageFlags.Ephemeral });
    }
    return;
  }

  if (customId.startsWith('antinuke_restore_channels_')) {
    if (!recentlyDeletedChannels.size) {
      await interaction.reply({ content: 'ℹ️ No deleted channels currently recorded in restore cache.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply();
    let restored = 0;
    for (const [id, chData] of [...recentlyDeletedChannels]) {
      try {
        await guild.channels.create({
          name: chData.name,
          type: chData.type,
          parent: chData.parentId || null,
          topic: chData.topic,
          permissionOverwrites: chData.permissionOverwrites
        });
        restored += 1;
        recentlyDeletedChannels.delete(id);
      } catch (rErr) {
        console.warn(`Could not restore channel ${chData.name}: ${rErr.message}`);
      }
    }

    await interaction.editReply({
      content: `🔄 **Channels Restored:** Successfully re-created **${restored}** deleted channel(s)!`
    });

    const logCard = new ContainerBuilder().setAccentColor(0x2b2d31);
    logCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🔄 Channels Auto-Restored'));
    logCard.addSeparatorComponents(thinLine());
    logCard.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `> **Restored:** **${restored}** channel(s)\n` +
        `> **Triggered By:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
        `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:F>`
      )
    );
    await sendSecurityLog(guild, logCard);
    return;
  }

  if (customId.startsWith('antinuke_restore_server_roles_')) {
    if (!recentlyDeletedRoles.size) {
      await interaction.reply({ content: 'ℹ️ No deleted roles currently recorded in restore cache.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply();
    let restored = 0;
    for (const [id, rData] of [...recentlyDeletedRoles]) {
      try {
        await guild.roles.create({
          name: rData.name,
          color: rData.color,
          hoist: rData.hoist,
          mentionable: rData.mentionable,
          permissions: rData.permissions
        });
        restored += 1;
        recentlyDeletedRoles.delete(id);
      } catch (rErr) {
        console.warn(`Could not restore role ${rData.name}: ${rErr.message}`);
      }
    }

    await interaction.editReply({
      content: `🔄 **Roles Restored:** Successfully re-created **${restored}** deleted role(s)!`
    });

    const logCard = new ContainerBuilder().setAccentColor(0x2b2d31);
    logCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🔄 Roles Auto-Restored'));
    logCard.addSeparatorComponents(thinLine());
    logCard.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `> **Restored:** **${restored}** role(s)\n` +
        `> **Triggered By:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
        `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:F>`
      )
    );
    await sendSecurityLog(guild, logCard);
    return;
  }
}

async function handleBanCommand(interaction) {
  const member = interaction.member || (await interaction.guild?.members.fetch(interaction.user.id).catch(() => null));
  if (!member?.permissions.has(PermissionFlagsBits.BanMembers) && !isStaffMember(member)) {
    await interaction.reply({ content: '❌ You do not have permission to ban members.', flags: MessageFlags.Ephemeral });
    return;
  }

  const targetUser = interaction.options.getUser('target', true);
  const reason = interaction.options.getString('reason')?.trim() || 'No reason provided';
  const deleteDays = interaction.options.getInteger('delete_days') || 0;

  if (targetUser.id === interaction.user.id) {
    await interaction.reply({ content: '❌ You cannot ban yourself.', flags: MessageFlags.Ephemeral });
    return;
  }

  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  if (targetMember) {
    if (!targetMember.bannable) {
      await interaction.reply({ content: `❌ I cannot ban <@${targetUser.id}>. Their role is higher or equal to mine.`, flags: MessageFlags.Ephemeral });
      return;
    }
    if (member.roles.highest.position <= targetMember.roles.highest.position && interaction.guild.ownerId !== interaction.user.id) {
      await interaction.reply({ content: `❌ You cannot ban <@${targetUser.id}> because their role is higher or equal to yours.`, flags: MessageFlags.Ephemeral });
      return;
    }
  }

  await interaction.deferReply();
  try {
    await interaction.guild.members.ban(targetUser.id, {
      reason: `${reason} (Issued by ${interaction.user.tag})`,
      deleteMessageSeconds: deleteDays * 24 * 60 * 60
    });

    const card = new ContainerBuilder().setAccentColor(0x2b2d31);
    card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🔨 Member Banned'));
    card.addSeparatorComponents(thinLine());
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `> **User:** <@${targetUser.id}> (\`${targetUser.tag || targetUser.username}\` • \`${targetUser.id}\`)\n` +
        `> **Moderator:** <@${interaction.user.id}>\n` +
        `> **Reason:** ${reason}\n` +
        `> **Deleted History:** ${deleteDays} day(s)`
      )
    );
    await interaction.editReply({ components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 });
    await sendSecurityLog(interaction.guild, card);
  } catch (err) {
    await interaction.editReply({ content: `❌ Failed to ban user: ${err.message}` });
  }
}

async function handleKickCommand(interaction) {
  const member = interaction.member || (await interaction.guild?.members.fetch(interaction.user.id).catch(() => null));
  if (!member?.permissions.has(PermissionFlagsBits.KickMembers) && !isStaffMember(member)) {
    await interaction.reply({ content: '❌ You do not have permission to kick members.', flags: MessageFlags.Ephemeral });
    return;
  }

  const targetUser = interaction.options.getUser('target', true);
  const reason = interaction.options.getString('reason')?.trim() || 'No reason provided';

  if (targetUser.id === interaction.user.id) {
    await interaction.reply({ content: '❌ You cannot kick yourself.', flags: MessageFlags.Ephemeral });
    return;
  }

  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  if (!targetMember) {
    await interaction.reply({ content: '❌ Member is not currently in the server.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (!targetMember.kickable) {
    await interaction.reply({ content: `❌ I cannot kick <@${targetUser.id}>. Their role is higher or equal to mine.`, flags: MessageFlags.Ephemeral });
    return;
  }

  if (member.roles.highest.position <= targetMember.roles.highest.position && interaction.guild.ownerId !== interaction.user.id) {
    await interaction.reply({ content: `❌ You cannot kick <@${targetUser.id}> because their role is higher or equal to yours.`, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply();
  try {
    await targetMember.kick(`${reason} (Issued by ${interaction.user.tag})`);
    const card = new ContainerBuilder().setAccentColor(0x2b2d31);
    card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 👢 Member Kicked'));
    card.addSeparatorComponents(thinLine());
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `> **User:** <@${targetUser.id}> (\`${targetUser.tag || targetUser.username}\` • \`${targetUser.id}\`)\n` +
        `> **Moderator:** <@${interaction.user.id}>\n` +
        `> **Reason:** ${reason}`
      )
    );
    await interaction.editReply({ components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 });
    await sendSecurityLog(interaction.guild, card);
  } catch (err) {
    await interaction.editReply({ content: `❌ Failed to kick user: ${err.message}` });
  }
}

async function handleTimeoutCommand(interaction) {
  const member = interaction.member || (await interaction.guild?.members.fetch(interaction.user.id).catch(() => null));
  if (!member?.permissions.has(PermissionFlagsBits.ModerateMembers) && !isStaffMember(member)) {
    await interaction.reply({ content: '❌ You do not have permission to timeout members.', flags: MessageFlags.Ephemeral });
    return;
  }

  const targetUser = interaction.options.getUser('target', true);
  const durationKey = interaction.options.getString('duration', true);
  const reason = interaction.options.getString('reason')?.trim() || 'No reason provided';

  const durations = {
    '60s': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '10m': 10 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '1w': 7 * 24 * 60 * 60 * 1000
  };
  const durationMs = durations[durationKey] || 5 * 60 * 1000;

  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  if (!targetMember) {
    await interaction.reply({ content: '❌ Member is not currently in the server.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (!targetMember.moderatable) {
    await interaction.reply({ content: `❌ I cannot timeout <@${targetUser.id}>. Their role is higher or equal to mine.`, flags: MessageFlags.Ephemeral });
    return;
  }

  if (member.roles.highest.position <= targetMember.roles.highest.position && interaction.guild.ownerId !== interaction.user.id) {
    await interaction.reply({ content: `❌ You cannot timeout <@${targetUser.id}> because their role is higher or equal to yours.`, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply();
  try {
    await targetMember.timeout(durationMs, `${reason} (Issued by ${interaction.user.tag})`);
    const card = new ContainerBuilder().setAccentColor(0x2b2d31);
    card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Member Timed Out'));
    card.addSeparatorComponents(thinLine());
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `> **User:** <@${targetUser.id}> (\`${targetUser.tag || targetUser.username}\` • \`${targetUser.id}\`)\n` +
        `> **Duration:** \`${durationKey}\`\n` +
        `> **Moderator:** <@${interaction.user.id}>\n` +
        `> **Reason:** ${reason}`
      )
    );
    await interaction.editReply({ components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 });
    await sendSecurityLog(interaction.guild, card);
  } catch (err) {
    await interaction.editReply({ content: `❌ Failed to timeout user: ${err.message}` });
  }
}

async function handlePurgeCommand(interaction) {
  const member = interaction.member || (await interaction.guild?.members.fetch(interaction.user.id).catch(() => null));
  if (!member?.permissions.has(PermissionFlagsBits.ManageMessages) && !isStaffMember(member)) {
    await interaction.reply({ content: '❌ You do not have permission to purge messages.', flags: MessageFlags.Ephemeral });
    return;
  }

  const amount = interaction.options.getInteger('amount', true);
  const filterUser = interaction.options.getUser('user') || null;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const fetched = await interaction.channel.messages.fetch({ limit: amount });
    const toDelete = filterUser ? fetched.filter((m) => m.author.id === filterUser.id) : fetched;

    const deleted = await interaction.channel.bulkDelete(toDelete, true);
    await interaction.editReply({
      content: `🧹 Successfully purged **${deleted.size}** message(s)${filterUser ? ` from <@${filterUser.id}>` : ''}.`
    });

    const logCard = new ContainerBuilder().setAccentColor(0x2b2d31);
    logCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🧹 Messages Purged'));
    logCard.addSeparatorComponents(thinLine());
    logCard.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `> **Channel:** <#${interaction.channelId}>\n` +
        `> **Amount:** **${deleted.size}** messages\n` +
        `> **Moderator:** <@${interaction.user.id}>\n` +
        `> **Target Filter:** ${filterUser ? `<@${filterUser.id}>` : '*All users*'}`
      )
    );
    await sendSecurityLog(interaction.guild, logCard);
  } catch (err) {
    await interaction.editReply({ content: `❌ Failed to purge messages: ${err.message}` });
  }
}

async function handleAntiNukeCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  const member = interaction.member || (await interaction.guild?.members.fetch(interaction.user.id).catch(() => null));

  if (!isStaffMember(member)) {
    await interaction.reply({ content: '❌ You must have staff permissions to manage Anti-Nuke.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'status') {
    const card = new ContainerBuilder().setAccentColor(0x2b2d31);
    card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🛡️ Anti-Nuke Defense Status'));
    card.addSeparatorComponents(thinLine());
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `> **System Status:** 🟢 **Active & Armed**\n` +
        `> **Security Log Channel:** <#${ANTINUKE_CONFIG.logChannelId}>\n` +
        `> **Channel Backup Cache:** ${channelBackupCache.size} channels indexed\n` +
        `> **Role Backup Cache:** ${roleBackupCache.size} roles indexed\n` +
        `> **Deleted Channels in Cache:** ${recentlyDeletedChannels.size}\n` +
        `> **Deleted Roles in Cache:** ${recentlyDeletedRoles.size}\n` +
        `> **Quarantined Actors:** ${strippedMemberRoles.size}\n\n` +
        `**Alert Routing:**\n` +
        `• **Minor Activity (2 deletions):** Alerts Deputy Director & Assistant Director\n` +
        `• **Critical Mass Nuke (4+ deletions / mass bans):** Instant role strip, 28-day quarantine, and alerts all leadership tiers.`
      )
    );
    await interaction.reply({ components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 });
    return;
  }

  if (sub === 'snapshot') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await backupGuildState(interaction.guild);
    await interaction.editReply({
      content: `✅ **Snapshot Complete:** Indexed **${channelBackupCache.size}** channels and **${roleBackupCache.size}** roles for automatic restoration.`
    });
    return;
  }

  if (sub === 'restore') {
    const type = interaction.options.getString('type', true);
    if (type === 'channels') {
      if (!recentlyDeletedChannels.size) {
        await interaction.reply({ content: 'ℹ️ No deleted channels in restore cache.', flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      let restored = 0;
      for (const [id, chData] of [...recentlyDeletedChannels]) {
        try {
          await interaction.guild.channels.create({
            name: chData.name,
            type: chData.type,
            parent: chData.parentId || null,
            topic: chData.topic,
            permissionOverwrites: chData.permissionOverwrites
          });
          restored += 1;
          recentlyDeletedChannels.delete(id);
        } catch (rErr) {
          console.warn(`Could not restore channel ${chData.name}: ${rErr.message}`);
        }
      }
      await interaction.editReply({ content: `✅ Re-created **${restored}** deleted channels.` });
      return;
    }

    if (type === 'roles') {
      if (!recentlyDeletedRoles.size) {
        await interaction.reply({ content: 'ℹ️ No deleted roles in restore cache.', flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      let restored = 0;
      for (const [id, rData] of [...recentlyDeletedRoles]) {
        try {
          await interaction.guild.roles.create({
            name: rData.name,
            color: rData.color,
            hoist: rData.hoist,
            mentionable: rData.mentionable,
            permissions: rData.permissions
          });
          restored += 1;
          recentlyDeletedRoles.delete(id);
        } catch (rErr) {
          console.warn(`Could not restore role ${rData.name}: ${rErr.message}`);
        }
      }
      await interaction.editReply({ content: `✅ Re-created **${restored}** deleted roles.` });
      return;
    }
  }
}

// ═══════════════════════ ER:LC In-Game Anti-Exploiter & VC Enforcer ═══════════════════════
const ERLC_ENFORCER_CONFIG = {
  enabled: true,
  codeWord: 'alabam',
  suspiciousAssets: ['144076358', '63690008', '1772336109'],
  staffRoleIds: ['1341965114101731418', '1548637141850918993'],
  guildIds: ['1232495211490443284', '1530147023754367006'],
  outfitBanDelayMs: 2 * 60 * 1000,
  vcJailDelayMs: 2 * 60 * 1000,
  vcKickDelayMs: 5 * 60 * 1000
};

const inGamePlayerTracker = new Map();
const allOnlinePlayers = new Set();
const verifiedInDiscordCache = new Set();
const rejoinedBaconOutfitWarned = new Set();
const rejoinedVcCooldown = new Map(); // username -> expiryTs (15 min cooldown)
const staffUnbannedExemptions = new Set(); // usernames/IDs unbanned by staff: immune to automated enforcement bans & kicks

function clearAllPlayerPenalties(usernameOrId) {
  if (!usernameOrId) return;
  const key = usernameOrId.toString().toLowerCase().trim();
  rejoinedBaconOutfitWarned.delete(key);
  rejoinedVcCooldown.delete(key);
  safeZoneStrikes.delete(key);
  saveSafeZoneStrikes();
  inGamePlayerTracker.delete(key);
  staffUnbannedExemptions.add(key);
  console.log(`[Staff Unban Exemption] Cleared all penalties, strikes, rejoin cooldowns & trackers for: ${key}`);
}

const BACON_HAIR_IDS = ['63690008', '1772336109'];
const BACON_CLOTHING_IDS = [
  '144076358', // Blue and Black Motorcycle Shirt
  '144076760', // Dark Green Jeans
  '144076433', // I <3 Pizza Shirt
  '144076512', // Pink Jeans
  '382537085', // Roblox Classic Shirt
  '382538059', // Roblox Classic Pants
  '144076250',
  '144076302'
];

let cachedPublicIp = null;
async function getOutboundIp() {
  if (cachedPublicIp) return cachedPublicIp;
  try {
    const res = await axios.get('https://api.ipify.org?format=json', { timeout: 4000 });
    if (res.data?.ip) cachedPublicIp = String(res.data.ip).trim();
  } catch {}
  return cachedPublicIp || 'Unknown';
}

const erlcCommandQueue = [];
let isProcessingErlcQueue = false;

async function processErlcQueue() {
  if (isProcessingErlcQueue || erlcCommandQueue.length === 0) return;
  isProcessingErlcQueue = true;

  while (erlcCommandQueue.length > 0) {
    const item = erlcCommandQueue.shift();
    const base = erlcBase();
    try {
      const res = await axios.post(
        `${base}/server/command`,
        { command: item.command },
        { headers: { 'Server-Key': config.apiKey }, timeout: 8000 }
      );
      console.log(`[ER:LC Command] Executed "${item.command}": status ${res.status}`);
      item.resolve({ ok: true, data: res.data });
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message;
      const retryAfterSec = Number(err.response?.data?.retry_after);
      if (err.response?.status === 429 || err.response?.data?.code === 4001 || errMsg.includes('rate limited')) {
        const waitMs = (retryAfterSec ? Math.ceil(retryAfterSec * 1000) : 5000) + 1200;
        console.warn(`[ER:LC Command] Rate limited on "${item.command}". Retrying in ${waitMs}ms...`);
        // Put back at head of queue and wait
        erlcCommandQueue.unshift(item);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      } else {
        if (errMsg.toLowerCase().includes('allowlist your ip') || errMsg.toLowerCase().includes('not authorized')) {
          getOutboundIp().then((ip) => {
            console.error(`[ER:LC API ERROR] Outbound IP (${ip}) is NOT allowlisted on https://api.erlc.gg/server-owners! Commands will fail until this IP is added.`);
          }).catch(() => {});
        }
        console.warn(`[ER:LC Command] Failed "${item.command}": ${errMsg}`);
        item.resolve({ ok: false, error: errMsg });
      }
    }
    // API pacing between commands to keep in-game actions responsive
    await new Promise((r) => setTimeout(r, 1600));
  }

  isProcessingErlcQueue = false;
}

async function sendErlcCommand(command) {
  if (!config.apiKey) return { ok: false, error: 'No API key configured in .env' };
  return new Promise((resolve) => {
    erlcCommandQueue.push({ command, resolve });
    processErlcQueue();
  });
}

async function getRobloxIdFromUsername(username) {
  try {
    const res = await axios.post('https://users.roblox.com/v1/usernames/users', {
      usernames: [username],
      excludeBannedUsers: false
    }, { timeout: 6000 });
    const user = res.data?.data?.[0];
    return user ? user.id : null;
  } catch (err) {
    console.warn(`Roblox user lookup failed for ${username}: ${err.message}`);
    return null;
  }
}

async function getRobloxCurrentlyWearing(userId) {
  if (!userId) return [];
  try {
    const res = await axios.get(`https://avatar.roblox.com/v1/users/${userId}/currently-wearing`, {
      timeout: 6000
    });
    return res.data?.assetIds?.map((id) => String(id)) || [];
  } catch (err) {
    console.warn(`Roblox avatar lookup failed for user ${userId}: ${err.message}`);
    return [];
  }
}

async function checkPlayerDiscordStatus(discordClient, username) {
  if (!username) return { found: false, isStaff: false, member: null };
  const uKey = username.toLowerCase();
  if (verifiedInDiscordCache.has(uKey)) {
    return { found: true, isStaff: false, member: null };
  }

  const cleanName = uKey.replace(/[^a-z0-9]/g, '');

  for (const gid of ERLC_ENFORCER_CONFIG.guildIds) {
    const guild = discordClient.guilds.cache.get(gid);
    if (!guild) continue;

    // Ensure member cache is loaded
    if (guild.members.cache.size < 20) {
      await guild.members.fetch().catch(() => null);
    }

    for (const member of guild.members.cache.values()) {
      if (member.user.bot) continue;

      const dUser = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
      const dGlobal = (member.user.globalName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const rawNick = (member.nickname || '').toLowerCase();
      const dNick = rawNick.replace(/[^a-z0-9]/g, '');

      let matched = (dUser === cleanName || dGlobal === cleanName || dNick === cleanName || dNick.includes(cleanName));

      // Also split nickname by common delimiters (e.g. "Teddy8D (susugoated1)", "𝐃┃♡ 𝕽𝖔𝖘𝖊♡ | notroseplays_34")
      if (!matched && member.nickname) {
        const parts = member.nickname
          .split(/[|┃I/\\()_ \-\[\]]/)
          .map((s) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, ''))
          .filter(Boolean);
        if (parts.includes(cleanName)) {
          matched = true;
        }
      }

      if (matched) {
        const isStaff = member.roles.cache.some(
          (r) =>
            ERLC_ENFORCER_CONFIG.staffRoleIds.includes(r.id) ||
            /(staff|admin|mod\b|supervisor|director|executive|owner|management)/i.test(r.name)
        );
        verifiedInDiscordCache.add(uKey);
        return { found: true, isStaff, member, guild };
      }
    }

    // Secondary attempt: live search by query
    try {
      const searchResults = await guild.members.search({ query: username, limit: 5 }).catch(() => null);
      if (searchResults && searchResults.size > 0) {
        for (const member of searchResults.values()) {
          const isStaff = member.roles.cache.some(
            (r) =>
              ERLC_ENFORCER_CONFIG.staffRoleIds.includes(r.id) ||
              /(staff|admin|mod\b|supervisor|director|executive|owner|management)/i.test(r.name)
          );
          verifiedInDiscordCache.add(uKey);
          return { found: true, isStaff, member, guild };
        }
      }
    } catch {
      // ignore transient search error
    }
  }

  return { found: false, isStaff: false, member: null };
}

async function getStaffRobloxUsername(discordClient, discordUser) {
  if (!discordUser) return null;
  const primaryGuildId = '1232495211490443284';
  const targetGuildIds = [primaryGuildId, '1530147023754367006'];
  let member = null;

  for (const gid of targetGuildIds) {
    const g = discordClient.guilds.cache.get(gid);
    if (!g) continue;
    member = await g.members.fetch(discordUser.id).catch(() => null);
    if (member) break;
  }

  let resolved = discordUser.username;

  if (member && member.nickname) {
    const nick = member.nickname;
    // 1. Parentheses check e.g. "Teddy8D (susugoated1)"
    const parenMatch = nick.match(/\(([^)]+)\)/);
    if (parenMatch && parenMatch[1].trim()) {
      resolved = parenMatch[1].trim();
    } else {
      // 2. Delimiter split by pipe or slash or dash e.g. "𝐃┃♡ 𝕽𝖔𝖘𝖊♡ | notroseplays_34"
      const parts = nick.split(/[|┃I]/).map((s) => s.trim()).filter(Boolean);
      for (let i = parts.length - 1; i >= 0; i--) {
        const candidate = parts[i].replace(/[^\w]/g, '').trim();
        const lower = candidate.toLowerCase();
        if (
          candidate.length >= 3 &&
          !['loa', 'dd', 'tm', 'ia', 'sia', 'tia', 'mgmt', 'cmgmt', 'smgmt', 'ad', 'hos', 'ja', 'ha', 'da', 'sa', 'jm'].includes(lower)
        ) {
          resolved = parts[i].trim().split(/\s+/).pop();
          break;
        }
      }
    }
  }

  return resolved;
}

async function getRobloxAvatarHeadshotUrl(userId) {
  if (!userId) return null;
  try {
    const res = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`, {
      timeout: 5000
    });
    return res.data?.data?.[0]?.imageUrl || null;
  } catch (err) {
    console.warn(`Roblox headshot thumbnail lookup failed for ${userId}: ${err.message}`);
    return null;
  }
}

async function buildStaffAlertCard(username, tracker, isJoined = false, hasLeft = false) {
  const card = new ContainerBuilder().setAccentColor(0x2b2d31);
  card.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('## In-Game Player Not in Discord Server')
  );
  card.addSeparatorComponents(thinLine());

  const robloxId = tracker?.robloxId || null;
  const avatarUrl = await getRobloxAvatarHeadshotUrl(robloxId);

  const warnCount = tracker?.warnCount || 1;
  const statusText = hasLeft
    ? '**Player Left the Game**'
    : isJoined
      ? '**Joined & Verified in Discord**'
      : tracker?.kicked
        ? '**Kicked from Server (5 Warnings Elapsed)**'
        : `**Not in Discord (Warning ${warnCount}/5)**`;

  const inGameState = hasLeft
    ? 'Player disconnected / left server'
    : isJoined
      ? 'Player unjailed'
      : tracker?.kicked
        ? 'Kicked from server'
        : `Warning ${warnCount} of 5 sent`;

  const assignedStaffText = tracker?.assignedStaffId ? `> **Assigned Staff:** <@${tracker.assignedStaffId}>\n` : '';
  const refreshSuffix = isJoined ? ' • *(Verified In Discord)*' : '';
  const detectedTs = tracker?.createdTs ? Math.floor(tracker.createdTs / 1000) : Math.floor(Date.now() / 1000);

  const infoText =
    `> **Player:** \`${username}\`${robloxId ? ` (Roblox ID: \`${robloxId}\`)` : ''}\n` +
    `> **Status:** ${statusText}\n` +
    `> **In-Game State:** ${inGameState}\n` +
    assignedStaffText +
    `> **Join Code:** \`ALABAM\`\n` +
    `> **Detected:** <t:${detectedTs}:R>${refreshSuffix}\n\n` +
    (hasLeft
      ? '*Player has left the game. In-game actions are no longer available.*'
      : isJoined
        ? '*Member has successfully joined the Discord server and was unjailed.*'
        : tracker?.kicked
          ? '*Player failed 5 warnings across 5 minutes and was kicked from the server.*'
          : `*Player joined in-game without being in Discord. 5-minute warning countdown active (Warning ${warnCount}/5).*`);

  if (avatarUrl) {
    card.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(infoText))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
    );
  } else {
    card.addTextDisplayComponents(new TextDisplayBuilder().setContent(infoText));
  }
  card.addSeparatorComponents(thinLine());

  const isActionDisabled = isJoined || hasLeft;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`erlc_tp_${username}`)
      .setLabel('Teleport to Player')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isActionDisabled),
    new ButtonBuilder()
      .setCustomId(`erlc_bring_${username}`)
      .setLabel('Bring Player to You')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isActionDisabled),
    new ButtonBuilder()
      .setCustomId(`erlc_check_join_${username}`)
      .setLabel(hasLeft ? 'Player Left Game' : isJoined ? 'In Discord' : 'Not In Discord')
      .setStyle(isJoined ? ButtonStyle.Success : ButtonStyle.Danger)
      .setDisabled(true)
  );

  card.addActionRowComponents(row);
  card.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('-# Alabama State Roleplay • Automated Moderation Desk')
  );
  return card;
}

async function buildOutfitFlagCard(username, robloxId, assetName) {
  const card = new ContainerBuilder().setAccentColor(0x2b2d31);
  card.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('## Flagged Avatar / Account In-Game')
  );
  card.addSeparatorComponents(thinLine());

  const avatarUrl = await getRobloxAvatarHeadshotUrl(robloxId);
  const infoText =
    `> **Player:** \`${username}\`${robloxId ? ` (Roblox ID: \`${robloxId}\`)` : ''}\n` +
    `> **Flagged Outfit:** \`${assetName}\`\n` +
    `> **Status:** Prohibited starter bacon outfit detected\n` +
    `> **Private Message Sent:** \`:pm ${username} Alabama State Roleplay - Please change your avatar out of the default bacon outfit.\`\n` +
    `> **Policy:** Warned. If player rejoins with this outfit, they will be automatically banned.\n` +
    `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>\n\n` +
    `*Staff moderation controls for this player:*`;

  if (avatarUrl) {
    card.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(infoText))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
    );
  } else {
    card.addTextDisplayComponents(new TextDisplayBuilder().setContent(infoText));
  }
  card.addSeparatorComponents(thinLine());

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`erlc_tp_${username}`)
      .setLabel('Teleport to Player')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📍'),
    new ButtonBuilder()
      .setCustomId(`erlc_bring_${username}`)
      .setLabel('Bring Player')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🧲'),
    new ButtonBuilder()
      .setCustomId(`erlc_instant_kick_${username}`)
      .setLabel('Kick Player')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('👢'),
    new ButtonBuilder()
      .setCustomId(`erlc_instant_ban_${username}`)
      .setLabel('Ban Player')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔨')
  );

  card.addActionRowComponents(row);
  card.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('-# Alabama State Roleplay • Automated Anti-Cheat System')
  );
  return card;
}

async function getOnDutyStaffMembers(discordClient) {
  const explicitDutyRoleIds = ['1342676208671785050', '1548637141850918993'];
  const explicitStaffRoleIds = ['1341965114101731418', '1548637141850918993', '1342676208671785050'];
  const onDutyMembers = new Map();
  const generalStaffMembers = new Map();

  for (const gid of ['1232495211490443284', '1530147023754367006']) {
    const guild = discordClient.guilds.cache.get(gid);
    if (!guild) continue;
    try {
      await guild.members.fetch().catch(() => null);
      for (const member of guild.members.cache.values()) {
        if (member.user.bot) continue;

        const isOwnerOrAdmin = member.id === guild.ownerId || member.permissions.has(PermissionFlagsBits.Administrator);
        const hasDutyRole = member.roles.cache.some(
          (r) => explicitDutyRoleIds.includes(r.id) || /^on[\s-_]?duty$/i.test(r.name.trim())
        );
        const hasStaffRole =
          isOwnerOrAdmin ||
          member.roles.cache.some(
            (r) =>
              explicitStaffRoleIds.includes(r.id) ||
              /(staff|moderator|mod\b|admin|supervisor|lead|management|high rank|hr|owner|co-owner)/i.test(r.name)
          );

        if (hasDutyRole) {
          onDutyMembers.set(member.user.id, member);
        }
        if (hasStaffRole) {
          generalStaffMembers.set(member.user.id, member);
        }
      }
    } catch (err) {
      console.warn(`[Staff Fetch] Error for guild ${guild.id}: ${err.message}`);
    }
  }

  // If there are staff explicitly marked On Duty, prioritize them!
  if (onDutyMembers.size > 0) {
    console.log(`[Staff Alert DM] Found ${onDutyMembers.size} on-duty staff member(s).`);
    return [...onDutyMembers.values()];
  }

  // Fallback: If no one has the On-Duty role active right now, alert staff team members / admins so alerts are NEVER dropped!
  console.log(`[Staff Alert DM] No explicit On-Duty role active. Falling back to ${generalStaffMembers.size} staff/admin member(s).`);
  return [...generalStaffMembers.values()];
}

function assignPlayerToStaff(onDutyStaff) {
  if (!onDutyStaff || onDutyStaff.length === 0) return null;
  if (onDutyStaff.length === 1) return onDutyStaff[0];

  // Distribute players evenly (50/50 for 2 staff, or 1/N for N staff)
  const staffLoad = new Map();
  for (const s of onDutyStaff) {
    staffLoad.set(s.user.id, 0);
  }
  for (const t of inGamePlayerTracker.values()) {
    if (t.assignedStaffId && staffLoad.has(t.assignedStaffId)) {
      staffLoad.set(t.assignedStaffId, staffLoad.get(t.assignedStaffId) + 1);
    }
  }

  // Pick staff member with the lowest active workload
  let bestStaff = onDutyStaff[0];
  let minLoad = staffLoad.get(bestStaff.user.id) || 0;
  for (const s of onDutyStaff) {
    const load = staffLoad.get(s.user.id) || 0;
    if (load < minLoad) {
      minLoad = load;
      bestStaff = s;
    }
  }
  return bestStaff;
}

async function sendStaffAlertDMs(discordClient, cardPayload, targetStaff = null) {
  if (targetStaff) {
    try {
      const dmMsg = await targetStaff.user.send(cardPayload);
      console.log(`[Staff Alert DM] Sent targeted alert DM to assigned staff ${targetStaff.user.tag} (${targetStaff.user.id})`);
      return [{ user: targetStaff.user, msg: dmMsg }];
    } catch (err) {
      console.warn(`[Staff Alert DM] Could not DM assigned staff ${targetStaff.user.tag}: ${err.message}. Trying other staff...`);
    }
  }

  const eligibleStaff = await getOnDutyStaffMembers(discordClient);
  if (!eligibleStaff.length) {
    console.log('[Staff Alert DM] No staff members found to alert.');
    return [];
  }

  // Sort candidates by current workload (ascending) so cases are balanced 50/50
  const candidates = [...eligibleStaff].sort((a, b) => {
    const aLoad = [...inGamePlayerTracker.values()].filter((t) => t.assignedStaffId === a.user.id).length;
    const bLoad = [...inGamePlayerTracker.values()].filter((t) => t.assignedStaffId === b.user.id).length;
    return aLoad - bLoad;
  });

  for (const staff of candidates) {
    try {
      const dmMsg = await staff.user.send(cardPayload);
      console.log(`[Staff Alert DM] Successfully sent alert DM to ${staff.user.tag} (${staff.user.id})`);
      return [{ user: staff.user, msg: dmMsg }];
    } catch (err) {
      console.warn(`[Staff Alert DM] Could not DM staff ${staff.user.tag} (${staff.user.id}): ${err.message}. Trying next candidate...`);
    }
  }
  return [];
}

// ═══════════════════════ Safe Zone Violations System ═══════════════════════
const SAFEZONE_FILE = fileURLToPath(new URL('../safezone_strikes.json', import.meta.url));
const safeZoneStrikes = new Map();

function loadSafeZoneStrikes() {
  try {
    if (!fs.existsSync(SAFEZONE_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(SAFEZONE_FILE, 'utf8'));
    for (const [user, data] of Object.entries(raw)) {
      safeZoneStrikes.set(user.toLowerCase(), data);
    }
    console.log(`Loaded ${safeZoneStrikes.size} safe zone strike record(s).`);
  } catch (err) {
    console.warn(`Could not load safezone_strikes.json: ${err.message}`);
  }
}

function saveSafeZoneStrikes() {
  try {
    const obj = {};
    for (const [user, data] of safeZoneStrikes) {
      obj[user] = data;
    }
    fs.writeFileSync(SAFEZONE_FILE, JSON.stringify(obj, null, 2));
  } catch (err) {
    console.warn(`Could not save safezone_strikes.json: ${err.message}`);
  }
}

async function handleSafeZoneStrike(discordClient, username, moderator = null, reason = 'Shooting in Safe Zone', victim = null) {
  const uKey = username.toLowerCase();
  let record = safeZoneStrikes.get(uKey) || { username, strikes: 0, lastStrikeTs: 0, history: [] };
  record.strikes += 1;
  record.lastStrikeTs = Date.now();
  record.username = username;

  const strikeNum = record.strikes;
  record.history.push({
    strike: strikeNum,
    reason,
    victim: victim || null,
    moderator: moderator ? `${moderator.tag || moderator.username} (${moderator.id})` : 'Automated Safe Zone Defense',
    timestamp: Math.floor(Date.now() / 1000)
  });
  safeZoneStrikes.set(uKey, record);
  saveSafeZoneStrikes();

  const safeZoneChannelId = '1277704273375002675';
  const targetChannel = await discordClient.channels.fetch(safeZoneChannelId).catch(() => null);
  const primaryGuild = discordClient.guilds.cache.get('1232495211490443284') || discordClient.guilds.cache.first();
  const victimLine = victim ? `> **Victim:** \`${victim}\`\n` : '';

  if (strikeNum === 1) {
    // Strike 1: Warning PM ONLY (do not jail)
    const warnPm = `Safe Zone Warning: Do not attack players in protected safe zones. First warning.`;
    await sendErlcCommand(`:pm ${username} ${warnPm}`);

    const card = new ContainerBuilder().setAccentColor(0xf1c40f);
    card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## ⚠️ Safe Zone Violation — Strike 1 (Warning)'));
    card.addSeparatorComponents(thinLine());
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `> **Player:** \`${username}\`\n` +
        victimLine +
        `> **Infraction:** Safe Zone Shooting / Kill Incident (First Offense)\n` +
        `> **Action Taken:** In-Game Warning PM Sent (Player not jailed)\n` +
        `> **Private Message:** \`${warnPm}\`\n` +
        `> **Next Penalty:** 🔒 **Second Warning & In-Game Jail** on Strike 2\n` +
        `> **Authorized By:** ${moderator ? `<@${moderator.id}>` : 'Automated Defense'}\n` +
        `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>`
      )
    );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`erlc_tp_${username}`).setLabel('Teleport to Player').setStyle(ButtonStyle.Secondary).setEmoji('📍'),
      new ButtonBuilder().setCustomId(`erlc_bring_${username}`).setLabel('Bring Player').setStyle(ButtonStyle.Secondary).setEmoji('🧲'),
      new ButtonBuilder().setCustomId(`sz_pardon_${username}`).setLabel('Pardon Strike').setStyle(ButtonStyle.Success).setEmoji('🕊️')
    );
    card.addActionRowComponents(row);

    if (targetChannel) {
      await targetChannel.send({ components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
    }
    if (primaryGuild) {
      await sendGameLog(primaryGuild, card);
    }
    return { ok: true, strike: 1, action: 'warn' };
  } else if (strikeNum === 2) {
    // Strike 2: Jail immediately + Second Warning PM
    const warnPm2 = `Safe Zone Warning: Do not attack players in protected safe zones. Second warning.`;
    const jailPm = `Safe Zone Violation: Jailed for attacking in protected safe zone.`;
    await sendErlcCommand(`:jail ${username}`);
    await sendErlcCommand(`:pm ${username} ${warnPm2}`);
    await sendErlcCommand(`:pm ${username} ${jailPm}`);

    const card = new ContainerBuilder().setAccentColor(0xe67e22);
    card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🔒 Safe Zone Violation — Strike 2 (Jailed)'));
    card.addSeparatorComponents(thinLine());
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `> **Player:** \`${username}\`\n` +
        victimLine +
        `> **Infraction:** Repeat Safe Zone Shooting (Second Offense)\n` +
        `> **Action Taken:** Jailed in-game (\`:jail ${username}\`) + Second Warning PM Sent\n` +
        `> **Private Messages Sent:**\n` +
        `> • \`${warnPm2}\`\n` +
        `> • \`${jailPm}\`\n` +
        `> **Next Penalty:** 👢 **Kick from Server** if they shoot again (Strike 3)\n` +
        `> **Authorized By:** ${moderator ? `<@${moderator.id}>` : 'Automated Defense'}\n` +
        `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>`
      )
    );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sz_unjail_${username}`).setLabel('Unjail Player').setStyle(ButtonStyle.Success).setEmoji('🔓'),
      new ButtonBuilder().setCustomId(`erlc_tp_${username}`).setLabel('Teleport to Player').setStyle(ButtonStyle.Secondary).setEmoji('📍'),
      new ButtonBuilder().setCustomId(`erlc_bring_${username}`).setLabel('Bring Player').setStyle(ButtonStyle.Secondary).setEmoji('🧲'),
      new ButtonBuilder().setCustomId(`sz_pardon_${username}`).setLabel('Pardon Strike').setStyle(ButtonStyle.Secondary).setEmoji('🕊️')
    );
    card.addActionRowComponents(row);

    if (targetChannel) {
      await targetChannel.send({ components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
    }
    if (primaryGuild) {
      await sendGameLog(primaryGuild, card);
    }
    return { ok: true, strike: 2, action: 'warn_jail' };
  } else if (strikeNum === 3) {
    // Strike 3: Notice PM + 3.5s Delay so they can read it + Kick!
    const removePm = `Safe Zone Violation: Removed for repeated attacks in protected safe zones.`;
    await sendErlcCommand(`:pm ${username} ${removePm}`);
    await new Promise((resolve) => setTimeout(resolve, 3500));
    await sendErlcCommand(`:kick ${username} Safe Zone - Repeated attacks in safe zone.`);

    const card = new ContainerBuilder().setAccentColor(0xed4245);
    card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 👢 Safe Zone Violation — Strike 3 (Kicked)'));
    card.addSeparatorComponents(thinLine());
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `> **Player:** \`${username}\`\n` +
        victimLine +
        `> **Infraction:** Repeated Safe Zone Shooting after Warning & Jail (Strike 3)\n` +
        `> **Action Taken:** Removal Notice Sent + Kicked from Server (\`:kick ${username}\`)\n` +
        `> **Private Message:** \`${removePm}\`\n` +
        `> **Next Penalty:** 🔨 **Permanent Ban** if they rejoin and shoot again (Strike 4)\n` +
        `> **Authorized By:** ${moderator ? `<@${moderator.id}>` : 'Automated Defense'}\n` +
        `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>`
      )
    );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sz_pardon_${username}`).setLabel('Pardon Strike').setStyle(ButtonStyle.Secondary).setEmoji('🕊️')
    );
    card.addActionRowComponents(row);

    if (targetChannel) {
      await targetChannel.send({ components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
    }
    if (primaryGuild) {
      await sendGameLog(primaryGuild, card);
    }
    return { ok: true, strike: 3, action: 'kick' };
  } else {
    // Strike 4+: Permanent Ban
    await sendErlcCommand(`:ban ${username} Safe Zone - Repeated safe zone shooting after kick.`);

    const card = new ContainerBuilder().setAccentColor(0x992d22);
    card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🔨 Safe Zone Violation — Strike 4 (Banned)'));
    card.addSeparatorComponents(thinLine());
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `> **Player:** \`${username}\`\n` +
        victimLine +
        `> **Infraction:** Rejoined and Violated Safe Zone Rules Again (Strike ${strikeNum})\n` +
        `> **Action Taken:** In-Game Ban Issued (\`:ban ${username}\`)\n` +
        `> **Authorized By:** ${moderator ? `<@${moderator.id}>` : 'Automated Defense'}\n` +
        `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>`
      )
    );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sz_pardon_${username}`).setLabel('Pardon Strike').setStyle(ButtonStyle.Secondary).setEmoji('🕊️')
    );
    card.addActionRowComponents(row);

    if (targetChannel) {
      await targetChannel.send({ components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
    }
    if (primaryGuild) {
      await sendGameLog(primaryGuild, card);
    }
    return { ok: true, strike: strikeNum, action: 'ban' };
  }
}

const processedKillTimestamps = new Set();
let killLogsInitialized = false;

async function isStaffKiller(discordClient, username) {
  if (!username) return false;
  const uLower = username.toLowerCase();
  const cleanName = uLower.replace(/[^a-z0-9]/g, '');

  // 1. Check ER:LC players list for permission
  const base = erlcBase();
  try {
    const res = await axios.get(`${base}/server/players`, {
      headers: { 'Server-Key': config.apiKey },
      timeout: 5000
    });
    if (Array.isArray(res.data)) {
      const p = res.data.find((item) => (item.Player || '').split(':')[0].toLowerCase() === uLower);
      if (p && /(admin|moderator|mod\b|owner|co-owner)/i.test((p.Permission || '').toLowerCase())) {
        return true;
      }
    }
  } catch {}

  // 2. Check Discord members for staff team role 1341965114101731418 or ERLC_ENFORCER_CONFIG.staffRoleIds
  const status = await checkPlayerDiscordStatus(discordClient, username);
  if (status.isStaff) return true;
  if (status.member) {
    if (status.member.roles.cache.has('1341965114101731418')) return true;
    if (status.member.roles.cache.some((r) => ERLC_ENFORCER_CONFIG.staffRoleIds.includes(r.id))) return true;
  }

  for (const gid of ERLC_ENFORCER_CONFIG.guildIds) {
    const guild = discordClient.guilds.cache.get(gid);
    if (!guild) continue;
    for (const member of guild.members.cache.values()) {
      if (member.user.bot) continue;
      const isStaff = member.roles.cache.some(
        (r) =>
          ERLC_ENFORCER_CONFIG.staffRoleIds.includes(r.id) ||
          r.id === '1341965114101731418' ||
          /(staff|admin|mod\b|supervisor|director|executive|owner|management)/i.test(r.name)
      );
      if (!isStaff) continue;

      const dUser = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
      const dGlobal = (member.user.globalName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const rawNick = (member.nickname || '').toLowerCase();
      const dNick = rawNick.replace(/[^a-z0-9]/g, '');
      if (dUser === cleanName || dGlobal === cleanName || dNick === cleanName || dNick.includes(cleanName)) {
        return true;
      }
      if (member.nickname) {
        const parts = member.nickname.split(/[|┃I/\\()_ \-\[\]]/).map((s) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean);
        if (parts.includes(cleanName)) return true;
      }
    }
  }
  return false;
}

async function checkKillLogsForSafeZone(discordClient) {
  if (!config.apiKey) return;
  const base = erlcBase();
  try {
    const res = await axios.get(`${base}/server/killlogs`, {
      headers: { 'Server-Key': config.apiKey },
      timeout: 6000
    });
    const logs = res.data || [];
    if (!Array.isArray(logs) || !logs.length) return;

    if (!killLogsInitialized) {
      const nowSec = Math.floor(Date.now() / 1000);
      for (const k of logs) {
        if (k.Timestamp && (nowSec - k.Timestamp > 20)) {
          processedKillTimestamps.add(`${k.Killer}:${k.Killed}:${k.Timestamp}`);
        }
      }
      killLogsInitialized = true;
      console.log(`[Safe Zone] Initialized with ${processedKillTimestamps.size} historical kill record(s). Watching for new kills...`);
    }

    for (const k of logs) {
      const key = `${k.Killer}:${k.Killed}:${k.Timestamp}`;
      if (processedKillTimestamps.has(key)) continue;
      processedKillTimestamps.add(key);

      const killerName = (k.Killer || '').split(':')[0] || 'Unknown';
      const victimName = (k.Killed || '').split(':')[0] || 'Unknown';

      const isStaff = await isStaffKiller(discordClient, killerName);
      console.log(`[Safe Zone Auto-Enforcer] Kill incident logged: ${killerName} killed ${victimName}${isStaff ? ' (Staff Member)' : ''}. Triggering safe zone strike & warning...`);
      await handleSafeZoneStrike(
        discordClient,
        killerName,
        null,
        isStaff ? 'Safe Zone Kill Incident (Staff Activity)' : 'Safe Zone Shooting / Kill Incident',
        victimName
      );
    }
  } catch (err) {
    console.warn(`[Safe Zone] Kill logs check error: ${err.response?.data?.message || err.message}`);
  }
}

function sanitizeRobloxMessage(text) {
  if (!text) return '';
  return text
    .replace(/discord(?:\.gg|\.com)?(?:\/[a-zA-Z0-9_-]+)?/gi, 'comms - alabam')
    .replace(/\bdiscord\b/gi, 'comms')
    .replace(/\bexploit(?:er|ing)?\b/gi, 'suspicious outfit')
    .replace(/\bbann?ed\b/gi, 'removed')
    .replace(/\bbann?ing\b/gi, 'removing')
    .replace(/\bban\b/gi, 'remove');
}

async function runErlcEnforcementScan(discordClient) {
  if (!config.apiKey) return;
  const base = erlcBase();
  let playersRaw = [];
  try {
    const res = await axios.get(`${base}/server/players`, {
      headers: { 'Server-Key': config.apiKey },
      timeout: 8000
    });
    playersRaw = res.data || [];
  } catch (err) {
    console.warn(`[ER:LC Scan Error] ${err.response?.data?.message || err.message}`);
    return;
  }

  if (!Array.isArray(playersRaw) || !playersRaw.length) {
    return;
  }
  console.log(`[ER:LC Scan] Inspecting ${playersRaw.length} player(s) in-game...`);

  allOnlinePlayers.clear();
  const activeUsernames = new Set();
  const primaryGuild = discordClient.guilds.cache.get('1232495211490443284') || discordClient.guilds.cache.first();

  for (const p of playersRaw) {
    let username = null;
    let robloxId = null;
    let permission = null;

    if (typeof p === 'string') {
      const parts = p.split(':');
      username = parts[0];
      robloxId = parts[1] || null;
    } else if (typeof p === 'object' && p !== null) {
      if (typeof p.Player === 'string') {
        const parts = p.Player.split(':');
        username = parts[0];
        robloxId = parts[1] || null;
      } else {
        username = p.username || p.name || p.PlayerName || null;
        robloxId = p.id || p.userId || p.PlayerId || null;
      }
      permission = p.Permission || p.permission || null;
    }

    if (!username) continue;
    allOnlinePlayers.add(username.toLowerCase());

    // Skip in-game staff members from all automated warnings / jailing!
    const permLower = (permission || '').toLowerCase();
    if (/(admin|moderator|mod\b|owner|co-owner)/i.test(permLower)) {
      continue;
    }

    activeUsernames.add(username.toLowerCase());

    const now = Date.now();
    let tracker = inGamePlayerTracker.get(username.toLowerCase());
    if (!tracker) {
      tracker = {
        username,
        robloxId,
        firstSeenTs: now,
        createdTs: now,
        assignedStaffId: null,
        warnedOutfit: false,
        warnedOutfitTs: null,
        outfitTimer: null,
        warnedVc: false,
        warnedVcTs: null,
        warnCount: 0,
        warnedVc1: false,
        warnedVc2: false,
        warnedVc3: false,
        warnedVc4: false,
        warnedVc5: false,
        kicked: false,
        jailed: false,
        jailedTs: null,
        kickTimer: null,
        staffDmMessages: [],
        dmAlertSent: false,
        sendingDm: false,
        refreshCount: 0
      };
      inGamePlayerTracker.set(username.toLowerCase(), tracker);
    }

    if (!tracker.robloxId && !robloxId) {
      tracker.robloxId = await getRobloxIdFromUsername(username);
    } else if (robloxId && !tracker.robloxId) {
      tracker.robloxId = robloxId;
    }

    // ── 1. Prohibited Bacon Outfit Check ──
    // If wearing bacon hair alone, it is fine. If wearing full bacon outfit (hair + starter clothes), warn them. If they rejoin still wearing it, ban for 24h!
    if (tracker.robloxId) {
      const assetIds = await getRobloxCurrentlyWearing(tracker.robloxId);
      const hasBaconHair = assetIds.some((id) => BACON_HAIR_IDS.includes(id));
      const hasBaconClothing = assetIds.some((id) => BACON_CLOTHING_IDS.includes(id));
      const isFullBaconOutfit = hasBaconHair && hasBaconClothing;

      if (isFullBaconOutfit) {
        // Rejoin penalty: If previously warned/kicked and rejoined wearing the outfit -> 24h BAN!
        if (!staffUnbannedExemptions.has(username.toLowerCase()) && rejoinedBaconOutfitWarned.has(username.toLowerCase()) && !tracker.bannedRejoin) {
          tracker.bannedRejoin = true;
          console.log(`[Flagged Avatar] Player "${username}" rejoined wearing the prohibited bacon outfit! Issuing 24h ban...`);
          await sendErlcCommand(`:ban ${username} 24h Flagged Avatar - Rejoined with prohibited bacon outfit`);
          if (primaryGuild) {
            const banCard = new ContainerBuilder().setAccentColor(0xed4245);
            banCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🔨 Flagged Avatar: Rejoined With Prohibited Outfit (Banned)'));
            banCard.addSeparatorComponents(thinLine());
            const avatarUrl = await getRobloxAvatarHeadshotUrl(tracker.robloxId);
            const infoText =
              `> **Player:** \`${username}\` (Roblox ID: \`${tracker.robloxId}\`)\n` +
              `> **Infraction:** Rejoined the server wearing the prohibited bacon outfit after previous warning.\n` +
              `> **Action Taken:** Automatically banned for 24 hours (\`:ban ${username} 24h ...\`).\n` +
              `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>`;
            if (avatarUrl) {
              banCard.addSectionComponents(
                new SectionBuilder()
                  .addTextDisplayComponents(new TextDisplayBuilder().setContent(infoText))
                  .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
              );
            } else {
              banCard.addTextDisplayComponents(new TextDisplayBuilder().setContent(infoText));
            }
            await sendGameLog(primaryGuild, banCard);
          }
          continue;
        }

        if (!tracker.warnedOutfit) {
          tracker.warnedOutfit = true;
          tracker.warnedOutfitTs = Date.now();
          rejoinedBaconOutfitWarned.add(username.toLowerCase());

          const assetName = 'Default Bacon Outfit (Starter Clothes + Hair)';
          const pmText = `Alabama State Roleplay - Please change your avatar out of the default bacon outfit.`;
          await sendErlcCommand(`:pm ${username} ${pmText}`);

          const onDutyStaff = await getOnDutyStaffMembers(discordClient);
          const assigned = assignPlayerToStaff(onDutyStaff);
          if (assigned) {
            tracker.assignedStaffId = assigned.user.id;
            const outfitCard = await buildOutfitFlagCard(username, tracker.robloxId, assetName);
            await sendStaffAlertDMs(discordClient, {
              components: [outfitCard.toJSON()],
              flags: MessageFlags.IsComponentsV2
            }, assigned);
          }

          if (primaryGuild) {
            const logCard = new ContainerBuilder().setAccentColor(0x2b2d31);
            logCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Prohibited Bacon Outfit Flagged In-Game'));
            logCard.addSeparatorComponents(thinLine());
            const avatarUrl = await getRobloxAvatarHeadshotUrl(tracker.robloxId);
            if (avatarUrl) {
              logCard.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(avatarUrl))
              );
              logCard.addSeparatorComponents(thinLine());
            }
            logCard.addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `> **Player:** \`${username}\` (Roblox ID: \`${tracker.robloxId}\`)\n` +
                `> **Flagged Outfit:** \`${assetName}\`\n` +
                `> **Private Message Sent:** \`${pmText}\`\n` +
                `> **Policy:** Warning sent & staff alerted. If the player rejoins wearing this outfit, they will be banned for 24h.\n` +
                `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>`
              )
            );
            await sendGameLog(primaryGuild, logCard);
          }
        }
      }
    }

    // ── 2. Voice Chat / Non-Discord Check (10-second grace check) ──
    // First check after 10 seconds. If in server, don't even send it!
    if (now - tracker.firstSeenTs < 10000) {
      continue;
    }

    const discordStatus = await checkPlayerDiscordStatus(discordClient, username);
    if (discordStatus.found || discordStatus.isStaff) {
      if (tracker.jailed) {
        await sendErlcCommand(`:unjail ${username}`);
        const unjailPm = `Verified - comms requirement met - alabam. Welcome to Alabama State Roleplay.`;
        await sendErlcCommand(`:pm ${username} ${unjailPm}`);
        tracker.jailed = false;
        if (tracker.kickTimer) {
          clearTimeout(tracker.kickTimer);
          tracker.kickTimer = null;
        }
      }

      // Auto-update staff DM cards to show the green button!
      if (tracker.warnedVc || tracker.staffDmMessages?.length) {
        tracker.warnedVc = false;
        if (tracker.staffDmMessages && tracker.staffDmMessages.length) {
          const updatedCard = await buildStaffAlertCard(username, tracker, true, false);
          for (const item of tracker.staffDmMessages) {
            try {
              await item.msg.edit({
                components: [updatedCard.toJSON()],
                flags: MessageFlags.IsComponentsV2
              });
            } catch {
              // Ignore if DM cannot be edited
            }
          }
          // Schedule 20-second deletion of the staff DM cards
          const toDelete = [...tracker.staffDmMessages];
          tracker.staffDmMessages = [];
          setTimeout(async () => {
            for (const item of toDelete) {
              try {
                await item.msg.delete().catch(() => null);
              } catch { }
            }
          }, 20000);
        }

        if (primaryGuild) {
          const unjailCard = new ContainerBuilder().setAccentColor(0x57f287);
          unjailCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Player Verified In Discord'));
          unjailCard.addSeparatorComponents(thinLine());
          const avatarUrl = await getRobloxAvatarHeadshotUrl(tracker.robloxId);
          if (avatarUrl) {
            unjailCard.addMediaGalleryComponents(
              new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(avatarUrl))
            );
            unjailCard.addSeparatorComponents(thinLine());
          }
          unjailCard.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `> **Player:** \`${username}\`\n` +
              `> **Status:** Verified in Alabama Discord server.\n` +
              `> **Action:** In-game staff controls updated (status turned green).`
            )
          );
          await sendGameLog(primaryGuild, unjailCard);
        }
      }
      continue;
    }

    // Check if player rejoined before their 15-minute rejoin timer expired
    const uLower = username.toLowerCase();
    const rejoinCooldownUntil = rejoinedVcCooldown.get(uLower);
    if (!staffUnbannedExemptions.has(uLower) && rejoinCooldownUntil && now < rejoinCooldownUntil) {
      console.log(`[VC Enforcer] Player ${username} rejoined before the rejoin timer expired! Kicking immediately...`);
      await sendErlcCommand(`:kick ${username} VC Only Server - Rejoined before the rejoin timer expired.`);
      if (primaryGuild) {
        const reCard = new ContainerBuilder().setAccentColor(0xed4245);
        reCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 👢 VC Only: Rejoined Before Timer Expired (Kicked)'));
        reCard.addSeparatorComponents(thinLine());
        const avatarUrl = await getRobloxAvatarHeadshotUrl(tracker.robloxId);
        const infoText =
          `> **Player:** \`${username}\`\n` +
          `> **Infraction:** Rejoined the server before the rejoin timer expired without joining comms.\n` +
          `> **Action Taken:** Automatically kicked from in-game server (\`:kick ${username} VC Only Server - Rejoined before the rejoin timer expired.\`).\n` +
          `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>`;
        if (avatarUrl) {
          reCard.addSectionComponents(
            new SectionBuilder()
              .addTextDisplayComponents(new TextDisplayBuilder().setContent(infoText))
              .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
          );
        } else {
          reCard.addTextDisplayComponents(new TextDisplayBuilder().setContent(infoText));
        }
        await sendGameLog(primaryGuild, reCard);
        await sendSecurityLog(primaryGuild, reCard);
      }
      if (tracker.staffDmMessages && tracker.staffDmMessages.length) {
        for (const item of tracker.staffDmMessages) {
          try {
            await item.msg.delete().catch(() => null);
          } catch { }
        }
        tracker.staffDmMessages = [];
      }
      inGamePlayerTracker.delete(uLower);
      continue;
    }

    // Player is NOT in Discord server:
    // Step A: First warning PM (0s) + Alert staff in DM immediately!
    if (!tracker.warnedVc1) {
      if (!activeUsernames.has(username.toLowerCase())) {
        continue;
      }
      tracker.warnedVc = true;
      tracker.warnedVc1 = true;
      tracker.warnedVcTs = now;
      tracker.warnCount = 1;
      const warnPm1 = `VC Only Server - Failed to join comms - alabam. First warning.`;
      await sendErlcCommand(`:pm ${username} ${warnPm1}`);

      // Send DM alert to ONE staff member (load balanced, fallback to general staff/admin)
      if (!tracker.dmAlertSent && !tracker.sendingDm) {
        tracker.sendingDm = true;
        try {
          const alertCard = await buildStaffAlertCard(username, tracker, false);
          const sentList = await sendStaffAlertDMs(discordClient, {
            components: [alertCard.toJSON()],
            flags: MessageFlags.IsComponentsV2
          });
          if (sentList && sentList.length > 0) {
            tracker.dmAlertSent = true;
            tracker.assignedStaffId = sentList[0].user.id;
            tracker.staffDmMessages = sentList;
          }
        } finally {
          tracker.sendingDm = false;
        }
      }

      if (primaryGuild) {
        const warnCard = new ContainerBuilder().setAccentColor(0x2b2d31);
        warnCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## VC Only: Player Not In Discord'));
        warnCard.addSeparatorComponents(thinLine());
        const avatarUrl = await getRobloxAvatarHeadshotUrl(tracker.robloxId);
        const infoText =
          `> **Player:** \`${username}\`\n` +
          `> **Status:** Not found in Discord server.\n` +
          `> **Private Message Sent:** \`${warnPm1}\`\n` +
          `> **Action:** First warning sent (Warning 1/5). Staff alerted in DMs.`;
        if (avatarUrl) {
          warnCard.addSectionComponents(
            new SectionBuilder()
              .addTextDisplayComponents(new TextDisplayBuilder().setContent(infoText))
              .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
          );
        } else {
          warnCard.addTextDisplayComponents(new TextDisplayBuilder().setContent(infoText));
        }
        await sendGameLog(primaryGuild, warnCard);
      }
      continue;
    }

    // Step A2: Second warning (sent 1 minute / 60s after first warning)
    if (tracker.warnedVc1 && !tracker.warnedVc2 && !tracker.kicked && (now - tracker.warnedVcTs >= 60000)) {
      if (!activeUsernames.has(username.toLowerCase())) {
        continue;
      }
      tracker.warnedVc2 = true;
      tracker.warnCount = 2;
      const warnPm2 = `VC Only Server - Failed to join comms - alabam. Second warning.`;
      await sendErlcCommand(`:pm ${username} ${warnPm2}`);

      if (tracker.staffDmMessages && tracker.staffDmMessages.length) {
        const updatedCard = await buildStaffAlertCard(username, tracker, false);
        for (const item of tracker.staffDmMessages) {
          try {
            await item.msg.edit({
              components: [updatedCard.toJSON()],
              flags: MessageFlags.IsComponentsV2
            });
          } catch { }
        }
      }
    }

    // Step A3: Third warning (sent 2 minutes / 120s after first warning)
    if (tracker.warnedVc2 && !tracker.warnedVc3 && !tracker.kicked && (now - tracker.warnedVcTs >= 120000)) {
      if (!activeUsernames.has(username.toLowerCase())) {
        continue;
      }
      tracker.warnedVc3 = true;
      tracker.warnCount = 3;
      const warnPm3 = `VC Only Server - Failed to join comms - alabam. Third warning.`;
      await sendErlcCommand(`:pm ${username} ${warnPm3}`);

      if (tracker.staffDmMessages && tracker.staffDmMessages.length) {
        const updatedCard = await buildStaffAlertCard(username, tracker, false);
        for (const item of tracker.staffDmMessages) {
          try {
            await item.msg.edit({
              components: [updatedCard.toJSON()],
              flags: MessageFlags.IsComponentsV2
            });
          } catch { }
        }
      }
    }

    // Step A4: Fourth warning (sent 3 minutes / 180s after first warning)
    if (tracker.warnedVc3 && !tracker.warnedVc4 && !tracker.kicked && (now - tracker.warnedVcTs >= 180000)) {
      if (!activeUsernames.has(username.toLowerCase())) {
        continue;
      }
      tracker.warnedVc4 = true;
      tracker.warnCount = 4;
      const warnPm4 = `VC Only Server - Failed to join comms - alabam. Fourth warning.`;
      await sendErlcCommand(`:pm ${username} ${warnPm4}`);

      if (tracker.staffDmMessages && tracker.staffDmMessages.length) {
        const updatedCard = await buildStaffAlertCard(username, tracker, false);
        for (const item of tracker.staffDmMessages) {
          try {
            await item.msg.edit({
              components: [updatedCard.toJSON()],
              flags: MessageFlags.IsComponentsV2
            });
          } catch { }
        }
      }
    }

    // Step A5: Fifth warning (sent 4 minutes / 240s after first warning)
    if (tracker.warnedVc4 && !tracker.warnedVc5 && !tracker.kicked && (now - tracker.warnedVcTs >= 240000)) {
      if (!activeUsernames.has(username.toLowerCase())) {
        continue;
      }
      tracker.warnedVc5 = true;
      tracker.warnCount = 5;
      const warnPm5 = `VC Only Server - Failed to join comms - alabam. Fifth warning.`;
      await sendErlcCommand(`:pm ${username} ${warnPm5}`);

      if (tracker.staffDmMessages && tracker.staffDmMessages.length) {
        const updatedCard = await buildStaffAlertCard(username, tracker, false);
        for (const item of tracker.staffDmMessages) {
          try {
            await item.msg.edit({
              components: [updatedCard.toJSON()],
              flags: MessageFlags.IsComponentsV2
            });
          } catch { }
        }
      }
    }

    // Step B: Kick after 5 minutes (300s) of warnings
    if (tracker.warnedVc1 && !tracker.kicked && (now - tracker.warnedVcTs >= 300000)) {
      if (!activeUsernames.has(username.toLowerCase())) {
        continue;
      }
      tracker.kicked = true;

      const kickReason = `VC Only Server - Failed to join comms - alabam. Rejoined before the rejoin timer expired.`;
      console.log(`[VC Enforcer] 5 minutes of warnings elapsed for ${username}. Kicking from server...`);
      await sendErlcCommand(`:kick ${username} ${kickReason}`);

      // Set 15-minute rejoin cooldown: rejoining before timer expires kicks immediately!
      rejoinedVcCooldown.set(username.toLowerCase(), Date.now() + 15 * 60 * 1000);

      // Delete staff DM alert message immediately so it doesn't linger
      if (tracker.staffDmMessages && tracker.staffDmMessages.length) {
        for (const item of tracker.staffDmMessages) {
          try {
            await item.msg.delete().catch(() => null);
          } catch { }
        }
        tracker.staffDmMessages = [];
      }

      inGamePlayerTracker.delete(username.toLowerCase());
      if (primaryGuild) {
        const kickCard = new ContainerBuilder().setAccentColor(0xed4245);
        kickCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 👢 VC Only: Player Kicked (5 Warnings Elapsed)'));
        kickCard.addSeparatorComponents(thinLine());
        const avatarUrl = await getRobloxAvatarHeadshotUrl(tracker.robloxId);
        const infoText =
          `> **Player:** \`${username}\`\n` +
          `> **Infraction:** Failed to join comms after 5 consecutive warnings across 5 minutes.\n` +
          `> **Action Taken:** Kicked from in-game server (\`:kick ${username} ${kickReason}\`).\n` +
          `> **Rejoin Policy:** 15-minute cooldown active. Rejoining before timer expires triggers immediate kick.\n` +
          `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>`;
        if (avatarUrl) {
          kickCard.addSectionComponents(
            new SectionBuilder()
              .addTextDisplayComponents(new TextDisplayBuilder().setContent(infoText))
              .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
          );
        } else {
          kickCard.addTextDisplayComponents(new TextDisplayBuilder().setContent(infoText));
        }
        await sendGameLog(primaryGuild, kickCard);
        await sendSecurityLog(primaryGuild, kickCard);
      }
    }
  }

  // Cleanup players who left game (require 2 consecutive missed checks)
  for (const [uname, t] of inGamePlayerTracker) {
    if (!activeUsernames.has(uname)) {
      t.missedCount = (t.missedCount || 0) + 1;
      if (t.missedCount >= 2) {
        if (t.outfitTimer) clearTimeout(t.outfitTimer);
        if (t.kickTimer) clearTimeout(t.kickTimer);

        // If they left the game, delete the alert message from staff DMs!
        if (t.staffDmMessages && t.staffDmMessages.length) {
          for (const item of t.staffDmMessages) {
            try {
              await item.msg.delete().catch(() => null);
            } catch { }
          }
          t.staffDmMessages = [];
        }

        inGamePlayerTracker.delete(uname);
      }
    } else {
      t.missedCount = 0;
    }
  }

  // Check live kill logs for Safe Zone violations
  await checkKillLogsForSafeZone(discordClient);
}

async function refreshTrackedNonDiscordPlayers(discordClient) {
  if (!config.apiKey || inGamePlayerTracker.size === 0) return;
  const base = erlcBase();
  let currentInGame = null;
  try {
    const res = await axios.get(`${base}/server/players`, {
      headers: { 'Server-Key': config.apiKey },
      timeout: 6000
    });
    if (Array.isArray(res.data)) {
      currentInGame = new Set(
        res.data
          .map((p) => {
            if (typeof p === 'string') return p.split(':')[0].toLowerCase();
            if (typeof p === 'object' && p !== null) {
              return ((p.Player || p.username || p.name || p.PlayerName || '').split(':')[0]).toLowerCase();
            }
            return '';
          })
          .filter(Boolean)
      );
    }
  } catch {
    // transient network error
  }

  for (const [uname, tracker] of [...inGamePlayerTracker.entries()]) {
    // Auto-delete stale alerts older than 7 minutes (lifecycle completed or player handled)
    if (tracker.createdTs && (Date.now() - tracker.createdTs > 7 * 60 * 1000)) {
      if (tracker.staffDmMessages && tracker.staffDmMessages.length) {
        for (const item of tracker.staffDmMessages) {
          try {
            await item.msg.delete().catch(() => null);
          } catch { }
        }
        tracker.staffDmMessages = [];
      }
      inGamePlayerTracker.delete(uname);
      continue;
    }

    // Check if player disconnected / left game
    if (currentInGame) {
      if (!currentInGame.has(uname)) {
        tracker.missedCount = (tracker.missedCount || 0) + 1;
        if (tracker.missedCount >= 2) {
          if (tracker.outfitTimer) clearTimeout(tracker.outfitTimer);
          if (tracker.kickTimer) clearTimeout(tracker.kickTimer);

          if (tracker.staffDmMessages && tracker.staffDmMessages.length) {
            for (const item of tracker.staffDmMessages) {
              try {
                await item.msg.delete().catch(() => null);
              } catch { }
            }
            tracker.staffDmMessages = [];
          }
          inGamePlayerTracker.delete(uname);
          continue;
        }
      } else {
        tracker.missedCount = 0;
      }
    }

    // If warned or jailed, check if they joined Discord
    if (tracker.warnedVc || tracker.jailed) {
      tracker.refreshCount = (tracker.refreshCount || 1) + 1;
      const status = await checkPlayerDiscordStatus(discordClient, tracker.username);
      if (status.found || status.isStaff) {
        console.log(`[Auto-Refresh] Player ${tracker.username} joined Discord! Updating staff DM and cleaning up...`);
        if (tracker.jailed) {
          await sendErlcCommand(`:unjail ${tracker.username}`);
          const unjailPm = `Alabama State Roleplay: Verified. Welcome to the server!`;
          await sendErlcCommand(`:pm ${tracker.username} ${unjailPm}`);
          tracker.jailed = false;
          if (tracker.kickTimer) {
            clearTimeout(tracker.kickTimer);
            tracker.kickTimer = null;
          }
        }
        tracker.warnedVc = false;

        if (tracker.staffDmMessages && tracker.staffDmMessages.length) {
          const updatedCard = await buildStaffAlertCard(tracker.username, tracker, true, false);
          for (const item of tracker.staffDmMessages) {
            try {
              await item.msg.edit({
                components: [updatedCard.toJSON()],
                flags: MessageFlags.IsComponentsV2
              });
            } catch { }
          }

          // Clean up verified DM after 10 seconds
          const toDelete = [...tracker.staffDmMessages];
          tracker.staffDmMessages = [];
          setTimeout(async () => {
            for (const item of toDelete) {
              try {
                await item.msg.delete().catch(() => null);
              } catch { }
            }
            console.log(`[Auto-Refresh] Cleaned up staff alert DM for ${tracker.username} 10s after Discord verification.`);
          }, 10000);
        }
      }
    }
  }
}

let erlcEnforcerTimer = null;
let safeZoneKillLogsTimer = null;
let nonDiscordAutoRefreshTimer = null;

function startErlcEnforcerLoop(client) {
  if (erlcEnforcerTimer) clearInterval(erlcEnforcerTimer);
  if (safeZoneKillLogsTimer) clearInterval(safeZoneKillLogsTimer);
  if (nonDiscordAutoRefreshTimer) clearInterval(nonDiscordAutoRefreshTimer);

  runErlcEnforcementScan(client).catch((err) => {
    console.warn(`[ER:LC Enforcer Loop] Initial Error: ${err.message}`);
  });
  erlcEnforcerTimer = setInterval(() => {
    runErlcEnforcementScan(client).catch((err) => {
      console.warn(`[ER:LC Enforcer Loop] Error: ${err.message}`);
    });
  }, 20000);

  // Dedicated real-time Safe Zone kill logs loop (every 6 seconds)
  safeZoneKillLogsTimer = setInterval(() => {
    checkKillLogsForSafeZone(client).catch(() => {});
  }, 6000);

  // Dedicated auto-refresh for non-Discord players & staff DMs (every 8 seconds)
  nonDiscordAutoRefreshTimer = setInterval(() => {
    refreshTrackedNonDiscordPlayers(client).catch(() => {});
  }, 8000);
}

async function handleErlcCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  const member = interaction.member || (await interaction.guild?.members.fetch(interaction.user.id).catch(() => null));

  if (!isStaffMember(member)) {
    await interaction.reply({ content: '❌ You must have staff permissions to run ER:LC enforcer tools.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'status') {
    const card = new ContainerBuilder().setAccentColor(0x2b2d31);
    card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🎮 ER:LC Anti-Exploiter & VC Enforcer Status'));
    card.addSeparatorComponents(thinLine());
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `> **Loop Status:** 🟢 **Active & Monitoring** (Every 35s)\n` +
        `> **Tracked Players In-Game:** ${inGamePlayerTracker.size}\n` +
        `> **Monitored Suspicious Assets:** \`144076358\`, \`63690008\` (Bacon Hair), \`1772336109\` (Down to Earth)\n` +
        `> **Verification Code:** \`${ERLC_ENFORCER_CONFIG.codeWord}\`\n` +
        `> **Exempt Staff Roles:** <@&${ERLC_ENFORCER_CONFIG.staffRoleIds[0]}> (Main) • <@&${ERLC_ENFORCER_CONFIG.staffRoleIds[1]}> (Test)\n\n` +
        `**Enforcement Policies:**\n` +
        `• **Suspicious Outfit:** In-game PM warning + 2-min countdown to 24h ban.\n` +
        `• **Non-Discord Member:** 2-min warning PM ➔ In-game Jail ➔ 5-min kick countdown (No bans).`
      )
    );
    await interaction.reply({ components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 });
    return;
  }

  if (sub === 'scan') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await runErlcEnforcementScan(interaction.client);
    await interaction.editReply({
      content: `✅ **Scan Completed:** Scanned all in-game players for suspicious avatars and VC Only compliance. Currently tracking **${inGamePlayerTracker.size}** active player(s).`
    });
    return;
  }

  if (sub === 'pm') {
    const target = interaction.options.getString('player', true).trim();
    const rawMsg = interaction.options.getString('message', true).trim();
    const cleanMsg = sanitizeRobloxMessage(rawMsg);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const res = await sendErlcCommand(`:pm ${target} ${cleanMsg}`);
    if (!res.ok) {
      await interaction.editReply({ content: `❌ Failed to send PM to \`${target}\`: ${res.error}` });
      return;
    }
    const card = new ContainerBuilder().setAccentColor(0x2b2d31);
    card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 📨 In-Game Private Message Sent'));
    card.addSeparatorComponents(thinLine());
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `> **Target Player:** \`${target}\`\n` +
        `> **Moderator:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
        `> **Message:** ${cleanMsg}\n` +
        `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>`
      )
    );
    await interaction.editReply({ components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 });
    await sendGameLog(interaction.guild, card);
    await sendSecurityLog(interaction.guild, card);
    return;
  }

  if (sub === 'jail') {
    const target = interaction.options.getString('player', true).trim();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const res = await sendErlcCommand(`:jail ${target}`);
    if (!res.ok) {
      await interaction.editReply({ content: `❌ Failed to jail \`${target}\`: ${res.error}` });
      return;
    }
    const card = new ContainerBuilder().setAccentColor(0x2b2d31);
    card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🔒 Player Jailed In-Game'));
    card.addSeparatorComponents(thinLine());
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `> **Target Player:** \`${target}\`\n` +
        `> **Moderator:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
        `> **Action:** In-game jail executed\n` +
        `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>`
      )
    );
    await interaction.editReply({ components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 });
    await sendGameLog(interaction.guild, card);
    await sendSecurityLog(interaction.guild, card);
    return;
  }

  if (sub === 'unjail') {
    const target = interaction.options.getString('player', true).trim();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const res = await sendErlcCommand(`:unjail ${target}`);
    if (!res.ok) {
      await interaction.editReply({ content: `❌ Failed to unjail \`${target}\`: ${res.error}` });
      return;
    }
    const card = new ContainerBuilder().setAccentColor(0x2b2d31);
    card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🔓 Player Unjailed In-Game'));
    card.addSeparatorComponents(thinLine());
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `> **Target Player:** \`${target}\`\n` +
        `> **Moderator:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
        `> **Action:** In-game unjail executed\n` +
        `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>`
      )
    );
    await interaction.editReply({ components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 });
    await sendGameLog(interaction.guild, card);
    await sendSecurityLog(interaction.guild, card);
    return;
  }

  if (sub === 'kick') {
    const target = interaction.options.getString('player', true).trim();
    const reason = interaction.options.getString('reason')?.trim() || 'Staff Moderation';
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const res = await sendErlcCommand(`:kick ${target} ${reason}`);
    if (!res.ok) {
      await interaction.editReply({ content: `❌ Failed to kick \`${target}\`: ${res.error}` });
      return;
    }
    const card = new ContainerBuilder().setAccentColor(0x2b2d31);
    card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 👢 Player Kicked In-Game'));
    card.addSeparatorComponents(thinLine());
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `> **Target Player:** \`${target}\`\n` +
        `> **Moderator:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
        `> **Reason:** ${reason}\n` +
        `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>`
      )
    );
    await interaction.editReply({ components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 });
    await sendGameLog(interaction.guild, card);
    await sendSecurityLog(interaction.guild, card);
    return;
  }

  if (sub === 'ban') {
    const target = interaction.options.getString('player', true).trim();
    const duration = interaction.options.getString('duration')?.trim() || '24h';
    const reason = interaction.options.getString('reason')?.trim() || 'Staff Moderation';
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const res = await sendErlcCommand(`:ban ${target} ${duration} ${reason}`);
    if (!res.ok) {
      await interaction.editReply({ content: `❌ Failed to ban \`${target}\`: ${res.error}` });
      return;
    }
    const card = new ContainerBuilder().setAccentColor(0x2b2d31);
    card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🔨 Player Banned In-Game'));
    card.addSeparatorComponents(thinLine());
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `> **Target Player:** \`${target}\`\n` +
        `> **Moderator:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
        `> **Duration:** \`${duration}\`\n` +
        `> **Reason:** ${reason}\n` +
        `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>`
      )
    );
    await interaction.editReply({ components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 });
    await sendGameLog(interaction.guild, card);
    await sendSecurityLog(interaction.guild, card);
    return;
  }

  if (sub === 'unban') {
    const target = interaction.options.getString('player', true).trim();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    clearAllPlayerPenalties(target);
    const res = await sendErlcCommand(`:unban ${target}`);
    if (!res.ok) {
      await interaction.editReply({ content: `❌ Failed to unban \`${target}\`: ${res.error}` });
      return;
    }
    const card = new ContainerBuilder().setAccentColor(0x2b2d31);
    card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🤝 Player Unbanned In-Game'));
    card.addSeparatorComponents(thinLine());
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `> **Target Player:** \`${target}\`\n` +
        `> **Moderator:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
        `> **Action:** In-game ban lifted\n` +
        `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>`
      )
    );
    await interaction.editReply({ components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 });
    await sendGameLog(interaction.guild, card);
    await sendSecurityLog(interaction.guild, card);
    return;
  }

  if (sub === 'message') {
    const rawMsg = interaction.options.getString('message', true).trim();
    const cleanMsg = sanitizeRobloxMessage(rawMsg);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const res = await sendErlcCommand(`:m ${cleanMsg}`);
    if (!res.ok) {
      await interaction.editReply({ content: `❌ Failed to broadcast message: ${res.error}` });
      return;
    }
    const card = new ContainerBuilder().setAccentColor(0x2b2d31);
    card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 📢 In-Game Broadcast Sent'));
    card.addSeparatorComponents(thinLine());
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `> **Moderator:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
        `> **Announcement:** ${cleanMsg}\n` +
        `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>`
      )
    );
    await interaction.editReply({ components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 });
    await sendGameLog(interaction.guild, card);
    await sendSecurityLog(interaction.guild, card);
    return;
  }

  if (sub === 'hint') {
    const rawMsg = interaction.options.getString('message', true).trim();
    const cleanMsg = sanitizeRobloxMessage(rawMsg);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const res = await sendErlcCommand(`:h ${cleanMsg}`);
    if (!res.ok) {
      await interaction.editReply({ content: `❌ Failed to send hint: ${res.error}` });
      return;
    }
    const card = new ContainerBuilder().setAccentColor(0x2b2d31);
    card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 💡 In-Game Top Hint Sent'));
    card.addSeparatorComponents(thinLine());
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `> **Moderator:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
        `> **Hint:** ${cleanMsg}\n` +
        `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>`
      )
    );
    await interaction.editReply({ components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 });
    await sendGameLog(interaction.guild, card);
    await sendSecurityLog(interaction.guild, card);
    return;
  }
}

async function handleJailCommand(interaction) {
  const member = interaction.member || (await interaction.guild?.members.fetch(interaction.user.id).catch(() => null));
  if (!isStaffMember(member)) {
    await interaction.reply({ content: '❌ You must have staff permissions to run this command.', flags: MessageFlags.Ephemeral });
    return;
  }
  const target = interaction.options.getString('player', true).trim();
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const res = await sendErlcCommand(`:jail ${target}`);
  if (!res.ok) {
    await interaction.editReply({ content: `❌ Failed to jail \`${target}\`: ${res.error}` });
    return;
  }
  const card = new ContainerBuilder().setAccentColor(0x2b2d31);
  card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🔒 Player Jailed In-Game'));
  card.addSeparatorComponents(thinLine());
  card.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `> **Target Player:** \`${target}\`\n` +
      `> **Moderator:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
      `> **Action:** In-game jail executed\n` +
      `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>`
    )
  );
  await interaction.editReply({ components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 });
  await sendGameLog(interaction.guild, card);
  await sendSecurityLog(interaction.guild, card);
}

async function handleUnjailCommand(interaction) {
  const member = interaction.member || (await interaction.guild?.members.fetch(interaction.user.id).catch(() => null));
  if (!isStaffMember(member)) {
    await interaction.reply({ content: '❌ You must have staff permissions to run this command.', flags: MessageFlags.Ephemeral });
    return;
  }
  const target = interaction.options.getString('player', true).trim();
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const res = await sendErlcCommand(`:unjail ${target}`);
  if (!res.ok) {
    await interaction.editReply({ content: `❌ Failed to unjail \`${target}\`: ${res.error}` });
    return;
  }
  const card = new ContainerBuilder().setAccentColor(0x2b2d31);
  card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🔓 Player Unjailed In-Game'));
  card.addSeparatorComponents(thinLine());
  card.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `> **Target Player:** \`${target}\`\n` +
      `> **Moderator:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
      `> **Action:** In-game unjail executed\n` +
      `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>`
    )
  );
  await interaction.editReply({ components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 });
  await sendGameLog(interaction.guild, card);
  await sendSecurityLog(interaction.guild, card);
}

async function handleUnbanCommand(interaction) {
  const member = interaction.member || (await interaction.guild?.members.fetch(interaction.user.id).catch(() => null));
  if (!isStaffMember(member)) {
    await interaction.reply({ content: '❌ You must have staff permissions to run this command.', flags: MessageFlags.Ephemeral });
    return;
  }
  const target = interaction.options.getString('target', true).trim();
  const reason = interaction.options.getString('reason')?.trim() || 'Staff Unban';
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  clearAllPlayerPenalties(target);

  let discordUnbanned = false;
  let inGameUnbanned = false;
  let details = [];

  // Check if target is a Discord User ID (numeric, 17-20 chars)
  if (/^\d{17,20}$/.test(target)) {
    try {
      await interaction.guild.members.unban(target, `${reason} (Issued by ${interaction.user.tag})`);
      discordUnbanned = true;
      details.push(`• **Discord Server:** Unbanned <@${target}> (\`${target}\`)`);
    } catch (dErr) {
      details.push(`• **Discord Server:** Could not unban (${dErr.message})`);
    }
  }

  // Always attempt in-game unban as well
  const erlcRes = await sendErlcCommand(`:unban ${target}`);
  if (erlcRes.ok) {
    inGameUnbanned = true;
    details.push(`• **ER:LC In-Game Server:** Unban command \`:unban ${target}\` sent successfully.`);
  } else {
    details.push(`• **ER:LC In-Game Server:** ${erlcRes.error || 'Failed to send command'}`);
  }

  const card = new ContainerBuilder().setAccentColor(0x2b2d31);
  card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🤝 Member / Player Unbanned'));
  card.addSeparatorComponents(thinLine());
  card.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `> **Target:** \`${target}\`\n` +
      `> **Moderator:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
      `> **Reason:** ${reason}\n\n` +
      details.join('\n') + `\n\n` +
      `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>`
    )
  );
  await interaction.editReply({ components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 });
  if (inGameUnbanned) await sendGameLog(interaction.guild, card);
  await sendSecurityLog(interaction.guild, card);
}

async function handleSafeZoneCommand(interaction) {
  const member = interaction.member || (await interaction.guild?.members.fetch(interaction.user.id).catch(() => null));
  if (!isStaffMember(member)) {
    await interaction.reply({ content: '❌ You must have staff permissions to manage Safe Zone violations.', flags: MessageFlags.Ephemeral });
    return;
  }

  const sub = interaction.options.getSubcommand();
  const player = interaction.options.getString('player', true).trim();

  if (sub === 'strike') {
    const reason = interaction.options.getString('reason')?.trim() || 'Shooting in Safe Zone';
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const res = await handleSafeZoneStrike(interaction.client, player, interaction.user, reason);
    await interaction.editReply({
      content: `✅ Applied Safe Zone Strike to **${player}** (Strike **${res.strike}** — Action: \`${res.action}\`).`
    });
    return;
  }

  if (sub === 'status') {
    const record = safeZoneStrikes.get(player.toLowerCase());
    const strikes = record?.strikes || 0;
    const card = new ContainerBuilder().setAccentColor(0x2b2d31);
    card.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🛡️ Safe Zone Record: ${player}`));
    card.addSeparatorComponents(thinLine());
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `> **Player:** \`${player}\`\n` +
        `> **Total Strikes:** **${strikes}**\n` +
        `> **Status:** ${strikes === 0 ? '🟢 Clean Record' : strikes === 1 ? '🟡 Strike 1: Warning (Not Jailed)' : strikes === 2 ? '🟠 Strike 2: Second Warning & Jailed' : strikes === 3 ? '🔴 Strike 3: Kicked' : '⛔ Strike 4+: Permanently Banned'}\n` +
        (record?.lastStrikeTs ? `> **Last Strike:** <t:${Math.floor(record.lastStrikeTs / 1000)}:R>\n` : '')
      )
    );
    await interaction.reply({ components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 });
    return;
  }

  if (sub === 'clear') {
    safeZoneStrikes.delete(player.toLowerCase());
    saveSafeZoneStrikes();
    await interaction.reply({
      content: `✅ Cleared all Safe Zone strikes for **${player}**. Their record is now reset to 0.`
    });
    return;
  }
}

// ═══════════════════════ Ticket System Engine ═══════════════════════
const TICKETS_FILE = fileURLToPath(new URL('../tickets.json', import.meta.url));
const TICKET_DESK_FILE = fileURLToPath(new URL('../ticket_desk.json', import.meta.url));
const TICKET_PANELS_FILE = fileURLToPath(new URL('../ticket_panels.json', import.meta.url));
const TRANSCRIPTS_CHANNEL_ID = '1236052058059309108';
const closedTranscripts = new Map(); // msgId -> transcriptInfo

const activeTickets = new Map(); // channelId -> ticketData
const APPLICATIONS_FILE = fileURLToPath(new URL('../applications.json', import.meta.url));
const activeApplications = new Map(); // applicantId -> applicationData
const activeReviewSessions = new Map(); // reviewerId -> { appId, pageIndex }

function loadApplications() {
  try {
    if (!fs.existsSync(APPLICATIONS_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(APPLICATIONS_FILE, 'utf8'));
    for (const [k, v] of Object.entries(raw)) activeApplications.set(k, v);
    console.log(`Restored ${activeApplications.size} staff application(s) from applications.json.`);
  } catch (err) {
    console.error('Failed to load applications.json:', err.message);
  }
}

function saveApplications() {
  try {
    const flat = {};
    for (const [k, v] of activeApplications) flat[k] = v;
    fs.writeFileSync(APPLICATIONS_FILE, JSON.stringify(flat, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save applications.json:', err.message);
  }
}

const APPEALS_FILE = fileURLToPath(new URL('../appeals.json', import.meta.url));
const activeAppeals = new Map(); // appealId -> appealData
const APPEALS_CHANNEL_ID = '1360997421642944623';

function loadAppeals() {
  try {
    if (!fs.existsSync(APPEALS_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(APPEALS_FILE, 'utf8'));
    for (const [k, v] of Object.entries(raw)) activeAppeals.set(k, v);
    console.log(`Restored ${activeAppeals.size} ban appeal(s) from appeals.json.`);
  } catch (err) {
    console.error('Failed to load appeals.json:', err.message);
  }
}

function saveAppeals() {
  try {
    const flat = {};
    for (const [k, v] of activeAppeals) flat[k] = v;
    fs.writeFileSync(APPEALS_FILE, JSON.stringify(flat, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save appeals.json:', err.message);
  }
}

let ticketDeskState = {
  status: 'online', // 'online' | 'busy' | 'closed'
  categories: {
    general: true,
    ia: true,
    highrank: true,
    partnership: true,
    staff_partnership: true
  }
};

function loadTicketDeskState() {
  try {
    if (!fs.existsSync(TICKET_DESK_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(TICKET_DESK_FILE, 'utf8'));
    if (raw && typeof raw === 'object') {
      if (raw.status) ticketDeskState.status = raw.status;
      if (raw.categories) ticketDeskState.categories = { ...ticketDeskState.categories, ...raw.categories };
    }
    console.log(`Loaded ticket desk state: status=${ticketDeskState.status}`);
  } catch (err) {
    console.error('Failed to load ticket_desk.json:', err.message);
  }
}

function saveTicketDeskState() {
  try {
    fs.writeFileSync(TICKET_DESK_FILE, JSON.stringify(ticketDeskState, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save ticket_desk.json:', err.message);
  }
}

const activeTicketPanels = new Map(); // chanKey -> messageId

function loadTicketPanels() {
  try {
    if (!fs.existsSync(TICKET_PANELS_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(TICKET_PANELS_FILE, 'utf8'));
    for (const [k, v] of Object.entries(raw)) lastTicketPanelByChannel.set(k, v);
    console.log(`Restored ${lastTicketPanelByChannel.size} ticket panel location(s).`);
  } catch (err) {
    console.error('Failed to load ticket_panels.json:', err.message);
  }
}

function saveTicketPanels() {
  try {
    const flat = {};
    for (const [k, v] of lastTicketPanelByChannel) flat[k] = v;
    fs.writeFileSync(TICKET_PANELS_FILE, JSON.stringify(flat, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save ticket_panels.json:', err.message);
  }
}

async function refreshAllTicketPanels(discordClient) {
  for (const [chanKey, msgId] of [...lastTicketPanelByChannel]) {
    const parts = chanKey.split(':');
    if (parts.length !== 2) continue;
    const channelId = parts[1];
    try {
      const ch = await discordClient.channels.fetch(channelId);
      if (!ch) continue;
      const msg = await ch.messages.fetch(msgId);
      if (msg) {
        await msg.edit({
          components: [buildTicketPanelContainer().toJSON()],
          flags: MessageFlags.IsComponentsV2
        });
      }
    } catch (err) {
      console.warn(`Could not refresh ticket panel in ${channelId}: ${err.message}`);
    }
  }
}

function loadTickets() {
  try {
    if (!fs.existsSync(TICKETS_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(TICKETS_FILE, 'utf8'));
    for (const [chanId, t] of Object.entries(raw)) activeTickets.set(chanId, t);
    console.log(`Restored ${activeTickets.size} active ticket(s) from ${TICKETS_FILE}.`);
  } catch (err) {
    console.error(`Could not read ${TICKETS_FILE}:`, err.message);
  }
}

function saveTickets() {
  try {
    const flat = {};
    for (const [chanId, t] of activeTickets) flat[chanId] = t;
    fs.writeFileSync(TICKETS_FILE, JSON.stringify(flat, null, 2), 'utf8');
  } catch (err) {
    console.error(`Could not save ${TICKETS_FILE}:`, err.message);
  }
}

function buildTicketPanelContainer() {
  const accentColor =
    ticketDeskState.status === 'online'
      ? 0x57f287
      : ticketDeskState.status === 'busy'
        ? 0xfee75c
        : 0xed4245;

  const container = new ContainerBuilder().setAccentColor(accentColor);
  if (TICKET_CONFIG.bannerUrl) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(TICKET_CONFIG.bannerUrl))
    );
  }
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Assistance Support'));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '> Need assistance? **Alabama State Roleplay** is here to help you resolve any issues or answer questions. To ensure your inquiry is handled quickly, please select a support category from the menu below.'
    )
  );
  container.addSeparatorComponents(thinLine());

  const generalOpen = ticketDeskState.status !== 'closed' && !!ticketDeskState.categories.general;
  const iaOpen = ticketDeskState.status !== 'closed' && !!ticketDeskState.categories.ia;
  const hrOpen = ticketDeskState.status !== 'closed' && !!ticketDeskState.categories.highrank;
  const partnershipOpen = ticketDeskState.status !== 'closed' && (ticketDeskState.categories.partnership !== false);
  const staffPartnershipOpen = ticketDeskState.status !== 'closed' && (ticketDeskState.categories.staff_partnership !== false);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**General Support** — ${generalOpen ? 'Community questions, general inquiries, and store assistance.' : '[Closed by staff] Currently unavailable.'}\n` +
      `**Internal Affairs** — ${iaOpen ? 'Staff reports, community concerns, and supervisor review.' : '[Closed by staff] Currently unavailable.'}\n` +
      `**High Rank Support** — ${hrOpen ? 'Executive matters, IA+ reports, and administrative management.' : '[Closed by staff] Currently unavailable.'}\n` +
      `**Partnership** — ${partnershipOpen ? 'Community partnerships, mutual advertising, and affiliations.' : '[Closed by staff] Currently unavailable.'}\n` +
      `**Staff Partnership** — ${staffPartnershipOpen ? 'Partner server staff transfers and reciprocal rank requests.' : '[Closed by staff] Currently unavailable.'}`
    )
  );

  container.addSeparatorComponents(thinLine());

  const deskLabel =
    ticketDeskState.status === 'online'
      ? 'Online'
      : ticketDeskState.status === 'busy'
        ? 'Busy'
        : 'Closed';

  const pillStyle =
    ticketDeskState.status === 'online'
      ? ButtonStyle.Success
      : ticketDeskState.status === 'busy'
        ? ButtonStyle.Secondary
        : ButtonStyle.Danger;

  container.addSectionComponents(
    sectionRow(
      'Support Desk',
      'Staff availability to assist community members.',
      deskLabel,
      'desk_status_pill',
      pillStyle
    )
  );

  container.addSeparatorComponents(thinLine());

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('ticket_select_category')
    .setPlaceholder('Select a support category...')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('General Support')
        .setValue('general')
        .setDescription(generalOpen ? 'Community inquiries, questions, and store assistance' : '[Closed by staff] Currently unavailable'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Internal Affairs')
        .setValue('ia')
        .setDescription(iaOpen ? 'Staff misconduct, community concerns, and supervisor review' : '[Closed by staff] Currently unavailable'),
      new StringSelectMenuOptionBuilder()
        .setLabel('High Rank Support')
        .setValue('highrank')
        .setDescription(hrOpen ? 'Executive matters, IA+ reports, payments, and management' : '[Closed by staff] Currently unavailable'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Partnership')
        .setValue('partnership')
        .setDescription(partnershipOpen ? 'Server partnerships, mutual advertising, and affiliations' : '[Closed by staff] Currently unavailable'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Staff Partnership')
        .setValue('staff_partnership')
        .setDescription(staffPartnershipOpen ? 'Partner server staff transfers and reciprocal rank requests' : '[Closed by staff] Currently unavailable')
    );

  container.addActionRowComponents(new ActionRowBuilder().addComponents(selectMenu));

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('-# Alabama State Roleplay • Select a category above to open a ticket')
  );

  return container;
}

function buildTicketControlContainer(ticket) {
  const isAiClaimed = ticket.categoryKey === 'partnership' && (ticket.claimedBy === client.user.id || !ticket.claimedBy);
  const isClaimed = !!ticket.claimedBy;
  const accentColor = isAiClaimed ? 0x3498db : (isClaimed ? 0x57f287 : 0xd35400);
  const container = new ContainerBuilder().setAccentColor(accentColor);
  if (TICKET_CONFIG.bannerUrl) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(TICKET_CONFIG.bannerUrl))
    );
  }
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${ticket.categoryName}`));
  container.addSeparatorComponents(thinLine());

  const handlerText = isAiClaimed
    ? `<@${client.user.id}> (Automated AI Assistant)`
    : (isClaimed ? `<@${ticket.claimedBy}>` : '*None (Awaiting Staff)*');

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `> **Opened By:** <@${ticket.authorId}>\n> **Assigned Handler:** ${handlerText}`
    )
  );

  container.addSectionComponents(
    sectionRow(
      'Status',
      isAiClaimed
        ? 'Claimed and automated by AI Assistant.'
        : (isClaimed ? `Claimed and handled by <@${ticket.claimedBy}>.` : 'Awaiting an available staff member to claim.'),
      isAiClaimed ? '🔵 AI Active' : (isClaimed ? 'Claimed' : 'Unclaimed'),
      'info_ticket_status',
      isAiClaimed ? ButtonStyle.Primary : (isClaimed ? ButtonStyle.Success : ButtonStyle.Danger)
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
      new ButtonBuilder().setCustomId('ticket_unclaim').setLabel('Unclaim Ticket').setStyle(ButtonStyle.Secondary)
    );
  } else {
    buttons.push(
      new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim Ticket').setStyle(ButtonStyle.Success)
    );
  }
  buttons.push(
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Close Ticket').setStyle(ButtonStyle.Danger)
  );

  if (ticket.categoryKey === 'partnership') {
    buttons.push(
      new ButtonBuilder()
        .setCustomId('ticket_partnership_guide')
        .setLabel('Partnership Requirements & Application')
        .setStyle(ButtonStyle.Primary)
    );
  }

  container.addActionRowComponents(new ActionRowBuilder().addComponents(...buttons));
  return container;
}

function buildPartnershipGuideContainer() {
  const container = new ContainerBuilder().setAccentColor(0x3498db);

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Partnership Requirements & Application'));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '> Thank you for your interest in partnering with **Alabama State Roleplay**. Please ensure your community satisfies our official requirements below prior to submitting your application.'
    )
  );

  container.addSeparatorComponents(thinLine());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### Partnership Requirements\n\n` +
      `**1. Minimum Members**\n` +
      `Your server must have **120+ active members**, excluding bots.\n\n` +
      `**2. Active Community**\n` +
      `Your server must be active and engaged.\n\n` +
      `**3. No NSFW Content**\n` +
      `NSFW content or promotion is prohibited and may result in a blacklist.\n\n` +
      `**4. Community Rules**\n` +
      `Your server must follow our community rules and partnership standards.\n\n` +
      `**5. Professional Environment**\n` +
      `Your server must maintain a respectful and welcoming environment.`
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
      `> **How to Apply:** Send \`-partnership\` followed by your completed form and server advertisement in this ticket.\n` +
      `> Once verified, you will be prompted to run \`/proof partnership\` (with a screenshot proving our advertisement is posted in your server's partnership channel).\n` +
      `-# if not uploaded partnership will be removed and you will be blacklisted`
    )
  );

  return container;
}

// ═══════════════════════ Staff Application System ═══════════════════════
const APP_PANEL_BANNER_URL =
  'https://media.discordapp.net/attachments/1539681421306896476/1547364175469355119/Applications.png?ex=6aab0fb0&is=6aa9be30&hm=7508cef429f53226df5621afe56da7ca214377f69c43cd96d0710927752743a2&=&format=webp&quality=lossless&width=2048&height=684';
const APP_PASSED_BANNER_URL =
  'https://media.discordapp.net/attachments/1232495213986058283/1536858352754360392/content.png?ex=6aab12e0&is=6aa9c160&hm=236ce65b7c5709b6e05934e6c7de79760de79a4832f8e08d510ccfc9b4951425&=&format=webp&quality=lossless';
const APP_DECISIONS_CHANNEL_ID = '1232495212333498458';
const APP_PANEL_CHANNEL_ID = '1539681421306896476';
const APP_REVIEWER_ROLE_ID = '1548637141850918993';

function buildStaffApplicationPanelCard() {
  const card = new ContainerBuilder();
  card.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(APP_PANEL_BANNER_URL))
  );

  card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Alabama State Roleplay Staff Applications'));
  card.addSeparatorComponents(thinLine());
  card.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '> Interested in joining the **Alabama State Roleplay** staff team? We are looking for mature, active, and dedicated individuals who are committed to maintaining a professional and engaging community environment.\n' +
      '> \n' +
      '> **Notice:** Submitting an application does not guarantee acceptance. Applications are thoroughly reviewed based on maturity, activity, effort, and situational judgment. AI-generated answers and false information are strictly prohibited.\n' +
      '> \n' +
      '> Select the position you wish to apply for from the menu below to receive your application in your Direct Messages.'
    )
  );

  card.addSeparatorComponents(thinLine());
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('app_select_position')
    .setPlaceholder('Select an application position...')
    .addOptions(
      {
        label: 'In-Game Staff Application',
        value: 'app_start_ingame',
        description: 'Apply to join the Alabama State Roleplay in-game staff team.'
      },
      {
        label: 'Discord Staff Application',
        value: 'app_start_discord',
        description: 'Apply to join the Discord moderation and ticket support team.'
      }
    );
  const row = new ActionRowBuilder().addComponents(selectMenu);
  card.addActionRowComponents(row);

  return card;
}

function buildApplicantDashboard(appData) {
  const card = new ContainerBuilder();
  card.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## Alabama State Roleplay Staff Application\n` +
      `> **Position:** **${appData.appType}**\n` +
      `> **Applicant:** <@${appData.applicantId}> (\`${appData.applicantTag}\`)`
    )
  );
  card.addSeparatorComponents(thinLine());

  if (appData.appType === 'In-Game Staff') {
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### IN-GAME REQUIREMENTS\n` +
        `> • 14+ years of age\n` +
        `> • Must be active within the server\n` +
        `> • Must have a working microphone\n` +
        `> • Must be respectful, mature, and professional\n` +
        `> • Must understand and follow the server rules\n` +
        `> • Must be willing to attend required staff trainings and meetings\n` +
        `> • Must be able to communicate effectively with members and staff\n` +
        `> • Must be willing to enforce rules fairly and without favoritism\n` +
        `> • Must be able to work as part of a team\n` +
        `> • Prior staff experience is preferred, but not required`
      )
    );
  } else {
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### DISCORD STAFF REQUIREMENTS\n` +
        `> • 14+ years of age\n` +
        `> • Must be active within the Discord server\n` +
        `> • Must have a working microphone\n` +
        `> • Must be respectful, mature, and professional\n` +
        `> • Must understand and follow all server rules\n` +
        `> • Must be able to communicate effectively with members and staff\n` +
        `> • Must be willing to enforce Discord rules fairly and without favoritism\n` +
        `> • Must be able to handle tickets, questions, and member concerns\n` +
        `> • Must be willing to attend required staff trainings and meetings\n` +
        `> • Must be able to work effectively as part of a team\n` +
        `> • Prior Discord staff experience is preferred, but not required`
      )
    );
  }

  card.addSeparatorComponents(thinLine());
  card.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `> Please complete each of the three numbered steps below in order.\n` +
      `> Buttons will turn green as you finish each section. Once all three steps are completed, click **Submit Application**.`
    )
  );
  card.addSeparatorComponents(thinLine());

  const btn1 = new ButtonBuilder()
    .setCustomId(`app_btn_step1_${appData.id}`)
    .setLabel('1. Rules & Requirements')
    .setStyle(appData.step1Done ? ButtonStyle.Success : ButtonStyle.Secondary);

  const btn2 = new ButtonBuilder()
    .setCustomId(`app_btn_step2_${appData.id}`)
    .setLabel('2. General Information')
    .setStyle(appData.step2Done ? ButtonStyle.Success : ButtonStyle.Secondary)
    .setDisabled(!appData.step1Done);

  const btn3 = new ButtonBuilder()
    .setCustomId(`app_btn_step3_${appData.id}`)
    .setLabel('3. Knowledge & Scenarios')
    .setStyle(appData.step3Done ? ButtonStyle.Success : ButtonStyle.Secondary)
    .setDisabled(!appData.step2Done);

  const stepRow = new ActionRowBuilder().addComponents(btn1, btn2, btn3);
  card.addActionRowComponents(stepRow);

  if (appData.step1Done && appData.step2Done && appData.step3Done && appData.status !== 'pending_review') {
    card.addSeparatorComponents(thinLine());
    const submitRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`app_btn_submit_${appData.id}`)
        .setLabel('Submit Application')
        .setStyle(ButtonStyle.Primary)
    );
    card.addActionRowComponents(submitRow);
  }

  return card;
}

function buildApplicationReviewReaderCard(appData, pageIndex = 0) {
  const card = new ContainerBuilder();
  const gen = appData.generalInfo || {};
  const ans = appData.scenarioAnswers || {};
  const isDiscord = appData.appType === 'Discord Staff';

  if (pageIndex === 0) {
    if (isDiscord) {
      card.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## 📋 Discord Staff Application Review — Page 1/3\n` +
          `### Applicant & General Information\n` +
          `> **Applicant:** <@${appData.applicantId}> (\`${appData.applicantTag}\` • \`${appData.applicantId}\`)\n` +
          `> **Application Type:** **${appData.appType}**\n` +
          `> **Submitted:** <t:${Math.floor(appData.createdAt / 1000)}:f>\n\n` +
          `• **Discord Username & Age:** \`${gen.discord_tag_user || 'N/A'}\`\n` +
          `• **Age & Timezone:** \`${gen.timezone_age || 'N/A'}\`\n` +
          `• **Bot & Tool Knowledge:** \`${gen.bot_knowledge || 'N/A'}\`\n` +
          `• **Weekly Availability:** \`${gen.availability || 'N/A'}\`\n` +
          `• **Previous Discord Moderation Experience:**\n\`\`\`\n${(gen.experience || 'None provided').slice(0, 500)}\n\`\`\``
        )
      );
    } else {
      card.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## 📋 In-Game Staff Application Review — Page 1/3\n` +
          `### Applicant & General Information\n` +
          `> **Applicant:** <@${appData.applicantId}> (\`${appData.applicantTag}\` • \`${appData.applicantId}\`)\n` +
          `> **Application Type:** **${appData.appType}**\n` +
          `> **Submitted:** <t:${Math.floor(appData.createdAt / 1000)}:f>\n\n` +
          `• **Roblox Username:** \`${gen.roblox_user || 'N/A'}\`\n` +
          `• **Age & Timezone:** \`${gen.timezone_age || 'N/A'}\`\n` +
          `• **Working Microphone & Clip Software:** \`${gen.mic_software || 'N/A'}\`\n` +
          `• **Weekly Availability:** \`${gen.availability || 'N/A'}\`\n` +
          `• **Previous ER:LC Staff Experience:**\n\`\`\`\n${(gen.experience || 'None provided').slice(0, 500)}\n\`\`\``
        )
      );
    }
  } else if (pageIndex === 1) {
    if (isDiscord) {
      card.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## 📋 Discord Staff Application Review — Page 2/3\n` +
          `### Moderation Scenarios & Enforcement\n` +
          `> **Applicant:** <@${appData.applicantId}> (\`${appData.applicantTag}\`)\n\n` +
          `**1. Mass Spam / Raids & Phishing Links:**\n` +
          `> ${(ans.raid_spam || 'N/A').slice(0, 300)}\n\n` +
          `**2. Heated Arguments & Harassment in Chat:**\n` +
          `> ${(ans.harassment_toxicity || 'N/A').slice(0, 300)}\n\n` +
          `**3. Ticket In-Game Ban Dispute & Angry Member:**\n` +
          `> ${(ans.ticket_dispute || 'N/A').slice(0, 300)}\n\n` +
          `**4. Friends Breaking Rules & Bias Prevention:**\n` +
          `> ${(ans.bias_favoritism || 'N/A').slice(0, 300)}\n\n` +
          `**5. Underage Member & Discord TOS Violation:**\n` +
          `> ${(ans.underage_tos || 'N/A').slice(0, 300)}`
        )
      );
    } else {
      card.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## 📋 In-Game Staff Application Review — Page 2/3\n` +
          `### In-Game Scenarios & Strict Enforcement\n` +
          `> **Applicant:** <@${appData.applicantId}> (\`${appData.applicantTag}\`)\n\n` +
          `**1. Fail Roleplay & Mass VDM:**\n` +
          `> ${(ans.failrp_vdm || 'N/A').slice(0, 300)}\n\n` +
          `**2. Combat Logging & Cuff Evasion:**\n` +
          `> ${(ans.combatlog_evade || 'N/A').slice(0, 300)}\n\n` +
          `**3. New Life Rule (NLR) & Safe Zone Violations:**\n` +
          `> ${(ans.nlr_safezone || 'N/A').slice(0, 300)}\n\n` +
          `**4. Admin Commands & Abuse Prevention:**\n` +
          `> ${(ans.admin_abuse || 'N/A').slice(0, 300)}\n\n` +
          `**5. De-escalation & Accusations of Staff Bias:**\n` +
          `> ${(ans.deescalation || 'N/A').slice(0, 300)}`
        )
      );
    }
  } else {
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## 📋 Staff Application Review — Page 3/3\n` +
        `### Final Verdict & Decision\n` +
        `> **Applicant:** <@${appData.applicantId}> (\`${appData.applicantTag}\`)\n` +
        `> **Position:** **${appData.appType}**\n` +
        (isDiscord ? `> **Discord User:** \`${gen.discord_tag_user || appData.applicantTag}\`\n\n` : `> **Roblox Username:** \`${gen.roblox_user || 'N/A'}\`\n\n`) +
        `Please review all applicant responses carefully. When ready, click **Accept Application** or **Deny Application** below to record your reason and publish the final verdict.`
      )
    );
    card.addSeparatorComponents(thinLine());

    const verdictRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`app_verdict_accept_${appData.id}`)
        .setLabel('Accept Application')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`app_verdict_deny_${appData.id}`)
        .setLabel('Deny Application')
        .setStyle(ButtonStyle.Danger)
    );
    card.addActionRowComponents(verdictRow);
  }

  card.addSeparatorComponents(thinLine());

  // Navigation row: Left arrow, Page indicator, Right arrow
  const leftBtn = new ButtonBuilder()
    .setCustomId(`app_rev_page_${appData.id}_${pageIndex - 1}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(pageIndex <= 0);
  try {
    leftBtn.setEmoji({ id: '1549583273519489089', name: 'arrow_left' });
  } catch {
    leftBtn.setEmoji('⬅️');
  }

  const indicatorBtn = new ButtonBuilder()
    .setCustomId('app_rev_indicator')
    .setLabel(`Page ${pageIndex + 1} / 3`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  const rightBtn = new ButtonBuilder()
    .setCustomId(`app_rev_page_${appData.id}_${pageIndex + 1}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(pageIndex >= 2);
  try {
    rightBtn.setEmoji({ id: '1549583002676236308', name: 'Right_arrow' });
  } catch {
    rightBtn.setEmoji('➡️');
  }

  const navRow = new ActionRowBuilder().addComponents(leftBtn, indicatorBtn, rightBtn);
  card.addActionRowComponents(navRow);

  return card;
}

async function handleStaffApplicationPanelCommand(interaction) {
  const member = interaction.member || (await interaction.guild?.members.fetch(interaction.user.id).catch(() => null));
  if (!isStaffMember(member) && !member?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: '❌ You must have staff permissions to post the application panel.', flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const targetChannel =
    interaction.options?.getChannel?.('channel') ||
    interaction.guild?.channels.cache.get(APP_PANEL_CHANNEL_ID) ||
    interaction.channel;

  if (!targetChannel) {
    await interaction.editReply({ content: '❌ Could not find target channel for application panel.' });
    return;
  }

  const card = buildStaffApplicationPanelCard();
  await targetChannel.send({
    components: [card.toJSON()],
    flags: MessageFlags.IsComponentsV2
  });

  await interaction.editReply({ content: `✅ Staff Application Panel posted in <#${targetChannel.id}>.` });
}

async function handleAppealCommand(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('appeal_modal_submit')
    .setTitle('In-Game Ban Appeal')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('roblox_user')
          .setLabel('Your Roblox Username')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Enter your exact Roblox username')
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ban_reason')
          .setLabel('Reason for Your In-Game Ban')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('What rule or reason were you banned for?')
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ban_date_staff')
          .setLabel('Date of Ban & Staff Member (if known)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. 3 days ago by ModeratorName / Unknown')
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('appeal_explanation')
          .setLabel('Why should your ban be lifted?')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Explain your perspective, what occurred, and why you should be unbanned...')
          .setMinLength(15)
          .setMaxLength(1000)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('future_conduct')
          .setLabel('Commitment to Server Rules Going Forward')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('How will you ensure you strictly follow Alabama State Roleplay rules?')
          .setMinLength(15)
          .setMaxLength(1000)
          .setRequired(true)
      )
    );

  await interaction.showModal(modal);
}

async function getApplicationReviewerStaff(client) {
  const staffMembers = [];
  const checkedUsers = new Set();

  for (const guild of client.guilds.cache.values()) {
    try {
      await guild.members.fetch().catch(() => null);
      const role = guild.roles.cache.get(APP_REVIEWER_ROLE_ID);
      if (role) {
        for (const member of role.members.values()) {
          if (!member.user.bot && !checkedUsers.has(member.id)) {
            checkedUsers.add(member.id);
            staffMembers.push(member);
          }
        }
      }
    } catch { }
  }

  if (!staffMembers.length) {
    const primaryGuild = client.guilds.cache.get('1232495211490443284') || client.guilds.cache.first();
    if (primaryGuild) {
      for (const m of primaryGuild.members.cache.values()) {
        if (!m.user.bot && isStaffMember(m) && !checkedUsers.has(m.id)) {
          checkedUsers.add(m.id);
          staffMembers.push(m);
        }
      }
    }
  }

  return staffMembers;
}

async function sendNextReviewInquiry(client, appData) {
  if (!appData.reviewCandidates || appData.currentReviewCandidateIdx >= appData.reviewCandidates.length) {
    console.warn(`[Staff Application] All review candidates exhausted for application ${appData.id}.`);
    return;
  }

  const staffId = appData.reviewCandidates[appData.currentReviewCandidateIdx];
  const staffUser = await client.users.fetch(staffId).catch(() => null);
  if (!staffUser) {
    appData.currentReviewCandidateIdx++;
    saveApplications();
    return sendNextReviewInquiry(client, appData);
  }

  const card = new ContainerBuilder();
  card.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## 📋 Staff Application Review Request\n` +
      `> **Applicant:** <@${appData.applicantId}> (\`${appData.applicantTag}\`)\n` +
      `> **Position:** **${appData.appType}**\n` +
      `> **Submitted:** <t:${Math.floor(appData.createdAt / 1000)}:R>\n\n` +
      `Are you available to read and review this application?`
    )
  );
  card.addSeparatorComponents(thinLine());

  // 2 buttons all gray: <:checkmark:1549230329418485832> and <:wrong:1549230458070507552>
  const checkBtn = new ButtonBuilder()
    .setCustomId(`app_rev_claim_${appData.id}`)
    .setStyle(ButtonStyle.Secondary);
  try {
    checkBtn.setEmoji({ id: '1549230329418485832', name: 'checkmark' });
  } catch {
    checkBtn.setEmoji('✅');
  }

  const wrongBtn = new ButtonBuilder()
    .setCustomId(`app_rev_decline_${appData.id}`)
    .setStyle(ButtonStyle.Secondary);
  try {
    wrongBtn.setEmoji({ id: '1549230458070507552', name: 'wrong' });
  } catch {
    wrongBtn.setEmoji('❌');
  }

  const row = new ActionRowBuilder().addComponents(checkBtn, wrongBtn);
  card.addActionRowComponents(row);

  try {
    await staffUser.send({
      components: [card.toJSON()],
      flags: MessageFlags.IsComponentsV2
    });
    console.log(`[Staff Application] Dispatched review inquiry to staff ${staffUser.tag} (${staffUser.id})`);
  } catch (err) {
    console.warn(`[Staff Application] Could not DM staff ${staffUser.tag}: ${err.message}. Skipping to next staff.`);
    appData.currentReviewCandidateIdx++;
    saveApplications();
    return sendNextReviewInquiry(client, appData);
  }
}

async function dispatchApplicationReview(client, appData) {
  const candidateStaff = await getApplicationReviewerStaff(client);
  appData.reviewCandidates = candidateStaff.map((m) => m.user.id);
  appData.currentReviewCandidateIdx = 0;
  saveApplications();
  await sendNextReviewInquiry(client, appData);
}

async function editVoteMessage(client, vote) {
  try {
    const channel = await client.channels.fetch(vote.channelId);
    const msg = await channel.messages.fetch(vote.messageId);
    await msg.edit({ components: [buildVoteContainer(vote).toJSON()], flags: MessageFlags.IsComponentsV2 });
    return true;
  } catch {
    return false; // Message deleted / channel gone - stop tracking.
  }
}

// The one goal-check: fires on every vote change + after postpone.
async function checkVoteGoal(client, vote) {
  const count = Object.keys(vote.voters ?? {}).length;
  if (count >= vote.needed && !vote.ready && !vote.started && !vote.expired) {
    vote.ready = true;
    saveVotes();
    await editVoteMessage(client, vote);
    await notifyHostReady(client, vote);
  } else if (count < vote.needed && vote.ready) {
    // Someone removed their vote below the goal again.
    vote.ready = false;
    saveVotes();
    await editVoteMessage(client, vote);
  }
}

async function notifyHostReady(client, vote) {
  const stats = await fetchServerStats();
  stats.staff = staffRoleCount(vote.guildId) ?? stats.staff;

  const box = new ContainerBuilder().setAccentColor(VOTE_COLOR.ready);
  box.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Session Ready'));
  box.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `> Your vote hit **${Object.keys(vote.voters).length}/${vote.needed}** - the session is ready to host.\n> What do you want to do?`
    )
  );
  box.addSeparatorComponents(thinLine());
  box.addSectionComponents(
    sectionRow('Players In-Game', 'Live player count.', playersText(stats), 'host_r_players')
  );
  box.addSectionComponents(
    sectionRow('Staff In-Game', 'Staff on-duty.', String(stats.staff), 'host_r_staff')
  );
  box.addSeparatorComponents(thinLine());
  box.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`vote_start_${vote.id}`).setLabel('Start Session').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`vote_postpone_${vote.id}`).setLabel('Postpone').setStyle(ButtonStyle.Secondary)
    )
  );
  const ok = await dmUser(client, vote.hostId, {
    components: [box.toJSON()],
    flags: MessageFlags.IsComponentsV2
  });
  if (!ok) {
    // DMs closed - fall back to a channel ping so the host is never stranded.
    try {
      const channel = await client.channels.fetch(vote.channelId);
      await channel.send({
        content: `<@${vote.hostId}> your session vote reached **${Object.keys(vote.voters).length}/${vote.needed}** - decide below.`,
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`vote_start_${vote.id}`).setLabel('Start Session').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`vote_postpone_${vote.id}`).setLabel('Postpone').setStyle(ButtonStyle.Secondary)
          )
        ]
      });
    } catch {
      // Channel gone - nothing else we can do.
    }
  }
}

async function expireVote(client, vote) {
  if (vote.started || vote.expired) return;
  const count = Object.keys(vote.voters ?? {}).length;
  // If the goal was hit but the host hasn't started yet (e.g. after a
  // postpone), give a 10-minute grace window and re-notify the host ONCE -
  // "the postponed session is ready again".
  if (count >= vote.needed && !vote.reReady) {
    vote.reReady = true;
    vote.ready = true;
    vote.endTs = Date.now() + 10 * 60_000;
    saveVotes();
    await editVoteMessage(client, vote);
    setVoteTimer(client, vote);
    await notifyHostReady(client, vote);
    return;
  }
  vote.expired = true;
  saveVotes();
  await editVoteMessage(client, vote);
  clearVoteTimer(vote.id);
  activeVotes.delete(vote.id);
  saveVotes();
}

function clearVoteTimer(id) {
  const t = voteTimers.get(id);
  if (t) {
    clearTimeout(t);
    voteTimers.delete(id);
  }
}

function setVoteTimer(client, vote) {
  clearVoteTimer(vote.id);
  const ms = vote.endTs - Date.now();
  if (ms <= 0) {
    void expireVote(client, vote);
    return;
  }
  voteTimers.set(
    vote.id,
    setTimeout(() => void expireVote(client, vote), Math.min(ms, 2 ** 31 - 1))
  );
}

// Boot: restore persisted votes, re-fetch their messages, re-arm timers.
async function restoreVotes(client) {
  loadVotes();
  for (const [id, vote] of [...activeVotes]) {
    if (vote.started || vote.expired) {
      activeVotes.delete(id);
      continue;
    }
    const ok = await editVoteMessage(client, vote);
    if (!ok) {
      activeVotes.delete(id); // message deleted while we were down
      continue;
    }
    setVoteTimer(client, vote);
    await checkVoteGoal(client, vote);
  }
  saveVotes();
}

// Host presses Start → DM voters the session is starting, give host the Shutdown Session card,
// flip panels orange/live, delete vote embed.
async function startSessionFromVote(client, vote, interaction) {
  vote.started = true;
  clearVoteTimer(vote.id);
  const stats = await fetchServerStats();
  stats.staff = staffRoleCount(vote.guildId) ?? stats.staff;
  const link = joinUrl();
  const count = Object.keys(vote.voters ?? {}).length;

  const card = new ContainerBuilder().setAccentColor(0x57f287);
  card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Session Starting!'));
  card.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `> The session you voted for is starting now! Hop into the server and join the patrol.`
    )
  );
  card.addSeparatorComponents(thinLine());
  card.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Join Server').setStyle(ButtonStyle.Link).setURL(link),
      new ButtonBuilder()
        .setCustomId('info_players')
        .setLabel(`Players in-game: ${playersText(stats)}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    )
  );

  let delivered = 0;
  for (const voterId of Object.keys(vote.voters ?? {})) {
    // The guy who started the vote (the host) does NOT get the "Session Starting" DM!
    if (voterId === vote.hostId) continue;
    if (await dmUser(client, voterId, { components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 })) {
      delivered += 1;
    }
  }

  // Send the host a dedicated Session Active control card with a Shutdown Session button!
  const hostControl = new ContainerBuilder().setAccentColor(0xff7700);
  hostControl.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Session Active'));
  hostControl.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `> The session is now LIVE! You can shut down the session whenever you want using the button below.`
    )
  );
  hostControl.addSeparatorComponents(thinLine());
  hostControl.addSectionComponents(
    sectionRow('Players In-Game', 'Live player count.', playersText(stats), 'host_active_players')
  );
  hostControl.addSectionComponents(
    sectionRow('Staff In-Game', 'Staff on duty.', String(stats.staff), 'host_active_staff')
  );
  hostControl.addSeparatorComponents(thinLine());
  hostControl.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Join Server').setStyle(ButtonStyle.Link).setURL(link),
      new ButtonBuilder()
        .setCustomId(`session_host_shutdown_${vote.channelId}`)
        .setLabel('Shutdown Session')
        .setStyle(ButtonStyle.Danger)
    )
  );
  await dmUser(client, vote.hostId, {
    components: [hostControl.toJSON()],
    flags: MessageFlags.IsComponentsV2
  });

  // Remember the final voter list so /session shutdown can DM them later.
  lastVoteVotersByChannel.set(`${vote.guildId}:${vote.channelId}`, Object.keys(vote.voters ?? {}));

  // Flip every live Session Information panel in this guild ORANGE -
  // the side bar + status pill now read "Session On", alerting everyone the session is live.
  for (const key of [...liveSessions.keys()]) {
    if (!key.startsWith(`${vote.guildId}:`)) continue;
    sessionLivePanels.add(key);
    const parts = key.split(':');
    try {
      const ch = await client.channels.fetch(parts[1]);
      const msg = await ch.messages.fetch(parts[2]);
      await msg.edit({
        components: [buildContainer(stats, { sessionLive: true }).toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
    } catch {
      // Panel already gone - skip.
    }
  }

  // Remove the original vote embed.
  try {
    const channel = await client.channels.fetch(vote.channelId);
    const msg = await channel.messages.fetch(vote.messageId);
    await msg.delete();
  } catch {
    // Already gone - fine.
  }


  activeVotes.delete(vote.id);
  saveVotes();
  const pingText = formatRoleMention(vote.roleId, vote.guildId);
  await interaction.reply({
    content: `✅ Session started - **${delivered}/${count}** voters were notified in DMs${pingText ? ` (role: ${pingText})` : ''}. Vote embed removed.`,
    flags: MessageFlags.Ephemeral
  });
}

// Host presses Postpone → ephemeral menu with fixed options + custom modal.
async function showPostponeMenu(vote, interaction) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`vote_delay_${vote.id}_30m`).setLabel('30 min').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`vote_delay_${vote.id}_1h`).setLabel('1 hour').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`vote_delay_${vote.id}_2h`).setLabel('2 hours').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`vote_delay_custom_${vote.id}`).setLabel('Custom…').setStyle(ButtonStyle.Primary)
  );
  await interaction.reply({
    content: `Postpone the **${Object.keys(vote.voters ?? {}).length}/${vote.needed}** vote by how long?`,
    components: [row],
    flags: MessageFlags.Ephemeral
  });
}

function applyPostpone(client, vote, ms) {
  vote.ready = false;
  vote.postponed = true;
  vote.endTs = Date.now() + ms;
  saveVotes();
  setVoteTimer(client, vote);
  void editVoteMessage(client, vote);
  return vote.endTs;
}

// Modal submit for the "Custom…" postpone length.
async function handlePostponeModal(client, interaction) {
  const id = interaction.customId.replace('vote_delay_custom_', '');
  const vote = activeVotes.get(id);
  if (!vote || vote.started || vote.expired) {
    await interaction.reply({ content: 'This vote is no longer active.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (interaction.user.id !== vote.hostId) {
    await interaction.reply({ content: 'Only the host can postpone this vote.', flags: MessageFlags.Ephemeral });
    return;
  }
  const minutes = Number(interaction.fields.getTextInputValue('minutes').trim());
  if (!Number.isFinite(minutes) || minutes < 5 || minutes > 1440) {
    await interaction.reply({ content: 'Enter a number of minutes between **5** and **1440**.', flags: MessageFlags.Ephemeral });
    return;
  }
  const endTs = applyPostpone(client, vote, minutes * 60_000);
  await interaction.reply({
    content: `Postponed by **${minutes} min** - vote now ends <t:${Math.floor(endTs / 1000)}:R>.`,
    flags: MessageFlags.Ephemeral
  });
}

// Toggle this member's vote. Returns 'added' | 'removed'.
function toggleVoter(vote, userId) {
  vote.voters ??= {};
  if (vote.voters[userId]) {
    delete vote.voters[userId];
    saveVotes();
    return 'removed';
  }
  vote.voters[userId] = Date.now();
  saveVotes();
  return 'added';
}

// ═════════════════════ /session vote - end persistent engine ═════════════════════

function getSlashPayload() {
  return [
    commandsCommand.toJSON(),
    retriggerCommand.toJSON(),
    sessionCommand.toJSON(),
    ticketCommand.toJSON(),
    staffCommand.toJSON(),
    suggestionCommand.toJSON(),
    suggestCommand.toJSON(),
    proofCommand.toJSON(),
    banCommand.toJSON(),
    kickCommand.toJSON(),
    timeoutCommand.toJSON(),
    purgeCommand.toJSON(),
    antiNukeCommand.toJSON(),
    verifyCommand.toJSON(),
    erlcCommand.toJSON(),
    jailCommand.toJSON(),
    unjailCommand.toJSON(),
    unbanCommand.toJSON(),
    safezoneCommand.toJSON(),
    appealCommand.toJSON(),
    addCommand.toJSON(),
    unaddCommand.toJSON()
  ];
}

client.once(Events.ClientReady, async (readyClient) => {
  // Register the /session commands + restore persisted votes.
  // NOTE: if you run the bot twice (2 terminals, dry.mjs still open, pm2 +
  // node, …) the OLD copy keeps re-registering the OLD commands and steals
  // your interactions - that is exactly the "still looks the same" bug.
  // Kill every node process first, then start ONE bot.
  try {
    const rest = new REST({ version: '10' }).setToken(config.token);
    // Wipe STALE GLOBAL commands first. An old global /session (from an early
    // build) duplicates the guild one and can make the wrong thing run.
    try {
      await rest.put(Routes.applicationCommands(config.clientId), { body: [] });
      console.log('Cleared global commands to prevent duplicates.');
    } catch (err) {
      console.error('Global command cleanup skipped:', err.message);
    }
    const slashPayload = getSlashPayload();

    const targetGuilds = ['1232495211490443284', '1530147023754367006', config.guildId].filter(Boolean);
    const uniqueGuilds = [...new Set(targetGuilds)];

    for (const gid of uniqueGuilds) {
      try {
        await rest.put(Routes.applicationGuildCommands(config.clientId, gid), {
          body: slashPayload
        });
        console.log(`Registered commands to guild ${gid}.`);
      } catch (err) {
        console.warn(`Could not register commands to guild ${gid}: ${err.message}`);
      }
    }

    console.log('Registered commands across all active guilds.');
    console.log('BUILD: dual-server-session-ticket-security-engine');
    loadTickets();
    loadTicketDeskState();
    loadTicketPanels();
    loadSafeZoneStrikes();
    loadSuggestions();
    loadApplications();
    loadAppeals();
    for (const gid of uniqueGuilds) {
      const g = readyClient.guilds.cache.get(gid);
      if (g) await backupGuildState(g);
    }
    // Restore any votes that were alive before the last restart.
    await restoreVotes(readyClient);
    // Re-attach live refresh timers to the persisted panels - without this
    // the card stays frozen on "Last updated: X minutes ago" after a restart.
    let reattached = 0;
    for (const [key, messageId] of [...lastPanelByChannel]) {
      const parts = key.split(':');
      if (parts.length !== 2) continue;
      const [guildId, channelId] = parts;
      try {
        const ch = await readyClient.channels.fetch(channelId);
        const msg = await ch.messages.fetch(messageId);
        startLiveRefresh(liveKey(guildId, channelId, messageId), msg, channelId);
        reattached += 1;
      } catch {
        // Panel was deleted while the bot was down - drop it.
        lastPanelByChannel.delete(key);
        savePanels();
      }
    }
    if (reattached) console.log(`Re-attached live refresh to ${reattached} panel(s).`);
    // Auto-heal: panels posted BEFORE panels.json existed (or lost) - scan the
    // configured session channel for a live "Session Information" card and
    // re-attach it, so a frozen "Last updated: X minutes ago" card heals itself.
    if (reattached === 0 && config.sessionChannelId) {
      try {
        const ch = await readyClient.channels.fetch(config.sessionChannelId);
        const msgs = await ch.messages.fetch({ limit: 25 });
        // Panels are Components-V2 CONTAINERS (type 17) - their text lives in
        // CHILD components, so the scan must recurse, not read the top level.
        const collectText = (components) => {
          let out = '';
          for (const c of components ?? []) {
            out += `${c.data?.content ?? ''} `;
            if (c.components?.size ?? c.components?.length) out += collectText([...c.components.values?.() ?? c.components]);
          }
          return out;
        };
        let healedPanelId = null;
        for (const msg of msgs.values()) {
          if (msg.author.id !== readyClient.user.id) continue;
          const text = collectText([...(msg.components?.values?.() ?? msg.components ?? [])]);
          if (!text.includes('Session Information')) continue;
          if (healedPanelId === null) {
            // Newest live panel - heal THIS one.
            startLiveRefresh(liveKey(config.guildId, config.sessionChannelId, msg.id), msg, config.sessionChannelId);
            lastPanelByChannel.set(`${config.guildId}:${config.sessionChannelId}`, msg.id);
            healedPanelId = msg.id;
            console.log(`Auto-healed session panel (message ${msg.id}) - refresh is live again.`);
            continue;
          }
          // Older dead panels (posted before panels.json existed) - delete them
          // so the channel keeps ONE live card, matching /session panel's design.
          try {
            await msg.delete();
            console.log(`Deleted dead panel (message ${msg.id}).`);
          } catch {
            // Already gone - fine.
          }
        }
        if (healedPanelId !== null) savePanels();
      } catch (err) {
        console.error('Panel auto-heal skipped:', err.message);
      }
    }
  } catch (error) {
    console.error(
      `Command registration failed (${error.message}). Check CLIENT_ID, GUILD_ID and the applications.commands scope.`
    );
  }

  console.log(`Logged in as ${readyClient.user.tag}. Bot is ready.`);
  getOutboundIp().then((ip) => {
    console.log(`[ER:LC Bot Outbound IP] ${ip} — Ensure this IP is allowlisted on https://api.erlc.gg/server-owners`);
  }).catch(() => {});
  startErlcEnforcerLoop(readyClient);
});

// ═══════════════════════ Welcome Message ═══════════════════════
const WELCOME_CHANNEL_ID = '1232495212019056733';

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    let channel = await member.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
    if (!channel) {
      channel = member.guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildText && /welcome|joins/i.test(c.name)
      );
    }
    if (!channel) return;

    const memberCount = member.guild.memberCount;

    const welcomeText =
      `<:Alabama_logo:1536900254304174080> Welcome to **Alabama State Roleplay**, ${member}. Navigate the server through <#${channel.id}>`;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('welcome_member_count')
        .setLabel(`Member #${memberCount.toLocaleString()}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );

    await channel.send({
      content: welcomeText,
      components: [row]
    });
  } catch (err) {
    console.error('Welcome message failed:', err.message);
  }
});

// ═══════════════════════ Anti-Nuke Real-Time Listeners ═══════════════════════
client.on(Events.ChannelDelete, async (channel) => {
  try {
    if (!channel.guild) return;
    recentlyDeletedChannels.set(channel.id, {
      id: channel.id,
      name: channel.name,
      type: channel.type,
      parentId: channel.parentId,
      topic: channel.topic,
      permissionOverwrites: channel.permissionOverwrites?.cache?.map((po) => ({
        id: po.id,
        allow: po.allow.toArray(),
        deny: po.deny.toArray()
      })) || []
    });

    setTimeout(async () => {
      try {
        const auditLogs = await channel.guild.fetchAuditLogs({
          limit: 6,
          type: AuditLogEvent.ChannelDelete
        });
        const entry = auditLogs.entries.find(
          (e) => e.targetId === channel.id || Date.now() - e.createdTimestamp < 8000
        );
        if (!entry || !entry.executor || entry.executor.id === client.user.id || entry.executor.id === channel.guild.ownerId) {
          return;
        }
        await handleAntiNukeTrigger({
          guild: channel.guild,
          executor: entry.executor,
          actionType: 'channel_delete',
          targetName: channel.name,
          targetId: channel.id
        });
      } catch (err) {
        console.warn(`ChannelDelete audit log check failed: ${err.message}`);
      }
    }, 600);
  } catch (err) {
    console.error('ChannelDelete listener error:', err.message);
  }
});

client.on(Events.GuildRoleDelete, async (role) => {
  try {
    if (!role.guild) return;
    recentlyDeletedRoles.set(role.id, {
      id: role.id,
      name: role.name,
      color: role.color,
      hoist: role.hoist,
      mentionable: role.mentionable,
      permissions: role.permissions.toArray()
    });

    setTimeout(async () => {
      try {
        const auditLogs = await role.guild.fetchAuditLogs({
          limit: 6,
          type: AuditLogEvent.RoleDelete
        });
        const entry = auditLogs.entries.find(
          (e) => e.targetId === role.id || Date.now() - e.createdTimestamp < 8000
        );
        if (!entry || !entry.executor || entry.executor.id === client.user.id || entry.executor.id === role.guild.ownerId) {
          return;
        }
        await handleAntiNukeTrigger({
          guild: role.guild,
          executor: entry.executor,
          actionType: 'role_delete',
          targetName: role.name,
          targetId: role.id
        });
      } catch (err) {
        console.warn(`GuildRoleDelete audit log check failed: ${err.message}`);
      }
    }, 600);
  } catch (err) {
    console.error('GuildRoleDelete listener error:', err.message);
  }
});

client.on(Events.GuildBanAdd, async (ban) => {
  try {
    if (!ban.guild) return;
    setTimeout(async () => {
      try {
        const auditLogs = await ban.guild.fetchAuditLogs({
          limit: 6,
          type: AuditLogEvent.MemberBanAdd
        });
        const entry = auditLogs.entries.find(
          (e) => e.targetId === ban.user?.id || Date.now() - e.createdTimestamp < 8000
        );
        if (!entry || !entry.executor || entry.executor.id === client.user.id || entry.executor.id === ban.guild.ownerId) {
          return;
        }
        await handleAntiNukeTrigger({
          guild: ban.guild,
          executor: entry.executor,
          actionType: 'member_ban',
          targetName: ban.user?.tag || ban.user?.username || ban.user?.id,
          targetId: ban.user?.id
        });
      } catch (err) {
        console.warn(`GuildBanAdd audit log check failed: ${err.message}`);
      }
    }, 600);
  } catch (err) {
    console.error('GuildBanAdd listener error:', err.message);
  }
});

client.on(Events.GuildBanRemove, async (ban) => {
  try {
    if (!ban.guild) return;
    setTimeout(async () => {
      try {
        const auditLogs = await ban.guild.fetchAuditLogs({
          limit: 6,
          type: AuditLogEvent.MemberBanRemove
        });
        const entry = auditLogs.entries.find(
          (e) => e.targetId === ban.user?.id || (Date.now() - e.createdTimestamp < 15000)
        );

        const executor = entry?.executor;
        const reason = entry?.reason || 'Staff Unban';

        // Clear all automated enforcer penalties and add to exemptions
        if (ban.user?.id) clearAllPlayerPenalties(ban.user.id);
        if (ban.user?.username) clearAllPlayerPenalties(ban.user.username);

        console.log(`[Discord Unban] User ${ban.user?.tag || ban.user?.id} was unbanned by ${executor?.tag || 'Staff'}. All penalties cleared.`);

        const logCard = new ContainerBuilder().setAccentColor(0x57f287);
        logCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🤝 Member Unbanned'));
        logCard.addSeparatorComponents(thinLine());
        logCard.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `> **Target Member:** <@${ban.user?.id}> (\`${ban.user?.tag || ban.user?.username || ban.user?.id}\`)\n` +
            `> **Moderator:** ${executor ? `<@${executor.id}> (${executor.tag})` : 'Staff Moderation'}\n` +
            `> **Reason:** ${reason}\n` +
            `> **Enforcement Status:** Cleared from auto-bans, bacon penalties, and rejoin cooldowns.\n` +
            `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>`
          )
        );

        await sendSecurityLog(ban.guild, logCard);

        // Also post to Discord-Logs (1232495213986058286)
        try {
          const discordLogsChan = ban.guild.channels.cache.get('1232495213986058286') ||
            (await ban.guild.channels.fetch('1232495213986058286').catch(() => null));
          if (discordLogsChan) {
            await discordLogsChan.send({
              components: [logCard.toJSON()],
              flags: MessageFlags.IsComponentsV2
            });
          }
        } catch { }
      } catch (err) {
        console.warn(`GuildBanRemove audit log check failed: ${err.message}`);
      }
    }, 600);
  } catch (err) {
    console.error('GuildBanRemove listener error:', err.message);
  }
});

client.on(Events.GuildMemberRemove, async (member) => {
  try {
    if (!member.guild) return;
    setTimeout(async () => {
      try {
        const auditLogs = await member.guild.fetchAuditLogs({
          limit: 6,
          type: AuditLogEvent.MemberKick
        });
        const entry = auditLogs.entries.find(
          (e) => e.targetId === member.id && Date.now() - e.createdTimestamp < 8000
        );
        if (!entry || !entry.executor || entry.executor.id === client.user.id || entry.executor.id === member.guild.ownerId) {
          return;
        }
        await handleAntiNukeTrigger({
          guild: member.guild,
          executor: entry.executor,
          actionType: 'member_kick',
          targetName: member.user?.tag || member.user?.username || member.id,
          targetId: member.id
        });
      } catch (err) {
        console.warn(`GuildMemberRemove audit log check failed: ${err.message}`);
      }
    }, 600);
  } catch (err) {
    console.error('GuildMemberRemove listener error:', err.message);
  }
});

client.on(Events.ChannelCreate, async (channel) => {
  try {
    if (!channel.guild) return;
    channelBackupCache.set(channel.id, {
      id: channel.id,
      name: channel.name,
      type: channel.type,
      parentId: channel.parentId,
      topic: channel.topic,
      permissionOverwrites: channel.permissionOverwrites?.cache?.map((po) => ({
        id: po.id,
        allow: po.allow.toArray(),
        deny: po.deny.toArray()
      })) || []
    });
  } catch { }
});

client.on(Events.GuildRoleCreate, async (role) => {
  try {
    if (!role.guild || role.id === role.guild.id) return;
    roleBackupCache.set(role.id, {
      id: role.id,
      name: role.name,
      color: role.color,
      hoist: role.hoist,
      mentionable: role.mentionable,
      permissions: role.permissions.toArray()
    });
  } catch { }
});

async function executeShutdown(client, guildId, channelId, user) {
  const chanKey = `${guildId}:${channelId}`;
  let closedStats;
  try {
    closedStats = await Promise.race([
      fetchServerStats(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('API timeout (10s)')), 10_000))
    ]);
  } catch (err) {
    console.error('Shutdown stats fetch failed, using fallback:', err.message);
    closedStats = {
      serverName: SERVER.name,
      ownerName: SERVER.ownerName,
      players: 0,
      maxPlayers: 50,
      queue: 0,
      staff: 0,
      online: false,
      joinKey: SERVER.code,
      updatedAt: Math.floor(Date.now() / 1000)
    };
  }
  closedStats.staff = staffRoleCount(guildId) ?? closedStats.staff;

  // Collect voters: last started vote + any still-open vote here.
  const voterSet = new Set(lastVoteVotersByChannel.get(chanKey) ?? []);
  for (const v of activeVotes.values()) {
    if (v.guildId === guildId && v.channelId === channelId) {
      for (const id of Object.keys(v.voters ?? {})) voterSet.add(id);
    }
  }

  // Cancel any open vote cards in this channel - session is over.
  for (const [vid, v] of [...activeVotes]) {
    if (v.channelId !== channelId || v.guildId !== guildId) continue;
    activeVotes.delete(vid);
    clearVoteTimer(vid);
    try {
      const ch = await client.channels.fetch(v.channelId);
      const m = await ch.messages.fetch(v.messageId);
      await m.delete();
    } catch {
      // Vote card already gone - fine.
    }
  }
  saveVotes();

  // Clear live session flags and ping mention so panel drops orange/live styling and clears mention.
  for (const key of [...sessionLivePanels]) {
    if (key.startsWith(`${guildId}:`)) sessionLivePanels.delete(key);
  }
  panelPingMentionByChannel.delete(chanKey);
  sessionShutdownByChannel.set(chanKey, true);

  // Update the existing panel in the channel so it stays in place and never disappears!
  const panelMsgId = lastPanelByChannel.get(chanKey);
  if (panelMsgId) {
    try {
      const ch = await client.channels.fetch(channelId);
      const panelMsg = await ch.messages.fetch(panelMsgId);
      await panelMsg.edit({
        components: [buildContainer(closedStats, { sessionLive: false, isShutdown: true }).toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
    } catch {
      // Panel already gone - fine.
    }
  }

  // Post the dark gray Session Closed card in the channel.
  let sentNotice = null;
  try {
    const ch = await client.channels.fetch(channelId);
    if (ch) {
      sentNotice = await ch.send({
        components: [buildShutdownNotice(closedStats).toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
    }
  } catch (err) {
    console.error('Could not post shutdown notice in channel:', err.message);
  }

  // Auto-check live player count on the Session Closed card until all have left (up to 15 minutes)
  if (sentNotice) {
    let checkRuns = 0;
    const shutdownCheckTimer = setInterval(async () => {
      checkRuns += 1;
      try {
        const fresh = await fetchServerStats();
        fresh.staff = staffRoleCount(guildId) ?? fresh.staff;
        await sentNotice.edit({
          components: [buildShutdownNotice(fresh).toJSON()],
          flags: MessageFlags.IsComponentsV2
        });
        if (panelMsgId) {
          try {
            const ch = await client.channels.fetch(channelId);
            const panelMsg = await ch.messages.fetch(panelMsgId);
            await panelMsg.edit({
              components: [buildContainer(fresh, { sessionLive: false, isShutdown: true }).toJSON()],
              flags: MessageFlags.IsComponentsV2
            });
          } catch { }
        }
        if (checkRuns >= 30 || (fresh.players === 0 && checkRuns >= 2)) {
          clearInterval(shutdownCheckTimer);
        }
      } catch {
        clearInterval(shutdownCheckTimer);
      }
    }, 30000);
  }

  // DM everyone who voted - dark gray Session Closed card with red Session Ended button.
  let delivered = 0;
  for (const voterId of voterSet) {
    if (
      await dmUser(client, voterId, {
        components: [buildSessionClosedDM(closedStats).toJSON()],
        flags: MessageFlags.IsComponentsV2
      })
    ) {
      delivered += 1;
    }
  }

  return { delivered, voterCount: voterSet.size };
}

async function closeTicketChannel(client, channel, ticket, closedByTag, closedById, waitMs = 5000) {
  if (ticket) {
    activeTickets.delete(channel.id);
    saveTickets();

    try {
      let messages = [];
      let lastId = null;
      for (let i = 0; i < 20; i++) {
        const batch = await channel.messages.fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) });
        if (!batch.size) break;
        messages.push(...batch.values());
        lastId = batch.last().id;
        if (batch.size < 100) break;
      }
      messages.reverse();

      const lines = [
        `=======================================================`,
        `           ALABAMA STATE ROLEPLAY - TICKET LOG         `,
        `=======================================================`,
        `Channel:   #${channel.name}`,
        `Category:  ${ticket.categoryName}`,
        `Author:    ${ticket.authorTag} (${ticket.authorId})`,
        `Claimed:   ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Unclaimed'}`,
        ...(ticket.reason ? [`Reason:    ${ticket.reason}`] : []),
        `Opened At: ${new Date(ticket.createdAt * 1000).toUTCString()}`,
        `Closed At: ${new Date().toUTCString()} by ${closedByTag} (${closedById})`,
        `Total:     ${messages.length} messages`,
        `=======================================================\n`
      ];

      for (const m of messages) {
        if (m.author.id === client.user.id && m.flags?.has?.(MessageFlags.IsComponentsV2)) continue;
        const time = m.createdAt.toISOString().replace('T', ' ').slice(0, 19);
        const author = `${m.author.tag} (${m.author.id})`;
        let content = m.cleanContent || m.content || '';
        if (m.embeds?.length) {
          const embedTexts = m.embeds
            .map((e) => `[Embed: ${e.title || e.description || 'Card'}]`)
            .join(' ');
          content = content ? `${content} ${embedTexts}` : embedTexts;
        }
        if (m.attachments.size) {
          const attachList = [...m.attachments.values()].map((a) => a.url).join(', ');
          content = content ? `${content} [Attachments: ${attachList}]` : `[Attachments: ${attachList}]`;
        }
        lines.push(`[${time}] ${author}:\n${content || '(no text)'}\n`);
      }

      const transcriptBuffer = Buffer.from(lines.join('\n'), 'utf8');
      const filename = `transcript-${ticket.authorUsername || 'ticket'}-${Date.now()}.txt`;
      const attachment = new AttachmentBuilder(transcriptBuffer, { name: filename });

      let transcriptChan = await client.channels.fetch(TRANSCRIPTS_CHANNEL_ID).catch(() => null);
      if (!transcriptChan) {
        transcriptChan = channel.guild.channels.cache.find(
          (c) => c.type === ChannelType.GuildText && /transcript/i.test(c.name)
        );
      }
      if (transcriptChan) {
        const isPartnership = ticket.categoryKey === 'partnership';
        const transcriptCard = new ContainerBuilder().setAccentColor(isPartnership ? 0x3498db : 0xd35400);
        transcriptCard.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## Ticket Closed: ${ticket.categoryName}`)
        );
        transcriptCard.addSeparatorComponents(thinLine());
        transcriptCard.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `> **Channel:** \`#${channel.name}\`\n` +
            `> **Author:** <@${ticket.authorId}>\n` +
            `> **Claimed By:** ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : '*Unclaimed*'}\n` +
            `> **Closed By:** <@${closedById}> (${closedByTag})\n` +
            `> **Reason:** ${ticket.reason || 'No reason provided'}\n` +
            `> **Total Messages:** ${messages.length}`
          )
        );
        transcriptCard.addSeparatorComponents(thinLine());

        const initialSent = await transcriptChan.send({
          files: [attachment]
        });

        const fileUrl = initialSent.attachments.first()?.url;
        const actionRow = new ActionRowBuilder();
        if (fileUrl) {
          actionRow.addComponents(
            new ButtonBuilder()
              .setLabel('View Online Transcript')
              .setStyle(ButtonStyle.Link)
              .setURL(fileUrl)
          );
        }
        actionRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`transcript_edit_reason_${initialSent.id}`)
            .setLabel('Edit Reason')
            .setStyle(ButtonStyle.Secondary)
        );

        transcriptCard.addActionRowComponents(actionRow);

        await initialSent.edit({
          components: [transcriptCard.toJSON()],
          flags: MessageFlags.IsComponentsV2
        });

        closedTranscripts.set(initialSent.id, {
          channelName: channel.name,
          categoryName: ticket.categoryName,
          isPartnership,
          authorId: ticket.authorId,
          claimedBy: ticket.claimedBy,
          closedById,
          closedByTag,
          totalMessages: messages.length,
          fileUrl,
          reason: ticket.reason || 'No reason provided'
        });
      }
    } catch (archErr) {
      console.error('Failed to generate/send transcript:', archErr);
    }
  }

  setTimeout(async () => {
    try {
      await channel.delete();
    } catch (err) {
      console.error(`Could not delete ticket channel: ${err.message}`);
    }
  }, waitMs);
}

const SHR_LOGS_CHANNEL_ID = '1549597951611899954';

function buildStaffTransferReviewCard(ticket, pageIndex = 0) {
  const reqs = ticket.staffRequests || [];
  const total = reqs.length;
  const page = Math.max(0, Math.min(total - 1, pageIndex));
  const card = new ContainerBuilder().setAccentColor(0x3498db);

  if (total === 0) {
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Staff Partnership & Rank Transfer Batch\n` +
        `> **Ticket Channel:** <#${ticket.channelId}>\n` +
        `> **Representative:** <@${ticket.authorId}>\n\n` +
        `*No transfer requests have been submitted in this ticket yet.*`
      )
    );
    return card;
  }

  const item = reqs[page];
  const verdictStatus = item.status === 'accepted'
    ? 'Passed / Accepted'
    : item.status === 'denied'
      ? 'Denied / Rejected'
      : 'Pending Review';

  card.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## Staff Partnership & Rank Transfer Request\n` +
      `*Member ${page + 1} of ${total} • Ticket <#${ticket.channelId}>*\n\n` +
      `> **Target Member:** <@${item.userId}> (\`${item.userTag}\` • \`${item.userId}\`)\n` +
      `> **Roblox Username:** \`${item.robloxUser}\`\n` +
      `> **Role(s) Requested:** ${item.rolesRequested}\n` +
      `> **Origin Server & Reason:** ${item.reason}\n` +
      `> **Proof / Evidence:** ${item.proof}\n` +
      `> **Status:** **${verdictStatus}**` +
      (item.reviewerId ? ` by <@${item.reviewerId}>` : '') +
      (item.verdictReason ? `\n> **Reviewer Notes:** ${item.verdictReason}` : '')
    )
  );

  card.addSeparatorComponents(thinLine());

  // Row 1: Decision buttons
  const decisionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`part_staff_verdict_accept_${ticket.channelId}_${page}`)
      .setLabel('Accept Member')
      .setStyle(ButtonStyle.Success)
      .setDisabled(item.status === 'accepted'),
    new ButtonBuilder()
      .setCustomId(`part_staff_verdict_deny_${ticket.channelId}_${page}`)
      .setLabel('Deny Member')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(item.status === 'denied')
  );
  card.addActionRowComponents(decisionRow);

  // Row 2: Pagination buttons if multiple members
  if (total > 1) {
    const leftBtn = new ButtonBuilder()
      .setCustomId(`part_staff_page_${ticket.channelId}_${page - 1}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0);
    try {
      leftBtn.setEmoji({ id: '1549583273519489089', name: 'arrow_left' });
    } catch {
      leftBtn.setLabel('Previous');
    }

    const indicatorBtn = new ButtonBuilder()
      .setCustomId('part_staff_indicator')
      .setLabel(`Member ${page + 1} / ${total}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);

    const rightBtn = new ButtonBuilder()
      .setCustomId(`part_staff_page_${ticket.channelId}_${page + 1}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= total - 1);
    try {
      rightBtn.setEmoji({ id: '1549583002676236308', name: 'Right_arrow' });
    } catch {
      rightBtn.setLabel('Next');
    }

    const pageRow = new ActionRowBuilder().addComponents(leftBtn, indicatorBtn, rightBtn);
    card.addActionRowComponents(pageRow);
  }

  return card;
}

async function createTicketForUser(client, interaction, catKey, reason) {
  const cat = TICKET_CONFIG.categories[catKey];
  if (!cat) {
    if (interaction.deferred) {
      await interaction.editReply({ content: '❌ Unknown ticket category.' });
    } else {
      await interaction.reply({ content: '❌ Unknown ticket category.', flags: MessageFlags.Ephemeral });
    }
    return;
  }

  if (ticketDeskState.status === 'closed' || !ticketDeskState.categories[catKey]) {
    const msg = `❌ **${cat.shortName}** is currently closed by staff. Please check back later.`;
    if (interaction.deferred) {
      await interaction.editReply({ content: msg });
    } else {
      await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    }
    return;
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  const sanitizedUsername =
    interaction.user.username.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20) || interaction.user.id;
  const isPartnership = catKey === 'partnership';
  const channelName = isPartnership ? `🔵・${sanitizedUsername}` : `🔴・${sanitizedUsername}`;

  try {
    const parentCategory = await interaction.guild.channels.fetch(cat.categoryId).catch(() => null);

    const permissionOverwrites = [
      {
        id: interaction.guild.roles.everyone.id,
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
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.ReadMessageHistory
        ]
      }
    ];

    // 1. Inherit all role overwrites from the parent category if set
    if (parentCategory?.permissionOverwrites?.cache) {
      for (const [id, overwrite] of parentCategory.permissionOverwrites.cache) {
        if (id === interaction.guild.roles.everyone.id) continue;
        if (id === interaction.user.id || id === client.user.id) continue;
        const role = interaction.guild.roles.cache.get(id);
        if (role) {
          permissionOverwrites.push({
            id: role.id,
            allow: overwrite.allow.toArray(),
            deny: overwrite.deny.toArray()
          });
        }
      }
    }

    // 2. Department-based role access:
    // - IA tickets: Only Internal Affairs / Supervisor roles can view
    // - High Rank tickets: Only SHR / High Rank / Executive roles can view
    // - General Support tickets: General Support / Staff roles can view
    const deptRolePattern =
      catKey === 'ia'
        ? /(internal\s*affairs|\bia\b|supervisor)/i
        : (catKey === 'highrank' || catKey === 'partnership')
          ? /(super\s*high\s*rank|high\s*rank|\bshr\b|\bhr\b|management|executive|director|partnership|affiliate|owner|co-owner)/i
          : /(general\s*support|support\s*team|support|staff|moderator|mod)/i;

    const departmentRoles = interaction.guild.roles.cache.filter(
      (r) => !r.managed && deptRolePattern.test(r.name)
    );
    for (const [rId] of departmentRoles) {
      if (!permissionOverwrites.some((po) => po.id === rId)) {
        permissionOverwrites.push({
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

    const ticketChannel = await interaction.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: parentCategory ? cat.categoryId : null,
      permissionOverwrites
    });

    const ticketData = {
      channelId: ticketChannel.id,
      guildId: interaction.guild.id,
      authorId: interaction.user.id,
      authorTag: interaction.user.tag,
      authorUsername: sanitizedUsername,
      categoryKey: catKey,
      categoryName: cat.name,
      reason: reason || 'Not specified',
      createdAt: Math.floor(Date.now() / 1000),
      claimedBy: isPartnership ? client.user.id : null,
      controlMessageId: null
    };

    // Top ping for department role & user (partnership and staff_partnership NEVER ping staff roles)
    let deptPingRoleId = null;
    if (catKey === 'ia') deptPingRoleId = '1341932342343897269';
    else if (catKey === 'general') deptPingRoleId = '1236052056201105418';
    else if (catKey === 'highrank') deptPingRoleId = '1341932333741244476';

    const topPingContent = deptPingRoleId
      ? `<@&${deptPingRoleId}> <@${interaction.user.id}>`
      : `<@${interaction.user.id}>`;

    const isStaffPartnership = catKey === 'staff_partnership';
    await ticketChannel.send({
      content: `${topPingContent}\n` +
        (isPartnership
          ? 'Welcome to your partnership ticket! Please select what type of partnership you are opening below.'
          : isStaffPartnership
            ? 'Welcome to your staff partnership and rank transfer ticket! Please read the requirements below.'
            : 'Welcome to your assistance ticket. Staff will assist you shortly!'),
      allowedMentions: {
        users: [interaction.user.id],
        roles: deptPingRoleId ? [deptPingRoleId] : []
      }
    });

    if (catKey === 'partnership') {
      ticketData.partnershipStep = 'select_type';
    }

    // Pinned control card
    const controlMsg = await ticketChannel.send({
      components: [buildTicketControlContainer(ticketData).toJSON()],
      flags: MessageFlags.IsComponentsV2
    });

    try {
      await controlMsg.pin();
    } catch (pinErr) {
      console.warn(`Could not pin ticket control card: ${pinErr.message}`);
    }

    // If partnership ticket, post the interactive Regular vs Paid selector
    if (isPartnership) {
      const selectTypeCard = new ContainerBuilder().setAccentColor(0x3498db);
      selectTypeCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Select Partnership Type'));
      selectTypeCard.addSeparatorComponents(thinLine());
      selectTypeCard.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `Welcome <@${interaction.user.id}>! Please choose which partnership path you would like to pursue:\n\n` +
          `• **Regular Partnership**: Mutual advertisement exchange for communities meeting our 120+ member requirement.\n` +
          `• **Paid Partnership**: Direct promotion for communities under the member limit or seeking a here / everyone ping tier.`
        )
      );
      selectTypeCard.addSeparatorComponents(thinLine());
      const selectTypeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`part_type_regular_${ticketChannel.id}`)
          .setLabel('Regular Partnership')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`part_type_paid_${ticketChannel.id}`)
          .setLabel('Paid Partnership')
          .setStyle(ButtonStyle.Secondary)
      );
      selectTypeCard.addActionRowComponents(selectTypeRow);

      await ticketChannel.send({
        components: [selectTypeCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
    }

    // If staff partnership ticket, post the staff rank transfer submission card
    if (isStaffPartnership) {
      ticketData.staffRequests = [];
      const staffPartCard = new ContainerBuilder().setAccentColor(0x3498db);
      staffPartCard.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## Staff Partnership & Rank Transfer Department\n` +
          `Welcome <@${interaction.user.id}> to your official staff partnership and rank transfer ticket.\n\n` +
          `### When Requesting Roles & Transfers\n` +
          `When submitting a role request for yourself or server representatives:\n` +
          `• Please only request roles that apply to your current position or rank in the partner community. For example, if you are a Lower Rank, only request Lower Rank roles. The same applies to Supervisors and High Ranks.\n` +
          `• Make sure to include all roles eligible for, including any required divider roles.\n` +
          `• These requirements apply to all departments and jobs within Alabama State Roleplay.\n\n` +
          `You may use \`/add <user>\` to add partner server representatives to this ticket.\n` +
          `Click **Submit Transfer Request** below to add a member to the review batch.`
        )
      );
      staffPartCard.addSeparatorComponents(thinLine());
      const staffPartRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`part_staff_add_${ticketChannel.id}`)
          .setLabel('Submit Transfer Request')
          .setStyle(ButtonStyle.Primary)
      );
      staffPartCard.addActionRowComponents(staffPartRow);

      await ticketChannel.send({
        components: [staffPartCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
    }

    ticketData.controlMessageId = controlMsg.id;
    activeTickets.set(ticketChannel.id, ticketData);
    saveTickets();

    await interaction.editReply({
      content: `✅ Your ticket has been opened: <#${ticketChannel.id}>`
    });
  } catch (err) {
    console.error('Failed to create ticket channel:', err);
    await interaction.editReply({
      content: `❌ Could not create ticket channel (${err.message}). Ensure I have **Manage Channels** permission.`
    });
  }
}

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // ─────────────── postpone: custom duration modal ───────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith('vote_delay_custom_')) {
      await handlePostponeModal(client, interaction);
      return;
    }

    // ─────────────── ticket creation modal submit ───────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_modal_')) {
      const catKey = interaction.customId.replace('ticket_modal_', '');
      const reason = interaction.fields.getTextInputValue('ticket_reason')?.trim() || 'No reason provided';
      await createTicketForUser(client, interaction, catKey, reason);
      return;
    }

    // ─────────────── transcript edit reason modal submit ───────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith('transcript_modal_')) {
      const msgId = interaction.customId.replace('transcript_modal_', '');
      const newReason = interaction.fields.getTextInputValue('new_reason').trim();
      const msg = await interaction.channel.messages.fetch(msgId).catch(() => null);
      if (!msg) {
        await interaction.reply({ content: '❌ Could not find transcript message in this channel.', flags: MessageFlags.Ephemeral });
        return;
      }
      const data = closedTranscripts.get(msgId) || {
        channelName: 'ticket',
        categoryName: 'Assistance Ticket',
        authorId: interaction.user.id,
        claimedBy: null,
        closedById: interaction.user.id,
        closedByTag: interaction.user.tag,
        totalMessages: 0,
        fileUrl: msg.attachments.first()?.url,
        isPartnership: false
      };
      data.reason = newReason;
      closedTranscripts.set(msgId, data);

      const updatedCard = new ContainerBuilder().setAccentColor(data.isPartnership ? 0x3498db : 0xd35400);
      updatedCard.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## Ticket Closed: ${data.categoryName}`)
      );
      updatedCard.addSeparatorComponents(thinLine());
      updatedCard.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `> **Channel:** \`#${data.channelName}\`\n` +
          `> **Author:** <@${data.authorId}>\n` +
          `> **Claimed By:** ${data.claimedBy ? `<@${data.claimedBy}>` : '*Unclaimed*'}\n` +
          `> **Closed By:** <@${data.closedById}> (${data.closedByTag})\n` +
          `> **Reason:** ${newReason}\n` +
          `> **Total Messages:** ${data.totalMessages}`
        )
      );
      updatedCard.addSeparatorComponents(thinLine());

      const actionRow = new ActionRowBuilder();
      const onlineUrl = data.fileUrl || msg.attachments.first()?.url;
      if (onlineUrl) {
        actionRow.addComponents(
          new ButtonBuilder()
            .setLabel('View Online Transcript')
            .setStyle(ButtonStyle.Link)
            .setURL(onlineUrl)
        );
      }
      actionRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`transcript_edit_reason_${msgId}`)
          .setLabel('Edit Reason')
          .setStyle(ButtonStyle.Secondary)
      );
      updatedCard.addActionRowComponents(actionRow);
      updatedCard.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# Reason updated by <@${interaction.user.id}> • <t:${Math.floor(Date.now() / 1000)}:R>`)
      );

      await msg.edit({
        components: [updatedCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });

      await interaction.reply({
        content: `✅ Updated transcript reason to: **"${newReason}"**`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // ─────────────── Staff Partnership: Transfer Request Modal Submit ───────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith('part_staff_modal_')) {
      const channelId = interaction.customId.replace('part_staff_modal_', '');
      const ticket = activeTickets.get(channelId) || activeTickets.get(interaction.channelId);
      if (!ticket) {
        await interaction.reply({ content: '❌ Ticket record not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      const targetUserInput = interaction.fields.getTextInputValue('target_user')?.trim() || '';
      const robloxUser = interaction.fields.getTextInputValue('roblox_user')?.trim() || 'N/A';
      const rolesRequested = interaction.fields.getTextInputValue('roles_requested')?.trim() || 'N/A';
      const reason = interaction.fields.getTextInputValue('transfer_reason')?.trim() || 'N/A';
      const proof = interaction.fields.getTextInputValue('proof_link')?.trim() || 'None provided';

      const matchId = targetUserInput.match(/\d{17,20}/)?.[0] || targetUserInput;
      let targetUserObj = null;
      if (matchId) {
        targetUserObj = await interaction.client.users.fetch(matchId).catch(() => null);
      }
      const userId = targetUserObj ? targetUserObj.id : interaction.user.id;
      const userTag = targetUserObj ? (targetUserObj.tag || targetUserObj.username) : interaction.user.tag;

      if (!Array.isArray(ticket.staffRequests)) {
        ticket.staffRequests = [];
      }

      ticket.staffRequests.push({
        userId,
        userTag,
        robloxUser,
        rolesRequested,
        reason,
        proof,
        status: 'pending',
        submittedAt: Date.now()
      });
      saveTickets();

      const itemCard = new ContainerBuilder().setAccentColor(0x3498db);
      itemCard.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## Staff Transfer Request Added\n` +
          `> **Member:** <@${userId}> (\`${userTag}\`)\n` +
          `> **Roblox Username:** \`${robloxUser}\`\n` +
          `> **Roles Requested:** ${rolesRequested}\n` +
          `> **Server & Reason:** ${reason}\n` +
          `> **Proof:** ${proof}\n\n` +
          `Total members in batch: **${ticket.staffRequests.length}**.`
        )
      );
      itemCard.addSeparatorComponents(thinLine());

      const manageRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`part_staff_add_${channelId}`)
          .setLabel('Add Another Member')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`part_staff_submit_shr_${channelId}`)
          .setLabel(`Submit Batch to SHR (${ticket.staffRequests.length})`)
          .setStyle(ButtonStyle.Success)
      );
      itemCard.addActionRowComponents(manageRow);

      await interaction.reply({
        components: [itemCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
      return;
    }

    // ─────────────── Staff Partnership: SHR Review Verdict Modal Submit ───────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith('part_staff_verdict_modal_')) {
      // e.g. part_staff_verdict_modal_accept_channelId_page or deny_...
      const withoutPrefix = interaction.customId.replace('part_staff_verdict_modal_', '');
      const isAccept = withoutPrefix.startsWith('accept_');
      const remainder = withoutPrefix.replace(isAccept ? 'accept_' : 'deny_', '');
      const lastUnderscore = remainder.lastIndexOf('_');
      const channelId = remainder.substring(0, lastUnderscore);
      const pageIndex = parseInt(remainder.substring(lastUnderscore + 1), 10) || 0;

      const ticket = activeTickets.get(channelId);
      if (!ticket || !Array.isArray(ticket.staffRequests) || !ticket.staffRequests[pageIndex]) {
        await interaction.reply({ content: '❌ Transfer request record not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      const verdictReason = interaction.fields.getTextInputValue('verdict_reason')?.trim() || 'No reason provided';
      const item = ticket.staffRequests[pageIndex];
      item.status = isAccept ? 'accepted' : 'denied';
      item.reviewerId = interaction.user.id;
      item.reviewerTag = interaction.user.tag || interaction.user.username;
      item.verdictReason = verdictReason;
      item.reviewedAt = Date.now();
      saveTickets();

      // Update SHR log message
      if (interaction.message) {
        try {
          const updatedShrCard = buildStaffTransferReviewCard(ticket, pageIndex);
          await interaction.message.edit({
            components: [updatedShrCard.toJSON()],
            flags: MessageFlags.IsComponentsV2
          });
        } catch (editErr) {
          console.warn('Failed to edit SHR transfer review message:', editErr.message);
        }
      }

      // Notify ticket channel
      try {
        const ticketChan = await interaction.client.channels.fetch(channelId).catch(() => null);
        if (ticketChan) {
          const noticeCard = new ContainerBuilder().setAccentColor(isAccept ? 0x57f287 : 0xed4245);
          noticeCard.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## Staff Transfer Verdict — ${isAccept ? 'Accepted' : 'Denied'}\n` +
              `> **Member:** <@${item.userId}> (\`${item.userTag}\`)\n` +
              `> **Roblox:** \`${item.robloxUser}\`\n` +
              `> **Roles Requested:** ${item.rolesRequested}\n` +
              `> **Reviewed By:** <@${interaction.user.id}>\n` +
              `> **Decision:** **${isAccept ? 'ACCEPTED' : 'DENIED'}**\n` +
              `> **Notes / Reason:** ${verdictReason}`
            )
          );
          await ticketChan.send({
            components: [noticeCard.toJSON()],
            flags: MessageFlags.IsComponentsV2
          });
        }
      } catch (postErr) {
        console.warn('Failed to notify ticket channel of SHR transfer decision:', postErr.message);
      }

      // DM transferring member
      try {
        const targetMemberUser = await interaction.client.users.fetch(item.userId).catch(() => null);
        if (targetMemberUser) {
          const dmCard = new ContainerBuilder().setAccentColor(isAccept ? 0x57f287 : 0xed4245);
          dmCard.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## Staff Partnership Rank Transfer Decision\n` +
              `Hello <@${item.userId}>,\n\n` +
              `Your rank transfer request for Alabama State Roleplay has been **${isAccept ? 'ACCEPTED' : 'DENIED'}** by <@${interaction.user.id}>.\n\n` +
              `> **Roles Requested:** ${item.rolesRequested}\n` +
              `> **Reviewer Notes:** ${verdictReason}\n\n` +
              (isAccept
                ? 'Please check in with our leadership team in your ticket channel for role assignment.'
                : 'Thank you for your interest. If you have questions, please speak with your server representative.')
            )
          );
          await targetMemberUser.send({
            components: [dmCard.toJSON()],
            flags: MessageFlags.IsComponentsV2
          });
        }
      } catch {}

      await interaction.reply({
        content: `✅ Member transfer request (${isAccept ? 'ACCEPTED' : 'DENIED'}) recorded. Ticket channel and user have been notified.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // ─────────────── Staff Application: Step 1 Modal Submit ───────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith('app_modal_step1_')) {
      const appId = interaction.customId.replace('app_modal_step1_', '');
      const appData = [...activeApplications.values()].find((a) => a.id === appId);
      if (!appData) {
        await interaction.reply({ content: 'Application session expired. Please start again from the panel.', flags: MessageFlags.Ephemeral });
        return;
      }
      appData.step1Done = true;
      saveApplications();
      const updatedCard = buildApplicantDashboard(appData);
      await interaction.update({
        components: [updatedCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
      return;
    }

    // ─────────────── Staff Application: Step 2 Modal Submit ───────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith('app_modal_step2_')) {
      const appId = interaction.customId.replace('app_modal_step2_', '');
      const appData = [...activeApplications.values()].find((a) => a.id === appId);
      if (!appData) {
        await interaction.reply({ content: 'Application session expired. Please start again from the panel.', flags: MessageFlags.Ephemeral });
        return;
      }
      const robloxUser = interaction.fields.getTextInputValue('roblox_user')?.trim() || interaction.fields.getTextInputValue('discord_tag_user')?.trim() || 'N/A';
      const timezoneAge = interaction.fields.getTextInputValue('timezone_age')?.trim() || interaction.fields.getTextInputValue('timezone')?.trim() || 'N/A';
      const micSoftware = interaction.fields.getTextInputValue('mic_software')?.trim() || interaction.fields.getTextInputValue('bot_knowledge')?.trim() || 'N/A';
      const experience = interaction.fields.getTextInputValue('experience')?.trim() || 'None provided';
      const availability = interaction.fields.getTextInputValue('availability')?.trim() || 'N/A';

      appData.generalInfo = {
        roblox_user: robloxUser,
        discord_tag_user: robloxUser,
        timezone: timezoneAge,
        timezone_age: timezoneAge,
        mic_software: micSoftware,
        bot_knowledge: micSoftware,
        experience,
        availability
      };
      appData.step2Done = true;
      saveApplications();
      const updatedCard = buildApplicantDashboard(appData);
      await interaction.update({
        components: [updatedCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
      return;
    }

    // ─────────────── Staff Application: Step 3 Modal Submit ───────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith('app_modal_step3_')) {
      const appId = interaction.customId.replace('app_modal_step3_', '');
      const appData = [...activeApplications.values()].find((a) => a.id === appId);
      if (!appData) {
        await interaction.reply({ content: 'Application session expired. Please start again from the panel.', flags: MessageFlags.Ephemeral });
        return;
      }
      const isDiscord = appData.appType === 'Discord Staff';
      if (isDiscord) {
        appData.scenarioAnswers = {
          raid_spam: interaction.fields.getTextInputValue('raid_spam')?.trim() || 'N/A',
          harassment_toxicity: interaction.fields.getTextInputValue('harassment_toxicity')?.trim() || 'N/A',
          ticket_dispute: interaction.fields.getTextInputValue('ticket_dispute')?.trim() || 'N/A',
          bias_favoritism: interaction.fields.getTextInputValue('bias_favoritism')?.trim() || 'N/A',
          underage_tos: interaction.fields.getTextInputValue('underage_tos')?.trim() || 'N/A'
        };
      } else {
        appData.scenarioAnswers = {
          failrp_vdm: interaction.fields.getTextInputValue('failrp_vdm')?.trim() || 'N/A',
          combatlog_evade: interaction.fields.getTextInputValue('combatlog_evade')?.trim() || interaction.fields.getTextInputValue('cuff_evasion')?.trim() || 'N/A',
          nlr_safezone: interaction.fields.getTextInputValue('nlr_safezone')?.trim() || 'N/A',
          admin_abuse: interaction.fields.getTextInputValue('admin_abuse')?.trim() || interaction.fields.getTextInputValue('mod_commands')?.trim() || 'N/A',
          deescalation: interaction.fields.getTextInputValue('deescalation')?.trim() || interaction.fields.getTextInputValue('disrespect_abuse')?.trim() || 'N/A'
        };
      }
      appData.step3Done = true;
      saveApplications();
      const updatedCard = buildApplicantDashboard(appData);
      await interaction.update({
        components: [updatedCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
      return;
    }

    // ─────────────── Staff Application: Verdict Decision Modal Submit ───────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith('app_modal_verdict_')) {
      const action = interaction.customId.startsWith('app_modal_verdict_accept_') ? 'accept' : 'deny';
      const prefix = interaction.customId.startsWith('app_modal_verdict_accept_') ? 'app_modal_verdict_accept_' : 'app_modal_verdict_deny_';
      const appId = interaction.customId.replace(prefix, '');
      const reason = interaction.fields.getTextInputValue('verdict_reason')?.trim() || 'No specific notes provided.';
      const appData = [...activeApplications.values()].find((a) => a.id === appId);

      if (!appData) {
        await interaction.reply({ content: 'Application record not found or already processed.', flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const isPassed = action === 'accept';
      const logChannel = await interaction.client.channels.fetch(APP_DECISIONS_CHANNEL_ID).catch(() => null);

      if (isPassed) {
        const passedCard = new ContainerBuilder().setAccentColor(0x57f287);
        passedCard.addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(APP_PASSED_BANNER_URL))
        );
        passedCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🎉 Staff Application Passed!'));
        passedCard.addSeparatorComponents(thinLine());
        passedCard.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `> **Applicant:** <@${appData.applicantId}> (\`${appData.applicantTag}\`)\n` +
            `> **Position:** **${appData.appType}**\n` +
            `> **Roblox Username:** \`${appData.generalInfo?.roblox_user || 'N/A'}\`\n` +
            `> **Reviewed By:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
            `> **Reviewer Notes:** ${reason}\n` +
            `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:F>`
          )
        );

        if (logChannel) {
          await logChannel.send({
            content: `🎉 Congratulations <@${appData.applicantId}>! Your staff application has been approved.`
          }).catch(console.error);
          await logChannel.send({
            components: [passedCard.toJSON()],
            flags: MessageFlags.IsComponentsV2
          }).catch(console.error);
        }

        try {
          const applicantUser = await interaction.client.users.fetch(appData.applicantId).catch(() => null);
          if (applicantUser) {
            await applicantUser.send({
              content: `🎉 **Congratulations!** Your Alabama State Roleplay **${appData.appType}** application has been **PASSED** by <@${interaction.user.id}>!\n\n**Reviewer Notes:**\n> ${reason}\n\nPlease check <#${APP_DECISIONS_CHANNEL_ID}> for details.`
            });
          }
        } catch { }
      } else {
        const failedCard = new ContainerBuilder().setAccentColor(0xed4245);
        const attachment = new AttachmentBuilder('src/assets/application_failed.png', { name: 'application_failed.png' });
        failedCard.addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://application_failed.png'))
        );
        failedCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## ❌ Staff Application Denied'));
        failedCard.addSeparatorComponents(thinLine());
        failedCard.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `> **Applicant:** <@${appData.applicantId}> (\`${appData.applicantTag}\`)\n` +
            `> **Position:** **${appData.appType}**\n` +
            `> **Roblox Username:** \`${appData.generalInfo?.roblox_user || 'N/A'}\`\n` +
            `> **Reviewed By:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
            `> **Reason for Denial:** ${reason}\n` +
            `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:F>`
          )
        );

        if (logChannel) {
          await logChannel.send({
            content: `<@${appData.applicantId}> Your staff application decision has been recorded.`
          }).catch(console.error);
          await logChannel.send({
            components: [failedCard.toJSON()],
            files: [attachment],
            flags: MessageFlags.IsComponentsV2
          }).catch(console.error);
        }

        try {
          const applicantUser = await interaction.client.users.fetch(appData.applicantId).catch(() => null);
          if (applicantUser) {
            await applicantUser.send({
              content: `❌ Your Alabama State Roleplay **${appData.appType}** application was **DENIED** by <@${interaction.user.id}>.\n\n**Reason:**\n> ${reason}`
            });
          }
        } catch { }
      }

      activeApplications.delete(appData.applicantId);
      activeReviewSessions.delete(interaction.user.id);
      saveApplications();

      // Update reviewer message and schedule 5-minute auto-delete
      if (interaction.message) {
        try {
          const closedCard = new ContainerBuilder().setAccentColor(isPassed ? 0x57f287 : 0xed4245);
          closedCard.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## ${isPassed ? 'Staff Application Accepted' : 'Staff Application Denied'}\n` +
              `> **Applicant:** <@${appData.applicantId}> (\`${appData.applicantTag}\`)\n` +
              `> **Position:** **${appData.appType}**\n` +
              `> **Verdict:** **${isPassed ? 'PASSED' : 'DENIED'}**\n` +
              `> **Reviewer:** <@${interaction.user.id}>\n` +
              `> **Notes / Reason:** ${reason}\n\n` +
              `-# This review session message will automatically delete in 5 minutes.`
            )
          );
          await interaction.message.edit({
            components: [closedCard.toJSON()],
            flags: MessageFlags.IsComponentsV2
          }).catch(() => null);
        } catch {}

        setTimeout(async () => {
          try {
            await interaction.message?.delete().catch(() => null);
          } catch {}
        }, 300000);
      }

      await interaction.editReply({
        content: `✅ Application verdict (${isPassed ? 'ACCEPTED' : 'DENIED'}) has been recorded and published in <#${APP_DECISIONS_CHANNEL_ID}>. This review message will auto-delete in 5 minutes.`
      });
      return;
    }

    // ─────────────── Ban Appeal: Modal Submit ───────────────
    if (interaction.isModalSubmit() && interaction.customId === 'appeal_modal_submit') {
      const robloxUser = interaction.fields.getTextInputValue('roblox_user')?.trim() || 'N/A';
      const banReason = interaction.fields.getTextInputValue('ban_reason')?.trim() || 'N/A';
      const banDateStaff = interaction.fields.getTextInputValue('ban_date_staff')?.trim() || 'Unknown';
      const appealExplanation = interaction.fields.getTextInputValue('appeal_explanation')?.trim() || 'N/A';
      const futureConduct = interaction.fields.getTextInputValue('future_conduct')?.trim() || 'N/A';

      const appealId = `${Date.now().toString(36)}_${interaction.user.id.slice(-4)}`;
      const appealData = {
        id: appealId,
        applicantId: interaction.user.id,
        applicantTag: interaction.user.tag || interaction.user.username,
        robloxUser,
        banReason,
        banDateStaff,
        appealExplanation,
        futureConduct,
        submittedAt: Date.now(),
        status: 'pending',
        channelMessageId: null
      };

      activeAppeals.set(appealId, appealData);
      saveAppeals();

      await interaction.reply({
        content: '✅ Your in-game ban appeal has been submitted! Our staff will review it. Please check your Direct Messages for confirmation.',
        flags: MessageFlags.Ephemeral
      });

      // DM applicant confirmation
      try {
        const dmCard = new ContainerBuilder().setAccentColor(0x3498db);
        dmCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## ⚖️ Ban Appeal Submitted'));
        dmCard.addSeparatorComponents(thinLine());
        dmCard.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `Hello <@${interaction.user.id}>,\n\n` +
            `Your in-game ban appeal for Roblox account **${robloxUser}** has been received!\n\n` +
            `> **Status:** Pending Staff Review\n` +
            `> **Submitted:** <t:${Math.floor(Date.now() / 1000)}:F>\n\n` +
            `Our moderation team has been notified. You will receive a direct message notification here once a decision has been reached.`
          )
        );
        await interaction.user.send({
          components: [dmCard.toJSON()],
          flags: MessageFlags.IsComponentsV2
        });
      } catch (dmErr) {
        console.warn(`Could not send appeal confirmation DM: ${dmErr.message}`);
      }

      // Send to Appeals Channel 1360997421642944623 (NO BANNER!)
      const appealChan = await interaction.client.channels.fetch(APPEALS_CHANNEL_ID).catch(() => null);
      if (appealChan) {
        try {
          const reviewCard = new ContainerBuilder().setAccentColor(0x2b2d31);
          reviewCard.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## ⚖️ New In-Game Ban Appeal\n` +
              `> **Applicant:** <@${interaction.user.id}> (\`${interaction.user.tag || interaction.user.username}\` • \`${interaction.user.id}\`)\n` +
              `> **Roblox Username:** \`${robloxUser}\`\n` +
              `> **Ban Date / Staff:** ${banDateStaff}\n` +
              `> **Submitted:** <t:${Math.floor(Date.now() / 1000)}:F>\n\n` +
              `### Ban Reason Stated\n> ${banReason}\n\n` +
              `### Appeal Explanation & Evidence\n> ${appealExplanation}\n\n` +
              `### Future Conduct Commitment\n> ${futureConduct}\n\n` +
              `Staff: Click a button below to accept or deny this appeal with a mandatory reason.`
            )
          );
          reviewCard.addSeparatorComponents(thinLine());
          const actRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`appeal_btn_accept_${appealId}`)
              .setLabel('Accept Appeal')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`appeal_btn_deny_${appealId}`)
              .setLabel('Deny Appeal')
              .setStyle(ButtonStyle.Danger)
          );
          reviewCard.addActionRowComponents(actRow);

          const sentMsg = await appealChan.send({
            components: [reviewCard.toJSON()],
            flags: MessageFlags.IsComponentsV2
          });
          appealData.channelMessageId = sentMsg.id;
          saveAppeals();
        } catch (chanErr) {
          console.error('Failed to post ban appeal card in channel:', chanErr.message);
        }
      }
      return;
    }

    // ─────────────── Ban Appeal: Verdict Modal Submit ───────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith('appeal_modal_verdict_')) {
      const isAccept = interaction.customId.startsWith('appeal_modal_verdict_accept_');
      const prefix = isAccept ? 'appeal_modal_verdict_accept_' : 'appeal_modal_verdict_deny_';
      const appealId = interaction.customId.replace(prefix, '');
      const reason = interaction.fields.getTextInputValue('verdict_reason')?.trim() || 'No reason provided';
      const appeal = activeAppeals.get(appealId);

      if (!appeal) {
        await interaction.reply({ content: '❌ Appeal record not found or already processed.', flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      appeal.status = isAccept ? 'accepted' : 'denied';
      appeal.reviewedBy = interaction.user.id;
      appeal.reviewerTag = interaction.user.tag || interaction.user.username;
      appeal.reviewReason = reason;
      appeal.reviewedAt = Date.now();
      saveAppeals();

      // If accepted, execute in-game unban via API
      if (isAccept && appeal.robloxUser && appeal.robloxUser !== 'N/A') {
        try {
          await sendErlcCommand(`:unban ${appeal.robloxUser}`);
        } catch (unbanErr) {
          console.warn(`Could not automatically execute :unban ${appeal.robloxUser}: ${unbanErr.message}`);
        }
      }

      // DM Applicant with verdict and reason
      try {
        const applicantUser = await interaction.client.users.fetch(appeal.applicantId).catch(() => null);
        if (applicantUser) {
          const resCard = new ContainerBuilder().setAccentColor(isAccept ? 0x57f287 : 0xed4245);
          resCard.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## ${isAccept ? '🎉 Ban Appeal Accepted!' : '❌ Ban Appeal Denied'}\n` +
              `Hello <@${appeal.applicantId}>,\n\n` +
              `Your in-game ban appeal for Roblox account **${appeal.robloxUser}** has been **${isAccept ? 'ACCEPTED' : 'DENIED'}** by <@${interaction.user.id}>.\n\n` +
              `> **Staff Reason / Notes:**\n> ${reason}\n\n` +
              (isAccept
                ? `You have been unbanned and may rejoin the Alabama State Roleplay private server. Please ensure you strictly adhere to all server rules.`
                : `Your ban remains in effect. Please do not evade or create alternate accounts.`)
            )
          );
          await applicantUser.send({
            components: [resCard.toJSON()],
            flags: MessageFlags.IsComponentsV2
          });
        }
      } catch (dmErr) {
        console.warn(`Could not send appeal decision DM: ${dmErr.message}`);
      }

      // Edit the review message in channel 1360997421642944623
      if (interaction.message) {
        try {
          const decisionCard = new ContainerBuilder().setAccentColor(isAccept ? 0x57f287 : 0xed4245);
          decisionCard.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## ⚖️ Ban Appeal ${isAccept ? 'Accepted' : 'Denied'}\n` +
              `> **Applicant:** <@${appeal.applicantId}> (\`${appeal.applicantTag}\`)\n` +
              `> **Roblox Username:** \`${appeal.robloxUser}\`\n` +
              `> **Verdict:** **${isAccept ? 'ACCEPTED' : 'DENIED'}**\n` +
              `> **Reviewed By:** <@${interaction.user.id}> (${interaction.user.tag || interaction.user.username})\n` +
              `> **Staff Reason:** ${reason}\n\n` +
              `-# This message will automatically delete in 5 minutes.`
            )
          );
          await interaction.message.edit({
            components: [decisionCard.toJSON()],
            flags: MessageFlags.IsComponentsV2
          });
        } catch {}

        // Auto delete after 5 minutes (300000 ms)
        setTimeout(async () => {
          try {
            await interaction.message?.delete().catch(() => null);
          } catch {}
        }, 300000);
      }

      await interaction.editReply({
        content: `✅ Ban appeal verdict (${isAccept ? 'ACCEPTED' : 'DENIED'}) recorded. The channel message will auto-delete in 5 minutes.`
      });
      return;
    }

    async function handleSessionPanel(panelInteraction) {
      await panelInteraction.deferReply({ flags: MessageFlags.Ephemeral });

      const targetChannelId = config.sessionChannelId || panelInteraction.channelId;
      const channel =
        targetChannelId === panelInteraction.channelId && panelInteraction.channel
          ? panelInteraction.channel
          : await client.channels.fetch(targetChannelId).catch(() => null);

      if (!channel) {
        await panelInteraction.editReply({
          content: `❌ I could not find the session channel. Make sure \`SESSION_CHANNEL_ID\` in .env is correct, or remove it to use the current channel.`
        });
        return;
      }

      const panelKey = `${panelInteraction.guildId}:${channel.id}`;
      const existing = lastPanelByChannel.get(panelKey);
      if (existing) {
        stopLive(liveKey(panelInteraction.guildId, channel.id, existing));
        try {
          const oldMsg = await channel.messages.fetch(existing).catch(() => null);
          if (oldMsg) await oldMsg.delete().catch(() => null);
        } catch {
          // Already gone - fine.
        }
        lastPanelByChannel.delete(panelKey);
      }
      sessionShutdownByChannel.delete(panelKey);

      const stats = await fetchServerStats();

      const selectedRole = panelInteraction.options?.getRole?.('ping_role') || null;
      const pingMention = selectedRole ? formatRoleMention(selectedRole.id, panelInteraction.guildId) : null;
      if (pingMention) {
        panelPingMentionByChannel.set(panelKey, pingMention);
      } else {
        panelPingMentionByChannel.delete(panelKey);
      }
      let sent;
      try {
        sent = await channel.send({
          components: [buildContainer(stats, { pingMention }).toJSON()],
          flags: MessageFlags.IsComponentsV2
        });
      } catch (err) {
        await panelInteraction.editReply({
          content: `❌ Could not post the session panel in <#${channel.id}> (${err.message}). Make sure I have **Send Messages** and **Embed Links** permissions.`
        });
        return;
      }

      lastPanelByChannel.set(panelKey, sent.id);
      savePanels();
      startLiveRefresh(
        liveKey(panelInteraction.guildId, sent.channelId, sent.id),
        sent,
        sent.channelId
      );

      await panelInteraction.editReply({
        content: `✅ Live session panel posted in <#${channel.id}>.`
      });
    }

    // ─────────────────────────── /session ───────────────────────────
    // Silent post: no "used /session" message - the card just appears.
    // Subcommands: panel, vote (stale registrations get a helpful nudge).
    if (interaction.isChatInputCommand() && interaction.commandName === 'session') {
      // Only /session panel exists now - anything else = stale Discord cache.
      let sub = null;
      try {
        sub = interaction.options.getSubcommand();
      } catch {
        sub = interaction.options?.data?.[0]?.name ?? null;
      }
      sub = typeof sub === 'string' ? sub.toLowerCase().trim() : sub;
      console.log(`[session] sub=${sub} by ${interaction.user?.tag ?? interaction.user?.id}`);
      // Unknown / stale subcommand (or missing) - NEVER fall through to the
      // panel. This was the hole that could post "Session Information".
      if (sub !== 'panel' && sub !== 'vote' && sub !== 'shutdown') {
        await interaction.reply({
          content: `Unknown /session option - use **/session panel**, **/session vote** or **/session shutdown**. Press Ctrl+R in Discord if the command list looks stale. (build: vote-engine-2)`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // ── /session vote → live, persistent vote card ──
      if (sub === 'vote') {
        // Ack FIRST so the interaction can't time out while we post the card.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        console.log(`CMD /session vote by ${interaction.user.tag} in #${interaction.channel?.name ?? interaction.channelId}`);
        const needed = interaction.options.getInteger('required', true);
        const durationKey = interaction.options.getString('duration', true);
        const role = interaction.options.getRole('ping_role', true);
        const durationMs = VOTE_DURATIONS[durationKey] ?? VOTE_DURATIONS['1h'];
        const vote = {
          id: `v${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          messageId: null,
          hostId: interaction.user.id,
          hostName: interaction.user.globalName ?? interaction.user.username,
          needed,
          roleId: role.id,
          endTs: Date.now() + durationMs,
          ready: false,
          postponed: false,
          started: false,
          expired: false,
          voters: {}
        };
        let sent;
        try {
          sent = await interaction.channel.send({
            components: [buildVoteContainer(vote).toJSON()],
            flags: MessageFlags.IsComponentsV2
          });
        } catch (err) {
          await interaction.editReply({
            content: `❌ I could not post the vote card here (${err.message}). Make sure I have **Send Messages** + **Embed Links** in this channel, or run /session vote somewhere I can post.`
          });
          return;
        }
        vote.messageId = sent.id;
        activeVotes.set(vote.id, vote);
        saveVotes();
        setVoteTimer(client, vote);
        await interaction.editReply({
          content: `✅ Vote is live in <#${interaction.channelId}> - ends <t:${Math.floor(vote.endTs / 1000)}:R>. I'll DM you when the goal is hit.`
        });
        return;
      }
      // ── /session shutdown → Session Closed card + DM voters ──
      if (sub === 'shutdown') {
        // Ack immediately so Discord never shows "thinking..." forever.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        console.log(`CMD /session shutdown by ${interaction.user.tag} in #${interaction.channel?.name ?? interaction.channelId}`);
        const { delivered, voterCount } = await executeShutdown(
          client,
          interaction.guildId,
          interaction.channelId,
          interaction.user
        );

        await interaction.editReply({
          content: `🔒 Session closed - Session Closed card posted in <#${interaction.channelId}>${voterCount ? ` and **${delivered}/${voterCount}** voters were notified in DMs.` : '.'}`
        });
        return;
      }

      // ── /session panel → live session card ──
      if (sub === 'panel') {
        await handleSessionPanel(interaction);
        return;
      }
    }

    // ─────────────────────────── /ticket panel ─────────────────────
    if (interaction.isChatInputCommand() && interaction.commandName === 'ticket') {
      let sub = null;
      try {
        sub = interaction.options.getSubcommand();
      } catch {
        sub = interaction.options?.data?.[0]?.name ?? null;
      }
      sub = typeof sub === 'string' ? sub.toLowerCase().trim() : sub;
      if (sub === 'panel' || !sub) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const targetChannel = interaction.channel;
        if (!targetChannel) {
          await interaction.editReply({ content: '❌ Could not find target channel to post the ticket panel.' });
          return;
        }

        const chanKey = `${interaction.guildId}:${targetChannel.id}`;
        const prevMsgId = lastTicketPanelByChannel.get(chanKey);
        if (prevMsgId) {
          try {
            const prevMsg = await targetChannel.messages.fetch(prevMsgId).catch(() => null);
            if (prevMsg) await prevMsg.delete().catch(() => null);
          } catch {
            // Already deleted
          }
          lastTicketPanelByChannel.delete(chanKey);
          saveTicketPanels();
        }

        try {
          const sent = await targetChannel.send({
            components: [buildTicketPanelContainer().toJSON()],
            flags: MessageFlags.IsComponentsV2
          });
          lastTicketPanelByChannel.set(chanKey, sent.id);
          saveTicketPanels();
          await interaction.editReply({
            content: `✅ Live assistance ticket panel posted in <#${targetChannel.id}>.`
          });
        } catch (err) {
          console.error('Failed to post ticket panel:', err);
          await interaction.editReply({
            content: `❌ Could not post ticket panel (${err.message}). Ensure I have **Send Messages** and **Embed Links** permissions.`
          });
        }
        return;
      }
    }

    // ─────────────────────────── /proof, /staff, /promote, /derank ──
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'proof') {
        let sub = null;
        try {
          sub = interaction.options.getSubcommand();
        } catch {
          sub = interaction.options?.data?.[0]?.name ?? null;
        }
        sub = typeof sub === 'string' ? sub.toLowerCase().trim() : sub;
        if (sub === 'partnership') {
          await handleProofPartnershipCommand(interaction);
          return;
        }
      } else if (interaction.commandName === 'staff') {
        let sub = null;
        try {
          sub = interaction.options.getSubcommand();
        } catch {
          sub = interaction.options?.data?.[0]?.name ?? null;
        }
        let grp = null;
        try { grp = interaction.options.getSubcommandGroup(false); } catch {}
        if (grp === 'application' || sub === 'application') {
          await handleStaffApplicationPanelCommand(interaction);
          return;
        }
        if (sub === 'panel') {
          await handleSessionPanel(interaction);
          return;
        }
        if (sub === 'promotion' || sub === 'promote') {
          await handlePromotionCommand(interaction);
          return;
        }
        if (sub === 'derank' || sub === 'demote') {
          await handleDerankCommand(interaction);
          return;
        }
        if (sub === 'feedback') {
          await handleStaffFeedbackCommand(interaction);
          return;
        }
      } else if (interaction.commandName === 'appeal') {
        await handleAppealCommand(interaction);
        return;
      } else if (interaction.commandName === 'suggestion' || interaction.commandName === 'suggest') {
        await handleSuggestionCommand(interaction);
        return;
      } else if (interaction.commandName === 'promote') {
        await handlePromotionCommand(interaction);
        return;
      } else if (interaction.commandName === 'derank') {
        await handleDerankCommand(interaction);
        return;
      } else if (interaction.commandName === 'ban') {
        await handleBanCommand(interaction);
        return;
      } else if (interaction.commandName === 'kick') {
        await handleKickCommand(interaction);
        return;
      } else if (interaction.commandName === 'timeout') {
        await handleTimeoutCommand(interaction);
        return;
      } else if (interaction.commandName === 'purge') {
        await handlePurgeCommand(interaction);
        return;
      } else if (interaction.commandName === 'antinuke') {
        await handleAntiNukeCommand(interaction);
        return;
      } else if (interaction.commandName === 'verify') {
        await handleVerifyCommand(interaction);
        return;
      } else if (interaction.commandName === 'erlc') {
        await handleErlcCommand(interaction);
        return;
      } else if (interaction.commandName === 'jail') {
        await handleJailCommand(interaction);
        return;
      } else if (interaction.commandName === 'unjail') {
        await handleUnjailCommand(interaction);
        return;
      } else if (interaction.commandName === 'unban') {
        await handleUnbanCommand(interaction);
        return;
      } else if (interaction.commandName === 'safezone') {
        await handleSafeZoneCommand(interaction);
        return;
      } else if (interaction.commandName === 'retrigger') {
        await handleRetriggerCommand(interaction, true);
        return;
      } else if (interaction.commandName === 'add') {
        await handleTicketAddMember(interaction, true);
        return;
      } else if (interaction.commandName === 'unadd') {
        await handleTicketUnaddMember(interaction, true);
        return;
      } else if (interaction.commandName === 'commands') {
        await handleCommandsGuideCommand(interaction, true, 0);
        return;
      }
    }

    // ───────────────── role buttons (shared helper) ─────────────────
    async function resolvePingRole(guild) {
      if (!guild) return null;
      const configuredId = config.pingRoleId || SERVER.pingRoleId;
      let role = null;
      if (configuredId) {
        role = await guild.roles.fetch(configuredId).catch(() => null);
      }
      // If configured role is missing or managed, look for a normal role named "Session Ping"
      if (!role || role.managed) {
        const byName = guild.roles.cache.find(
          (r) => !r.managed && r.id !== guild.id && /session\s*ping|session\s*notify|session/i.test(r.name)
        );
        if (byName) return byName;
      }
      return role;
    }

    async function toggleRole(buttonInteraction, configuredRoleId, addedMsg, removedMsg) {
      const guild = buttonInteraction.guild;
      let member = buttonInteraction.member;
      try {
        if (!member?.roles?.cache && guild) {
          member = await guild.members.fetch(buttonInteraction.user.id);
        }
      } catch {
        // Falls through to the "inside the server" message below.
      }
      if (!member?.roles?.cache || !guild) {
        await buttonInteraction.reply({
          content: 'This button can only be used inside the server.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const role = await resolvePingRole(guild);
      if (!role) {
        await buttonInteraction.reply({
          content: '❌ No ping role found. Please create a role named **Session Ping** in Server Settings > Roles.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (role.managed) {
        await buttonInteraction.reply({
          content: `❌ The role **@${role.name}** is a bot/integration role managed by Discord and cannot be assigned to members. Please create a normal role named **Session Ping** in Server Settings > Roles.`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const botMember = await guild.members.fetch(client.user.id).catch(() => null);
      if (botMember && botMember.roles.highest.position <= role.position) {
        await buttonInteraction.reply({
          content: `❌ My highest role (**${botMember.roles.highest.name}**) is below **@${role.name}**. In Server Settings > Roles, please drag my role ABOVE **@${role.name}**.`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      try {
        if (member.roles.cache.has(role.id)) {
          await member.roles.remove(role.id);
          await buttonInteraction.reply({ content: removedMsg, flags: MessageFlags.Ephemeral });
        } else {
          await member.roles.add(role.id);
          await buttonInteraction.reply({ content: addedMsg, flags: MessageFlags.Ephemeral });
        }
      } catch (err) {
        console.error('Role update failed:', err.message);
        await buttonInteraction.reply({
          content: `❌ Could not update role (${err.message}). Make sure I have **Manage Roles** permission and my role is above **@${role.name}**.`,
          flags: MessageFlags.Ephemeral
        });
      }
    }

    // ─────────────── "Session Notification" toggle ───────────────
    if (interaction.isButton() && interaction.customId === 'session_notify') {
      await toggleRole(
        interaction,
        SERVER.pingRoleId,
        'Session notifications on - you will be pinged for new sessions.',
        'Session notifications off - you will no longer be pinged.'
      );
      return;
    }

    // ─────────────── Host DM "Shutdown Session" button ───────────────
    if (interaction.isButton() && interaction.customId.startsWith('session_host_shutdown_')) {
      const channelId = interaction.customId.replace('session_host_shutdown_', '');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const { delivered, voterCount } = await executeShutdown(
        client,
        interaction.guildId || config.guildId,
        channelId,
        interaction.user
      );
      await interaction.editReply({
        content: `🔒 Session closed - Session Closed card posted in <#${channelId}>${voterCount ? ` and **${delivered}/${voterCount}** voters were notified in DMs.` : '.'}`
      });
      return;
    }

    // ─────────────── vote buttons (host + voters) ───────────────
    if (interaction.isButton() && interaction.customId.startsWith('vote_count_')) {
      // Count pill is disabled - this should never fire, but stay safe.
      await interaction.reply({ content: 'That pill is just a counter - use the **Vote** button.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('vote_click_')) {
      const vote = activeVotes.get(interaction.customId.replace('vote_click_', ''));
      if (!vote || vote.started || vote.expired || vote.cancelled) {
        await interaction.reply({ content: 'This vote is no longer active.', flags: MessageFlags.Ephemeral });
        return;
      }
      const action = toggleVoter(vote, interaction.user.id);
      await checkVoteGoal(client, vote);
      await editVoteMessage(client, vote);
      const count = Object.keys(vote.voters ?? {}).length;
      await interaction.reply({
        content:
          action === 'added'
            ? `Vote counted - **${count}/${vote.needed}**.${count >= vote.needed ? ' Goal reached - the host has been notified!' : ''}`
            : `↩️ Your vote was removed - **${count}/${vote.needed}**.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('vote_start_')) {
      const vote = activeVotes.get(interaction.customId.replace('vote_start_', ''));
      if (!vote || vote.started || vote.expired || vote.cancelled) {
        await interaction.reply({ content: 'This vote is no longer active.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (interaction.user.id !== vote.hostId) {
        await interaction.reply({ content: 'Only the host can start this session.', flags: MessageFlags.Ephemeral });
        return;
      }
      await startSessionFromVote(client, vote, interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('vote_postpone_')) {
      const vote = activeVotes.get(interaction.customId.replace('vote_postpone_', ''));
      if (!vote || vote.started || vote.expired || vote.cancelled) {
        await interaction.reply({ content: 'This vote is no longer active.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (interaction.user.id !== vote.hostId) {
        await interaction.reply({ content: 'Only the host can postpone this vote.', flags: MessageFlags.Ephemeral });
        return;
      }
      await showPostponeMenu(vote, interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('vote_delay_custom_')) {
      const vote = activeVotes.get(interaction.customId.replace('vote_delay_custom_', ''));
      if (!vote || vote.started || vote.expired || vote.cancelled) {
        await interaction.reply({ content: 'This vote is no longer active.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (interaction.user.id !== vote.hostId) {
        await interaction.reply({ content: 'Only the host can postpone this vote.', flags: MessageFlags.Ephemeral });
        return;
      }
      const modal = new ModalBuilder()
        .setCustomId(`vote_delay_custom_${vote.id}`)
        .setTitle('Postpone Vote')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('minutes')
              .setLabel('Minutes to postpone (5 - 1440)')
              .setStyle(TextInputStyle.Short)
              .setMinLength(1)
              .setMaxLength(5)
              .setRequired(true)
              .setPlaceholder('e.g. 45')
          )
        );
      await interaction.showModal(modal);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('vote_delay_')) {
      // vote_delay_<id>_<30m|1h|2h>
      const parts = interaction.customId.split('_');
      const voteId = parts[2];
      const key = parts[3];
      const vote = activeVotes.get(voteId);
      if (!vote || vote.started || vote.expired || vote.cancelled) {
        await interaction.update({ content: 'This vote is no longer active.', components: [] });
        return;
      }
      if (interaction.user.id !== vote.hostId) {
        await interaction.reply({ content: 'Only the host can postpone this vote.', flags: MessageFlags.Ephemeral });
        return;
      }
      const ms = VOTE_DURATIONS[key];
      if (!ms) {
        await interaction.update({ content: 'Unknown postpone option.', components: [] });
        return;
      }
      const endTs = applyPostpone(client, vote, ms);
      await interaction.update({
        content: `Postponed - vote now ends <t:${Math.floor(endTs / 1000)}:R>. I'll DM you again when the timer runs out.`,
        components: []
      });
      return;
    }

    // ─────────────── Select Ticket Category (Dropdown) ───────────────
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select_category') {
      const catKey = interaction.values[0];
      const cat = TICKET_CONFIG.categories[catKey];
      if (!cat) {
        await interaction.reply({ content: 'Unknown ticket category.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (ticketDeskState.status === 'closed' || !ticketDeskState.categories[catKey]) {
        await interaction.reply({
          content: `❌ **${cat.shortName}** is currently closed by staff. Please check back later.`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      const isPartnership = catKey === 'partnership';
      const modal = new ModalBuilder()
        .setCustomId(`ticket_modal_${catKey}`)
        .setTitle(`Open ${cat.shortName}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('ticket_reason')
              .setLabel(isPartnership ? 'Server Name & Brief Overview' : 'Reason for opening this ticket')
              .setStyle(TextInputStyle.Paragraph)
              .setMinLength(3)
              .setMaxLength(1000)
              .setRequired(true)
              .setPlaceholder(
                isPartnership
                  ? 'e.g. Server Name, member count, and partnership interest...'
                  : 'Please describe your inquiry or reason in detail...'
              )
          )
        );
      await interaction.showModal(modal);
      return;
    }

    // ─────────────── Open Ticket (Buttons fallback) ───────────────
    if (interaction.isButton() && interaction.customId.startsWith('ticket_open_')) {
      const catKey = interaction.customId.replace('ticket_open_', '');
      const cat = TICKET_CONFIG.categories[catKey];
      if (!cat) {
        await interaction.reply({ content: 'Unknown ticket category.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (ticketDeskState.status === 'closed' || !ticketDeskState.categories[catKey]) {
        await interaction.reply({
          content: `❌ **${cat.shortName}** is currently closed by staff. Please check back later.`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      const isPartnershipBtn = catKey === 'partnership';
      const modal = new ModalBuilder()
        .setCustomId(`ticket_modal_${catKey}`)
        .setTitle(`Open ${cat.shortName}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('ticket_reason')
              .setLabel(isPartnershipBtn ? 'Server Name & Brief Overview' : 'Reason for opening this ticket')
              .setStyle(TextInputStyle.Paragraph)
              .setMinLength(3)
              .setMaxLength(1000)
              .setRequired(true)
              .setPlaceholder(
                isPartnershipBtn
                  ? 'e.g. Server Name, member count, and partnership interest...'
                  : 'Please describe your inquiry or reason in detail...'
              )
          )
        );
      await interaction.showModal(modal);
      return;
    }

    // ─────────────── Ticket Control: Claim ───────────────
    if (interaction.isButton() && interaction.customId === 'ticket_claim') {
      const ticket = activeTickets.get(interaction.channelId);
      if (!ticket) {
        await interaction.reply({ content: 'This channel is not an active ticket in my database.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (ticket.claimedBy) {
        await interaction.reply({ content: `This ticket is already claimed by <@${ticket.claimedBy}>.`, flags: MessageFlags.Ephemeral });
        return;
      }
      ticket.claimedBy = interaction.user.id;
      saveTickets();

      try {
        await interaction.channel.setName(`🟢・${ticket.authorUsername}`);
      } catch (err) {
        console.warn(`Could not rename ticket channel: ${err.message}`);
      }

      if (ticket.controlMessageId) {
        try {
          const msg = await interaction.channel.messages.fetch(ticket.controlMessageId);
          await msg.edit({
            components: [buildTicketControlContainer(ticket).toJSON()],
            flags: MessageFlags.IsComponentsV2
          });
        } catch (err) {
          console.warn(`Could not update ticket control message: ${err.message}`);
        }
      }

      await interaction.reply({
        content: `> 🔒 **Claimed** by <@${interaction.user.id}>. They will now be assisting with this inquiry.`
      });
      return;
    }

    // ─────────────── Ticket Control: Unclaim ───────────────
    if (interaction.isButton() && interaction.customId === 'ticket_unclaim') {
      const ticket = activeTickets.get(interaction.channelId);
      if (!ticket) {
        await interaction.reply({ content: 'This channel is not an active ticket in my database.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (!ticket.claimedBy) {
        await interaction.reply({ content: 'This ticket is not currently claimed.', flags: MessageFlags.Ephemeral });
        return;
      }
      ticket.claimedBy = null;
      saveTickets();

      try {
        await interaction.channel.setName(`🔴・${ticket.authorUsername}`);
      } catch (err) {
        console.warn(`Could not rename ticket channel: ${err.message}`);
      }

      if (ticket.controlMessageId) {
        try {
          const msg = await interaction.channel.messages.fetch(ticket.controlMessageId);
          await msg.edit({
            components: [buildTicketControlContainer(ticket).toJSON()],
            flags: MessageFlags.IsComponentsV2
          });
        } catch (err) {
          console.warn(`Could not update ticket control message: ${err.message}`);
        }
      }

      await interaction.reply({
        content: `> 🔓 **Unclaimed** by <@${interaction.user.id}>. Ticket is open for any staff member to claim.`
      });
      return;
    }

    // ─────────────── Ticket Control: Partnership Guide ───────────────
    if (interaction.isButton() && interaction.customId === 'ticket_partnership_guide') {
      await interaction.reply({
        components: [buildPartnershipGuideContainer().toJSON()],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
      });
      return;
    }

    // ─────────────── Ticket Control: Close Prompt ───────────────
    if (interaction.isButton() && interaction.customId === 'ticket_close') {
      const ticket = activeTickets.get(interaction.channelId);
      if (!ticket) {
        await interaction.reply({ content: 'This channel is not an active ticket in my database.', flags: MessageFlags.Ephemeral });
        return;
      }
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_close_confirm').setLabel('Confirm Close').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ticket_close_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
      );
      await interaction.reply({
        content: '⚠️ Are you sure you want to close and delete this ticket?',
        components: [row]
      });
      return;
    }

    // ─────────────── Ticket Control: Confirm Close ───────────────
    if (interaction.isButton() && interaction.customId === 'ticket_close_confirm') {
      const ticket = activeTickets.get(interaction.channelId);
      await interaction.update({
        content: '🔒 Archiving transcript and closing ticket in **5 seconds**...',
        components: []
      });
      await closeTicketChannel(client, interaction.channel, ticket, interaction.user.tag, interaction.user.id, 5000);
      return;
    }

    // ─────────────── Ticket Control: Cancel Close ───────────────
    if (interaction.isButton() && interaction.customId === 'ticket_close_cancel') {
      await interaction.update({
        content: 'Ticket closure cancelled.',
        components: []
      });
      return;
    }

    // ─────────────── Transcript: Edit Reason Button ───────────────
    if (interaction.isButton() && interaction.customId.startsWith('transcript_edit_reason_')) {
      const msgId = interaction.customId.replace('transcript_edit_reason_', '');
      const data = closedTranscripts.get(msgId);
      const currentReason = data?.reason || '';
      const modal = new ModalBuilder()
        .setCustomId(`transcript_modal_${msgId}`)
        .setTitle('Edit Ticket Close Reason')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('new_reason')
              .setLabel('Updated Closure Reason')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMinLength(1)
              .setMaxLength(500)
              .setValue(currentReason.slice(0, 500) || 'Resolved')
          )
        );
      await interaction.showModal(modal);
      return;
    }

    // ─────────────── Anti-Nuke Action Buttons ───────────────
    if (interaction.isButton() && interaction.customId.startsWith('antinuke_')) {
      await handleAntiNukeButton(interaction);
      return;
    }

    // ─────────────── Roblox Verification Action Button ───────────────
    if (interaction.isButton() && (interaction.customId === 'roblox_verify_action' || interaction.customId === 'roblox_verify_btn')) {
      await interaction.reply({
        content: `🔗 **Roblox Verification System**\n\n` +
          `> Please make sure your Discord account is linked via **Bloxlink** (https://blox.link) or our server verification portal.\n` +
          `> Once linked, your Alabama State Roleplay in-game data, callsign, and roles will be synchronized automatically.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // ─────────────── Partnership Type Selection Buttons ───────────────
    if (interaction.isButton() && interaction.customId.startsWith('part_type_regular_')) {
      const channelId = interaction.customId.replace('part_type_regular_', '');
      const ticket = activeTickets.get(channelId) || activeTickets.get(interaction.channelId);
      if (!ticket) {
        await interaction.reply({ content: 'Ticket record not found.', flags: MessageFlags.Ephemeral });
        return;
      }
      ticket.partnershipType = 'regular';
      ticket.partnershipStep = 'awaiting_ad';
      saveTickets();

      const regularCard = new ContainerBuilder().setAccentColor(0x3498db);
      regularCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🤝 Regular Partnership Selected'));
      regularCard.addSeparatorComponents(thinLine());
      regularCard.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `> **Requirement:** Your server must have at least **120+ active members** (excluding bots).\n\n` +
          `**Next Step:** Please submit your partnership information and server advertisement using:\n` +
          `\`-partnership [Your Server Details & Advertisement]\`\n\n` +
          `You may click the **Partnership Requirements & Application** button on the control card above for our application form template.`
        )
      );

      await interaction.update({
        components: [regularCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('part_type_paid_')) {
      const channelId = interaction.customId.replace('part_type_paid_', '');
      const ticket = activeTickets.get(channelId) || activeTickets.get(interaction.channelId);
      if (!ticket) {
        await interaction.reply({ content: 'Ticket record not found.', flags: MessageFlags.Ephemeral });
        return;
      }
      ticket.partnershipType = 'paid';
      ticket.partnershipStep = 'awaiting_payment_proof';
      saveTickets();

      const paidCard = new ContainerBuilder().setAccentColor(0xfee75c);
      paidCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Paid Partnership Game Passes'));
      paidCard.addSeparatorComponents(thinLine());
      paidCard.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `Please purchase one of our official game passes below to proceed with your paid partnership:\n\n` +
          `• [**Paid Partnership Fee (100 R$)**](https://www.roblox.com/game-pass/1941739587/Alabama-State-Roleplay-Partnership-Fee-100)\n` +
          `> Promote your server to our community. The partnership fee applies to communities under the 120 member threshold.\n\n` +
          `• [**Paid Partnership Here Ping Tier (200 R$)**](https://www.roblox.com/game-pass/1941619662/Alabama-Paid-Partnership-here-ping-200)\n` +
          `> Get your advertisement promoted with a here ping tier for additional exposure.\n\n` +
          `• [**Paid Partnership Everyone Ping Tier (300 R$)**](https://www.roblox.com/game-pass/1944102339/Alabama-Paid-Partnership-everyone-ping-300)\n` +
          `> Get maximum exposure with an everyone ping tier, reaching the entire community.\n\n` +
          `**Payment Proof Required:** After purchasing, upload a screenshot of your purchase confirmation into this channel (or run \`/proof partnership\`).\n` +
          `Once uploaded, the partnership team will verify your payment so you can submit your server advertisement.`
        )
      );

      await interaction.update({
        components: [paidCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('part_confirm_payment_')) {
      const channelId = interaction.customId.replace('part_confirm_payment_', '');
      const ticket = activeTickets.get(channelId) || activeTickets.get(interaction.channelId);
      if (!ticket) {
        await interaction.reply({ content: 'Ticket record not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      const member = interaction.member || (await interaction.guild?.members.fetch(interaction.user.id).catch(() => null));
      const canConfirm = member && (
        member.roles?.cache?.has('1341965114101731418') ||
        member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.permissions.has(PermissionFlagsBits.ManageGuild) ||
        member.roles?.cache?.some((r) => /(moderator|mod|admin|owner|supervisor|high\s*rank|staff)/i.test(r.name))
      );
      if (!canConfirm) {
        await interaction.reply({
          content: '❌ You do not have permission to verify partnership payments. Required role: <@&1341965114101731418>.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      ticket.paymentVerified = true;
      ticket.partnershipStep = 'awaiting_ad';
      saveTickets();

      const confirmedCard = new ContainerBuilder().setAccentColor(0x57f287);
      confirmedCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## ✅ Payment Verified by Staff!'));
      confirmedCard.addSeparatorComponents(thinLine());
      confirmedCard.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `> **Verified by:** <@${interaction.user.id}>\n\n` +
          `**Next Step:** <@${ticket.authorId}>, your payment has been verified! Please submit your server advertisement using:\n` +
          `\`-partnership [Your Server Details & Advertisement]\``
        )
      );

      await interaction.update({
        components: [confirmedCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
      return;
    }

    // ─────────────── Staff Partnership: Open Transfer Request Modal ───────────────
    if (interaction.isButton() && interaction.customId.startsWith('part_staff_add_')) {
      const channelId = interaction.customId.replace('part_staff_add_', '');
      const modal = new ModalBuilder()
        .setCustomId(`part_staff_modal_${channelId}`)
        .setTitle('Staff Rank Transfer Request')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('target_user')
              .setLabel('Discord Username / Tag / User ID')
              .setPlaceholder('e.g. @Member or 123456789012345678')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('roblox_user')
              .setLabel('Roblox Username')
              .setPlaceholder('e.g. OfficerJohn')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('roles_requested')
              .setLabel('Role(s) Requested (matching tier)')
              .setPlaceholder('e.g. Senior Moderator + Staff Divider')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('transfer_reason')
              .setLabel('Current Rank in Partner Server & Reason')
              .setPlaceholder('e.g. Server merge / partner representative, Head Admin in...')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('proof_link')
              .setLabel('Proof / Screenshot Link')
              .setPlaceholder('Image URL or screenshot reference link showing position')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
          )
        );

      await interaction.showModal(modal);
      return;
    }

    // ─────────────── Staff Partnership: Submit Batch to SHR ───────────────
    if (interaction.isButton() && interaction.customId.startsWith('part_staff_submit_shr_')) {
      const channelId = interaction.customId.replace('part_staff_submit_shr_', '');
      const ticket = activeTickets.get(channelId) || activeTickets.get(interaction.channelId);
      if (!ticket || !Array.isArray(ticket.staffRequests) || ticket.staffRequests.length === 0) {
        await interaction.reply({
          content: '❌ No transfer requests found in this batch to submit.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const shrChan = await interaction.client.channels.fetch(SHR_LOGS_CHANNEL_ID).catch(() => null);
      if (!shrChan) {
        await interaction.editReply({
          content: `❌ Could not find SHR logs channel (<#${SHR_LOGS_CHANNEL_ID}>). Ensure I have channel access.`
        });
        return;
      }

      const reviewCard = buildStaffTransferReviewCard(ticket, 0);
      const shrMsg = await shrChan.send({
        components: [reviewCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
      ticket.shrMessageId = shrMsg.id;
      ticket.batchSubmitted = true;
      saveTickets();

      const batchNotif = new ContainerBuilder().setAccentColor(0x57f287);
      batchNotif.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## Batch Submitted for Super High Rank Review\n` +
          `> **Total Requests:** **${ticket.staffRequests.length}**\n` +
          `> **Submitted by:** <@${interaction.user.id}>\n` +
          `> **Log Channel:** <#${SHR_LOGS_CHANNEL_ID}>\n\n` +
          `The Super High Rank administration will review each candidate. You will receive updates directly in this ticket channel.`
        )
      );

      await interaction.channel.send({
        components: [batchNotif.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });

      await interaction.editReply({
        content: `✅ Batch forwarded to Super High Rank logs channel (<#${SHR_LOGS_CHANNEL_ID}>).`
      });
      return;
    }

    // ─────────────── Staff Partnership: SHR Review Pagination ───────────────
    if (interaction.isButton() && interaction.customId.startsWith('part_staff_page_')) {
      // e.g. part_staff_page_channelId_page
      const parts = interaction.customId.split('_');
      const pageIndex = parseInt(parts.pop(), 10) || 0;
      const channelId = parts.slice(3).join('_');

      const ticket = activeTickets.get(channelId);
      if (!ticket) {
        await interaction.reply({ content: '❌ Ticket record not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      const updatedCard = buildStaffTransferReviewCard(ticket, pageIndex);
      await interaction.update({
        components: [updatedCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
      return;
    }

    // ─────────────── Staff Partnership: SHR Accept / Deny Verdict Click ───────────────
    if (interaction.isButton() && (interaction.customId.startsWith('part_staff_verdict_accept_') || interaction.customId.startsWith('part_staff_verdict_deny_'))) {
      const isAccept = interaction.customId.startsWith('part_staff_verdict_accept_');
      const prefix = isAccept ? 'part_staff_verdict_accept_' : 'part_staff_verdict_deny_';
      const remainder = interaction.customId.replace(prefix, '');
      const lastUnderscore = remainder.lastIndexOf('_');
      const channelId = remainder.substring(0, lastUnderscore);
      const pageIndex = parseInt(remainder.substring(lastUnderscore + 1), 10) || 0;

      const member = interaction.member || (await interaction.guild?.members.fetch(interaction.user.id).catch(() => null));
      const canReview = member && (
        member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.roles?.cache?.some((r) => /(super\s*high\s*rank|shr|executive|director|owner|co-owner|management)/i.test(r.name))
      );

      if (!canReview) {
        await interaction.reply({
          content: '❌ You must be a Super High Rank / Executive to review staff transfer requests.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`part_staff_verdict_modal_${isAccept ? 'accept' : 'deny'}_${channelId}_${pageIndex}`)
        .setTitle(isAccept ? 'Accept Member Transfer' : 'Deny Member Transfer')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('verdict_reason')
              .setLabel(isAccept ? 'Role Assignment Notes & Instructions' : 'Reason for Denial')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMinLength(2)
              .setMaxLength(1000)
              .setPlaceholder(isAccept ? 'e.g. Approved for Senior Moderator; assigning roles.' : 'e.g. Insufficient proof or mismatched rank.')
          )
        );

      await interaction.showModal(modal);
      return;
    }

    // ─────────────── /commands Multi-Page Interactive Reader ───────────────
    if (interaction.isButton() && interaction.customId.startsWith('cmds_page_')) {
      const parts = interaction.customId.split('_');
      const pageIndex = parseInt(parts.pop(), 10) || 0;
      const card = buildCommandsGuidePage(pageIndex);
      await interaction.update({
        components: [card.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
      return;
    }

    // ─────────────── Staff Application: Start Application (Select Menu & Buttons) ───────────────
    async function startStaffApplication(startInteraction, chosenOption) {
      const existing = activeApplications.get(startInteraction.user.id);
      if (existing) {
        await startInteraction.reply({
          content: '⚠️ You already have an active application in progress. Please check your Direct Messages with me to complete it.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const isIngame = chosenOption === 'app_start_ingame';
      const appType = isIngame ? 'In-Game Staff' : 'Discord Staff';
      const appId = `${Date.now().toString(36)}_${startInteraction.user.id.slice(-4)}`;

      const newApp = {
        id: appId,
        applicantId: startInteraction.user.id,
        applicantTag: startInteraction.user.tag,
        appType,
        step1Done: false,
        step2Done: false,
        step3Done: false,
        generalInfo: null,
        scenarioAnswers: null,
        createdAt: Date.now(),
        dmMessageId: null
      };

      try {
        const dashboard = buildApplicantDashboard(newApp);
        // NOTE: In Components V2, do NOT pass legacy 'content' field
        const dmMsg = await startInteraction.user.send({
          components: [dashboard.toJSON()],
          flags: MessageFlags.IsComponentsV2
        });
        newApp.dmMessageId = dmMsg.id;
        activeApplications.set(startInteraction.user.id, newApp);
        saveApplications();

        await startInteraction.reply({
          content: `✅ I have opened your **${appType}** application in your Direct Messages! Please check your DMs to begin.`,
          flags: MessageFlags.Ephemeral
        });
      } catch (err) {
        console.error('Failed to send application DM:', err);
        await startInteraction.reply({
          content: `❌ I could not send you a DM (${err.message}). Please ensure your Direct Messages from server members are enabled in **Privacy & Safety** settings, then try again.`,
          flags: MessageFlags.Ephemeral
        });
      }
    }

    if (startStaffApplication && interaction.isStringSelectMenu() && interaction.customId === 'app_select_position') {
      const selected = interaction.values?.[0];
      await startStaffApplication(interaction, selected);
      return;
    }

    if (interaction.isButton() && (interaction.customId === 'app_start_ingame' || interaction.customId === 'app_start_discord')) {
      await startStaffApplication(interaction, interaction.customId);
      return;
    }

    // ─────────────── Staff Application: Step Buttons (Applicant DM) ───────────────
    if (interaction.isButton() && interaction.customId.startsWith('app_btn_step1_')) {
      const appId = interaction.customId.replace('app_btn_step1_', '');
      const appData = [...activeApplications.values()].find((a) => a.id === appId);
      if (!appData) {
        await interaction.reply({ content: 'Application session expired. Please start again from the panel.', flags: MessageFlags.Ephemeral });
        return;
      }
      const isDiscord = appData.appType === 'Discord Staff';
      const modal = new ModalBuilder()
        .setCustomId(`app_modal_step1_${appId}`)
        .setTitle('Step 1: Rules & Requirements Agreement')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('rules_agree')
              .setLabel(isDiscord ? 'Do you agree to enforce Discord rules & TOS?' : 'Do you agree to enforce server rules strictly?')
              .setPlaceholder('Type "Yes" to confirm agreement')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('activity_agree')
              .setLabel(isDiscord ? 'Can you maintain active chat & ticket presence?' : 'Can you maintain minimum 10+ hrs/week on duty?')
              .setPlaceholder('Type "Yes" to confirm agreement')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('nda_agree')
              .setLabel('Do you agree to keep staff channels private?')
              .setPlaceholder('Type "Yes" to confirm agreement')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
      await interaction.showModal(modal);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('app_btn_step2_')) {
      const appId = interaction.customId.replace('app_btn_step2_', '');
      const appData = [...activeApplications.values()].find((a) => a.id === appId);
      if (!appData) {
        await interaction.reply({ content: 'Application session expired. Please start again from the panel.', flags: MessageFlags.Ephemeral });
        return;
      }
      const isDiscord = appData.appType === 'Discord Staff';
      const modal = new ModalBuilder()
        .setCustomId(`app_modal_step2_${appId}`)
        .setTitle('Step 2: General Information');

      if (isDiscord) {
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('discord_tag_user')
              .setLabel('Discord Tag & Account Age')
              .setPlaceholder('e.g. username | 2 years')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('timezone_age')
              .setLabel('Your Age & Timezone')
              .setPlaceholder('e.g. 16 | EST')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('bot_knowledge')
              .setLabel('Discord Bot Knowledge (Dyno, Wick, Carl, etc.)')
              .setPlaceholder('Describe your experience with moderation bots and Discord Automod...')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('experience')
              .setLabel('Previous Discord Staff / Moderation Roles')
              .setPlaceholder('List server names, member counts, ranks held, duration...')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('availability')
              .setLabel('Weekly Moderation Availability')
              .setPlaceholder('e.g. 2-4 hours daily, available afternoons/evenings')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
      } else {
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('roblox_user')
              .setLabel('Roblox Username & Profile Link')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('timezone_age')
              .setLabel('Your Age & Timezone')
              .setPlaceholder('e.g. 16 | EST')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('mic_software')
              .setLabel('Working Microphone & Clip Software')
              .setPlaceholder('e.g. Yes - Medal / OBS / GeForce')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('experience')
              .setLabel('Previous ER:LC / Roblox Staff Roles')
              .setPlaceholder('List server names, ranks held, duration, supervisor references...')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('availability')
              .setLabel('Weekly Duty Availability & Times')
              .setPlaceholder('e.g. 15-20 hours/week, active during patrols')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
      }
      await interaction.showModal(modal);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('app_btn_step3_')) {
      const appId = interaction.customId.replace('app_btn_step3_', '');
      const appData = [...activeApplications.values()].find((a) => a.id === appId);
      if (!appData) {
        await interaction.reply({ content: 'Application session expired. Please start again from the panel.', flags: MessageFlags.Ephemeral });
        return;
      }
      const isDiscord = appData.appType === 'Discord Staff';
      const modal = new ModalBuilder()
        .setCustomId(`app_modal_step3_${appId}`)
        .setTitle('Step 3: Knowledge & Scenarios');

      if (isDiscord) {
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('raid_spam')
              .setLabel('Mass spam / raid / phishing links in chat:')
              .setPlaceholder('Immediate lockdown, purge, and ban/timeout protocol?')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('harassment_toxicity')
              .setLabel('Heated arguments, slurs, toxicity in chat:')
              .setPlaceholder('De-escalation steps, warning, and timeout guidelines?')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('ticket_dispute')
              .setLabel('Member furiously disputes in-game ban in ticket:')
              .setPlaceholder('How do you remain professional and guide them?')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('bias_favoritism')
              .setLabel('A close friend breaks rules in general chat:')
              .setPlaceholder('How do you handle them without favoritism?')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('underage_tos')
              .setLabel('User admits under 13 or posts TOS content:')
              .setPlaceholder('Safety actions taken and evidence recording?')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          )
        );
      } else {
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('failrp_vdm')
              .setLabel('Player committing mass VDM & Fail RP:')
              .setPlaceholder('Immediate moderation actions and punishment log?')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('combatlog_evade')
              .setLabel('Suspect combat logs or cuff evades in pursuit:')
              .setPlaceholder('How do you confirm logs/clip and enforce punishment?')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('nlr_safezone')
              .setLabel('Explain NLR and Safe Zone gunplay rules:')
              .setPlaceholder('Define both rules and how you handle violators...')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('admin_abuse')
              .setLabel('Admin Commands & Abuse Prevention:')
              .setPlaceholder('When are :jail, :to, :bring, :return, :kick allowed/abusive?')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('deescalation')
              .setLabel('Player screams in VC accusing you of bias:')
              .setPlaceholder('How do you maintain strict composure and resolve this?')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          )
        );
      }
      await interaction.showModal(modal);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('app_btn_submit_')) {
      const appId = interaction.customId.replace('app_btn_submit_', '');
      const appData = [...activeApplications.values()].find((a) => a.id === appId);
      if (!appData) {
        await interaction.reply({ content: 'Application session expired. Please start again from the panel.', flags: MessageFlags.Ephemeral });
        return;
      }

      if (!appData.step1Done || !appData.step2Done || !appData.step3Done) {
        await interaction.reply({ content: '⚠️ Please complete all 3 steps before submitting your application.', flags: MessageFlags.Ephemeral });
        return;
      }

      appData.status = 'pending_review';
      appData.submittedAt = Date.now();
      saveApplications();

      const submittedCard = new ContainerBuilder().setAccentColor(0x57f287);
      submittedCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## ✅ Staff Application Submitted!'));
      submittedCard.addSeparatorComponents(thinLine());
      submittedCard.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `Thank you <@${interaction.user.id}>! Your application for **${appData.appType}** has been submitted.\n\n` +
          `Our staff team will review your application. You will receive a direct message notification here once a verdict has been recorded.`
        )
      );

      await interaction.update({
        components: [submittedCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });

      // Dispatch to sequential review among staff with role 1548637141850918993
      await dispatchApplicationReview(interaction.client, appData);
      return;
    }

    // ─────────────── Staff Application: Review Claim / Decline / Paging / Verdict ───────────────
    if (interaction.isButton() && interaction.customId.startsWith('app_rev_claim_')) {
      const appId = interaction.customId.replace('app_rev_claim_', '');
      const appData = [...activeApplications.values()].find((a) => a.id === appId);
      if (!appData) {
        await interaction.reply({ content: 'This application has already been processed or expired.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (appData.claimedReviewerId && appData.claimedReviewerId !== interaction.user.id) {
        await interaction.reply({ content: `This application has already been claimed by <@${appData.claimedReviewerId}>.`, flags: MessageFlags.Ephemeral });
        return;
      }

      appData.claimedReviewerId = interaction.user.id;
      appData.currentPage = 0;
      saveApplications();
      activeReviewSessions.set(interaction.user.id, { appId, currentPage: 0 });

      const reviewCard = buildApplicationReviewReaderCard(appData, 0);
      await interaction.update({
        components: [reviewCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('app_rev_decline_')) {
      const appId = interaction.customId.replace('app_rev_decline_', '');
      const appData = [...activeApplications.values()].find((a) => a.id === appId);
      if (!appData) {
        await interaction.update({ content: 'Application no longer pending.', components: [] });
        return;
      }

      await interaction.update({
        content: 'You declined to review this application. Forwarding to next staff member...',
        components: []
      });

      appData.currentReviewCandidateIdx = (appData.currentReviewCandidateIdx || 0) + 1;
      saveApplications();
      await sendNextReviewInquiry(interaction.client, appData);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('app_rev_page_')) {
      const parts = interaction.customId.split('_');
      const pageIndex = parseInt(parts.pop(), 10) || 0;
      const appId = parts.slice(3).join('_');
      const appData = [...activeApplications.values()].find((a) => a.id === appId);
      if (!appData) {
        await interaction.reply({ content: 'Application not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      appData.currentPage = pageIndex;
      saveApplications();
      const reviewCard = buildApplicationReviewReaderCard(appData, pageIndex);
      await interaction.update({
        components: [reviewCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
      return;
    }

    if (interaction.isButton() && (interaction.customId.startsWith('app_verdict_accept_') || interaction.customId.startsWith('app_verdict_deny_'))) {
      const isAccept = interaction.customId.startsWith('app_verdict_accept_');
      const appId = interaction.customId.replace(isAccept ? 'app_verdict_accept_' : 'app_verdict_deny_', '');
      const appData = [...activeApplications.values()].find((a) => a.id === appId);
      if (!appData) {
        await interaction.reply({ content: 'Application record not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`app_modal_verdict_${isAccept ? 'accept' : 'deny'}_${appId}`)
        .setTitle(isAccept ? 'Accept Staff Application' : 'Deny Staff Application')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('verdict_reason')
              .setLabel(isAccept ? 'Reviewer Feedback & Notes' : 'Reason for Denial')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMinLength(2)
              .setMaxLength(1000)
              .setPlaceholder(isAccept ? 'e.g. Great scenarios and solid past experience...' : 'e.g. Insufficient detail on scenario answers...')
          )
        );

      await interaction.showModal(modal);
      return;
    }

    // ─────────────── Ban Appeal: Reviewer Verdict Buttons (Accept / Deny) ───────────────
    if (interaction.isButton() && (interaction.customId.startsWith('appeal_btn_accept_') || interaction.customId.startsWith('appeal_btn_deny_'))) {
      const isAccept = interaction.customId.startsWith('appeal_btn_accept_');
      const appealId = interaction.customId.replace(isAccept ? 'appeal_btn_accept_' : 'appeal_btn_deny_', '');
      const appeal = activeAppeals.get(appealId);

      const member = interaction.member || (await interaction.guild?.members.fetch(interaction.user.id).catch(() => null));
      if (!isStaffMember(member) && !member?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: '❌ You must have staff permissions to review appeals.', flags: MessageFlags.Ephemeral });
        return;
      }

      if (!appeal || appeal.status !== 'pending') {
        await interaction.reply({ content: '❌ This appeal is no longer pending or has already been reviewed.', flags: MessageFlags.Ephemeral });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`appeal_modal_verdict_${isAccept ? 'accept' : 'deny'}_${appealId}`)
        .setTitle(isAccept ? 'Accept Ban Appeal' : 'Deny Ban Appeal')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('verdict_reason')
              .setLabel(isAccept ? 'Acceptance Reason & Conditions' : 'Reason for Denial')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMinLength(3)
              .setMaxLength(1000)
              .setPlaceholder(isAccept ? 'e.g. Acknowledged mistake, no prior infractions; ban revoked.' : 'e.g. Repeated trolling and severe NLR violation; appeal denied.')
          )
        );

      await interaction.showModal(modal);
      return;
    }

    // ─────────────── Community Suggestion Buttons ───────────────
    if (interaction.isButton() && interaction.customId.startsWith('sug_up_')) {
      const sugId = interaction.customId.replace('sug_up_', '');
      const sug = activeSuggestions.get(sugId);
      if (!sug) {
        await interaction.reply({ content: '❌ Suggestion not found or expired.', flags: MessageFlags.Ephemeral });
        return;
      }
      const userId = interaction.user.id;
      const upIdx = sug.upvoters.indexOf(userId);
      const downIdx = sug.downvoters.indexOf(userId);
      if (upIdx >= 0) {
        sug.upvoters.splice(upIdx, 1);
      } else {
        sug.upvoters.push(userId);
        if (downIdx >= 0) sug.downvoters.splice(downIdx, 1);
      }
      saveSuggestions();
      try {
        await interaction.message.edit({
          components: [buildSuggestionContainer(sug, interaction.client).toJSON()],
          flags: MessageFlags.IsComponentsV2
        });
      } catch (err) {
        console.warn('Failed to update suggestion message on upvote:', err.message);
      }
      await interaction.reply({
        content: upIdx >= 0 ? 'Removed your upvote.' : 'Upvoted this suggestion! <:checkmark:1549230329418485832>',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('sug_down_')) {
      const sugId = interaction.customId.replace('sug_down_', '');
      const sug = activeSuggestions.get(sugId);
      if (!sug) {
        await interaction.reply({ content: '❌ Suggestion not found or expired.', flags: MessageFlags.Ephemeral });
        return;
      }
      const userId = interaction.user.id;
      const upIdx = sug.upvoters.indexOf(userId);
      const downIdx = sug.downvoters.indexOf(userId);
      if (downIdx >= 0) {
        sug.downvoters.splice(downIdx, 1);
      } else {
        sug.downvoters.push(userId);
        if (upIdx >= 0) sug.upvoters.splice(upIdx, 1);
      }
      saveSuggestions();
      try {
        await interaction.message.edit({
          components: [buildSuggestionContainer(sug, interaction.client).toJSON()],
          flags: MessageFlags.IsComponentsV2
        });
      } catch (err) {
        console.warn('Failed to update suggestion message on downvote:', err.message);
      }
      await interaction.reply({
        content: downIdx >= 0 ? 'Removed your downvote.' : 'Downvoted this suggestion. <:wrong:1549230458070507552>',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('sug_voters_')) {
      const sugId = interaction.customId.replace('sug_voters_', '');
      const sug = activeSuggestions.get(sugId);
      if (!sug) {
        await interaction.reply({ content: '❌ Suggestion not found.', flags: MessageFlags.Ephemeral });
        return;
      }
      const upMentions = sug.upvoters.length > 0
        ? sug.upvoters.slice(0, 40).map((u) => `<@${u}>`).join(', ')
        : '*No upvotes yet*';
      const downMentions = sug.downvoters.length > 0
        ? sug.downvoters.slice(0, 40).map((u) => `<@${u}>`).join(', ')
        : '*No downvotes yet*';

      const votersCard = new ContainerBuilder().setAccentColor(0x2b2d31);
      votersCard.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## Voters for Suggestion #${sug.id}`)
      );
      votersCard.addSeparatorComponents(thinLine());
      votersCard.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `> **Votes:** **${sug.upvoters.length}** Upvotes • **${sug.downvoters.length}** Downvotes\n\n` +
          `### Upvoters (${sug.upvoters.length})\n${upMentions}\n\n` +
          `### Downvoters (${sug.downvoters.length})\n${downMentions}`
        )
      );
      await interaction.reply({
        components: [votersCard.toJSON()],
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      });
      return;
    }

    // ─────────────── ER:LC Staff DM Moderation Buttons ───────────────
    if (interaction.isButton() && interaction.customId.startsWith('erlc_tp_')) {
      const targetUser = interaction.customId.replace('erlc_tp_', '');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      if (!inGamePlayerTracker.has(targetUser.toLowerCase()) && !allOnlinePlayers.has(targetUser.toLowerCase())) {
        await interaction.editReply({ content: `❌ **${targetUser}** has left the game. Teleport is no longer available.` });
        return;
      }
      const staffRoblox = await getStaffRobloxUsername(interaction.client, interaction.user);
      if (!staffRoblox) {
        await interaction.editReply({ content: 'Could not detect your Roblox username from your Discord profile.' });
        return;
      }
      const res = await sendErlcCommand(`:tp ${staffRoblox} ${targetUser}`);
      if (!res.ok) {
        if (res.error?.includes('allowlist your IP') || res.error?.includes('not authorized')) {
          const pubIp = await getOutboundIp();
          await interaction.editReply({
            content:
              `❌ **Teleport Failed: Bot Outbound IP Not Allowlisted**\n\n` +
              `Your bot's current outbound IP is: \`${pubIp}\`\n\n` +
              `**How to fix:**\n` +
              `1. Visit [ER:LC Server Owners](https://api.erlc.gg/server-owners)\n` +
              `2. Select **${SERVER.name}**\n` +
              `3. Add \`${pubIp}\` to your **Custom Bot IP Allowlist**\n` +
              `4. Ensure **Execute Server Commands** is enabled.`
          });
        } else {
          await interaction.editReply({ content: `Failed to teleport: ${res.error}` });
        }
      } else {
        await interaction.editReply({
          content: `Teleporting **${staffRoblox}** to **${targetUser}** in-game!\n-# Command executed: \`:tp ${staffRoblox} ${targetUser}\``
        });
      }
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('erlc_bring_')) {
      const targetUser = interaction.customId.replace('erlc_bring_', '');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      if (!inGamePlayerTracker.has(targetUser.toLowerCase()) && !allOnlinePlayers.has(targetUser.toLowerCase())) {
        await interaction.editReply({ content: `❌ **${targetUser}** has left the game. Bring is no longer available.` });
        return;
      }
      const staffRoblox = await getStaffRobloxUsername(interaction.client, interaction.user);
      if (!staffRoblox) {
        await interaction.editReply({ content: 'Could not detect your Roblox username from your Discord profile.' });
        return;
      }
      let res = await sendErlcCommand(`:tp ${targetUser} ${staffRoblox}`);
      if (!res.ok) {
        res = await sendErlcCommand(`:bring ${targetUser}`);
      }
      if (!res.ok) {
        if (res.error?.includes('allowlist your IP') || res.error?.includes('not authorized')) {
          const pubIp = await getOutboundIp();
          await interaction.editReply({
            content:
              `❌ **Bring Failed: Bot Outbound IP Not Allowlisted**\n\n` +
              `Your bot's current outbound IP is: \`${pubIp}\`\n\n` +
              `**How to fix:**\n` +
              `1. Visit [ER:LC Server Owners](https://api.erlc.gg/server-owners)\n` +
              `2. Select **${SERVER.name}**\n` +
              `3. Add \`${pubIp}\` to your **Custom Bot IP Allowlist**\n` +
              `4. Ensure **Execute Server Commands** is enabled.`
          });
        } else {
          await interaction.editReply({ content: `Failed to bring player: ${res.error}` });
        }
      } else {
        await interaction.editReply({
          content: `Bringing **${targetUser}** to **${staffRoblox}** in-game!\n-# Command executed: \`:tp ${targetUser} ${staffRoblox}\``
        });
      }
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('erlc_check_join_')) {
      const targetUser = interaction.customId.replace('erlc_check_join_', '');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const status = await checkPlayerDiscordStatus(client, targetUser);
      const tracker = inGamePlayerTracker.get(targetUser.toLowerCase());

      if (!status.found && !status.isStaff) {
        await interaction.editReply({
          content: `**${targetUser}** is **still not in the Alabama Discord server**.\n-# The status button will remain until the user joins.`
        });
        return;
      }

      // Member has joined!
      if (tracker) {
        tracker.jailed = false;
        if (tracker.kickTimer) {
          clearTimeout(tracker.kickTimer);
          tracker.kickTimer = null;
        }
      }

      await sendErlcCommand(`:unjail ${targetUser}`);
      await sendErlcCommand(`:pm ${targetUser} Alabama State Roleplay: Verified. Welcome to the server!`);

      const updatedCard = await buildStaffAlertCard(targetUser, tracker, true);
      try {
        await interaction.message.edit({
          components: [updatedCard.toJSON()],
          flags: MessageFlags.IsComponentsV2
        });
        setTimeout(async () => {
          try {
            await interaction.message.delete().catch(() => null);
          } catch { }
        }, 10000);
      } catch (editErr) {
        console.warn(`Could not update staff DM card: ${editErr.message}`);
      }

      await interaction.editReply({
        content: `**${targetUser}** has joined the server! Player has been unjailed in-game.`
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('sz_flag_')) {
      const killerName = interaction.customId.replace('sz_flag_', '');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const res = await handleSafeZoneStrike(interaction.client, killerName, interaction.user, 'Shooting in Safe Zone Area');
      if (res.action === 'warn') {
        await interaction.editReply({
          content: `⚠️ Issued **Strike 1** to **${killerName}**! In-game warning PM sent (player was not jailed).`
        });
      } else if (res.action === 'warn_jail') {
        await interaction.editReply({
          content: `🔒 Issued **Strike 2** to **${killerName}**! Second warning sent and player jailed in-game.`
        });
      } else if (res.action === 'kick') {
        await interaction.editReply({
          content: `👢 Issued **Strike 3** to **${killerName}**! Removal notice sent and player kicked from the server.`
        });
      } else {
        await interaction.editReply({
          content: `🔨 Issued **Strike 4** to **${killerName}**! Player permanently banned from the server.`
        });
      }
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('sz_dismiss_')) {
      const killerName = interaction.customId.replace('sz_dismiss_', '');
      await interaction.reply({
        content: `✅ Kill incident by **${killerName}** dismissed (marked as road / outside safe zone area).`,
        flags: MessageFlags.Ephemeral
      });
      try {
        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`sz_dismissed_${killerName}`)
            .setLabel('Dismissed (Outside Safe Zone)')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        );
        await interaction.message.edit({ components: [disabledRow] });
      } catch {}
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('sz_unjail_')) {
      const username = interaction.customId.replace('sz_unjail_', '');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const res = await sendErlcCommand(`:unjail ${username}`);
      if (!res.ok) {
        await interaction.editReply({ content: `❌ Failed to unjail \`${username}\`: ${res.error}` });
      } else {
        await interaction.editReply({ content: `🔓 Successfully unjailed \`${username}\` in-game!` });
      }
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('sz_pardon_')) {
      const username = interaction.customId.replace('sz_pardon_', '');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const uKey = username.toLowerCase();
      let record = safeZoneStrikes.get(uKey);
      if (record) {
        if (record.strikes > 1) {
          record.strikes -= 1;
        } else {
          record.strikes = 0;
        }
        safeZoneStrikes.set(uKey, record);
        saveSafeZoneStrikes();
      }
      await sendErlcCommand(`:unjail ${username}`);
      await interaction.editReply({
        content: `🕊️ Infraction strike pardoned for **${username}** (Strikes remaining: ${record ? record.strikes : 0}). Player was also unjailed in-game.`
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('erlc_instant_ban_')) {
      const username = interaction.customId.replace('erlc_instant_ban_', '');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const res = await sendErlcCommand(`:ban ${username} 24h Flagged Avatar / Exploiter Outfit`);
      if (!res.ok) {
        await interaction.editReply({ content: `❌ Failed to ban \`${username}\`: ${res.error}` });
      } else {
        await interaction.editReply({ content: `🔨 Banned \`${username}\` from the private server for 24 hours!` });
      }
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('erlc_instant_kick_')) {
      const username = interaction.customId.replace('erlc_instant_kick_', '');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      rejoinedBaconOutfitWarned.add(username.toLowerCase());
      const res = await sendErlcCommand(`:kick ${username} Alabama State Roleplay - Please change your avatar out of the default bacon outfit.`);
      if (!res.ok) {
        await interaction.editReply({ content: `❌ Failed to kick \`${username}\`: ${res.error}` });
      } else {
        await interaction.editReply({ content: `👢 Kicked \`${username}\` from the server! (If they rejoin with the default outfit, they will be automatically banned for 24h).` });
      }
      return;
    }
  } catch (error) {
    console.error(`Failed to handle an interaction (${error.message}).`);
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: 'Something went wrong while running that. Check the bot logs.',
          flags: MessageFlags.Ephemeral
        });
      } catch {
        // Interaction already expired or not replyable - nothing more to do.
      }
    } else if (interaction.deferred) {
      // We deferred but never finished - try to clean up the "thinking..." state.
      try {
        await interaction.editReply({
          content: 'Something went wrong while running that.',
          flags: MessageFlags.Ephemeral
        });
      } catch {
        // If edit fails, try delete to clear the "thinking..." indicator.
        try {
          await interaction.deleteReply();
        } catch {
          // Give up - interaction is beyond recovery.
        }
      }
    }
  }
});

const PROOF_CHANNEL_ID = '1548840322438791178';
const PARTNERSHIP_PUBLISH_CHANNEL_ID = '1234265981250179072';

function inspectAdContent(text) {
  if (!text || text.trim().length < 5) return { ok: false, reason: 'No advertisement text was provided.' };
  const badWords = [
    'fuck', 'bitch', 'shit', 'nigger', 'nigga', 'fag', 'faggot', 'cunt', 'dick', 'cock',
    'pussy', 'whore', 'slut', 'porn', 'nsfw', 'hentai', 'nude', 'nudes', 'sex', 'raiding',
    'nuke', 'nuker', 'ddos', 'dox', 'doxing', 'grabify', 'iplogger', 'scam'
  ];
  const lower = text.toLowerCase();
  for (const word of badWords) {
    const regex = new RegExp(`(?:^|\\W)${word}(?:$|\\W)`, 'i');
    if (regex.test(lower)) {
      return { ok: false, reason: `Inappropriate or prohibited language detected (\`${word}\`).` };
    }
  }
  return { ok: true };
}

async function processPartnershipProof({ guild, channel, author, ticket, imageUrl, replyTarget, isInteraction = false }) {
  // ── Step 1: Send initial 30-second AI review notice ──
  const reviewCard = new ContainerBuilder().setAccentColor(0x3498db);
  reviewCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🔍 AI Verification In Progress'));
  reviewCard.addSeparatorComponents(thinLine());
  reviewCard.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `> **Analyzing Submission:** Our AI is now inspecting your server advertisement, validating formatting, and screening for prohibited content and community safety rules.\n\n` +
      `-# Review inspection window: ~30 seconds. Please wait...`
    )
  );

  if (isInteraction) {
    await replyTarget.reply({
      components: [reviewCard.toJSON()],
      flags: MessageFlags.IsComponentsV2
    });
  } else {
    await channel.send({
      components: [reviewCard.toJSON()],
      flags: MessageFlags.IsComponentsV2
    });
  }

  // ── Step 2: 30-second verification delay ──
  await new Promise((resolve) => setTimeout(resolve, 30000));

  const partnerName = ticket.partnerServerName || 'Community Partner';
  const partnerAd = ticket.partnerAdText || '';

  // ── Step 3: Content and safety inspection ──
  const inspection = inspectAdContent(partnerAd);
  if (!inspection.ok) {
    const failCard = new ContainerBuilder().setAccentColor(0xed4245);
    failCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## ❌ Partnership Review Failed'));
    failCard.addSeparatorComponents(thinLine());
    failCard.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `> **Safety Issue Detected:** ${inspection.reason}\n\n` +
        `Our community rules strictly prohibit profanity, offensive language, or malicious content in advertisements.\n` +
        `-# Please clean up your advertisement text and resubmit using \`-partnership\`.`
      )
    );

    if (isInteraction) {
      await replyTarget.followUp({
        components: [failCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
    } else {
      await channel.send({
        components: [failCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
    }
    return;
  }

  // ── Step 4: Archive proof screenshot to channel 1548646534944530582 ──
  const proofChan = await guild.channels.fetch(PROOF_CHANNEL_ID).catch(() => null);
  if (proofChan) {
    try {
      const proofCard = new ContainerBuilder().setAccentColor(0x3498db);
      proofCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Partnership Proof Submitted'));
      proofCard.addSeparatorComponents(thinLine());
      proofCard.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `> **Applicant:** <@${author.id}> (${author.tag || author.username})\n` +
          `> **Partner Community:** ${partnerName}\n` +
          `> **Ticket Channel:** <#${channel.id}>\n` +
          `> **AI Verification:** Passed (Content Safety Approved)\n` +
          `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:F>`
        )
      );
      proofCard.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(imageUrl))
      );
      await proofChan.send({
        components: [proofCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
    } catch (err) {
      console.error('Failed to post to proof channel:', err.message);
    }
  }

  // ── Step 5: Publish advertisement in channel 1548815558525583380 (NO EMBED, CLEAN TEXT WITH >, NO PINGS) ──
  const publishChan = await guild.channels.fetch(PARTNERSHIP_PUBLISH_CHANNEL_ID).catch(() => null);
  if (publishChan && partnerAd) {
    try {
      // Neutralize any @everyone, @here, or role pings so nobody is pinged
      const sanitizedAd = partnerAd
        .replace(/@(everyone|here)/gi, '@\u200b$1')
        .replace(/<@&(\d+)>/g, '<@\u200b&$1>');

      const plainAd =
        `# ${partnerName}\n` +
        `> **Official Community Partnership**\n` +
        `> **Representative:** <@${author.id}>\n` +
        `> **Date:** <t:${Math.floor(Date.now() / 1000)}:d>\n` +
        `───────────────────────────────────────\n\n` +
        `${sanitizedAd}\n\n` +
        `───────────────────────────────────────\n` +
        `-# Alabama State Roleplay • Official Partnership`;

      await publishChan.send({
        content: plainAd.slice(0, 2000),
        allowedMentions: { parse: [] }
      });
    } catch (pubErr) {
      console.error('Failed to post ad to publish channel:', pubErr.message);
    }
  }

  ticket.partnershipStep = 'completed';
  saveTickets();

  // ── Step 6: Remodeled Partnership Approved & Published card (BLUE, NO GREEN, Close Button, 5-min auto close) ──
  const confirmCard = new ContainerBuilder().setAccentColor(0x3498db); // Blue accent, NO green!
  confirmCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Partnership Approved & Published!'));
  confirmCard.addSeparatorComponents(thinLine());
  confirmCard.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `> **AI Verification:** Passed & Approved\n` +
      `> Your proof screenshot has been recorded and archived in <#${PROOF_CHANNEL_ID}>.\n` +
      `> Your server advertisement has been published to <#${PARTNERSHIP_PUBLISH_CHANNEL_ID}>.\n\n` +
      `**Thank you for partnering with Alabama State Roleplay!**\n\n` +
      `⏱️ *This ticket is finished and will automatically close in **5 minutes** if not closed below.*`
    )
  );

  confirmCard.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_close')
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Danger)
    )
  );

  if (isInteraction) {
    await replyTarget.followUp({
      components: [confirmCard.toJSON()],
      flags: MessageFlags.IsComponentsV2
    });
  } else {
    await channel.send({
      components: [confirmCard.toJSON()],
      flags: MessageFlags.IsComponentsV2
    });
  }

  // ── Step 7: 5-minute auto close timer ──
  setTimeout(async () => {
    try {
      const curTicket = activeTickets.get(channel.id);
      if (curTicket) {
        await channel.send({
          content: '⏱️ **5-minute completion window reached.** Archiving transcript and closing ticket now...'
        }).catch(() => null);
        await closeTicketChannel(client, channel, curTicket, 'Automated AI', client.user.id, 4000);
      }
    } catch (autoErr) {
      console.warn(`Auto-close 5m timer error: ${autoErr.message}`);
    }
  }, 5 * 60 * 1000);
}

async function handleProofPartnershipCommand(interaction) {
  const ticket = activeTickets.get(interaction.channelId);
  if (!ticket || ticket.categoryKey !== 'partnership') {
    await interaction.reply({
      content: '❌ This command can only be used inside your active partnership ticket channel.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const attachment = interaction.options.getAttachment('screenshot', true);
  const isImage =
    attachment.contentType?.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif)$/i.test(attachment.name || attachment.url);

  if (!isImage) {
    await interaction.reply({
      content: '❌ Please upload an image/screenshot file (PNG, JPG, WEBP).',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  await processPartnershipProof({
    guild: interaction.guild,
    channel: interaction.channel,
    author: interaction.user,
    ticket,
    imageUrl: attachment.url,
    replyTarget: interaction,
    isInteraction: true
  });
}

async function handleTicketAddMember(interaction, isSlash = true, targetUser = null) {
  const ticket = activeTickets.get(interaction.channelId);
  if (!ticket) {
    const msg = '❌ This command can only be used inside an active ticket channel.';
    if (isSlash) return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    return autoDeleteReply(interaction, msg, 15000);
  }

  const allowedCategories = ['partnership', 'staff_partnership', 'ia', 'general', 'highrank'];
  if (!allowedCategories.includes(ticket.categoryKey)) {
    const msg = '❌ Member management is not available in this category.';
    if (isSlash) return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    return autoDeleteReply(interaction, msg, 15000);
  }

  const member = interaction.member || (await interaction.guild?.members.fetch(interaction.user?.id || interaction.author?.id).catch(() => null));
  const isStaff =
    member &&
    (member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.permissions.has(PermissionFlagsBits.ManageChannels) ||
      member.roles?.cache?.some((r) =>
        /(moderator|mod|admin|owner|supervisor|high\s*rank|staff|partnership)/i.test(r.name)
      ));

  if (!isStaff && ticket.authorId !== (interaction.user?.id || interaction.author?.id)) {
    const msg = '❌ You do not have permission to add members to this ticket.';
    if (isSlash) return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    return autoDeleteReply(interaction, msg, 15000);
  }

  const target = targetUser || (isSlash ? interaction.options.getUser('user', true) : null);
  if (!target) {
    const msg = '❌ Please mention a valid user to add.';
    if (isSlash) return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    return autoDeleteReply(interaction, msg, 15000);
  }

  try {
    await interaction.channel.permissionOverwrites.edit(target.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
      EmbedLinks: true
    });

    const addCard = new ContainerBuilder().setAccentColor(0x57f287);
    addCard.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Member Added to Ticket\n` +
        `> **User:** <@${target.id}> (\`${target.tag || target.username}\`)\n` +
        `> **Added by:** <@${interaction.user?.id || interaction.author?.id}>`
      )
    );

    if (isSlash) {
      await interaction.reply({
        components: [addCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
    } else {
      await interaction.channel.send({
        components: [addCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
    }
  } catch (err) {
    const errMsg = `❌ Failed to add user: ${err.message}`;
    if (isSlash) return interaction.reply({ content: errMsg, flags: MessageFlags.Ephemeral });
    return autoDeleteReply(interaction, errMsg, 15000);
  }
}

async function handleTicketUnaddMember(interaction, isSlash = true, targetUser = null) {
  const ticket = activeTickets.get(interaction.channelId);
  if (!ticket) {
    const msg = '❌ This command can only be used inside an active ticket channel.';
    if (isSlash) return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    return autoDeleteReply(interaction, msg, 15000);
  }

  const allowedCategories = ['partnership', 'staff_partnership', 'ia', 'general', 'highrank'];
  if (!allowedCategories.includes(ticket.categoryKey)) {
    const msg = '❌ Member management is not available in this category.';
    if (isSlash) return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    return autoDeleteReply(interaction, msg, 15000);
  }

  const member = interaction.member || (await interaction.guild?.members.fetch(interaction.user?.id || interaction.author?.id).catch(() => null));
  const isStaff =
    member &&
    (member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.permissions.has(PermissionFlagsBits.ManageChannels) ||
      member.roles?.cache?.some((r) =>
        /(moderator|mod|admin|owner|supervisor|high\s*rank|staff|partnership)/i.test(r.name)
      ));

  if (!isStaff && ticket.authorId !== (interaction.user?.id || interaction.author?.id)) {
    const msg = '❌ You do not have permission to remove members from this ticket.';
    if (isSlash) return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    return autoDeleteReply(interaction, msg, 15000);
  }

  const target = targetUser || (isSlash ? interaction.options.getUser('user', true) : null);
  if (!target) {
    const msg = '❌ Please mention a valid user to remove.';
    if (isSlash) return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    return autoDeleteReply(interaction, msg, 15000);
  }

  if (target.id === ticket.authorId) {
    const msg = '❌ You cannot remove the ticket creator from their own ticket.';
    if (isSlash) return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    return autoDeleteReply(interaction, msg, 15000);
  }

  try {
    await interaction.channel.permissionOverwrites.delete(target.id);

    const unaddCard = new ContainerBuilder().setAccentColor(0xed4245);
    unaddCard.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Member Removed from Ticket\n` +
        `> **User:** <@${target.id}> (\`${target.tag || target.username}\`)\n` +
        `> **Removed by:** <@${interaction.user?.id || interaction.author?.id}>`
      )
    );

    if (isSlash) {
      await interaction.reply({
        components: [unaddCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
    } else {
      await interaction.channel.send({
        components: [unaddCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      });
    }
  } catch (err) {
    const errMsg = `❌ Failed to remove user: ${err.message}`;
    if (isSlash) return interaction.reply({ content: errMsg, flags: MessageFlags.Ephemeral });
    return autoDeleteReply(interaction, errMsg, 15000);
  }
}

function buildCommandsGuidePage(pageIndex = 0) {
  const card = new ContainerBuilder().setAccentColor(0x2b2d31);
  const totalPages = 6;
  const page = Math.max(0, Math.min(totalPages - 1, pageIndex));

  if (page === 0) {
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Command Directory — Session & Server Operations\n` +
        `*Page 1 of ${totalPages} • Session management, voting, and real-time operations.*\n\n` +
        `• \`/session panel [ping_role]\`\n` +
        `> Post the live session panel with real-time in-game player counts and direct join buttons.\n\n` +
        `• \`/session vote <required> <duration> [ping_role]\`\n` +
        `> Open an interactive community vote for a new session with customizable vote targets.\n\n` +
        `• \`/session shutdown\`\n` +
        `> Safely shut down the active session, update panel status to closed, and alert voters via DM.`
      )
    );
  } else if (page === 1) {
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Command Directory — Staff & Management\n` +
        `*Page 2 of ${totalPages} • Staff administration, ranks, and applications.*\n\n` +
        `• \`/staff panel [ping_role]\`\n` +
        `> Post the live staff control and session management panel.\n\n` +
        `• \`/staff promotion <user> <new_rank> <prev_rank> [roles] [reason]\`\n` +
        `> Post an official staff promotion notice and update member roles.\n\n` +
        `• \`/staff derank <user> <remove_role> <new_rank> <reason>\`\n` +
        `> Demote a staff member and remove old staff roles.\n\n` +
        `• \`/staff feedback <staff> <rating> <comments> [anonymous]\`\n` +
        `> Submit a 1 to 5 star rating and feedback review for a staff member.\n\n` +
        `• \`/staff application panel [channel]\`\n` +
        `> Post the interactive staff application desk panel.`
      )
    );
  } else if (page === 2) {
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Command Directory — Moderation & Server Security\n` +
        `*Page 3 of ${totalPages} • Discord moderation, safety enforcement, and anti-nuke.*\n\n` +
        `• \`/ban <target> [reason] [delete_days]\` — Ban a user from the Discord server.\n` +
        `• \`/kick <target> [reason]\` — Kick a member from the Discord server.\n` +
        `• \`/timeout <target> <duration> [reason]\` — Mute/timeout a member (60s, 5m, 10m, 1h, 1d, 1w).\n` +
        `• \`/unban <target> [reason]\` — Unban a user from the Discord server or in-game ER:LC server.\n` +
        `• \`/purge <amount> [user]\` — Bulk-delete 1 to 100 recent messages in the current channel.\n` +
        `• \`/antinuke status\` — View anti-nuke defense status, thresholds, and recent incident logs.\n` +
        `• \`/antinuke snapshot\` — Save an instant backup snapshot of all channels and roles.\n` +
        `• \`/antinuke restore <channels|roles>\` — Instantly recreate deleted channels or roles.`
      )
    );
  } else if (page === 3) {
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Command Directory — ER:LC In-Game Moderation & Enforcer\n` +
        `*Page 4 of ${totalPages} • Private server policing, command execution, and safe zones.*\n\n` +
        `• \`/erlc scan\` — Scan in-game players for default avatar outfits and Discord VC compliance.\n` +
        `• \`/erlc status\` — View live in-game enforcer tracking statistics and non-Discord players.\n` +
        `• \`/erlc pm <player> <message>\` — Send a private in-game message to a player.\n` +
        `• \`/erlc jail <player>\` / \`/erlc unjail <player>\` — Jail or unjail a player in the ER:LC private server.\n` +
        `• \`/erlc kick <player>\` / \`/erlc ban <player>\` — Kick or ban a player from the private server.\n` +
        `• \`/erlc message <msg>\` / \`/erlc hint <msg>\` — Broadcast a server announcement (:m) or top hint (:h).\n` +
        `• \`/safezone strike|status|clear\` — Manage Safe Zone shooting strikes and auto-escalations.`
      )
    );
  } else if (page === 4) {
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Command Directory — Tickets, Roblox & Community\n` +
        `*Page 5 of ${totalPages} • Assistance desk, member management, and prefix controls.*\n\n` +
        `• \`/ticket panel\` — Post the interactive assistance ticket desk panel for support requests.\n` +
        `• \`/add <user>\` — Add a member to the current ticket channel.\n` +
        `• \`/unadd <user>\` — Remove a member from the current ticket channel.\n` +
        `• \`/verify panel\` — Post the official Roblox account verification panel.\n` +
        `• \`/proof partnership <screenshot>\` — Submit screenshot proof of our server advertisement.\n` +
        `• \`/suggest <suggestion>\` — Submit a community suggestion for public voting.\n\n` +
        `### Ticket Desk Prefix Commands (-)\n` +
        `• \`-busy\` — Set ticket desk to Busy (panel turns yellow).\n` +
        `• \`-open\` or \`-open all\` — Set ticket desk to Online and open all departments (panel turns green).\n` +
        `• \`-close all\` — Close ticket desk and lock all categories (panel turns red).\n` +
        `• \`-close <dept>\` / \`-open <dept>\` — Lock / unlock specific departments (general, ia, high rank, partnership, staff partnership).\n` +
        `• \`-add @user\` / \`-unadd @user\` — Add or remove a member from the current ticket.\n` +
        `• \`-partnership <text>\` — Submit partnership application & ad inside ticket.\n` +
        `• \`-confirm\` — Staff verification for paid partnership payments.\n` +
        `• \`-status\` — Display current operational availability of the ticket desk.`
      )
    );
  } else {
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Command Directory — Emergency Controls & Appeals\n` +
        `*Page 6 of ${totalPages} • Emergency recovery, appeals, and system diagnostics.*\n\n` +
        `• \`/appeal\`\n` +
        `> Open an official in-game ban appeal form for staff review.\n\n` +
        `• \`/retrigger\`\n` +
        `> Emergency reboot & re-sync: re-registers slash commands with Discord API, restarts frozen live panel refresh timers ("Last Updated"), reboots in-game enforcer loops, and unblocks stuck buttons.\n\n` +
        `• \`/commands\`\n` +
        `> Display this interactive multi-page command directory.`
      )
    );
  }

  card.addSeparatorComponents(thinLine());

  // Navigation row: Left arrow, Page indicator, Right arrow
  const leftBtn = new ButtonBuilder()
    .setCustomId(`cmds_page_${page - 1}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page <= 0);
  try {
    leftBtn.setEmoji({ id: '1549583273519489089', name: 'arrow_left' });
  } catch {
    leftBtn.setLabel('Previous');
  }

  const indicatorBtn = new ButtonBuilder()
    .setCustomId('cmds_page_indicator')
    .setLabel(`Page ${page + 1} / ${totalPages}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  const rightBtn = new ButtonBuilder()
    .setCustomId(`cmds_page_${page + 1}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page >= totalPages - 1);
  try {
    rightBtn.setEmoji({ id: '1549583002676236308', name: 'Right_arrow' });
  } catch {
    rightBtn.setLabel('Next');
  }

  const navRow = new ActionRowBuilder().addComponents(leftBtn, indicatorBtn, rightBtn);
  card.addActionRowComponents(navRow);

  return card;
}

async function handleCommandsGuideCommand(interaction, isSlash = true, pageIndex = 0) {
  const card = buildCommandsGuidePage(pageIndex);
  if (isSlash) {
    await interaction.reply({
      components: [card.toJSON()],
      flags: MessageFlags.IsComponentsV2
    });
  } else {
    await autoDeleteReply(
      interaction,
      {
        components: [card.toJSON()],
        flags: MessageFlags.IsComponentsV2
      },
      60000
    );
  }
}

async function handleRetriggerCommand(interaction, isSlash = true) {
  // Permission check: Administrator or Staff
  const member = interaction.member;
  if (member && !member.permissions?.has?.(PermissionFlagsBits.Administrator)) {
    const isStaff = member.roles?.cache?.some((r) =>
      ERLC_ENFORCER_CONFIG.staffRoleIds.includes(r.id) ||
      /(staff|admin|mod\b|supervisor|director|executive|owner|management)/i.test(r.name)
    );
    if (!isStaff) {
      if (isSlash) {
        await interaction.reply({
          content: '❌ You must be an Administrator or Staff member to use `/retrigger`.',
          flags: MessageFlags.Ephemeral
        });
      } else {
        await autoDeleteReply(interaction, '❌ You must be an Administrator or Staff member to use `-retrigger`.', 10000);
      }
      return;
    }
  }

  if (isSlash) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  const startTime = Date.now();
  const logs = [];

  // 1. Re-register slash commands via Discord REST API
  let commandsSynced = 0;
  let targetGuildCount = 0;
  try {
    const rest = new REST({ version: '10' }).setToken(config.token);
    const slashPayload = getSlashPayload();
    const targetGuilds = ['1232495211490443284', '1530147023754367006', config.guildId].filter(Boolean);
    const uniqueGuilds = [...new Set(targetGuilds)];
    targetGuildCount = uniqueGuilds.length;

    for (const gid of uniqueGuilds) {
      try {
        await rest.put(Routes.applicationGuildCommands(config.clientId, gid), {
          body: slashPayload
        });
        commandsSynced = slashPayload.length;
      } catch (gErr) {
        console.warn(`[Retrigger] Failed registering commands to guild ${gid}: ${gErr.message}`);
      }
    }
    logs.push(`✅ Re-synced **${commandsSynced}** slash commands across **${targetGuildCount}** guild(s).`);
  } catch (cmdErr) {
    logs.push(`⚠️ Command sync notice: ${cmdErr.message}`);
  }

  // 2. Reload All Datastores from disk
  try {
    loadTickets();
    loadTicketDeskState();
    loadTicketPanels();
    loadSafeZoneStrikes();
    loadSuggestions();
    loadVotes();
    loadPanels();
    logs.push(`✅ Datastores successfully reloaded from disk (Tickets, Panels, Votes, Strikes, Suggestions).`);
  } catch (dataErr) {
    logs.push(`⚠️ Datastore reload notice: ${dataErr.message}`);
  }

  // 3. Reboot Live Panels & "Last Updated" refresh timers
  let panelsRebooted = 0;
  try {
    // Clear all existing live session intervals
    for (const [key] of liveSessions) {
      stopLive(key);
    }

    const discordClient = interaction.client;
    // Iterate through all tracked session panels
    for (const [chanKey, messageId] of [...lastPanelByChannel.entries()]) {
      const parts = chanKey.split(':');
      if (parts.length !== 2) continue;
      const [guildId, channelId] = parts;
      try {
        const ch = await discordClient.channels.fetch(channelId).catch(() => null);
        if (!ch) continue;
        const msg = await ch.messages.fetch(messageId).catch(() => null);
        if (!msg) {
          lastPanelByChannel.delete(chanKey);
          continue;
        }

        // Fetch fresh server stats immediately
        const fresh = await fetchServerStats();
        fresh.staff = staffRoleCount(guildId) ?? fresh.staff;
        const isShutdown = sessionShutdownByChannel.get(chanKey) || false;
        const pingMention = panelPingMentionByChannel.get(chanKey) ?? null;
        const key = liveKey(guildId, channelId, messageId);

        // Edit message immediately so "Last updated" resets to "just now"
        await msg.edit({
          components: [
            buildContainer(fresh, {
              sessionLive: !isShutdown && sessionLivePanels.has(key),
              isShutdown,
              pingMention
            }).toJSON()
          ],
          flags: MessageFlags.IsComponentsV2
        });

        // Restart live refresh timer
        startLiveRefresh(key, msg, channelId);
        panelsRebooted++;
      } catch (panelErr) {
        console.warn(`[Retrigger] Could not refresh panel ${messageId}: ${panelErr.message}`);
      }
    }

    // Auto-heal: If lastPanelByChannel had 0, check config.sessionChannelId
    if (panelsRebooted === 0 && config.sessionChannelId) {
      try {
        const ch = await interaction.client.channels.fetch(config.sessionChannelId).catch(() => null);
        if (ch) {
          const msgs = await ch.messages.fetch({ limit: 15 }).catch(() => null);
          if (msgs) {
            for (const m of msgs.values()) {
              if (m.author.id === interaction.client.user.id) {
                const fresh = await fetchServerStats();
                const key = liveKey(config.guildId, config.sessionChannelId, m.id);
                startLiveRefresh(key, m, config.sessionChannelId);
                lastPanelByChannel.set(`${config.guildId}:${config.sessionChannelId}`, m.id);
                panelsRebooted++;
                break;
              }
            }
          }
        }
      } catch { }
    }

    savePanels();
    logs.push(`✅ Live session panels rebooted: **${panelsRebooted}** panel(s) refreshed & active.`);
  } catch (panelGlobalErr) {
    logs.push(`⚠️ Live panel reboot notice: ${panelGlobalErr.message}`);
  }

  // 4. Reboot ER:LC In-Game Enforcer & Reset Queues
  try {
    erlcCommandQueue.length = 0; // Clear any stalled queue items
    isProcessingErlcQueue = false; // Release lock if stuck
    killLogsInitialized = false; // Reset safe zone kill log cache so new kills are caught immediately
    processedKillTimestamps.clear();
    rejoinedVcCooldown.clear();
    rejoinedBaconOutfitWarned.clear();
    cachedPublicIp = null;
    startErlcEnforcerLoop(interaction.client);
    logs.push(`✅ ER:LC enforcer loop, safe zone kill watcher, rejoin cooldowns & command queues rebooted cleanly.`);
  } catch (erlcErr) {
    logs.push(`⚠️ Enforcer loop notice: ${erlcErr.message}`);
  }

  // 5. Check System Health & Latency
  const wsPing = interaction.client.ws.ping;
  let erlcApiStatus = 'Unconfigured';
  try {
    if (config.apiKey) {
      const testStats = await fetchServerStats();
      erlcApiStatus = testStats.online ? 'Connected (Online)' : 'Connected (Offline)';
    }
  } catch {
    erlcApiStatus = 'API Error / Rate Limited';
  }

  const elapsedMs = Date.now() - startTime;

  // Build Results Card
  const resultCard = new ContainerBuilder().setAccentColor(0x57f287);
  resultCard.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('## ⚡ System Retrigger & Emergency Reboot Completed')
  );
  resultCard.addSeparatorComponents(thinLine());

  resultCard.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      logs.join('\n') + '\n\n' +
      `**System Status Summary:**\n` +
      `> • **Discord Gateway Latency:** \`${wsPing >= 0 ? `${wsPing}ms` : 'Connecting...'}\`\n` +
      `> • **ER:LC Server API:** \`${erlcApiStatus}\`\n` +
      `> • **Active Tickets:** \`${activeTickets.size}\`\n` +
      `> • **Execution Duration:** \`${elapsedMs}ms\`\n` +
      `> • **Buttons & Collectors:** Active and listening`
    )
  );

  resultCard.addSeparatorComponents(thinLine());
  resultCard.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '-# Alabama State Roleplay Utilities • Triggered by ' +
      (interaction.user?.tag || interaction.author?.tag || 'Staff')
    )
  );

  if (isSlash) {
    await interaction.editReply({
      components: [resultCard.toJSON()],
      flags: MessageFlags.IsComponentsV2
    });
  } else {
    await autoDeleteReply(
      interaction,
      {
        components: [resultCard.toJSON()],
        flags: MessageFlags.IsComponentsV2
      },
      30000
    );
  }
}

async function autoDeleteReply(userMessage, replyOptions, ms = 30000) {
  let sent = null;
  try {
    if (typeof replyOptions === 'string') {
      sent = await userMessage.reply({ content: replyOptions });
    } else {
      sent = await userMessage.reply(replyOptions);
    }
  } catch (err) {
    console.warn(`Could not send command reply: ${err.message}`);
    return;
  }
  setTimeout(async () => {
    try {
      await userMessage.delete().catch(() => null);
    } catch { }
    try {
      await sent.delete().catch(() => null);
    } catch { }
  }, ms);
}

client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author?.bot || !message.guild) return;

    const ticket = activeTickets.get(message.channelId);
    const isPartnershipTicket = ticket && ticket.categoryKey === 'partnership';

    // ── 1. -partnership command ──
    if (message.content?.startsWith('-')) {
      const trimmed = message.content.slice(1).trim();
      const lower = trimmed.toLowerCase();

      if (lower.startsWith('partnership')) {
        if (!isPartnershipTicket) {
          await autoDeleteReply(message, '❌ The `-partnership` command can only be used inside an active partnership ticket.', 30000);
          return;
        }

        const payload = trimmed.slice(11).trim();
        if (!payload || payload.length < 10) {
          await message.reply({
            content:
              `ℹ️ **How to Apply:**\n` +
              `Type \`-partnership\` followed by your completed server form and advertisement.\n` +
              `You can click the **Partnership Requirements & Application** button on the control card above to copy the form template!`
          });
          return;
        }

        // Check member count
        const memberMatch =
          payload.match(/(?:member\s*count|members?|count)\s*[:=\-]?\s*(\d+)/i) ||
          payload.match(/(\d{2,6})\s*(?:\+|members|users)/i);

        let memberCount = memberMatch ? parseInt(memberMatch[1], 10) : null;

        const inviteMatch = payload.match(/(?:discord\.gg|discord(?:app)?\.com\/invite)\/([a-zA-Z0-9_-]+)/i);
        let serverNameFromInvite = null;
        if (inviteMatch && client) {
          try {
            const invite = await client.fetchInvite(inviteMatch[1]).catch(() => null);
            if (invite) {
              if (invite.guild?.name) serverNameFromInvite = invite.guild.name;
              if (invite.memberCount) memberCount = invite.memberCount;
            }
          } catch { }
        }

        if (ticket.partnershipType === 'paid' && !ticket.paymentVerified) {
          await message.reply({
            content:
              `⚠️ **Payment Verification Required:** Please purchase your Paid Partnership Game Pass and submit proof before submitting your advertisement.\n` +
              `Staff role <@&1341965114101731418> will verify your payment and confirm it.`
          });
          return;
        }

        if (memberCount !== null && memberCount < 120 && !(ticket.partnershipType === 'paid' && ticket.paymentVerified)) {
          await message.reply({
            content:
              `❌ **Requirement Not Met:** Your server must have at least **120+ active members** (excluding bots) to partner with Alabama State Roleplay. Your submission indicated **${memberCount} members**.\n` +
              `-# If your community is under 120 members, you may choose a Paid Partnership.`
          });
          return;
        }

        const nameMatch = payload.match(/(?:server\s*name)\s*[:=\-]?\s*([^\n\r]+)/i);
        const serverName = nameMatch ? nameMatch[1].trim() : (serverNameFromInvite || 'Partner Community');

        ticket.partnerAdText = payload;
        ticket.partnerServerName = serverName;
        ticket.partnershipStep = 'awaiting_screenshot';
        saveTickets();

        const receivedCard = new ContainerBuilder().setAccentColor(0xd69a5c);
        receivedCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Partnership Application & Advertisement Received!'));
        receivedCard.addSeparatorComponents(thinLine());
        receivedCard.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `> **Server:** **${serverName}** ${memberCount ? `(${memberCount} members)` : ''}\n\n` +
            `**Next Step:** Please upload a **screenshot** in this ticket proving you have uploaded our advertisement in your server's partnership channel.\n` +
            `You can run \`/proof partnership\` (and attach your screenshot) or reply with your image.\n\n` +
            `-# if not uploaded partnership will be removed and you will be blacklisted`
          )
        );

        await message.reply({
          components: [receivedCard.toJSON()],
          flags: MessageFlags.IsComponentsV2
        });
        return;
      }

      // ── 2. -confirm command (Staff verification for paid partnerships) ──
      if (lower === 'confirm' || lower.startsWith('confirm')) {
        if (!isPartnershipTicket) {
          await autoDeleteReply(message, '❌ The `-confirm` command can only be used inside an active partnership ticket.', 30000);
          return;
        }

        const member = message.member || (await message.guild.members.fetch(message.author.id).catch(() => null));
        const canConfirm = member && (
          member.roles?.cache?.has('1341965114101731418') ||
          member.permissions.has(PermissionFlagsBits.Administrator) ||
          member.permissions.has(PermissionFlagsBits.ManageGuild) ||
          member.roles?.cache?.some((r) => /(moderator|mod|admin|owner|supervisor|high\s*rank|staff)/i.test(r.name))
        );
        if (!canConfirm) {
          await message.reply({ content: '❌ You do not have permission to verify partnership payments. Required role: <@&1341965114101731418>.' });
          return;
        }

        ticket.paymentVerified = true;
        ticket.partnershipStep = 'awaiting_ad';
        saveTickets();

        const verifiedCard = new ContainerBuilder().setAccentColor(0x57f287);
        verifiedCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## ✅ Paid Partnership Confirmed!'));
        verifiedCard.addSeparatorComponents(thinLine());
        verifiedCard.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `> **Verified by:** <@${message.author.id}>\n\n` +
            `**Next Step:** <@${ticket.authorId}>, your payment has been confirmed! Please submit your server advertisement using:\n` +
            `\`-partnership [Your Server Details & Advertisement]\``
          )
        );

        await message.channel.send({ content: `<@${ticket.authorId}> Payment verified!` });
        await message.channel.send({
          components: [verifiedCard.toJSON()],
          flags: MessageFlags.IsComponentsV2
        });
        return;
      }

      // ── 3. -proof command ──
      if (lower.startsWith('proof')) {
        if (!isPartnershipTicket) {
          await autoDeleteReply(message, '❌ The `-proof` command can only be used inside an active partnership ticket.', 30000);
          return;
        }

        const hasImage = message.attachments.find(
          (att) =>
            att.contentType?.startsWith('image/') ||
            /\.(png|jpe?g|webp|gif)$/i.test(att.name || att.url)
        );

        if (!hasImage) {
          await message.reply({
            content:
              '⚠️ **Screenshot Required:** Please attach an image of your proof screenshot to your `-proof` message or run `/proof partnership`.\n-# if not uploaded partnership will be removed and you will be blacklisted'
          });
          return;
        }

        if (ticket.partnershipStep === 'awaiting_payment_proof' || (ticket.partnershipType === 'paid' && !ticket.paymentVerified)) {
          ticket.paymentProofUrl = hasImage.url;
          ticket.partnershipStep = 'payment_proof_submitted';
          saveTickets();

          const pendingCard = new ContainerBuilder().setAccentColor(0xfee75c);
          pendingCard.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(hasImage.url))
          );
          pendingCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 💳 Payment Proof Submitted!'));
          pendingCard.addSeparatorComponents(thinLine());
          pendingCard.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `> **Submitted by:** <@${message.author.id}>\n\n` +
              `Attention <@&1341965114101731418>: Please verify this payment proof.\n` +
              `Once verified, type \`-confirm\` or click **Confirm Payment** below to unlock advertisement submission.`
            )
          );

          const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`part_confirm_payment_${ticket.channelId}`)
              .setLabel('Confirm Payment')
              .setStyle(ButtonStyle.Success)
          );

          await message.channel.send({ content: `<@&1341965114101731418> New paid partnership payment proof uploaded!` });
          await message.channel.send({
            components: [pendingCard.toJSON(), confirmRow],
            flags: MessageFlags.IsComponentsV2
          });
          return;
        }

        await processPartnershipProof({
          guild: message.guild,
          channel: message.channel,
          author: message.author,
          ticket,
          imageUrl: hasImage.url,
          replyTarget: message,
          isInteraction: false
        });
        return;
      }
    }

    // ── 4. Direct image screenshot upload while awaiting proof ──
    if (isPartnershipTicket && message.author.id === ticket.authorId) {
      const hasImage = message.attachments.find(
        (att) =>
          att.contentType?.startsWith('image/') ||
          /\.(png|jpe?g|webp|gif)$/i.test(att.name || att.url)
      );
      if (hasImage) {
        if (ticket.partnershipStep === 'awaiting_payment_proof' || (ticket.partnershipType === 'paid' && !ticket.paymentVerified)) {
          ticket.paymentProofUrl = hasImage.url;
          ticket.partnershipStep = 'payment_proof_submitted';
          saveTickets();

          const pendingCard = new ContainerBuilder().setAccentColor(0xfee75c);
          pendingCard.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(hasImage.url))
          );
          pendingCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 💳 Payment Proof Submitted!'));
          pendingCard.addSeparatorComponents(thinLine());
          pendingCard.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `> **Submitted by:** <@${message.author.id}>\n\n` +
              `Attention <@&1341965114101731418>: Please verify this payment proof.\n` +
              `Once verified, type \`-confirm\` or click **Confirm Payment** below to unlock advertisement submission.`
            )
          );

          const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`part_confirm_payment_${ticket.channelId}`)
              .setLabel('Confirm Payment')
              .setStyle(ButtonStyle.Success)
          );

          await message.channel.send({ content: `<@&1341965114101731418> New paid partnership payment proof uploaded!` });
          await message.channel.send({
            components: [pendingCard.toJSON(), confirmRow],
            flags: MessageFlags.IsComponentsV2
          });
          return;
        }

        if (ticket.partnershipStep === 'awaiting_screenshot') {
          await processPartnershipProof({
            guild: message.guild,
            channel: message.channel,
            author: message.author,
            ticket,
            imageUrl: hasImage.url,
            replyTarget: message,
            isInteraction: false
          });
          return;
        }
      }
    }

    if (!message.content?.startsWith('-')) return;

    const raw = message.content.slice(1).trim().toLowerCase();

    // ── Ticket Channel Member Management (-add, -unadd) ──
    if (raw.startsWith('add ') || raw.startsWith('unadd ')) {
      const isAdd = raw.startsWith('add ');
      const targetUser = message.mentions.users.first();
      if (!targetUser) {
        const parts = message.content.slice(1).trim().split(/\s+/);
        const uid = parts[1];
        const fetchedUser = uid && /^\d{17,20}$/.test(uid) ? await client.users.fetch(uid).catch(() => null) : null;
        if (isAdd) {
          await handleTicketAddMember(message, false, fetchedUser);
        } else {
          await handleTicketUnaddMember(message, false, fetchedUser);
        }
      } else {
        if (isAdd) {
          await handleTicketAddMember(message, false, targetUser);
        } else {
          await handleTicketUnaddMember(message, false, targetUser);
        }
      }
      return;
    }

    const isKnownCmd =
      raw === 'busy' ||
      raw === 'open' ||
      raw === 'open all' ||
      raw === 'close all' ||
      raw === 'close desk' ||
      raw.startsWith('close ') ||
      raw.startsWith('open ') ||
      raw === 'status' ||
      raw === 'ticket status' ||
      raw === 'desk status' ||
      raw === 'help' ||
      raw === 'ticket help' ||
      raw === 'commands' ||
      raw === 'ticket commands' ||
      raw.startsWith('ban') ||
      raw.startsWith('kick') ||
      raw.startsWith('timeout') ||
      raw.startsWith('purge') ||
      raw.startsWith('antinuke') ||
      raw.startsWith('anti-nuke');

    if (!isKnownCmd) return;

    const member = message.member || (await message.guild.members.fetch(message.author.id).catch(() => null));
    const isStaff =
      member &&
      (member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.permissions.has(PermissionFlagsBits.ManageGuild) ||
        member.roles?.cache?.some((r) =>
          /(moderator|mod|admin|owner|supervisor|high\s*rank|staff)/i.test(r.name)
        ));

    if (!isStaff) {
      await autoDeleteReply(message, '❌ You do not have permission to manage the ticket desk.', 30000);
      return;
    }

    if (raw === 'busy') {
      ticketDeskState.status = 'busy';
      saveTicketDeskState();
      await refreshAllTicketPanels(client);
      await autoDeleteReply(message, '🟠 Support desk status set to **Busy** (panel updated to yellow).', 30000);
      return;
    }

    if (raw === 'open' || raw === 'open all') {
      ticketDeskState.status = 'online';
      ticketDeskState.categories.general = true;
      ticketDeskState.categories.ia = true;
      ticketDeskState.categories.highrank = true;
      ticketDeskState.categories.partnership = true;
      ticketDeskState.categories.staff_partnership = true;
      saveTicketDeskState();
      await refreshAllTicketPanels(client);
      await autoDeleteReply(message, '🟢 Support desk is now **Online** and all categories are open (panel updated to green).', 30000);
      return;
    }

    if (raw === 'close all' || raw === 'close desk') {
      ticketDeskState.status = 'closed';
      ticketDeskState.categories.general = false;
      ticketDeskState.categories.ia = false;
      ticketDeskState.categories.highrank = false;
      ticketDeskState.categories.partnership = false;
      ticketDeskState.categories.staff_partnership = false;
      saveTicketDeskState();
      await refreshAllTicketPanels(client);
      await autoDeleteReply(message, '🔴 Support desk is now **Closed** (all ticket categories locked, panel updated to red).', 30000);
      return;
    }

    // Flexible -close <department>
    if (raw.startsWith('close ')) {
      const target = raw.slice(6).trim();
      if (/^general(\s*support)?$/i.test(target)) {
        ticketDeskState.categories.general = false;
        saveTicketDeskState();
        await refreshAllTicketPanels(client);
        await autoDeleteReply(message, '🔒 **General Support** is now closed.', 30000);
        return;
      }
      if (/^(internal(\s*affairs)?|internals|ia)$/i.test(target)) {
        ticketDeskState.categories.ia = false;
        saveTicketDeskState();
        await refreshAllTicketPanels(client);
        await autoDeleteReply(message, '🔒 **Internal Affairs Support** is now closed.', 30000);
        return;
      }
      if (/^(high\s*rank(\s*support)?|highrank|hr)$/i.test(target)) {
        ticketDeskState.categories.highrank = false;
        saveTicketDeskState();
        await refreshAllTicketPanels(client);
        await autoDeleteReply(message, '🔒 **High Rank Support** is now closed.', 30000);
        return;
      }
      if (/^staff\s*partner(ship)?$/i.test(target)) {
        ticketDeskState.categories.staff_partnership = false;
        saveTicketDeskState();
        await refreshAllTicketPanels(client);
        await autoDeleteReply(message, '🔒 **Staff Partnership** is now closed.', 30000);
        return;
      }
      if (/^partner(ship)?(\s*operations)?$/i.test(target)) {
        ticketDeskState.categories.partnership = false;
        saveTicketDeskState();
        await refreshAllTicketPanels(client);
        await autoDeleteReply(message, '🔒 **Partnership Operations** is now closed.', 30000);
        return;
      }
    }

    // Flexible -open <department>
    if (raw.startsWith('open ')) {
      const target = raw.slice(5).trim();
      if (/^general(\s*support)?$/i.test(target)) {
        ticketDeskState.categories.general = true;
        if (ticketDeskState.status === 'closed') ticketDeskState.status = 'online';
        saveTicketDeskState();
        await refreshAllTicketPanels(client);
        await autoDeleteReply(message, '🔓 **General Support** is now open.', 30000);
        return;
      }
      if (/^(internal(\s*affairs)?|internals|ia)$/i.test(target)) {
        ticketDeskState.categories.ia = true;
        if (ticketDeskState.status === 'closed') ticketDeskState.status = 'online';
        saveTicketDeskState();
        await refreshAllTicketPanels(client);
        await autoDeleteReply(message, '🔓 **Internal Affairs Support** is now open.', 30000);
        return;
      }
      if (/^(high\s*rank(\s*support)?|highrank|hr)$/i.test(target)) {
        ticketDeskState.categories.highrank = true;
        if (ticketDeskState.status === 'closed') ticketDeskState.status = 'online';
        saveTicketDeskState();
        await refreshAllTicketPanels(client);
        await autoDeleteReply(message, '🔓 **High Rank Support** is now open.', 30000);
        return;
      }
      if (/^staff\s*partner(ship)?$/i.test(target)) {
        ticketDeskState.categories.staff_partnership = true;
        if (ticketDeskState.status === 'closed') ticketDeskState.status = 'online';
        saveTicketDeskState();
        await refreshAllTicketPanels(client);
        await autoDeleteReply(message, '🔓 **Staff Partnership** is now open.', 30000);
        return;
      }
      if (/^partner(ship)?(\s*operations)?$/i.test(target)) {
        ticketDeskState.categories.partnership = true;
        if (ticketDeskState.status === 'closed') ticketDeskState.status = 'online';
        saveTicketDeskState();
        await refreshAllTicketPanels(client);
        await autoDeleteReply(message, '🔓 **Partnership Operations** is now open.', 30000);
        return;
      }
    }

    if (raw === 'status' || raw === 'ticket status' || raw === 'desk status') {
      const statusLabel =
        ticketDeskState.status === 'online'
          ? '🟢 Online'
          : ticketDeskState.status === 'busy'
            ? '🟠 Busy'
            : '🔴 Closed';
      const statusCard = new ContainerBuilder().setAccentColor(0x2b2d31);
      statusCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Ticket Desk Status'));
      statusCard.addSeparatorComponents(thinLine());
      statusCard.addSectionComponents(
        sectionRow('Desk Status', 'Current operational availability.', statusLabel, 'info_status_pill', ButtonStyle.Secondary)
      );
      statusCard.addSeparatorComponents(thinLine());
      statusCard.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `> • **General Support:** ${ticketDeskState.categories.general ? '🟢 Open' : '🔴 Closed'}\n` +
          `> • **Internal Affairs:** ${ticketDeskState.categories.ia ? '🟢 Open' : '🔴 Closed'}\n` +
          `> • **High Rank Support:** ${ticketDeskState.categories.highrank ? '🟢 Open' : '🔴 Closed'}\n` +
          `> • **Partnership:** ${ticketDeskState.categories.partnership !== false ? '🟢 Open' : '🔴 Closed'}\n` +
          `> • **Staff Partnership:** ${ticketDeskState.categories.staff_partnership !== false ? '🟢 Open' : '🔴 Closed'}`
        )
      );
      statusCard.addSeparatorComponents(thinLine());
      statusCard.addTextDisplayComponents(
        new TextDisplayBuilder().setContent('-# Auto-deleting in 30 seconds')
      );
      await autoDeleteReply(
        message,
        {
          components: [statusCard.toJSON()],
          flags: MessageFlags.IsComponentsV2
        },
        30000
      );
      return;
    }

    if (raw === 'retrigger' || raw === 'reboot') {
      await handleRetriggerCommand(message, false);
      return;
    }

    if (raw === 'commands' || raw === 'help' || raw === 'cmds') {
      await handleCommandsGuideCommand(message, false);
      return;
    }

    if (raw === 'ticket help' || raw === 'ticket commands') {
      const helpCard = new ContainerBuilder().setAccentColor(0x2b2d31);
      helpCard.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Ticket Desk Staff Commands'));
      helpCard.addSeparatorComponents(thinLine());
      helpCard.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `> Manage the ticket desk and department availability in real-time. Changes update the public panel immediately.\n\n` +
          `• \`-busy\` — Set desk status to **Busy** (panel turns yellow)\n` +
          `• \`-open\` or \`-open all\` — Set desk to **Online** and open all departments (panel turns green)\n` +
          `• \`-close all\` — Close desk and lock all departments (panel turns red)\n` +
          `• \`-close general\` / \`-open general\` — Lock / unlock General Support\n` +
          `• \`-close internal\` / \`-open internal\` — Lock / unlock Internal Affairs\n` +
          `• \`-close high rank\` / \`-open high rank\` — Lock / unlock High Rank\n` +
          `• \`-close partnership\` / \`-open partnership\` — Lock / unlock Partnership\n` +
          `• \`-close staff partnership\` / \`-open staff partnership\` — Lock / unlock Staff Partnership\n` +
          `• \`-add @user\` / \`-unadd @user\` — Add or remove a member from the active ticket\n` +
          `• \`-status\` — View current ticket desk status\n` +
          `• \`-ticket help\` — View this ticket desk guide\n` +
          `• \`-commands\` — View the complete server command directory`
        )
      );
      helpCard.addSeparatorComponents(thinLine());
      helpCard.addTextDisplayComponents(
        new TextDisplayBuilder().setContent('-# Auto-deleting in 30 seconds')
      );
      await autoDeleteReply(
        message,
        {
          components: [helpCard.toJSON()],
          flags: MessageFlags.IsComponentsV2
        },
        30000
      );
      return;
    }

    // ── Staff Moderation & Anti-Nuke Prefix Commands ──
    if (raw.startsWith('ban ') || raw === 'ban') {
      const parts = message.content.slice(1).trim().split(/\s+/);
      const targetUser = message.mentions.users.first() || (parts[1] ? await client.users.fetch(parts[1]).catch(() => null) : null);
      if (!targetUser) {
        await autoDeleteReply(message, '❌ Usage: `-ban @user [reason]`', 30000);
        return;
      }
      const reason = parts.slice(2).join(' ') || 'No reason provided';
      try {
        await message.guild.members.ban(targetUser.id, { reason: `${reason} (Issued by ${message.author.tag})` });
        const card = new ContainerBuilder().setAccentColor(0x2b2d31);
        card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🔨 Member Banned'));
        card.addSeparatorComponents(thinLine());
        card.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `> **User:** <@${targetUser.id}> (\`${targetUser.tag || targetUser.username}\` • \`${targetUser.id}\`)\n` +
            `> **Moderator:** <@${message.author.id}>\n` +
            `> **Reason:** ${reason}`
          )
        );
        await autoDeleteReply(message, { components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 }, 30000);
        await sendSecurityLog(message.guild, card);
      } catch (err) {
        await autoDeleteReply(message, `❌ Failed to ban: ${err.message}`, 30000);
      }
      return;
    }

    if (raw.startsWith('kick ') || raw === 'kick') {
      const parts = message.content.slice(1).trim().split(/\s+/);
      const targetUser = message.mentions.users.first() || (parts[1] ? await client.users.fetch(parts[1]).catch(() => null) : null);
      if (!targetUser) {
        await autoDeleteReply(message, '❌ Usage: `-kick @user [reason]`', 30000);
        return;
      }
      const reason = parts.slice(2).join(' ') || 'No reason provided';
      try {
        const targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) {
          await autoDeleteReply(message, '❌ Member not found in server.', 30000);
          return;
        }
        await targetMember.kick(`${reason} (Issued by ${message.author.tag})`);
        const card = new ContainerBuilder().setAccentColor(0x2b2d31);
        card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 👢 Member Kicked'));
        card.addSeparatorComponents(thinLine());
        card.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `> **User:** <@${targetUser.id}> (\`${targetUser.tag || targetUser.username}\` • \`${targetUser.id}\`)\n` +
            `> **Moderator:** <@${message.author.id}>\n` +
            `> **Reason:** ${reason}`
          )
        );
        await autoDeleteReply(message, { components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 }, 30000);
        await sendSecurityLog(message.guild, card);
      } catch (err) {
        await autoDeleteReply(message, `❌ Failed to kick: ${err.message}`, 30000);
      }
      return;
    }

    if (raw.startsWith('timeout ') || raw === 'timeout') {
      const parts = message.content.slice(1).trim().split(/\s+/);
      const targetUser = message.mentions.users.first() || (parts[1] ? await client.users.fetch(parts[1]).catch(() => null) : null);
      const durationStr = parts[2] || '5m';
      const reason = parts.slice(3).join(' ') || 'No reason provided';
      if (!targetUser) {
        await autoDeleteReply(message, '❌ Usage: `-timeout @user [duration: e.g. 5m, 1h] [reason]`', 30000);
        return;
      }
      const durations = { '60s': 60000, '5m': 300000, '10m': 600000, '1h': 3600000, '1d': 86400000, '1w': 604800000 };
      const durationMs = durations[durationStr] || 300000;
      try {
        const targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) {
          await autoDeleteReply(message, '❌ Member not found in server.', 30000);
          return;
        }
        await targetMember.timeout(durationMs, `${reason} (Issued by ${message.author.tag})`);
        const card = new ContainerBuilder().setAccentColor(0x2b2d31);
        card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Member Timed Out'));
        card.addSeparatorComponents(thinLine());
        card.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `> **User:** <@${targetUser.id}> (\`${targetUser.tag || targetUser.username}\` • \`${targetUser.id}\`)\n` +
            `> **Duration:** \`${durationStr}\`\n` +
            `> **Moderator:** <@${message.author.id}>\n` +
            `> **Reason:** ${reason}`
          )
        );
        await autoDeleteReply(message, { components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 }, 30000);
        await sendSecurityLog(message.guild, card);
      } catch (err) {
        await autoDeleteReply(message, `❌ Failed to timeout: ${err.message}`, 30000);
      }
      return;
    }

    if (raw.startsWith('purge ') || raw === 'purge') {
      const parts = message.content.slice(1).trim().split(/\s+/);
      const amount = Math.min(Math.max(parseInt(parts[1], 10) || 10, 1), 100);
      try {
        await message.delete().catch(() => null);
        const fetched = await message.channel.messages.fetch({ limit: amount });
        const deleted = await message.channel.bulkDelete(fetched, true);
        const card = new ContainerBuilder().setAccentColor(0x2b2d31);
        card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🧹 Messages Purged'));
        card.addSeparatorComponents(thinLine());
        card.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `> **Channel:** <#${message.channelId}>\n` +
            `> **Amount:** **${deleted.size}** messages\n` +
            `> **Moderator:** <@${message.author.id}>`
          )
        );
        const rep = await message.channel.send({ components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 });
        setTimeout(() => rep.delete().catch(() => null), 15000);
        await sendSecurityLog(message.guild, card);
      } catch (err) {
        const errRep = await message.channel.send(`❌ Failed to purge: ${err.message}`);
        setTimeout(() => errRep.delete().catch(() => null), 15000);
      }
      return;
    }

    if (raw.startsWith('antinuke') || raw === 'anti-nuke') {
      const parts = message.content.slice(1).trim().split(/\s+/);
      const action = parts[1]?.toLowerCase() || 'status';
      if (action === 'status') {
        const card = new ContainerBuilder().setAccentColor(0x2b2d31);
        card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🛡️ Anti-Nuke Defense Status'));
        card.addSeparatorComponents(thinLine());
        card.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `> **System Status:** 🟢 **Active & Armed**\n` +
            `> **Security Log Channel:** <#${ANTINUKE_CONFIG.logChannelId}>\n` +
            `> **Channel Backup Cache:** ${channelBackupCache.size} channels indexed\n` +
            `> **Role Backup Cache:** ${roleBackupCache.size} roles indexed\n` +
            `> **Deleted Channels in Cache:** ${recentlyDeletedChannels.size}\n` +
            `> **Deleted Roles in Cache:** ${recentlyDeletedRoles.size}\n` +
            `> **Quarantined Actors:** ${strippedMemberRoles.size}\n\n` +
            `**Alert Routing:**\n` +
            `• **Minor Activity (2 deletions):** Alerts Deputy Director & Assistant Director\n` +
            `• **Critical Mass Nuke (4+ deletions / mass bans):** Instant role strip, 28-day quarantine, alerts Director, Deputy, Assistant, Executive.`
          )
        );
        await autoDeleteReply(message, { components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 }, 30000);
        return;
      }
      if (action === 'snapshot') {
        await backupGuildState(message.guild);
        await autoDeleteReply(message, `✅ **Snapshot Complete:** Indexed **${channelBackupCache.size}** channels and **${roleBackupCache.size}** roles for automatic restoration.`, 30000);
        return;
      }
    }

    // ── In-Game ER:LC Staff Moderation Prefix Commands ──
    if (isStaffMember(message.member)) {
      if (raw.startsWith('pm ') || raw.startsWith('erlc pm ')) {
        const afterCmd = raw.startsWith('erlc pm ') ? message.content.slice(9).trim() : message.content.slice(4).trim();
        const parts = afterCmd.split(/\s+/);
        const player = parts[0];
        const rawMsg = parts.slice(1).join(' ');
        if (!player || !rawMsg) {
          await autoDeleteReply(message, '❌ Usage: `-pm <roblox_username> <message>`', 30000);
          return;
        }
        const cleanMsg = sanitizeRobloxMessage(rawMsg);
        const res = await sendErlcCommand(`:pm ${player} ${cleanMsg}`);
        if (!res.ok) {
          await autoDeleteReply(message, `❌ Failed to send PM to \`${player}\`: ${res.error}`, 30000);
          return;
        }
        const card = new ContainerBuilder().setAccentColor(0x2b2d31);
        card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 📨 In-Game Private Message Sent'));
        card.addSeparatorComponents(thinLine());
        card.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `> **Target Player:** \`${player}\`\n` +
            `> **Moderator:** <@${message.author.id}>\n` +
            `> **Message:** ${cleanMsg}\n` +
            `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>`
          )
        );
        await autoDeleteReply(message, { components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 }, 30000);
        await sendGameLog(message.guild, card);
        await sendSecurityLog(message.guild, card);
        return;
      }

      if (raw.startsWith('jail ') || raw.startsWith('erlc jail ')) {
        const parts = message.content.slice(1).trim().split(/\s+/);
        const player = parts[0].toLowerCase() === 'erlc' ? parts[2] : parts[1];
        if (!player) {
          await autoDeleteReply(message, '❌ Usage: `-jail <roblox_username>`', 30000);
          return;
        }
        const res = await sendErlcCommand(`:jail ${player}`);
        if (!res.ok) {
          await autoDeleteReply(message, `❌ Failed to jail \`${player}\`: ${res.error}`, 30000);
          return;
        }
        const card = new ContainerBuilder().setAccentColor(0x2b2d31);
        card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🔒 Player Jailed In-Game'));
        card.addSeparatorComponents(thinLine());
        card.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `> **Target Player:** \`${player}\`\n` +
            `> **Moderator:** <@${message.author.id}>\n` +
            `> **Action:** In-game jail executed\n` +
            `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>`
          )
        );
        await autoDeleteReply(message, { components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 }, 30000);
        await sendGameLog(message.guild, card);
        await sendSecurityLog(message.guild, card);
        return;
      }

      if (raw.startsWith('unjail ') || raw.startsWith('erlc unjail ')) {
        const parts = message.content.slice(1).trim().split(/\s+/);
        const player = parts[0].toLowerCase() === 'erlc' ? parts[2] : parts[1];
        if (!player) {
          await autoDeleteReply(message, '❌ Usage: `-unjail <roblox_username>`', 30000);
          return;
        }
        const res = await sendErlcCommand(`:unjail ${player}`);
        if (!res.ok) {
          await autoDeleteReply(message, `❌ Failed to unjail \`${player}\`: ${res.error}`, 30000);
          return;
        }
        const card = new ContainerBuilder().setAccentColor(0x2b2d31);
        card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🔓 Player Unjailed In-Game'));
        card.addSeparatorComponents(thinLine());
        card.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `> **Target Player:** \`${player}\`\n` +
            `> **Moderator:** <@${message.author.id}>\n` +
            `> **Action:** In-game unjail executed\n` +
            `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>`
          )
        );
        await autoDeleteReply(message, { components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 }, 30000);
        await sendGameLog(message.guild, card);
        await sendSecurityLog(message.guild, card);
        return;
      }

      if (raw.startsWith('unban ') || raw.startsWith('erlc unban ')) {
        const parts = message.content.slice(1).trim().split(/\s+/);
        const target = parts[0].toLowerCase() === 'erlc' ? parts[2] : parts[1];
        if (!target) {
          await autoDeleteReply(message, '❌ Usage: `-unban <roblox_username | discord_user_id>`', 30000);
          return;
        }
        clearAllPlayerPenalties(target);
        let discordUnbanned = false;
        let inGameUnbanned = false;
        const details = [];

        if (/^\d{17,20}$/.test(target) || message.mentions.users.first()) {
          const uid = message.mentions.users.first()?.id || target;
          try {
            await message.guild.members.unban(uid, `Unbanned by ${message.author.tag}`);
            discordUnbanned = true;
            details.push(`• **Discord Server:** Unbanned <@${uid}> (\`${uid}\`)`);
          } catch (dErr) {
            details.push(`• **Discord Server:** Could not unban (${dErr.message})`);
          }
        }

        const erlcRes = await sendErlcCommand(`:unban ${target}`);
        if (erlcRes.ok) {
          inGameUnbanned = true;
          details.push(`• **ER:LC In-Game:** Unban command \`:unban ${target}\` executed.`);
        } else {
          details.push(`• **ER:LC In-Game:** ${erlcRes.error || 'Failed to send'}`);
        }

        const card = new ContainerBuilder().setAccentColor(0x2b2d31);
        card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🤝 Member / Player Unbanned'));
        card.addSeparatorComponents(thinLine());
        card.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `> **Target:** \`${target}\`\n` +
            `> **Moderator:** <@${message.author.id}>\n\n` +
            details.join('\n') + `\n\n` +
            `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>`
          )
        );
        await autoDeleteReply(message, { components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 }, 30000);
        if (inGameUnbanned) await sendGameLog(message.guild, card);
        await sendSecurityLog(message.guild, card);
        return;
      }

      if (raw.startsWith('gameban ') || raw.startsWith('erlc ban ')) {
        const afterCmd = raw.startsWith('erlc ban ') ? message.content.slice(10).trim() : message.content.slice(9).trim();
        const parts = afterCmd.split(/\s+/);
        const player = parts[0];
        const duration = parts[1] || '24h';
        const reason = parts.slice(2).join(' ') || 'Staff Moderation';
        if (!player) {
          await autoDeleteReply(message, '❌ Usage: `-gameban <roblox_username> [duration] [reason]`', 30000);
          return;
        }
        const res = await sendErlcCommand(`:ban ${player} ${duration} ${reason}`);
        if (!res.ok) {
          await autoDeleteReply(message, `❌ Failed to ban \`${player}\`: ${res.error}`, 30000);
          return;
        }
        const card = new ContainerBuilder().setAccentColor(0x2b2d31);
        card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🔨 Player Banned In-Game'));
        card.addSeparatorComponents(thinLine());
        card.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `> **Target Player:** \`${player}\`\n` +
            `> **Moderator:** <@${message.author.id}>\n` +
            `> **Duration:** \`${duration}\`\n` +
            `> **Reason:** ${reason}\n` +
            `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>`
          )
        );
        await autoDeleteReply(message, { components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 }, 30000);
        await sendGameLog(message.guild, card);
        await sendSecurityLog(message.guild, card);
        return;
      }

      if (raw.startsWith('gamekick ') || raw.startsWith('erlc kick ')) {
        const afterCmd = raw.startsWith('erlc kick ') ? message.content.slice(11).trim() : message.content.slice(10).trim();
        const parts = afterCmd.split(/\s+/);
        const player = parts[0];
        const reason = parts.slice(1).join(' ') || 'Staff Moderation';
        if (!player) {
          await autoDeleteReply(message, '❌ Usage: `-gamekick <roblox_username> [reason]`', 30000);
          return;
        }
        const res = await sendErlcCommand(`:kick ${player} ${reason}`);
        if (!res.ok) {
          await autoDeleteReply(message, `❌ Failed to kick \`${player}\`: ${res.error}`, 30000);
          return;
        }
        const card = new ContainerBuilder().setAccentColor(0x2b2d31);
        card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 👢 Player Kicked In-Game'));
        card.addSeparatorComponents(thinLine());
        card.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `> **Target Player:** \`${player}\`\n` +
            `> **Moderator:** <@${message.author.id}>\n` +
            `> **Reason:** ${reason}\n` +
            `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>`
          )
        );
        await autoDeleteReply(message, { components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 }, 30000);
        await sendGameLog(message.guild, card);
        await sendSecurityLog(message.guild, card);
        return;
      }

      if (raw.startsWith('m ') || raw.startsWith('broadcast ')) {
        const text = raw.startsWith('broadcast ') ? message.content.slice(11).trim() : message.content.slice(3).trim();
        if (!text) {
          await autoDeleteReply(message, '❌ Usage: `-m <broadcast_text>`', 30000);
          return;
        }
        const cleanMsg = sanitizeRobloxMessage(text);
        const res = await sendErlcCommand(`:m ${cleanMsg}`);
        if (!res.ok) {
          await autoDeleteReply(message, `❌ Failed to send announcement: ${res.error}`, 30000);
          return;
        }
        const card = new ContainerBuilder().setAccentColor(0x2b2d31);
        card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 📢 In-Game Broadcast Sent'));
        card.addSeparatorComponents(thinLine());
        card.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `> **Moderator:** <@${message.author.id}>\n` +
            `> **Announcement:** ${cleanMsg}\n` +
            `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>`
          )
        );
        await autoDeleteReply(message, { components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 }, 30000);
        await sendGameLog(message.guild, card);
        await sendSecurityLog(message.guild, card);
        return;
      }

      if (raw.startsWith('h ') || raw.startsWith('hint ')) {
        const text = raw.startsWith('hint ') ? message.content.slice(6).trim() : message.content.slice(3).trim();
        if (!text) {
          await autoDeleteReply(message, '❌ Usage: `-h <hint_text>`', 30000);
          return;
        }
        const cleanMsg = sanitizeRobloxMessage(text);
        const res = await sendErlcCommand(`:h ${cleanMsg}`);
        if (!res.ok) {
          await autoDeleteReply(message, `❌ Failed to send hint: ${res.error}`, 30000);
          return;
        }
        const card = new ContainerBuilder().setAccentColor(0x2b2d31);
        card.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 💡 In-Game Top Hint Sent'));
        card.addSeparatorComponents(thinLine());
        card.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `> **Moderator:** <@${message.author.id}>\n` +
            `> **Hint:** ${cleanMsg}\n` +
            `> **Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>`
          )
        );
        await autoDeleteReply(message, { components: [card.toJSON()], flags: MessageFlags.IsComponentsV2 }, 30000);
        await sendGameLog(message.guild, card);
        await sendSecurityLog(message.guild, card);
        return;
      }

      if (raw.startsWith('sz ') || raw.startsWith('safezone ')) {
        const parts = message.content.slice(1).trim().split(/\s+/);
        // e.g. -sz <player> [reason...] or -sz status <player> or -sz clear <player>
        if (parts.length < 2) {
          await autoDeleteReply(message, '❌ Usage: `-sz <player> [reason]` or `-sz status <player>` or `-sz clear <player>`', 30000);
          return;
        }
        if (parts[1].toLowerCase() === 'status') {
          const player = parts[2];
          if (!player) {
            await autoDeleteReply(message, '❌ Usage: `-sz status <player>`', 30000);
            return;
          }
          const rec = safeZoneStrikes.get(player.toLowerCase());
          const count = rec ? rec.strikes : 0;
          await autoDeleteReply(message, `ℹ️ **Safe Zone Status for ${player}:** **${count}** strike(s).`, 30000);
          return;
        }
        if (parts[1].toLowerCase() === 'clear') {
          const player = parts[2];
          if (!player) {
            await autoDeleteReply(message, '❌ Usage: `-sz clear <player>`', 30000);
            return;
          }
          safeZoneStrikes.delete(player.toLowerCase());
          saveSafeZoneStrikes();
          await autoDeleteReply(message, `✅ Cleared all Safe Zone strikes for **${player}**.`, 30000);
          return;
        }

        const player = parts[1];
        const reason = parts.slice(2).join(' ') || 'Shooting in Safe Zone Area';
        const res = await handleSafeZoneStrike(message.client, player, message.author, reason);
        if (res.action === 'warn_jail') {
          await autoDeleteReply(message, `⚠️ **Strike 1** applied to \`${player}\`! PM warning sent + jailed in-game.`, 30000);
        } else if (res.action === 'kick') {
          await autoDeleteReply(message, `👢 **Strike 2** applied to \`${player}\`! Final warning sent + kicked from server.`, 30000);
        } else {
          await autoDeleteReply(message, `🔨 **Strike 3** applied to \`${player}\`! Permanently banned from the private server.`, 30000);
        }
        return;
      }
    }
  } catch (err) {
    console.error('Error in MessageCreate prefix command:', err.message);
  }
});

async function buildSessionPayload() {
  const stats = await fetchServerStats();
  return {
    // Components V2 single-card payload - NO legacy embeds field.
    components: [buildContainer(stats).toJSON()],
    flags: MessageFlags.IsComponentsV2
  };
}

if (!process.env.SKIP_LOGIN) {
  // Only log in when this file is the actual entry point -
  // importing it from dry.mjs / verify.mjs must NEVER start a 2nd bot
  // (that 2nd login is what stole your commands + froze updates).
  const entry = process.argv[1] ? path.resolve(process.argv[1]).replace(/\\/g, '/') : '';
  const self = fileURLToPath(import.meta.url).replace(/\\/g, '/');
  if (entry.endsWith('/src/index.js') && (entry === self || path.resolve(entry) === path.resolve(self))) {
    client.login(config.token);
  }
}

// ═════════════════════ Railway / Web Healthcheck Server ═════════════════════
const PORT = process.env.PORT || process.env.WEB_PORT;
if (PORT) {
  try {
    const healthServer = http.createServer((req, res) => {
      if (req.url === '/health' || req.url === '/' || req.url === '/ping') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'online',
            service: 'Alabama State Roleplay Utilities',
            bot: client?.user?.tag || 'connecting',
            ping: client?.ws?.ping ?? -1,
            uptimeSec: Math.floor(process.uptime()),
            timestamp: new Date().toISOString()
          })
        );
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    healthServer.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`[Railway Web Server] Healthcheck listening on port ${PORT}`);
    });
  } catch (srvErr) {
    console.warn(`[Railway Web Server] Could not start health server: ${srvErr.message}`);
  }
}

// Graceful shutdown handling for Railway container lifecycle
function handleGracefulShutdown(signal) {
  console.log(`[Process] Received ${signal}. Saving data stores...`);
  try {
    saveTickets();
    saveTicketDeskState();
    saveTicketPanels();
    saveSafeZoneStrikes();
    saveSuggestions();
    savePanels();
    saveVotes();
  } catch (saveErr) {
    console.error(`[Process] Error saving state during shutdown: ${saveErr.message}`);
  }
  if (client) {
    try {
      client.destroy();
    } catch { }
  }
  process.exit(0);
}

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

// Exposed for automated smoke tests; harmless in production.
export {
  buildSessionText,
  buildContainer,
  buildVoteContainer,
  buildShutdownNotice,
  buildSessionClosedDM,
  buildSessionPayload,
  fetchServerStats,
  serverStatus,
  sessionCommand,
  ticketCommand,
  staffCommand,
  proofCommand,
  STAFF_CONFIG,
  buildPromotionContainer,
  buildDerankContainer,
  TICKET_CONFIG,
  buildTicketPanelContainer,
  buildTicketControlContainer,
  toggleVoter,
  applyPostpone,
  activeVotes,
  saveVotes,
  loadVotes,
  banCommand,
  kickCommand,
  timeoutCommand,
  purgeCommand,
  antiNukeCommand,
  ANTINUKE_CONFIG,
  backupGuildState,
  handleAntiNukeTrigger,
  handleAntiNukeButton,
  verifyCommand,
  erlcCommand,
  jailCommand,
  unjailCommand,
  unbanCommand,
  sendGameLog,
  sendSecurityLog,
  buildVerificationContainer,
  safezoneCommand,
  handleSafeZoneStrike,
  suggestionCommand,
  suggestCommand,
  activeSuggestions,
  saveSuggestions,
  loadSuggestions,
  retriggerCommand,
  commandsCommand,
  addCommand,
  unaddCommand,
  handleRetriggerCommand,
  buildCommandsGuidePage
};