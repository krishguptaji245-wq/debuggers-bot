import fs from 'fs';
import path from 'path';

// Telegram Bot Token (Environment Variable ya command line argument se leta hai)
const BOT_TOKEN = process.argv[2] || process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('\n❌ ERROR: Telegram Bot Token is required!');
  console.log('Usage: node bot.js <YOUR_TELEGRAM_BOT_TOKEN>\n');
  process.exit(1);
}

const DATA_FILE = path.resolve(process.cwd(), 'debugger_club_data.json');
let adminPasscode = 'DEBUGGER2026';

// Starter events data
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

// Telegram API Helper (Uses built-in global fetch in Node.js 18+)
async function tg(method, body = {}) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function setupCommands() {
  await tg('setMyCommands', {
    commands: [
      { command: 'events', description: 'Browse club events & 1-click register' },
      { command: 'newevent', description: '[Organizers] Create a new club event' },
      { command: 'participants', description: '[Organizers] View registered attendees' },
      { command: 'deleteevent', description: '[Organizers] Delete an event' },
      { command: 'makeadmin', description: 'Enter organizer passcode to get admin role' },
      { command: 'cancel', description: 'Cancel current ongoing action' },
      { command: 'help', description: 'Show all available bot commands & guides' },
    ],
  });
}

function isOrganizer(userId, username) {
  return db.organizers.some(
    (o) =>
      String(o.telegramUserId) === String(userId) ||
      (username && o.username && o.username.toLowerCase() === username.toLowerCase())
  );
}

async function handleMessage(msg) {
  if (!msg || !msg.text) return;
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || '';
  const fullName = `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim() || 'Debugger';
  const text = msg.text.trim();

  // Active Session Wizard Check
  const session = userSessions.get(userId);
  if (session && !text.startsWith('/')) {
    return handleSessionStep(chatId, userId, text, session);
  }

  const [cmd] = text.split(' ');

  switch (cmd.toLowerCase()) {
    case '/start':
      return tg('sendMessage', {
        chat_id: chatId,
        text: `👋 *Welcome to Debuggers' Club Bot, ${fullName}!*\n\n` +
          `Your all-in-one portal for coding contests, hackathons, and workshops.\n\n` +
          `📌 *Quick Commands:*\n` +
          `• /events — Browse upcoming events & register\n` +
          `• /help — Full command guide & organizer instructions\n` +
          `• /makeadmin — Register as an event organizer\n\n` +
          `Tap below to explore active club events! 👇`,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📅 Browse Upcoming Events', callback_data: 'cmd_events' }],
            [{ text: '❓ Help & Guides', callback_data: 'cmd_help' }],
          ],
        },
      });

    case '/events':
      return sendEventsList(chatId);

    case '/help':
      return tg('sendMessage', {
        chat_id: chatId,
        text: `⚡ *Debuggers' Club Bot Commands:*\n\n` +
          `👤 *Attendee Commands:*\n` +
          `• /events — View upcoming events and 1-click register\n` +
          `• /help — Show this instructions manual\n` +
          `• /cancel — Cancel any active wizard\n\n` +
          `🛡 *Organizer Commands:*\n` +
          `• /newevent — Step-by-step wizard to create an event\n` +
          `• /participants — View attendee list for any event\n` +
          `• /deleteevent — Remove an event\n` +
          `• /makeadmin — Verify with passcode (*DEBUGGER2026*)`,
        parse_mode: 'Markdown',
      });

    case '/makeadmin': {
      userSessions.set(userId, { type: 'admin_auth', step: 1 });
      return tg('sendMessage', {
        chat_id: chatId,
        text: `🔐 *Organizer Verification*\n\nPlease enter the secret club admin passcode to gain organizer access:\n\n_(Send /cancel to exit)_`,
        parse_mode: 'Markdown',
      });
    }

    case '/newevent': {
      if (!isOrganizer(userId, username)) {
        return tg('sendMessage', {
          chat_id: chatId,
          text: `🚫 *Access Restricted*\n\nYou must be a verified organizer. Run /makeadmin first.`,
          parse_mode: 'Markdown',
        });
      }
      userSessions.set(userId, { type: 'create_event', step: 'title', data: {} });
      return tg('sendMessage', {
        chat_id: chatId,
        text: `📝 *Step 1/5:* Enter the *Title* of the event:`,
        parse_mode: 'Markdown',
      });
    }

    case '/participants': {
      if (!isOrganizer(userId, username)) {
        return tg('sendMessage', { chat_id: chatId, text: `🚫 Organizer access required. Run /makeadmin.` });
      }
      const buttons = db.events.map((e) => [{ text: `${e.title} (${e.registeredCount})`, callback_data: `part_${e.id}` }]);
      return tg('sendMessage', {
        chat_id: chatId,
        text: `👥 *Select an event to view attendees:*`,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons },
      });
    }

    case '/deleteevent': {
      if (!isOrganizer(userId, username)) {
        return tg('sendMessage', { chat_id: chatId, text: `🚫 Organizer access required.` });
      }
      const buttons = db.events.map((e) => [{ text: `🗑 ${e.title}`, callback_data: `del_${e.id}` }]);
      return tg('sendMessage', {
        chat_id: chatId,
        text: `⚠️ *Select event to delete:*`,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons },
      });
    }

    case '/cancel':
      userSessions.delete(userId);
      return tg('sendMessage', { chat_id: chatId, text: `✖️ Action cancelled.` });

    default:
      return tg('sendMessage', { chat_id: chatId, text: `Command not recognized. Type /help to see all commands.` });
  }
}

