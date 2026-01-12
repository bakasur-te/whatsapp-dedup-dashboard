const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const { statements, dataDir } = require('./database');
const { generateTextHash, generateMediaHash, hasLinks, hasPrices, generateId } = require('./deduplication');

const mediaDir = path.join(dataDir, 'media');
if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });

const sessionDir = path.join(dataDir, 'session');

let client = null;
let isReady = false;
let qrCodeData = null;
let qrCodeImage = null;

function initializeClient() {
    client = new Client({
        authStrategy: new LocalAuth({ dataPath: sessionDir }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        }
    });

    client.on('qr', async (qr) => {
        qrCodeData = qr;
        console.log('\n[WhatsApp] Scan this QR code:');
        qrcode.generate(qr, { small: true });

        // Generate QR as data URL for web display
        try {
            qrCodeImage = await QRCode.toDataURL(qr, { width: 256, margin: 2 });
        } catch (err) {
            console.error('QR generation error:', err);
        }
    });

    client.on('ready', () => {
        isReady = true;
        qrCodeData = null;
        qrCodeImage = null;
        console.log('[WhatsApp] Client is ready!');
    });

    client.on('disconnected', (reason) => {
        isReady = false;
        console.log('[WhatsApp] Disconnected:', reason);
    });

    client.on('message', async (message) => {
        try {
            await handleMessage(message);
        } catch (err) {
            console.error('[WhatsApp] Error:', err);
        }
    });

    client.on('auth_failure', (msg) => {
        console.error('[WhatsApp] Auth failed:', msg);
    });

    client.initialize();
    console.log('[WhatsApp] Initializing...');
    return client;
}

async function handleMessage(message) {
    const chat = await message.getChat();
    const contact = await message.getContact();

    statements.upsertChat.run({
        id: chat.id._serialized,
        name: chat.name || contact.pushname || contact.number || 'Unknown',
        is_group: chat.isGroup ? 1 : 0,
        is_community: chat.isCommunity ? 1 : 0
    });

    const senderId = message.author || message.from;
    const senderName = contact.pushname || contact.name || contact.number || 'Unknown';
    const messageBody = message.body || '';
    const timestamp = new Date(message.timestamp * 1000).toISOString();

    let contentHash, mediaId = null, isDuplicate = false, originalMessageId = null;

    if (message.hasMedia) {
        try {
            const media = await message.downloadMedia();
            if (media && media.data) {
                const buffer = Buffer.from(media.data, 'base64');
                const mediaHash = generateMediaHash(buffer);
                const existingMedia = statements.findMediaByHash.get(mediaHash);

                if (existingMedia) {
                    mediaId = existingMedia.id;
                    contentHash = mediaHash;
                    const existingMsg = statements.findByContentHash.get(contentHash);
                    if (existingMsg) {
                        isDuplicate = true;
                        originalMessageId = existingMsg.id;
                    }
                } else {
                    mediaId = generateId();
                    const ext = getExtension(media.mimetype);
                    const fileName = `${mediaId}${ext}`;
                    const filePath = path.join('media', fileName);
                    fs.writeFileSync(path.join(dataDir, filePath), buffer);

                    statements.insertMedia.run({
                        id: mediaId,
                        file_hash: mediaHash,
                        file_path: filePath,
                        mime_type: media.mimetype,
                        file_size: buffer.length
                    });
                    contentHash = mediaHash;
                }
            } else {
                contentHash = generateTextHash(senderId, messageBody);
            }
        } catch (err) {
            console.error('[WhatsApp] Media error:', err.message);
            contentHash = generateTextHash(senderId, messageBody);
        }
    } else {
        contentHash = generateTextHash(senderId, messageBody);
        const existingMsg = statements.findByContentHash.get(contentHash);
        if (existingMsg) {
            isDuplicate = true;
            originalMessageId = existingMsg.id;
        }
    }

    const msgHasLinks = hasLinks(messageBody) ? 1 : 0;
    const msgHasPrices = hasPrices(messageBody) ? 1 : 0;

    statements.insertMessage.run({
        id: generateId(),
        chat_id: chat.id._serialized,
        sender_id: senderId,
        sender_name: senderName,
        body: messageBody,
        timestamp: timestamp,
        has_media: message.hasMedia ? 1 : 0,
        media_id: mediaId,
        content_hash: contentHash,
        is_duplicate: isDuplicate ? 1 : 0,
        original_message_id: originalMessageId,
        has_links: msgHasLinks,
        has_prices: msgHasPrices
    });

    const preview = messageBody.length > 40 ? messageBody.substring(0, 40) + '...' : (messageBody || '[Media]');
    console.log(`[Message] ${isDuplicate ? 'DUP' : 'NEW'}: ${senderName}: ${preview}`);

    // Forward to Telegram if it's a unique message from a watched group
    if (!isDuplicate) {
        try {
            const { isWatchedGroup, queueForTelegram } = require('./telegram');
            if (isWatchedGroup(chat.id._serialized)) {
                const chatName = chat.name || 'Unknown Group';
                const mediaPath = mediaId ? statements.findMediaByHash.get(contentHash)?.file_path : null;
                queueForTelegram({
                    sender_id: senderId,
                    sender_name: senderName,
                    body: messageBody,
                    chat_id: chat.id._serialized,
                    timestamp: timestamp
                }, chatName, mediaPath);
            }
        } catch (err) {
            console.error('[Telegram] Queue error:', err.message);
        }
    }
}

