#!/bin/bash

# Azure Virtual Desktop Inventory Server - Start Script

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🚀 Starting Azure Virtual Desktop Inventory Server..."
echo ""

# Check if PowerShell is installed
if ! command -v pwsh &> /dev/null; then
    echo "❌ PowerShell (pwsh) is not installed."
    echo "Please install PowerShell from: https://github.com/PowerShell/PowerShell"
    exit 1
fi

# Kill any existing server instances
pkill -f "Start-AVDInventoryServer.ps1" 2>/dev/null
sleep 1

# Start the server with all command line arguments passed through
cd "$SCRIPT_DIR"
pwsh -File "./Start-AVDInventoryServer.ps1" "$@"
