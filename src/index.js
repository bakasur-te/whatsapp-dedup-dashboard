const express = require('express');
const cors = require('cors');
const path = require('path');

require('./database');
const { initializeClient } = require('./whatsapp');
const { scheduleCleanup } = require('./retention');
const apiRouter = require('./api');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/api', apiRouter);

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║     WhatsApp Message Deduplication Dashboard              ║
║     Dashboard: http://10.55.1.222:${PORT}                    ║
╚═══════════════════════════════════════════════════════════╝
    `);
    initializeClient();
    scheduleCleanup();
});

process.on('SIGINT', () => { console.log('\nShutting down...'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\nShutting down...'); process.exit(0); });
