const fs = require('fs');
const path = require('path');
const { db, dataDir } = require('./database');

// Backup output directory
const backupDir = path.join(dataDir, 'backup');

// Track backup progress
let backupProgress = { status: 'idle', progress: 0, message: '', lastBackup: null };

/**
 * Generate full backup (HTML + JSON)
 */
async function generateBackup() {
    backupProgress = { status: 'running', progress: 0, message: 'Initializing...', lastBackup: null };

    try {
        // Create backup directories
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const currentBackupDir = path.join(backupDir, `backup_${timestamp}`);
        const chatsDir = path.join(currentBackupDir, 'chats');
        const jsonDir = path.join(currentBackupDir, 'json');
        const mediaBackupDir = path.join(currentBackupDir, 'media');

        fs.mkdirSync(chatsDir, { recursive: true });
        fs.mkdirSync(jsonDir, { recursive: true });
        fs.mkdirSync(mediaBackupDir, { recursive: true });

        backupProgress = { status: 'running', progress: 10, message: 'Fetching chats...', lastBackup: null };

        // Get all chats
        const chats = db.prepare('SELECT * FROM chats ORDER BY updated_at DESC').all();

        // Get all unique messages with media info
        const messages = db.prepare(`
            SELECT m.*, c.name as chat_name, c.is_group, c.is_community,
                   med.file_path as media_path, med.mime_type
            FROM messages m
            LEFT JOIN chats c ON m.chat_id = c.id
            LEFT JOIN media med ON m.media_id = med.id
            WHERE m.is_duplicate = 0
            ORDER BY m.timestamp ASC
        `).all();

        backupProgress = { status: 'running', progress: 20, message: `Processing ${messages.length} messages...`, lastBackup: null };

        // Generate JSON backup
        const jsonData = {
            exportDate: new Date().toISOString(),
            totalChats: chats.length,
            totalMessages: messages.length,
            chats: chats,
            messages: messages
        };
        fs.writeFileSync(path.join(jsonDir, 'backup.json'), JSON.stringify(jsonData, null, 2));
        fs.writeFileSync(path.join(jsonDir, 'chats.json'), JSON.stringify(chats, null, 2));
        fs.writeFileSync(path.join(jsonDir, 'messages.json'), JSON.stringify(messages, null, 2));

        backupProgress = { status: 'running', progress: 40, message: 'Copying media files...', lastBackup: null };

        // Copy media files
        const mediaFiles = db.prepare('SELECT * FROM media').all();
        for (const media of mediaFiles) {
            if (media.file_path) {
                const srcPath = path.join(dataDir, media.file_path);
                const destPath = path.join(mediaBackupDir, path.basename(media.file_path));
                if (fs.existsSync(srcPath)) {
                    fs.copyFileSync(srcPath, destPath);
                }
            }
        }

        backupProgress = { status: 'running', progress: 60, message: 'Generating HTML files...', lastBackup: null };

        // Group messages by chat
        const messagesByChat = {};
        for (const msg of messages) {
            if (!messagesByChat[msg.chat_id]) {
                messagesByChat[msg.chat_id] = [];
            }
            messagesByChat[msg.chat_id].push(msg);
        }

        // Generate HTML for each chat
        const chatLinks = [];
        let processed = 0;
        for (const chat of chats) {
            const chatMessages = messagesByChat[chat.id] || [];
            if (chatMessages.length === 0) continue;

            const safeName = sanitizeFilename(chat.name || 'Unknown');
            const filename = `${safeName}.html`;
            const htmlContent = generateChatHTML(chat, chatMessages);
            fs.writeFileSync(path.join(chatsDir, filename), htmlContent);

            chatLinks.push({
                name: chat.name || 'Unknown',
                filename: filename,
                messageCount: chatMessages.length,
                isGroup: chat.is_group,
                isCommunity: chat.is_community
            });

            processed++;
            backupProgress = {
                status: 'running',
                progress: 60 + Math.floor((processed / chats.length) * 30),
                message: `Generated ${processed}/${chats.length} chat files...`,
                lastBackup: null
            };
        }

        // Generate index.html
        const indexHTML = generateIndexHTML(chatLinks, messages.length, timestamp);
        fs.writeFileSync(path.join(currentBackupDir, 'index.html'), indexHTML);

        backupProgress = {
            status: 'complete',
            progress: 100,
            message: `Backup complete! ${messages.length} messages exported.`,
            lastBackup: currentBackupDir,
            backupName: `backup_${timestamp}`
        };

        console.log(`[Backup] Complete: ${currentBackupDir}`);
        return { success: true, path: currentBackupDir, name: `backup_${timestamp}` };

    } catch (err) {
        console.error('[Backup] Error:', err);
        backupProgress = { status: 'error', progress: 0, message: err.message, lastBackup: null };
        return { success: false, error: err.message };
    }
}

/**
 * Generate HTML for a single chat
 */
