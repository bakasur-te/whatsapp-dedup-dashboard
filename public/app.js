const API_BASE = '/api';
let currentPage = 1, isLoading = false, hasMore = true, filters = {};

const el = {
    connectionStatus: document.getElementById('connectionStatus'),
    qrModal: document.getElementById('qrModal'),
    qrCode: document.getElementById('qrCode'),
    messagesList: document.getElementById('messagesList'),
    loadingIndicator: document.getElementById('loadingIndicator'),
    loadMore: document.getElementById('loadMore'),
    loadMoreBtn: document.getElementById('loadMoreBtn'),
    mediaModal: document.getElementById('mediaModal'),
    mediaViewer: document.getElementById('mediaViewer'),
    closeMediaModal: document.getElementById('closeMediaModal'),
    refreshBtn: document.getElementById('refreshBtn'),
    applyFilters: document.getElementById('applyFilters'),
    clearFilters: document.getElementById('clearFilters'),
    filterLinks: document.getElementById('filterLinks'),
    filterPrices: document.getElementById('filterPrices'),
    filterMedia: document.getElementById('filterMedia'),
    filterChat: document.getElementById('filterChat'),
    filterSearch: document.getElementById('filterSearch'),
    filterDateFrom: document.getElementById('filterDateFrom'),
    filterDateTo: document.getElementById('filterDateTo'),
    statUnique: document.getElementById('statUnique'),
    statDuplicates: document.getElementById('statDuplicates'),
    statChats: document.getElementById('statChats'),
    // Import modal
    openImportBtn: document.getElementById('openImportBtn'),
    importModal: document.getElementById('importModal'),
    importChatSelect: document.getElementById('importChatSelect'),
    importLimit: document.getElementById('importLimit'),
    importStatus: document.getElementById('importStatus'),
    importStatusText: document.getElementById('importStatusText'),
    importResult: document.getElementById('importResult'),
    startImportBtn: document.getElementById('startImportBtn'),
    closeImportBtn: document.getElementById('closeImportBtn'),
    // Backup modal
    openBackupBtn: document.getElementById('openBackupBtn'),
    backupModal: document.getElementById('backupModal'),
    backupProgress: document.getElementById('backupProgress'),
    backupStatusText: document.getElementById('backupStatusText'),
    backupResult: document.getElementById('backupResult'),
    startBackupBtn: document.getElementById('startBackupBtn'),
    closeBackupBtn: document.getElementById('closeBackupBtn'),
    // Telegram modal
    openTelegramBtn: document.getElementById('openTelegramBtn'),
    telegramModal: document.getElementById('telegramModal'),
    telegramBotToken: document.getElementById('telegramBotToken'),
    telegramChatId: document.getElementById('telegramChatId'),
    telegramEnabled: document.getElementById('telegramEnabled'),
    telegramGroupList: document.getElementById('telegramGroupList'),
    telegramResult: document.getElementById('telegramResult'),
    testTelegramBtn: document.getElementById('testTelegramBtn'),
    saveTelegramBtn: document.getElementById('saveTelegramBtn'),
    closeTelegramBtn: document.getElementById('closeTelegramBtn')
};

document.addEventListener('DOMContentLoaded', init);

function init() {
    checkStatus();
    loadChats();
    loadStats();
    loadMessages();
    setupEvents();
    setInterval(checkStatus, 5000);
    setInterval(loadStats, 30000);
}

