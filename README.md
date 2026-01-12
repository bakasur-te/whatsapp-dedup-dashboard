# WhatsApp Dedup Dashboard

> 📱 Self-hosted WhatsApp message deduplication dashboard with backup and Telegram forwarding

[![Docker](https://img.shields.io/badge/Docker-Ready-blue?logo=docker)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green?logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

A lightweight, self-hosted solution to capture WhatsApp messages, automatically deduplicate them, and view in a clean dashboard. Perfect for managing message overload from multiple groups and communities.

## ✨ Features

- **Real-time Capture** - Captures all incoming WhatsApp messages using whatsapp-web.js
- **Smart Deduplication** - Identifies duplicates based on sender + content or media hash
- **Dark Theme Dashboard** - Modern, responsive UI with filters and search
- **HTML/JSON Backup** - Export all unique messages as browsable HTML files
- **Telegram Forwarding** - Forward messages from selected groups to Telegram with auto-merge
- **Media Storage** - Saves images and videos locally (only unique copies)
- **Retention Policy** - Auto-cleanup of old group messages (configurable)

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- Ubuntu/Debian server (tested on Ubuntu 22.04)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/whatsapp-dedup-dashboard.git
   cd whatsapp-dedup-dashboard
   ```

2. **Start the container**
   ```bash
   docker compose up -d --build
   ```

3. **Scan QR Code**
   - Open `http://your-server:3000`
   - Scan the QR code with WhatsApp (Settings → Linked Devices → Link a Device)

4. **Done!** Messages will start appearing in the dashboard.

## 📸 Screenshots

| Dashboard | Telegram Settings | Backup |
|-----------|-------------------|--------|
| Dark theme with filters | Configure bot forwarding | Export to HTML/JSON |

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATA_DIR` | `/data` | Directory for database and media |
| `TZ` | `Asia/Kolkata` | Timezone for timestamps |

### Data Retention

- **Group/Community messages**: 30 days (configurable in `retention.js`)
- **Individual chats**: Kept forever
- **Media files**: Deduplicated, orphaned files auto-deleted

## 📲 Telegram Integration

Forward unique messages from buy/sell groups to Telegram:

1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Create a channel/group and add the bot as admin
3. Get chat ID using [@RawDataBot](https://t.me/RawDataBot)
4. Configure in Dashboard → Tools → 📲 Telegram Settings

**Features:**
- 30-second message merge (same sender's messages combined)
- Media attachments included
- Only unique messages forwarded

## 📁 Backup Export

Export all unique messages:

1. Dashboard → Tools → 📁 Export Backup
2. Choose export options
3. Download HTML files for offline viewing

**Output structure:**
```
backup/
├── index.html          # Chat list
├── chats/*.html        # Individual chat history
├── json/backup.json    # Raw data
└── media/              # All media files
```

## 🏗️ Project Structure

```
whatsapp-dedup-dashboard/
├── src/
│   ├── index.js        # Entry point
│   ├── whatsapp.js     # WhatsApp client
│   ├── database.js     # SQLite setup
│   ├── api.js          # REST endpoints
│   ├── backup.js       # HTML/JSON export
│   ├── telegram.js     # Telegram integration
│   ├── deduplication.js # Hash functions
│   └── retention.js    # Cleanup scheduler
├── public/
│   ├── index.html      # Dashboard UI
│   ├── styles.css      # Dark theme
│   └── app.js          # Frontend logic
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | Connection status |
| GET | `/api/stats` | Message statistics |
| GET | `/api/chats` | List all chats |
| GET | `/api/messages` | Filtered messages |
| POST | `/api/import` | Import chat history |
| POST | `/api/backup` | Start backup |
| GET | `/api/backup/progress` | Backup status |
| POST | `/api/telegram/config` | Save Telegram settings |

## 🐳 Docker Commands

```bash
# Start
docker compose up -d

# View logs
docker compose logs -f

# Restart
docker compose restart

# Stop
docker compose down

# Rebuild after changes
docker compose up -d --build
```

## ⚠️ Troubleshooting

### "Profile in use" error
```bash
docker compose down
sudo rm -f data/session/session/Singleton*
docker compose up -d
```

### Permission denied
```bash
sudo chown -R $USER:$USER data/
```

### QR code not appearing
Check logs: `docker compose logs -f`

## 📄 License

MIT License - feel free to use and modify.

## � Acknowledgments

This project was created with the assistance of **Claude AI** (Anthropic).

## �🤝 Contributing

Contributions welcome! Please open an issue first to discuss changes.

---

**Disclaimer:** This project uses [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) which is not affiliated with WhatsApp. Use responsibly and in accordance with WhatsApp's Terms of Service.
