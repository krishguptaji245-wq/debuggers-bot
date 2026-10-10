import fs from 'fs';
import path from 'path';
import http from 'http';

// Render Web Service ke liye port bind karna zaroori hai
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('🤖 Debuggers Club Telegram Bot is LIVE 24/7 on Render!\n');
}).listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

// Telegram Bot Token
const BOT_TOKEN = process.argv[2] || process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('\n❌ ERROR: Telegram Bot Token is required!');
  console.log('Usage: node bot.js <YOUR_TELEGRAM_BOT_TOKEN>\n');
  process.exit(1);
}

const DATA_FILE = path.resolve(process.cwd(), 'debugger_club_data.json');
let adminPasscode = 'DEBUGGER2026';

const defaultData = {
  events: [
    {
      id: 'evt-01',
      title: 'Code Wars 2026: The Bug Hunt Championship',
      date: 'Oct 24, 2026 • 04:30 PM IST',
      venue: 'Computer Science Lab 3 & Online Discord',
      description: 'Solve real-world memory leaks, race conditions, and algorithmic edge cases under time pressure.',
      category: 'Contest',
      capacity: 60,
      registeredCount: 38,
      status: 'upcoming',
    },
    {
      id: 'evt-02',
      title: 'Full-Stack Modern Web & Cloud Architecture Workshop',
      date: 'Nov 02, 2026 • 02:00 PM IST',
      venue: 'Auditorium Hall A (Live Streamed)',
      description: 'Hands-on session building high-scale real-time web applications, containerization, and cloud deployments.',
      category: 'Workshop',
      capacity: 100,
      registeredCount: 65,
      status: 'upcoming',
    },
    {
      id: 'evt-03',
      title: 'HackDebug 36-Hour Hackathon',
      date: 'Nov 18, 2026 • 09:00 AM IST',
      venue: 'Innovation Hub Innovation Center',
      description: 'Flagship 36-hour hackathon of Debuggers Club with tracks in AI, Developer Tools, and Web3.',
      category: 'Hackathon',
      capacity: 150,
      registeredCount: 92,
      status: 'upcoming',
    },
  ],
  registrations: [],
  organizers: [
    {
      telegramUserId: '1001001',
      username: 'lead_debugger',
      fullName: 'Club Lead Admin',
      role: 'lead',
    },
  ],
};

let db = { ...defaultData };
if (fs.existsSync(DATA_FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (e) {
    db = { ...defaultData };
  }
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Save error:', err);
  }
}

const userSessions = new Map();

async function tg(method, body = {}) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return await res.json();
}

function isOrganizer(userId) {
  const str = String(userId);
  return db.organizers.some((o) => String(o.telegramUserId) === str);
}

async function setupCommands() {
  const commands = [
    { command: 'events', description: 'Browse upcoming events and register' },
    { command: 'newevent', description: '(Organizers) Create an event' },
    { command: 'participants', description: '(Organizers) View registrations' },
    { command: 'deleteevent', description: '(Organizers) Delete an event' },
    { command: 'makeadmin', description: 'Become the first organizer' },
    { command: 'cancel', description: 'Cancel current action' },
    { command: 'help', description: 'Show help' },
  ];

  try {
    const res = await tg('setMyCommands', { commands });
    if (res.ok) {
      console.log('✅ Registered all commands in Telegram menu!');
    }
  } catch (e) {
    // ignore
  }
}