async function handleSessionStep(chatId, userId, text, session) {
  if (session.type === 'admin_auth') {
    if (text.trim() === adminPasscode) {
      if (!db.organizers.some((o) => String(o.telegramUserId) === String(userId))) {
        db.organizers.push({
          telegramUserId: String(userId),
          fullName: 'Organizer',
          role: 'organizer',
        });
        saveData();
      }
      userSessions.delete(userId);
      return tg('sendMessage', {
        chat_id: chatId,
        text: `🎉 *Success!* You are now a verified organizer. You can use /newevent, /participants, and /deleteevent.`,
        parse_mode: 'Markdown',
      });
    } else {
      userSessions.delete(userId);
      return tg('sendMessage', { chat_id: chatId, text: `❌ Incorrect passcode.` });
    }
  }

  if (session.type === 'create_event') {
    if (session.step === 'title') {
      session.data.title = text;
      session.step = 'date';
      return tg('sendMessage', { chat_id: chatId, text: `📅 *Step 2/5:* Enter the *Date & Time* (e.g. Nov 15, 2026 • 5:00 PM):`, parse_mode: 'Markdown' });
    }
    if (session.step === 'date') {
      session.data.date = text;
      session.step = 'venue';
      return tg('sendMessage', { chat_id: chatId, text: `📍 *Step 3/5:* Enter the *Venue / Link* (e.g. Lab 2 or Discord):`, parse_mode: 'Markdown' });
    }
    if (session.step === 'venue') {
      session.data.venue = text;
      session.step = 'capacity';
      return tg('sendMessage', { chat_id: chatId, text: `👥 *Step 4/5:* Enter the *Seat Capacity* (e.g. 50):`, parse_mode: 'Markdown' });
    }
    if (session.step === 'capacity') {
      session.data.capacity = parseInt(text) || 50;
      session.step = 'desc';
      return tg('sendMessage', { chat_id: chatId, text: `📋 *Step 5/5:* Enter a short *Description*:`, parse_mode: 'Markdown' });
    }
    if (session.step === 'desc') {
      session.data.description = text;
      const newEvt = {
        id: `evt-${Date.now()}`,
        title: session.data.title,
        date: session.data.date,
        venue: session.data.venue,
        capacity: session.data.capacity,
        description: session.data.description,
        category: 'Workshop',
        registeredCount: 0,
        status: 'upcoming',
      };
      db.events.push(newEvt);
      saveData();
      userSessions.delete(userId);
      return tg('sendMessage', {
        chat_id: chatId,
        text: `✅ *Event Created Successfully!*\n\n*${newEvt.title}*\n📅 ${newEvt.date}\n📍 ${newEvt.venue}\n👥 Seats: ${newEvt.capacity}`,
        parse_mode: 'Markdown',
      });
    }
  }
}

async function sendEventsList(chatId) {
  if (!db.events.length) {
    return tg('sendMessage', { chat_id: chatId, text: `No upcoming events at the moment.` });
  }

  for (const evt of db.events) {
    const remaining = Math.max(0, evt.capacity - evt.registeredCount);
    const msg = `🏆 *${evt.title}*\n\n` +
      `📅 *Date:* ${evt.date}\n` +
      `📍 *Venue:* ${evt.venue}\n` +
      `🏷 *Type:* ${evt.category}\n` +
      `👥 *Seats Remaining:* ${remaining}/${evt.capacity}\n\n` +
      `📝 *About:* ${evt.description}`;

    await tg('sendMessage', {
      chat_id: chatId,
      text: msg,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: remaining > 0 ? '🎟 Register Now' : '❌ Sold Out', callback_data: `reg_${evt.id}` }],
        ],
      },
    });
  }
}

async function handleCallback(cq) {
  const chatId = cq.message.chat.id;
  const userId = cq.from.id;
  const username = cq.from.username || '';
  const fullName = `${cq.from.first_name || ''} ${cq.from.last_name || ''}`.trim() || 'Debugger';
  const data = cq.data;

  await tg('answerCallbackQuery', { callback_query_id: cq.id });

  if (data === 'cmd_events') return sendEventsList(chatId);
  if (data === 'cmd_help') return tg('sendMessage', { chat_id: chatId, text: `Use /events to register or /makeadmin for organizer permissions.` });

  if (data.startsWith('reg_')) {
    const evtId = data.replace('reg_', '');
    const evt = db.events.find((e) => e.id === evtId);
    if (!evt) return;

    const alreadyReg = db.registrations.some((r) => r.eventId === evtId && String(r.telegramUserId) === String(userId));
    if (alreadyReg) {
      return tg('sendMessage', { chat_id: chatId, text: `⚠️ You are already registered for *${evt.title}*!`, parse_mode: 'Markdown' });
    }

    if (evt.registeredCount >= evt.capacity) {
      return tg('sendMessage', { chat_id: chatId, text: `❌ Sorry, *${evt.title}* is full.`, parse_mode: 'Markdown' });
    }

    evt.registeredCount++;
    db.registrations.push({
      id: `reg-${Date.now()}`,
      eventId: evtId,
      telegramUserId: String(userId),
      telegramUsername: username,
      fullName: fullName,
      registeredAt: new Date().toISOString(),
    });
    saveData();

    return tg('sendMessage', {
      chat_id: chatId,
      text: `🎉 *Confirmed!* You are successfully registered for *${evt.title}*!\n\n📅 ${evt.date}\n📍 ${evt.venue}`,
      parse_mode: 'Markdown',
    });
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

// Bot Startup Loop
async function startBot() {
  console.log('🤖 Connecting to Telegram Bot API...');
  const me = await tg('getMe');
  if (!me.ok) {
    console.error('❌ Failed to connect:', me.description);
    process.exit(1);
  }

  console.log(`✨ Bot is online: @${me.result.username}`);
  await setupCommands();
  await tg('deleteWebhook', { drop_pending_updates: false });

  let offset = 0;
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
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

startBot();