function setupEvents() {
    el.refreshBtn.addEventListener('click', () => { currentPage = 1; hasMore = true; el.messagesList.innerHTML = ''; loadMessages(); loadStats(); });
    el.applyFilters.addEventListener('click', applyFiltersHandler);
    el.clearFilters.addEventListener('click', clearFiltersHandler);
    el.loadMoreBtn.addEventListener('click', () => { if (!isLoading && hasMore) { currentPage++; loadMessages(true); } });
    el.closeMediaModal.addEventListener('click', closeMediaModal);
    el.mediaModal.addEventListener('click', (e) => { if (e.target === el.mediaModal) closeMediaModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAllModals(); });
    el.filterSearch.addEventListener('keypress', (e) => { if (e.key === 'Enter') applyFiltersHandler(); });

    // Import modal events
    el.openImportBtn.addEventListener('click', openImportModal);
    el.closeImportBtn.addEventListener('click', closeImportModal);
    el.startImportBtn.addEventListener('click', startImport);
    el.importModal.addEventListener('click', (e) => { if (e.target === el.importModal) closeImportModal(); });

    // Backup modal events
    el.openBackupBtn.addEventListener('click', openBackupModal);
    el.closeBackupBtn.addEventListener('click', closeBackupModal);
    el.startBackupBtn.addEventListener('click', startBackup);
    el.backupModal.addEventListener('click', (e) => { if (e.target === el.backupModal) closeBackupModal(); });

    // Telegram modal events
    el.openTelegramBtn.addEventListener('click', openTelegramModal);
    el.closeTelegramBtn.addEventListener('click', closeTelegramModal);
    el.saveTelegramBtn.addEventListener('click', saveTelegramSettings);
    el.testTelegramBtn.addEventListener('click', testTelegramConnection);
    el.telegramModal.addEventListener('click', (e) => { if (e.target === el.telegramModal) closeTelegramModal(); });
}

function closeAllModals() {
    closeMediaModal();
    closeImportModal();
    closeBackupModal();
    closeTelegramModal();
}

async function checkStatus() {
    try {
        const res = await fetch(`${API_BASE}/status`);
        const status = await res.json();

        if (status.isReady) {
            el.connectionStatus.classList.add('connected');
            el.connectionStatus.classList.remove('disconnected');
            el.connectionStatus.querySelector('.status-text').textContent = 'Connected';
            el.qrModal.classList.add('hidden');
        } else if (status.qrCodeImage) {
            el.connectionStatus.classList.remove('connected', 'disconnected');
            el.connectionStatus.querySelector('.status-text').textContent = 'Scan QR Code';
            el.qrModal.classList.remove('hidden');
            el.qrCode.innerHTML = `<img src="${status.qrCodeImage}" alt="QR Code">`;
        } else {
            el.connectionStatus.classList.remove('connected');
            el.connectionStatus.classList.add('disconnected');
            el.connectionStatus.querySelector('.status-text').textContent = 'Initializing...';
        }
    } catch (err) {
        el.connectionStatus.classList.add('disconnected');
        el.connectionStatus.querySelector('.status-text').textContent = 'Connection Error';
    }
}

async function loadStats() {
    try {
        const res = await fetch(`${API_BASE}/stats`);
        const stats = await res.json();
        el.statUnique.textContent = formatNumber(stats.unique_messages);
        el.statDuplicates.textContent = formatNumber(stats.duplicate_messages);
        el.statChats.textContent = formatNumber(stats.total_chats);
    } catch (err) { console.error('Stats error:', err); }
}

async function loadChats() {
    try {
        const res = await fetch(`${API_BASE}/chats`);
        const chats = await res.json();
        el.filterChat.innerHTML = '<option value="">All Chats</option>';
        chats.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.name || 'Unknown';
            el.filterChat.appendChild(opt);
        });
    } catch (err) { console.error('Chats error:', err); }
}