async function handleMessage(msg) {
  if (!msg || !msg.text || !msg.from) return;

  const chatId = msg.chat.id;
  const userId = String(msg.from.id);
  const fullName = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ') || 'Developer';
  const username = msg.from.username || '';
  const text = msg.text.trim();

  console.log(`[MSG] @${username || userId} (${fullName}): ${text}`);

  if (text === '/cancel' || text.toLowerCase() === 'cancel') {
    userSessions.delete(userId);
    return tg('sendMessage', {
      chat_id: chatId,
      text: '❌ *Action Cancelled*\n\nType `/events` to explore club events or `/help` for commands.',
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📅 Upcoming Events', callback_data: 'cmd_events' }],
          [{ text: 'ℹ️ Show Help', callback_data: 'cmd_help' }],
        ],
      },
    });
  }

  const session = userSessions.get(userId);
  if (session && session.step) {
    return handleSessionStep(chatId, userId, fullName, username, text, session);
  }

  const cmd = text.split(' ')[0].toLowerCase().split('@')[0];

  switch (cmd) {
    case '/start':
      return tg('sendMessage', {
        chat_id: chatId,
        text:
          `🚀 *Welcome to Debuggers' Club!* 💻\n\n` +
          `Hey *${fullName}*! Welcome to the official bot of *Debuggers' Club*.\n\n` +
          `📌 *Available Commands:*\n` +
          `• \`/events\` — Browse upcoming events & register\n` +
          `• \`/help\` — View guide\n` +
          `• \`/makeadmin\` — Claim organizer role\n\n` +
          `Use the buttons below to begin:`,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📅 Browse Upcoming Events', callback_data: 'cmd_events' }],
            [
              { text: 'ℹ️ Help Menu', callback_data: 'cmd_help' },
              { text: isOrganizer(userId) ? '👑 Organizer Area' : '🛡 Claim Admin', callback_data: isOrganizer(userId) ? 'cmd_participants' : 'cmd_makeadmin' },
            ],
          ],
        },
      });

    case '/events':
      return sendEventsList(chatId, userId);

    case '/newevent':
      if (!isOrganizer(userId)) {
        return tg('sendMessage', {
          chat_id: chatId,
          text: `⛔ *Access Denied: Organizers Only*\n\nOnly verified Debuggers' Club organizers can create events.\nUse \`/makeadmin\` to authenticate.`,
          parse_mode: 'Markdown',
        });
      }
      userSessions.set(userId, { step: 'title', data: {} });
      return tg('sendMessage', {
        chat_id: chatId,
        text: `✨ *Create New Event (Step 1/4)*\n\nPlease enter the *Title* of your event (or \`/cancel\`):`,
        parse_mode: 'Markdown',
      });

    case '/participants':
      if (!isOrganizer(userId)) {
        return tg('sendMessage', {
          chat_id: chatId,
          text: `⛔ *Access Denied: Organizers Only*\n\nOnly organizers can view attendee rosters.`,
          parse_mode: 'Markdown',
        });
      }
      const buttons = db.events.map((e) => [
        { text: `👥 ${e.title.substring(0, 28)} (${e.registeredCount})`, callback_data: `part_${e.id}` },
      ]);
      return tg('sendMessage', {
        chat_id: chatId,
        text: `📋 *Select Event to View Registrations:*`,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons },
      });

    case '/deleteevent':
      if (!isOrganizer(userId)) {
        return tg('sendMessage', {
          chat_id: chatId,
          text: `⛔ *Access Denied: Organizers Only*`,
          parse_mode: 'Markdown',
        });
      }
      const delButtons = db.events.map((e) => [
        { text: `🗑 Delete: ${e.title.substring(0, 26)}`, callback_data: `del_${e.id}` },
      ]);
      return tg('sendMessage', {
        chat_id: chatId,
        text: `⚠️ *Delete Event*\n\nSelect which event to delete:`,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: delButtons },
      });

    case '/makeadmin':
      if (isOrganizer(userId)) {
        return tg('sendMessage', {
          chat_id: chatId,
          text: `👑 *You are already a Debuggers' Club organizer!*`,
          parse_mode: 'Markdown',
        });
      }
      const parts = text.split(' ');
      if (parts.length > 1 && parts[1].trim() === adminPasscode) {
        db.organizers.push({
          telegramUserId: userId,
          username,
          fullName,
          role: 'organizer',
        });
        saveData();
        return tg('sendMessage', {
          chat_id: chatId,
          text: `✅ *Passcode Verified!* You are now an organizer for Debuggers' Club!`,
          parse_mode: 'Markdown',
        });
      }
      userSessions.set(userId, { step: 'passcode' });
      return tg('sendMessage', {
        chat_id: chatId,
        text: `🔐 *Organizer Verification*\n\nPlease reply with the Admin Passcode (Default: \`${adminPasscode}\`):`,
        parse_mode: 'Markdown',
      });

    case '/help':
      return tg('sendMessage', {
        chat_id: chatId,
        text:
          `🛠 *Debuggers' Club Bot — Command Menu*\n\n` +
          `• \`/events\` — Browse upcoming events and register\n` +
          `• \`/newevent\` — (Organizers) Create an event\n` +
          `• \`/participants\` — (Organizers) View registrations\n` +
          `• \`/deleteevent\` — (Organizers) Delete an event\n` +
          `• \`/makeadmin\` — Become the first organizer\n` +
          `• \`/cancel\` — Cancel current action\n` +
          `• \`/help\` — Show help`,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📅 Upcoming Events', callback_data: 'cmd_events' }],
            [{ text: '👑 Organizer Mode', callback_data: 'cmd_makeadmin' }],
          ],
        },
      });

    default:
      if (cmd.startsWith('/register_')) {
        const evtId = cmd.replace('/register_', '');
        return registerUser(chatId, userId, fullName, username, evtId);
      }
      return tg('sendMessage', {
        chat_id: chatId,
        text: `Type \`/events\` to explore club events or \`/help\` for commands.`,
      });
  }
}

