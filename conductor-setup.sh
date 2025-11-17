#!/bin/bash

# Setup script for OpenChamber workspace
# Installs dependencies required for building and deployment

set -e

echo "Installing dependencies..."
pnpm install

echo "[OK] Setup complete"
