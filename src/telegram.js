const fs = require('fs');
const path = require('path');
const https = require('https');
const { db, dataDir } = require('./database');

// Initialize Telegram tables
db.exec(`
    CREATE TABLE IF NOT EXISTS telegram_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        bot_token TEXT,
        chat_id TEXT,
        enabled INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS telegram_watched_groups (
        chat_id TEXT PRIMARY KEY,
        chat_name TEXT,
        enabled INTEGER DEFAULT 1
    );

    INSERT OR IGNORE INTO telegram_config (id, bot_token, chat_id, enabled) VALUES (1, '', '', 0);
`);

// Message queue for merging (same sender within 30 seconds)
const messageQueue = new Map(); // senderId -> { messages: [], timer: null, chatName: string }
const MERGE_WINDOW_MS = 30000;

/**
 * Get Telegram config
 */
function getTelegramConfig() {
    const config = db.prepare('SELECT * FROM telegram_config WHERE id = 1').get();
    return config || { bot_token: '', chat_id: '', enabled: 0 };
}

/**
 * Save Telegram config
 */
function saveTelegramConfig(botToken, chatId, enabled) {
    db.prepare(`
        UPDATE telegram_config SET bot_token = ?, chat_id = ?, enabled = ? WHERE id = 1
    `).run(botToken, chatId, enabled ? 1 : 0);
}

/**
 * Get watched groups
 */
function getWatchedGroups() {
    return db.prepare('SELECT * FROM telegram_watched_groups').all();
}

/**
 * Set watched groups
 */
function setWatchedGroups(groups) {
    const deleteStmt = db.prepare('DELETE FROM telegram_watched_groups');
    const insertStmt = db.prepare('INSERT OR REPLACE INTO telegram_watched_groups (chat_id, chat_name, enabled) VALUES (?, ?, 1)');

    db.transaction(() => {
        deleteStmt.run();
        for (const group of groups) {
            insertStmt.run(group.id, group.name);
        }
    })();
}

/**
 * Check if a chat is being watched
 */
function isWatchedGroup(chatId) {
    const group = db.prepare('SELECT * FROM telegram_watched_groups WHERE chat_id = ? AND enabled = 1').get(chatId);
    return !!group;
}

/**
 * Queue a message for Telegram (with 30-second merge window)
 */
function queueForTelegram(message, chatName, mediaPath) {
    const config = getTelegramConfig();
    if (!config.enabled || !config.bot_token || !config.chat_id) return;

    const senderId = message.sender_id || 'unknown';
    const queueKey = `${senderId}_${message.chat_id}`;

    if (!messageQueue.has(queueKey)) {
        messageQueue.set(queueKey, {
            messages: [],
            timer: null,
            chatName: chatName,
            senderName: message.sender_name
        });
    }

    const queue = messageQueue.get(queueKey);
    queue.messages.push({
        body: message.body,
        mediaPath: mediaPath,
        timestamp: message.timestamp
    });

    // Reset timer
    if (queue.timer) clearTimeout(queue.timer);

    queue.timer = setTimeout(() => {
        flushQueue(queueKey);
    }, MERGE_WINDOW_MS);
}

/**
 * Flush queued messages to Telegram
 */
async function flushQueue(queueKey) {
    const queue = messageQueue.get(queueKey);
    if (!queue || queue.messages.length === 0) return;

    messageQueue.delete(queueKey);

    const config = getTelegramConfig();
    if (!config.enabled || !config.bot_token || !config.chat_id) return;

    try {
        // Merge messages
        const mergedText = queue.messages
            .map(m => m.body)
            .filter(b => b && b.trim())
            .join('\n\n');

        const header = `📱 *${escapeMarkdown(queue.chatName)}*\n👤 ${escapeMarkdown(queue.senderName)}\n${'─'.repeat(20)}\n`;
        const fullMessage = header + (mergedText || '[Media only]');

        // Send text message
        await sendTelegramMessage(config.bot_token, config.chat_id, fullMessage);

        // Send media files
        for (const msg of queue.messages) {
            if (msg.mediaPath) {
                const fullPath = path.join(dataDir, msg.mediaPath);
                if (fs.existsSync(fullPath)) {
                    await sendTelegramPhoto(config.bot_token, config.chat_id, fullPath);
                }
            }
        }

        console.log(`[Telegram] Sent ${queue.messages.length} merged messages from ${queue.senderName}`);
    } catch (err) {
        console.error('[Telegram] Send error:', err.message);
    }
}

/**
 * Send text message to Telegram
 */
function sendTelegramMessage(botToken, chatId, text) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'Markdown'
        });

        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${botToken}/sendMessage`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                const result = JSON.parse(body);
                if (result.ok) resolve(result);
                else reject(new Error(result.description || 'Telegram API error'));
            });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

/**
 * Send photo to Telegram
 */
function sendTelegramPhoto(botToken, chatId, filePath) {
    return new Promise((resolve, reject) => {
        const FormData = require('form-data');
        const form = new FormData();
        form.append('chat_id', chatId);
        form.append('photo', fs.createReadStream(filePath));

        form.submit(`https://api.telegram.org/bot${botToken}/sendPhoto`, (err, res) => {
            if (err) return reject(err);
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(body);
                    if (result.ok) resolve(result);
                    else reject(new Error(result.description || 'Telegram API error'));
                } catch (e) {
                    reject(e);
                }
            });
        });
    });
}

/**
 * Test Telegram connection
 */
async function testConnection() {
    const config = getTelegramConfig();
    if (!config.bot_token || !config.chat_id) {
        return { success: false, error: 'Bot token or chat ID not configured' };
    }

    try {
        await sendTelegramMessage(config.bot_token, config.chat_id, '✅ WhatsApp Dedup Dashboard connected successfully!');
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

function escapeMarkdown(text) {
    if (!text) return '';
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

module.exports = {
    getTelegramConfig,
    saveTelegramConfig,
    getWatchedGroups,
    setWatchedGroups,
    isWatchedGroup,
    queueForTelegram,
    testConnection
};
