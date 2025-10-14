#!/usr/bin/env node
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const source = join(__dirname, "preload.cjs");
const targetDir = join(__dirname, "..", "dist-electron");
const target = join(targetDir, "preload.cjs");

mkdirSync(targetDir, { recursive: true });
copyFileSync(source, target);
console.log(`Copied preload script to ${target}`);
