#!/bin/bash

# Startup script for Copilot Session Viewer

export PATH="/opt/homebrew/bin:/opt/homebrew/opt/node@22/bin:$PATH"

cd "$(dirname "$0")"

echo "🚀 Starting Copilot Session Viewer..."
node server.js