function generateChatHTML(chat, messages) {
    const messagesHTML = messages.map(msg => {
        const time = new Date(msg.timestamp).toLocaleString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        let mediaHTML = '';
        if (msg.media_path) {
            const mediaFile = `../media/${path.basename(msg.media_path)}`;
            if (msg.mime_type && msg.mime_type.startsWith('image/')) {
                mediaHTML = `<div class="media"><img src="${mediaFile}" alt="Image" loading="lazy"></div>`;
            } else if (msg.mime_type && msg.mime_type.startsWith('video/')) {
                mediaHTML = `<div class="media"><video src="${mediaFile}" controls></video></div>`;
            } else {
                mediaHTML = `<div class="media"><a href="${mediaFile}" target="_blank">📎 Attachment</a></div>`;
            }
        }

        const bodyHTML = escapeHTML(msg.body || '').replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');

        return `
        <div class="message">
            <div class="message-header">
                <span class="sender">${escapeHTML(msg.sender_name || 'Unknown')}</span>
                <span class="time">${time}</span>
            </div>
            <div class="body">${bodyHTML}</div>
            ${mediaHTML}
        </div>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHTML(chat.name || 'Chat')} - WhatsApp Backup</title>
    <style>${getCSS()}</style>
</head>
<body>
    <header>
        <a href="../index.html" class="back">← Back</a>
        <h1>${chat.is_group ? '👥' : '👤'} ${escapeHTML(chat.name || 'Unknown')}</h1>
        <span class="count">${messages.length} messages</span>
    </header>
    <main>
        ${messagesHTML}
    </main>
</body>
</html>`;
}

/**
 * Generate index.html with chat list
 */
function generateIndexHTML(chatLinks, totalMessages, timestamp) {
    const date = new Date().toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    const chatListHTML = chatLinks
        .sort((a, b) => b.messageCount - a.messageCount)
        .map(chat => `
        <a href="chats/${chat.filename}" class="chat-item">
            <span class="icon">${chat.isGroup ? '👥' : '👤'}</span>
            <span class="name">${escapeHTML(chat.name)}</span>
            <span class="count">${chat.messageCount} msgs</span>
        </a>`).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Backup</title>
    <style>${getCSS()}</style>
</head>
<body>
    <header>
        <h1>💬 WhatsApp Backup</h1>
        <span class="meta">Exported: ${date} | ${totalMessages} unique messages | ${chatLinks.length} chats</span>
    </header>
    <main>
        <div class="chat-list">
            ${chatListHTML}
        </div>
        <div class="json-links">
            <h3>Raw Data (JSON)</h3>
            <a href="json/backup.json">📄 Full Backup</a>
            <a href="json/chats.json">📄 Chats</a>
            <a href="json/messages.json">📄 Messages</a>
        </div>
    </main>
</body>
</html>`;
}

/**
 * CSS for backup HTML files
 */
function getCSS() {
    return `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0f; color: #fff; line-height: 1.5; }
header { background: #12121a; padding: 20px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
header h1 { font-size: 20px; flex: 1; }
header .meta, header .count { font-size: 13px; color: #888; }
header .back { color: #00d9a0; text-decoration: none; font-size: 14px; }
main { max-width: 900px; margin: 0 auto; padding: 20px; }
.message { background: #16161f; border-radius: 8px; padding: 12px 16px; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.05); }
.message-header { display: flex; justify-content: space-between; margin-bottom: 6px; }
.sender { font-weight: 600; color: #00d9a0; font-size: 14px; }
.time { font-size: 12px; color: #666; }
.body { font-size: 14px; color: #ccc; white-space: pre-wrap; word-break: break-word; }
.body a { color: #00d9a0; }
.media { margin-top: 10px; }
.media img, .media video { max-width: 300px; max-height: 300px; border-radius: 6px; }
.media a { color: #00d9a0; text-decoration: none; }
.chat-list { display: flex; flex-direction: column; gap: 8px; }
.chat-item { display: flex; align-items: center; gap: 12px; background: #16161f; padding: 14px 16px; border-radius: 8px; text-decoration: none; color: #fff; border: 1px solid rgba(255,255,255,0.05); transition: border-color 0.2s; }
.chat-item:hover { border-color: #00d9a0; }
.chat-item .icon { font-size: 20px; }
.chat-item .name { flex: 1; font-size: 15px; }
.chat-item .count { font-size: 13px; color: #888; }
.json-links { margin-top: 30px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); }
.json-links h3 { font-size: 14px; color: #888; margin-bottom: 12px; }
.json-links a { display: inline-block; margin-right: 16px; color: #00d9a0; text-decoration: none; }
`;
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sanitizeFilename(name) {
    return name.replace(/[^a-zA-Z0-9_\-\s]/g, '').replace(/\s+/g, '_').slice(0, 50) || 'chat';
}

function getBackupProgress() {
    return backupProgress;
}

function getBackupList() {
    if (!fs.existsSync(backupDir)) return [];
    return fs.readdirSync(backupDir)
        .filter(name => name.startsWith('backup_'))
        .map(name => ({
            name,
            path: path.join(backupDir, name),
            date: name.replace('backup_', '').replace(/-/g, ':').slice(0, 19)
        }))
        .sort((a, b) => b.name.localeCompare(a.name));
}

module.exports = { generateBackup, getBackupProgress, getBackupList, backupDir };
