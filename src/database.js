const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Data directory (mounted volume in Docker)
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'whatsapp.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Initialize tables
db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        name TEXT,
        is_group INTEGER DEFAULT 0,
        is_community INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        sender_id TEXT,
        sender_name TEXT,
        body TEXT,
        timestamp DATETIME NOT NULL,
        has_media INTEGER DEFAULT 0,
        media_id TEXT,
        content_hash TEXT,
        is_duplicate INTEGER DEFAULT 0,
        original_message_id TEXT,
        has_links INTEGER DEFAULT 0,
        has_prices INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chat_id) REFERENCES chats(id)
    );

    CREATE TABLE IF NOT EXISTS media (
        id TEXT PRIMARY KEY,
        file_hash TEXT UNIQUE,
        file_path TEXT,
        mime_type TEXT,
        file_size INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
    CREATE INDEX IF NOT EXISTS idx_messages_content_hash ON messages(content_hash);
    CREATE INDEX IF NOT EXISTS idx_messages_is_duplicate ON messages(is_duplicate);
    CREATE INDEX IF NOT EXISTS idx_messages_has_links ON messages(has_links);
    CREATE INDEX IF NOT EXISTS idx_messages_has_prices ON messages(has_prices);
    CREATE INDEX IF NOT EXISTS idx_media_file_hash ON media(file_hash);
`);

const statements = {
    upsertChat: db.prepare(`
        INSERT INTO chats (id, name, is_group, is_community, updated_at)
        VALUES (@id, @name, @is_group, @is_community, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            name = @name, is_group = @is_group, is_community = @is_community, updated_at = CURRENT_TIMESTAMP
    `),
    getChat: db.prepare('SELECT * FROM chats WHERE id = ?'),
    getAllChats: db.prepare('SELECT * FROM chats ORDER BY updated_at DESC'),
    insertMessage: db.prepare(`
        INSERT INTO messages (id, chat_id, sender_id, sender_name, body, timestamp, has_media, media_id, content_hash, is_duplicate, original_message_id, has_links, has_prices)
        VALUES (@id, @chat_id, @sender_id, @sender_name, @body, @timestamp, @has_media, @media_id, @content_hash, @is_duplicate, @original_message_id, @has_links, @has_prices)
    `),
    findByContentHash: db.prepare('SELECT * FROM messages WHERE content_hash = ? AND is_duplicate = 0 LIMIT 1'),
    insertMedia: db.prepare(`
        INSERT INTO media (id, file_hash, file_path, mime_type, file_size)
        VALUES (@id, @file_hash, @file_path, @mime_type, @file_size)
    `),
    findMediaByHash: db.prepare('SELECT * FROM media WHERE file_hash = ?'),
    deleteOldGroupMessages: db.prepare(`
        DELETE FROM messages
        WHERE chat_id IN (SELECT id FROM chats WHERE is_group = 1 OR is_community = 1)
        AND timestamp < datetime('now', '-30 days')
    `),
    getOrphanedMedia: db.prepare(`
        SELECT * FROM media WHERE id NOT IN (SELECT DISTINCT media_id FROM messages WHERE media_id IS NOT NULL)
    `),
    deleteMedia: db.prepare('DELETE FROM media WHERE id = ?'),
    getStats: db.prepare(`
        SELECT
            (SELECT COUNT(*) FROM messages WHERE is_duplicate = 0) as unique_messages,
            (SELECT COUNT(*) FROM messages WHERE is_duplicate = 1) as duplicate_messages,
            (SELECT COUNT(*) FROM chats) as total_chats,
            (SELECT COUNT(*) FROM media) as total_media
    `)
};

module.exports = { db, statements, dataDir };
