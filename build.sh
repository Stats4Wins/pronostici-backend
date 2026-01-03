#!/bin/bash
echo "📦 Installing dependencies..."
npm install --production --no-optional

echo "🎭 Installing Chromium dependencies..."
apt-get update
apt-get install -y chromium chromium-sandbox

echo "✅ Build complete!"