function getExtension(mimeType) {
    const map = {
        'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
        'video/mp4': '.mp4', 'video/3gpp': '.3gp',
        'audio/ogg': '.ogg', 'audio/mpeg': '.mp3',
        'application/pdf': '.pdf'
    };
    return map[mimeType] || '.bin';
}

function getStatus() {
    return { isReady, qrCode: qrCodeData, qrCodeImage };
}

function getClient() {
    return client;
}

// Import history from a specific chat
async function importHistory(chatId, limit = 100) {
    if (!client || !isReady) {
        throw new Error('WhatsApp client not ready');
    }

    const chat = await client.getChatById(chatId);
    if (!chat) {
        throw new Error('Chat not found');
    }

    console.log(`[Import] Fetching ${limit} messages from: ${chat.name || chatId}`);

    const messages = await chat.fetchMessages({ limit });
    let imported = 0, duplicates = 0, errors = 0;

    for (const message of messages) {
        try {
            // Check if message already exists (by WhatsApp message ID)
            const waMessageId = message.id._serialized;
            const existingCheck = statements.findByContentHash.get(waMessageId);

            if (existingCheck) {
                duplicates++;
                continue;
            }

            const contact = await message.getContact();
            const senderId = message.author || message.from;
            const senderName = contact.pushname || contact.name || contact.number || 'Unknown';
            const messageBody = message.body || '';
            const timestamp = new Date(message.timestamp * 1000).toISOString();

            let contentHash, mediaId = null, isDuplicate = false, originalMessageId = null;

            // For historical messages, use WA message ID as part of hash to avoid re-importing
            contentHash = generateTextHash(senderId, messageBody + waMessageId);

            // Check for content duplicate (same sender + same text, ignoring WA ID)
            const textOnlyHash = generateTextHash(senderId, messageBody);
            const existingMsg = statements.findByContentHash.get(textOnlyHash);
            if (existingMsg) {
                isDuplicate = true;
                originalMessageId = existingMsg.id;
            }

            // Handle media
            if (message.hasMedia) {
                try {
                    const media = await message.downloadMedia();
                    if (media && media.data) {
                        const buffer = Buffer.from(media.data, 'base64');
                        const mediaHash = generateMediaHash(buffer);
                        const existingMedia = statements.findMediaByHash.get(mediaHash);

                        if (existingMedia) {
                            mediaId = existingMedia.id;
                            isDuplicate = true;
                        } else {
                            mediaId = generateId();
                            const ext = getExtension(media.mimetype);
                            const fileName = `${mediaId}${ext}`;
                            const filePath = path.join('media', fileName);
                            fs.writeFileSync(path.join(dataDir, filePath), buffer);

                            statements.insertMedia.run({
                                id: mediaId,
                                file_hash: mediaHash,
                                file_path: filePath,
                                mime_type: media.mimetype,
                                file_size: buffer.length
                            });
                        }
                        contentHash = mediaHash;
                    }
                } catch (err) {
                    // Media download failed for old message, continue without media
                }
            }

            const msgHasLinks = hasLinks(messageBody) ? 1 : 0;
            const msgHasPrices = hasPrices(messageBody) ? 1 : 0;

            statements.insertMessage.run({
                id: generateId(),
                chat_id: chatId,
                sender_id: senderId,
                sender_name: senderName,
                body: messageBody,
                timestamp: timestamp,
                has_media: message.hasMedia ? 1 : 0,
                media_id: mediaId,
                content_hash: contentHash,
                is_duplicate: isDuplicate ? 1 : 0,
                original_message_id: originalMessageId,
                has_links: msgHasLinks,
                has_prices: msgHasPrices
            });

            imported++;
        } catch (err) {
            errors++;
            console.error(`[Import] Error processing message:`, err.message);
        }
    }

    // Update chat info
    statements.upsertChat.run({
        id: chatId,
        name: chat.name || 'Unknown',
        is_group: chat.isGroup ? 1 : 0,
        is_community: chat.isCommunity ? 1 : 0
    });

    console.log(`[Import] Complete: ${imported} imported, ${duplicates} skipped, ${errors} errors`);
    return { imported, duplicates, errors, total: messages.length };
}

// Get all WhatsApp chats for import selection
async function getWhatsAppChats() {
    if (!client || !isReady) {
        return [];
    }

    const chats = await client.getChats();
    return chats.map(chat => ({
        id: chat.id._serialized,
        name: chat.name || chat.id.user || 'Unknown',
        isGroup: chat.isGroup,
        isCommunity: chat.isCommunity,
        unreadCount: chat.unreadCount
    }));
}

module.exports = { initializeClient, getStatus, getClient, importHistory, getWhatsAppChats };

