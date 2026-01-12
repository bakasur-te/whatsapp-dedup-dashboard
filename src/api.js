const express = require('express');
const path = require('path');
const { db, statements, dataDir } = require('./database');
const { getStatus } = require('./whatsapp');

const router = express.Router();

router.get('/status', (req, res) => {
    const status = getStatus();
    res.json(status);
});

router.get('/stats', (req, res) => {
    const stats = statements.getStats.get();
    res.json(stats);
});

router.get('/chats', (req, res) => {
    const chats = statements.getAllChats.all();
    res.json(chats);
});

router.get('/messages', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = (page - 1) * limit;

    let whereConditions = ['m.is_duplicate = 0'];
    let params = [];

    if (req.query.chat_id) {
        whereConditions.push('m.chat_id = ?');
        params.push(req.query.chat_id);
    }
    if (req.query.has_links === '1') whereConditions.push('m.has_links = 1');
    if (req.query.has_prices === '1') whereConditions.push('m.has_prices = 1');
    if (req.query.has_media === '1') whereConditions.push('m.has_media = 1');
    if (req.query.search) {
        whereConditions.push('m.body LIKE ?');
        params.push(`%${req.query.search}%`);
    }
    if (req.query.date_from) {
        whereConditions.push('m.timestamp >= ?');
        params.push(req.query.date_from);
    }
    if (req.query.date_to) {
        whereConditions.push('m.timestamp <= ?');
        params.push(req.query.date_to);
    }

    const whereClause = whereConditions.join(' AND ');
    const countQuery = `SELECT COUNT(*) as total FROM messages m WHERE ${whereClause}`;
    const total = db.prepare(countQuery).get(...params).total;

    const query = `
        SELECT m.*, c.name as chat_name, c.is_group, c.is_community,
               med.file_path as media_path, med.mime_type
        FROM messages m
        LEFT JOIN chats c ON m.chat_id = c.id
        LEFT JOIN media med ON m.media_id = med.id
        WHERE ${whereClause}
        ORDER BY m.timestamp DESC
        LIMIT ? OFFSET ?
    `;

    const messages = db.prepare(query).all(...params, limit, offset);

    res.json({
        messages,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
});

router.get('/media/:filename', (req, res) => {
    const filePath = path.join(dataDir, 'media', req.params.filename);
    res.sendFile(filePath);
});

// Get all WhatsApp chats for import (live from WhatsApp)
router.get('/whatsapp-chats', async (req, res) => {
    try {
        const { getWhatsAppChats } = require('./whatsapp');
        const chats = await getWhatsAppChats();
        res.json(chats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Import history from a specific chat
router.post('/import', async (req, res) => {
    try {
        const { chatId, limit = 100 } = req.body;
        if (!chatId) {
            return res.status(400).json({ error: 'chatId is required' });
        }

        const { importHistory } = require('./whatsapp');
        const result = await importHistory(chatId, parseInt(limit));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ BACKUP ENDPOINTS ============

// Start backup generation
router.post('/backup', async (req, res) => {
    try {
        const { generateBackup } = require('./backup');
        // Start backup in background
        generateBackup();
        res.json({ status: 'started' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get backup progress
router.get('/backup/progress', (req, res) => {
    const { getBackupProgress } = require('./backup');
    res.json(getBackupProgress());
});

// List all backups
router.get('/backup/list', (req, res) => {
    const { getBackupList } = require('./backup');
    res.json(getBackupList());
});

// Serve backup files
router.get('/backup/files/:backupName/*', (req, res) => {
    const { backupDir } = require('./backup');
    const filePath = path.join(backupDir, req.params.backupName, req.params[0]);
    res.sendFile(filePath);
});

// ============ TELEGRAM ENDPOINTS ============

// Get Telegram config
router.get('/telegram/config', (req, res) => {
    const { getTelegramConfig, getWatchedGroups } = require('./telegram');
    res.json({
        config: getTelegramConfig(),
        watchedGroups: getWatchedGroups()
    });
});

// Save Telegram config
router.post('/telegram/config', (req, res) => {
    try {
        const { saveTelegramConfig } = require('./telegram');
        const { botToken, chatId, enabled } = req.body;
        saveTelegramConfig(botToken, chatId, enabled);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update watched groups
router.post('/telegram/groups', (req, res) => {
    try {
        const { setWatchedGroups } = require('./telegram');
        const { groups } = req.body;
        setWatchedGroups(groups);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Test Telegram connection
router.post('/telegram/test', async (req, res) => {
    try {
        const { testConnection } = require('./telegram');
        const result = await testConnection();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
