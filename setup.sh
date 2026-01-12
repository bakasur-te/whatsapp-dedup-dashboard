#!/bin/bash

# WhatsApp Dedup Dashboard - Ubuntu Server Setup Script
# Run this on a fresh Ubuntu VM

set -e

echo "=============================================="
echo "WhatsApp Dedup Dashboard - Setup Script"
echo "=============================================="

# Update system
echo "[1/4] Updating system..."
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker
echo "[2/4] Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    echo "Docker installed. You may need to logout and login for group changes."
else
    echo "Docker already installed."
fi

# Install Docker Compose
echo "[3/4] Installing Docker Compose..."
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    sudo apt-get install -y docker-compose-plugin
else
    echo "Docker Compose already installed."
fi

# Create app directory
echo "[4/4] Setting up application..."
APP_DIR="$HOME/whatsapp-dedup"
mkdir -p "$APP_DIR"
cd "$APP_DIR"

echo ""
echo "=============================================="
echo "Setup Complete!"
echo "=============================================="
echo ""
echo "Next steps:"
echo "1. Copy the application files to: $APP_DIR"
echo "   From Windows: scp -r c:/Users/Buzz/Documents/WA/* user@10.55.1.222:~/whatsapp-dedup/"
echo ""
echo "2. Build and start the container:"
echo "   cd ~/whatsapp-dedup"
echo "   docker compose up -d --build"
echo ""
echo "3. View logs to get QR code:"
echo "   docker compose logs -f"
echo ""
echo "4. Access dashboard at: http://10.55.1.222:3000"
echo ""