async function loadMessages(append = false) {
    if (isLoading) return;
    isLoading = true;
    el.loadingIndicator.classList.remove('hidden');

    try {
        const params = new URLSearchParams({ page: currentPage, limit: 50, ...filters });
        const res = await fetch(`${API_BASE}/messages?${params}`);
        const data = await res.json();

        if (!append) el.messagesList.innerHTML = '';

        if (data.messages.length === 0 && !append) {
            el.messagesList.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📭</div><h3>No messages found</h3><p>Messages will appear here once received</p></div>`;
        } else {
            data.messages.forEach(msg => el.messagesList.appendChild(createMessageCard(msg)));
        }

        hasMore = currentPage < data.pagination.totalPages;
        el.loadMore.classList.toggle('hidden', !hasMore);
    } catch (err) {
        if (!append) el.messagesList.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Failed to load</h3></div>`;
    } finally {
        isLoading = false;
        el.loadingIndicator.classList.add('hidden');
    }
}

function createMessageCard(msg) {
    const card = document.createElement('div');
    card.className = 'message-card';

    const initials = getInitials(msg.sender_name);
    const time = formatTime(msg.timestamp);
    const body = linkifyText(msg.body || '');

    let tags = '';
    if (msg.has_links) tags += '<span class="tag link">🔗 Link</span>';
    if (msg.has_prices) tags += '<span class="tag price">💰 Price</span>';
    if (msg.has_media) tags += '<span class="tag media">📷 Media</span>';

    let media = '';
    if (msg.media_path && msg.mime_type) {
        const url = `/api/media/${msg.media_path.split('/').pop()}`;
        if (msg.mime_type.startsWith('image/')) {
            media = `<div class="message-media" onclick="openMedia('${url}', 'image')"><img src="${url}" class="media-thumbnail" loading="lazy"></div>`;
        } else if (msg.mime_type.startsWith('video/')) {
            media = `<div class="message-media" onclick="openMedia('${url}', 'video')"><video src="${url}" class="media-thumbnail" preload="metadata"></video></div>`;
        }
    }

    card.innerHTML = `
        <div class="message-header">
            <div class="message-sender">
                <div class="sender-avatar">${initials}</div>
                <div class="sender-info">
                    <span class="sender-name">${escapeHtml(msg.sender_name)}</span>
                    <span class="chat-name">${escapeHtml(msg.chat_name || 'Unknown')}</span>
                </div>
            </div>
            <span class="message-time">${time}</span>
        </div>
        <div class="message-body">${body}</div>
        ${media}
        ${tags ? `<div class="message-tags">${tags}</div>` : ''}
    `;
    return card;
}

function applyFiltersHandler() {
    filters = {};
    if (el.filterLinks.checked) filters.has_links = '1';
    if (el.filterPrices.checked) filters.has_prices = '1';
    if (el.filterMedia.checked) filters.has_media = '1';
    if (el.filterChat.value) filters.chat_id = el.filterChat.value;
    if (el.filterSearch.value.trim()) filters.search = el.filterSearch.value.trim();
    if (el.filterDateFrom.value) filters.date_from = el.filterDateFrom.value;
    if (el.filterDateTo.value) filters.date_to = el.filterDateTo.value;
    currentPage = 1; hasMore = true;
    loadMessages();
}

function clearFiltersHandler() {
    filters = {};
    el.filterLinks.checked = false;
    el.filterPrices.checked = false;
    el.filterMedia.checked = false;
    el.filterChat.value = '';
    el.filterSearch.value = '';
    el.filterDateFrom.value = '';
    el.filterDateTo.value = '';
    currentPage = 1; hasMore = true;
    loadMessages();
}

function openMedia(url, type) {
    el.mediaModal.classList.remove('hidden');
    el.mediaViewer.innerHTML = type === 'image'
        ? `<img src="${url}" alt="Media">`
        : `<video src="${url}" controls autoplay></video>`;
}

function closeMediaModal() {
    el.mediaModal.classList.add('hidden');
    el.mediaViewer.innerHTML = '';
}

function getInitials(name) {
    if (!name) return '?';
    const parts = name.split(' ').filter(p => p);
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.substring(0, 2).toUpperCase();
}

function formatTime(ts) {
    const d = new Date(ts), now = new Date(), diff = now - d;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function formatNumber(n) {
    if (n == null) return '-';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
}

function escapeHtml(t) { if (!t) return ''; const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
function linkifyText(t) { return escapeHtml(t).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>'); }

// Import Modal Functions
async function openImportModal() {
    el.importModal.classList.remove('hidden');
    el.importResult.classList.add('hidden');
    el.importStatus.classList.add('hidden');
    el.importChatSelect.innerHTML = '<option value="">Loading chats...</option>';

    try {
        const res = await fetch(`${API_BASE}/whatsapp-chats`);
        const chats = await res.json();

        el.importChatSelect.innerHTML = '<option value="">Select a chat...</option>';
        chats.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = `${c.isGroup ? '👥 ' : '👤 '}${c.name}`;
            el.importChatSelect.appendChild(opt);
        });
    } catch (err) {
        el.importChatSelect.innerHTML = '<option value="">Failed to load chats</option>';
    }
}

function closeImportModal() {
    el.importModal.classList.add('hidden');
}

async function startImport() {
    const chatId = el.importChatSelect.value;
    const limit = el.importLimit.value;

    if (!chatId) {
        el.importResult.classList.remove('hidden');
        el.importResult.className = 'import-result error';
        el.importResult.textContent = 'Please select a chat';
        return;
    }

    el.importStatus.classList.remove('hidden');
    el.importResult.classList.add('hidden');
    el.startImportBtn.disabled = true;
    el.importStatusText.textContent = 'Importing messages...';

    try {
        const res = await fetch(`${API_BASE}/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, limit: parseInt(limit) })
        });

        const result = await res.json();

        el.importStatus.classList.add('hidden');
        el.importResult.classList.remove('hidden');

        if (result.error) {
            el.importResult.className = 'import-result error';
            el.importResult.textContent = `Error: ${result.error}`;
        } else {
            el.importResult.className = 'import-result success';
            el.importResult.textContent = `✅ Imported ${result.imported} messages, ${result.duplicates} duplicates skipped`;
            // Refresh messages list
            currentPage = 1; hasMore = true;
            loadMessages();
            loadStats();
            loadChats();
        }
    } catch (err) {
        el.importStatus.classList.add('hidden');
        el.importResult.classList.remove('hidden');
        el.importResult.className = 'import-result error';
        el.importResult.textContent = `Error: ${err.message}`;
    } finally {
        el.startImportBtn.disabled = false;
    }
}

// ============ BACKUP MODAL ============
function openBackupModal() {
    el.backupModal.classList.remove('hidden');
    el.backupResult.classList.add('hidden');
    el.backupProgress.style.width = '0%';
    el.backupStatusText.textContent = 'Ready to export';
}

function closeBackupModal() {
    el.backupModal.classList.add('hidden');
}

let backupPollInterval = null;

async function startBackup() {
    el.startBackupBtn.disabled = true;
    el.backupResult.classList.add('hidden');
    el.backupStatusText.textContent = 'Starting backup...';

    try {
        await fetch(`${API_BASE}/backup`, { method: 'POST' });

        // Poll for progress
        backupPollInterval = setInterval(async () => {
            const res = await fetch(`${API_BASE}/backup/progress`);
            const progress = await res.json();

            el.backupProgress.style.width = `${progress.progress}%`;
            el.backupStatusText.textContent = progress.message;

            if (progress.status === 'complete') {
                clearInterval(backupPollInterval);
                el.backupResult.classList.remove('hidden');
                el.backupResult.className = 'backup-result success';
                el.backupResult.innerHTML = `✅ Backup complete! <a href="/api/backup/files/${progress.backupName}/index.html" target="_blank">View Backup</a>`;
                el.startBackupBtn.disabled = false;
            } else if (progress.status === 'error') {
                clearInterval(backupPollInterval);
                el.backupResult.classList.remove('hidden');
                el.backupResult.className = 'backup-result error';
                el.backupResult.textContent = `Error: ${progress.message}`;
                el.startBackupBtn.disabled = false;
            }
        }, 500);
    } catch (err) {
        el.backupResult.classList.remove('hidden');
        el.backupResult.className = 'backup-result error';
        el.backupResult.textContent = `Error: ${err.message}`;
        el.startBackupBtn.disabled = false;
    }
}

// ============ TELEGRAM MODAL ============
let telegramGroups = [];

async function openTelegramModal() {
    el.telegramModal.classList.remove('hidden');
    el.telegramResult.classList.add('hidden');
    el.telegramGroupList.innerHTML = 'Loading groups...';

    try {
        // Load config
        const configRes = await fetch(`${API_BASE}/telegram/config`);
        const data = await configRes.json();

        el.telegramBotToken.value = data.config.bot_token || '';
        el.telegramChatId.value = data.config.chat_id || '';
        el.telegramEnabled.checked = !!data.config.enabled;

        const watchedIds = data.watchedGroups.map(g => g.chat_id);

        // Load WhatsApp groups
        const chatsRes = await fetch(`${API_BASE}/whatsapp-chats`);
        telegramGroups = await chatsRes.json();

        // Show only groups
        const groups = telegramGroups.filter(c => c.isGroup || c.isCommunity);

        if (groups.length === 0) {
            el.telegramGroupList.innerHTML = '<p>No groups found. Make sure WhatsApp is connected.</p>';
            return;
        }

        el.telegramGroupList.innerHTML = groups.map(g => `
            <label class="group-item">
                <input type="checkbox" value="${g.id}" ${watchedIds.includes(g.id) ? 'checked' : ''}>
                <span class="check"></span>
                <span class="name">${escapeHtml(g.name)}</span>
            </label>
        `).join('');
    } catch (err) {
        el.telegramGroupList.innerHTML = `<p>Error loading: ${err.message}</p>`;
    }
}

function closeTelegramModal() {
    el.telegramModal.classList.add('hidden');
}

async function saveTelegramSettings() {
    el.saveTelegramBtn.disabled = true;
    el.telegramResult.classList.add('hidden');

    try {
        // Save config
        await fetch(`${API_BASE}/telegram/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                botToken: el.telegramBotToken.value,
                chatId: el.telegramChatId.value,
                enabled: el.telegramEnabled.checked
            })
        });

        // Save watched groups
        const checkedInputs = el.telegramGroupList.querySelectorAll('input:checked');
        const groups = Array.from(checkedInputs).map(input => {
            const g = telegramGroups.find(gr => gr.id === input.value);
            return { id: input.value, name: g ? g.name : 'Unknown' };
        });

        await fetch(`${API_BASE}/telegram/groups`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groups })
        });

        el.telegramResult.classList.remove('hidden');
        el.telegramResult.className = 'telegram-result success';
        el.telegramResult.textContent = '✅ Settings saved!';
    } catch (err) {
        el.telegramResult.classList.remove('hidden');
        el.telegramResult.className = 'telegram-result error';
        el.telegramResult.textContent = `Error: ${err.message}`;
    } finally {
        el.saveTelegramBtn.disabled = false;
    }
}

async function testTelegramConnection() {
    el.testTelegramBtn.disabled = true;
    el.telegramResult.classList.add('hidden');

    // Save config first
    await fetch(`${API_BASE}/telegram/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            botToken: el.telegramBotToken.value,
            chatId: el.telegramChatId.value,
            enabled: el.telegramEnabled.checked
        })
    });

    try {
        const res = await fetch(`${API_BASE}/telegram/test`, { method: 'POST' });
        const result = await res.json();

        el.telegramResult.classList.remove('hidden');
        if (result.success) {
            el.telegramResult.className = 'telegram-result success';
            el.telegramResult.textContent = '✅ Test message sent to Telegram!';
        } else {
            el.telegramResult.className = 'telegram-result error';
            el.telegramResult.textContent = `Error: ${result.error}`;
        }
    } catch (err) {
        el.telegramResult.classList.remove('hidden');
        el.telegramResult.className = 'telegram-result error';
        el.telegramResult.textContent = `Error: ${err.message}`;
    } finally {
        el.testTelegramBtn.disabled = false;
    }
}

window.openMedia = openMedia;