async function handleSessionStep(chatId, userId, fullName, username, text, session) {
  if (session.step === 'passcode') {
    if (text.trim() === adminPasscode) {
      userSessions.delete(userId);
      db.organizers.push({ telegramUserId: userId, username, fullName, role: 'organizer' });
      saveData();
      return tg('sendMessage', {
        chat_id: chatId,
        text: `✅ *Passcode Verified!*\n\nYou are now an organizer! You can now use \`/newevent\`, \`/participants\`, and \`/deleteevent\`.`,
        parse_mode: 'Markdown',
      });
    } else {
      return tg('sendMessage', {
        chat_id: chatId,
        text: `❌ Incorrect passcode. Try again or type \`/cancel\`.`,
      });
    }
  }

  if (session.step === 'title') {
    session.data.title = text;
    session.step = 'date';
    return tg('sendMessage', {
      chat_id: chatId,
      text: `🗓 *Step 2/4*: Please enter *Date & Time* (e.g. \`Nov 10, 2026 • 05:00 PM IST\`):`,
      parse_mode: 'Markdown',
    });
  }

  if (session.step === 'date') {
    session.data.date = text;
    session.step = 'venue';
    return tg('sendMessage', {
      chat_id: chatId,
      text: `📍 *Step 3/4*: Enter *Venue or Online Link* (e.g. \`Lab 3 & Discord\`):`,
      parse_mode: 'Markdown',
    });
  }

  if (session.step === 'venue') {
    session.data.venue = text;
    session.step = 'description';
    return tg('sendMessage', {
      chat_id: chatId,
      text: `📝 *Step 4/4*: Enter a brief *Description and Capacity* (e.g. \`Hands-on coding! Capacity: 75\`):`,
      parse_mode: 'Markdown',
    });
  }

  if (session.step === 'description') {
    const match = text.match(/(\d+)/);
    const capacity = match ? parseInt(match[1], 10) : 60;
    const newEvent = {
      id: 'evt-' + Date.now(),
      title: session.data.title,
      date: session.data.date,
      venue: session.data.venue,
      description: text,
      category: 'Workshop',
      capacity,
      registeredCount: 0,
      status: 'upcoming',
    };
    db.events.unshift(newEvent);
    saveData();
    userSessions.delete(userId);

    return tg('sendMessage', {
      chat_id: chatId,
      text: `🎉 *Event Created Successfully!*\n\n📌 *${newEvent.title}*\n🗓 ${newEvent.date}\n📍 ${newEvent.venue}\n👥 Capacity: ${newEvent.capacity}\n\nLive for registrations via \`/events\`!`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '📅 View in /events', callback_data: 'cmd_events' }]],
      },
    });
  }
}

