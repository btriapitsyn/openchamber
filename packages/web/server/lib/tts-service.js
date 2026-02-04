import fs from "fs";
import path from "path";
import os from "os";

const USAGE_FILE = path.join(
  os.homedir(),
  ".config",
  "openchamber",
  "tts-usage.json",
);

const ensureDir = (filePath) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const getUsage = () => {
  if (!fs.existsSync(USAGE_FILE)) {
    return {
      totalCharacters: 0,
      lastUsed: null,
      monthlyLimit: 1000000, // Hypothetical 1M chars/mo limit
    };
  }
  try {
    return JSON.parse(fs.readFileSync(USAGE_FILE, "utf-8"));
  } catch {
    return { totalCharacters: 0, lastUsed: null, monthlyLimit: 1000000 };
  }
};

const saveUsage = (usage) => {
  ensureDir(USAGE_FILE);
  fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2));
};

export const trackTtsUsage = (text) => {
  const usage = getUsage();
  usage.totalCharacters += text.length;
  usage.lastUsed = new Date().toISOString();
  saveUsage(usage);
  return usage;
};

export const getTtsMetadata = () => {
  const usage = getUsage();
  const usedPercent = Math.min(
    100,
    (usage.totalCharacters / usage.monthlyLimit) * 100,
  );

  return {
    providerId: "openai-tts",
    providerName: "OpenAI Voice",
    ok: true,
    configured: true,
    usage: {
      windows: {
        monthly: {
          usedPercent,
          remainingPercent: 100 - usedPercent,
          valueLabel: `${usage.totalCharacters.toLocaleString()} / ${usage.monthlyLimit.toLocaleString()} chars`,
          resetAt: null, // TBD
        },
      },
    },
  };
};