async function sendEventsList(chatId, userId) {
  if (db.events.length === 0) {
    return tg('sendMessage', {
      chat_id: chatId,
      text: `📅 *Upcoming Events*\n\nNo upcoming events right now. Check back soon!`,
      parse_mode: 'Markdown',
    });
  }

  let text = `📅 *Debuggers' Club Upcoming Events (${db.events.length})*\n\n`;
  const keyboard = [];

  db.events.forEach((evt, idx) => {
    const isReg = db.registrations.some((r) => r.eventId === evt.id && r.telegramUserId === String(userId));
    const spotsLeft = Math.max(0, evt.capacity - evt.registeredCount);

    text += `*${idx + 1}. ${evt.title}*\n`;
    text += `🏷 *Type*: ${evt.category}\n`;
    text += `🗓 *Date*: ${evt.date}\n`;
    text += `📍 *Venue*: ${evt.venue}\n`;
    text += `👥 *Seats*: ${evt.registeredCount}/${evt.capacity} (${spotsLeft > 0 ? `${spotsLeft} left` : 'FULL'})\n`;
    text += `📝 ${evt.description}\n`;
    text += `${isReg ? '✅ *You are registered!*' : '👉 Tap button below to register.'}\n\n`;

    if (isReg) {
      keyboard.push([{ text: `✅ Registered: ${evt.title.substring(0, 22)}...`, callback_data: 'noop' }]);
    } else if (spotsLeft > 0) {
      keyboard.push([{ text: `🎟 Register for ${evt.title.substring(0, 20)}...`, callback_data: `reg_${evt.id}` }]);
    }
  });

  return tg('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function registerUser(chatId, userId, fullName, username, eventId) {
  const evt = db.events.find((e) => e.id === eventId);
  if (!evt) {
    return tg('sendMessage', { chat_id: chatId, text: '❌ Event not found.' });
  }

  const existing = db.registrations.find((r) => r.eventId === eventId && r.telegramUserId === String(userId));
  if (existing) {
    return tg('sendMessage', {
      chat_id: chatId,
      text: `✅ You are already registered for *${evt.title}*! (Ticket: \`${existing.id}\`)`,
      parse_mode: 'Markdown',
    });
  }

  const newReg = {
    id: 'reg-' + Date.now().toString(36),
    eventId: evt.id,
    eventTitle: evt.title,
    telegramUserId: String(userId),
    telegramUsername: username,
    fullName,
    registeredAt: new Date().toISOString(),
  };

  db.registrations.push(newReg);
  evt.registeredCount++;
  saveData();

  return tg('sendMessage', {
    chat_id: chatId,
    text:
      `🎉 *Registration Confirmed!*\n\n` +
      `📌 *${evt.title}*\n` +
      `🗓 ${evt.date}\n` +
      `📍 ${evt.venue}\n` +
      `🆔 Ticket ID: \`${newReg.id}\`\n\n` +
      `See you there! Happy Debugging! 🐛⚡`,
    parse_mode: 'Markdown',
  });
}

async function handleCallback(cb) {
  const chatId = cb.message?.chat.id;
  const userId = String(cb.from.id);
  const fullName = [cb.from.first_name, cb.from.last_name].filter(Boolean).join(' ') || 'Developer';
  const username = cb.from.username || '';
  const data = cb.data;

  await tg('answerCallbackQuery', { callback_query_id: cb.id });

  if (data === 'cmd_events') return sendEventsList(chatId, userId);
  if (data === 'cmd_help') {
    return tg('sendMessage', {
      chat_id: chatId,
      text: `🛠 *Debuggers' Club Bot*\n\nType \`/events\` to browse events or \`/help\` for commands.`,
      parse_mode: 'Markdown',
    });
  }
  if (data === 'cmd_makeadmin') {
    userSessions.set(userId, { step: 'passcode' });
    return tg('sendMessage', {
      chat_id: chatId,
      text: `🔐 Please enter the admin passcode:`,
    });
  }
  if (data.startsWith('reg_')) {
    const evtId = data.replace('reg_', '');
    return registerUser(chatId, userId, fullName, username, evtId);
  }
  if (data.startsWith('part_')) {
    const evtId = data.replace('part_', '');
    const evt = db.events.find((e) => e.id === evtId);
    const regs = db.registrations.filter((r) => r.eventId === evtId);
    let txt = `👥 *Attendees for: ${evt?.title}* (${regs.length})\n\n`;
    regs.forEach((r, i) => {
      txt += `${i + 1}. *${r.fullName}* (@${r.telegramUsername || 'N/A'})\n`;
    });
    return tg('sendMessage', { chat_id: chatId, text: txt || 'No registrations yet.', parse_mode: 'Markdown' });
  }
  if (data.startsWith('del_')) {
    const evtId = data.replace('del_', '');
    const idx = db.events.findIndex((e) => e.id === evtId);
    if (idx !== -1) {
      const removed = db.events.splice(idx, 1)[0];
      saveData();
      return tg('sendMessage', { chat_id: chatId, text: `🗑 Deleted event: *${removed.title}*`, parse_mode: 'Markdown' });
    }
  }
}

async function startBot() {
  console.log('🤖 Connecting to Telegram Bot API...');

  const me = await tg('getMe');
  if (!me.ok) {
    console.error('❌ Failed to connect:', me.description);
    process.exit(1);
  }

  console.log(`\n======================================================`);
  console.log(`✨ DEBUGGERS' CLUB BOT IS ONLINE!`);
  console.log(`   Username: @${me.result.username}`);
  console.log(`======================================================\n`);

  await setupCommands();
  await tg('deleteWebhook', { drop_pending_updates: false });

  let offset = 0;
  console.log('📡 Long polling active... Listening for Telegram messages...\n');

  while (true) {
    try {
      const updates = await tg('getUpdates', { offset, timeout: 25 });
      if (updates.ok && Array.isArray(updates.result)) {
        for (const u of updates.result) {
          offset = Math.max(offset, u.update_id + 1);
          if (u.message) await handleMessage(u.message);
          if (u.callback_query) await handleCallback(u.callback_query);
        }
      }
    } catch (err) {
      console.error('Polling error, reconnecting in 3s...', err.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

startBot();
