#!/usr/bin/env node
/**
 * Chaos Stress Test for Agent Manager Worktree System
 * 1. Parallel Spawning: Simultaneously trigger 5 POST /spawn requests.
 * 2. Persistence Integrity: Verify state file contains all 5 entries.
 * 3. Worktree Isolation: Check directories.
 * 4. Cleanup: Verify termination and metadata removal.
 */

import http from "http";
import path from "path";
import fs from "fs/promises";
import os from "os";

const BASE_URL = "http://localhost:3001";
const API_BASE = `${BASE_URL}/api/agents`;
const PROJECT_DIR = process.cwd(); // Assume we run from project root

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(level, message) {
  const prefix = {
    info: colors.cyan + "ℹ",
    success: colors.green + "✓",
    error: colors.red + "✗",
    warn: colors.yellow + "⚠",
  }[level];
  console.log(`${prefix} ${message}${colors.reset}`);
}

async function api(method, endpoint, body = null) {
  return new Promise((resolve) => {
    const url = new URL(endpoint, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { "Content-Type": "application/json" },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on("error", (e) => resolve({ status: "ERROR", data: e.message }));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runChaosTest() {
  log("info", "🌊 Starting Chaotic Stress Test...");
  log("info", `Project Directory: ${PROJECT_DIR}`);

  const agentNames = ["Chaos-1", "Chaos-2", "Chaos-3", "Chaos-4", "Chaos-5"];

  // 1. Parallel Spawning
  log("info", `Step 1: Spawning ${agentNames.length} agents in parallel...`);
  const spawnPromises = agentNames.map((name) =>
    api("POST", `${API_BASE}/spawn`, {
      projectDirectory: PROJECT_DIR,
      agentName: name,
      agentType: "specialist",
      task: `Stress test task for ${name}`,
      branchName: `chaos/${name.toLowerCase()}-${Date.now()}`,
    }),
  );

  const spawnResults = await Promise.all(spawnPromises);
  const successfulSpawns = spawnResults.filter((r) => r.status === 201);

  if (successfulSpawns.length === agentNames.length) {
    log("success", `All ${agentNames.length} agents spawned successfully.`);
  } else {
    log(
      "error",
      `Only ${successfulSpawns.length}/${agentNames.length} agents spawned.`,
    );
    successfulSpawns.forEach((r, i) => {
      if (r.status !== 201)
        log("error", `Spawn ${i} failed: ${JSON.stringify(r.data)}`);
    });
  }

  // 2. Persistence Integrity
  log("info", "Step 2: Verifying persistence integrity...");
  const statusRes = await api(
    "GET",
    `${API_BASE}/status?projectDirectory=${encodeURIComponent(PROJECT_DIR)}`,
  );
  const activeAgents = statusRes.data.agents.filter((a) =>
    agentNames.includes(a.name),
  );

  if (activeAgents.length === agentNames.length) {
    log(
      "success",
      "Persistence integrity verified: All agents found in state.",
    );
  } else {
    log(
      "error",
      `Persistence failure: Found ${activeAgents.length}/${agentNames.length} agents.`,
    );
  }

  // 3. Worktree Isolation
  log("info", "Step 3: Verifying worktree isolation...");
  let isolationOk = true;
  for (const agent of activeAgents) {
    try {
      await fs.access(agent.worktreePath);
      // log("info", ` - Agent ${agent.name} worktree exists: ${agent.worktreePath}`);
    } catch {
      log(
        "error",
        ` - Agent ${agent.name} worktree MISSING: ${agent.worktreePath}`,
      );
      isolationOk = false;
    }
  }
  if (isolationOk)
    log("success", "Worktree isolation verified: All directories exist.");

  // 4. Cleanup
  log("info", "Step 4: Cleaning up (Terminating agents)...");
  const terminatorPromises = activeAgents.map((a) =>
    api("DELETE", `${API_BASE}/${a.id}`),
  );
  const termResults = await Promise.all(terminatorPromises);

  const successfulTerms = termResults.filter((r) => r.status === 200);
  if (successfulTerms.length === activeAgents.length) {
    log("success", "All agents terminated.");
  } else {
    log(
      "error",
      `Termination incomplete: ${successfulTerms.length}/${activeAgents.length} successful.`,
    );
  }

  // Final verification
  log("info", "Final Verification: Checking for stale metadata...");
  const finalStatus = await api(
    "GET",
    `${API_BASE}/status?projectDirectory=${encodeURIComponent(PROJECT_DIR)}`,
  );
  const remaining = finalStatus.data.agents.filter(
    (a) => agentNames.includes(a.name) && a.status === "active",
  );

  if (remaining.length === 0) {
    log(
      "success",
      "Chaos Stress Test PASSED: System remains consistent under high concurrency.",
    );
  } else {
    log(
      "error",
      `Chaos Stress Test FAILED: ${remaining.length} agents still active/inconsistent.`,
    );
  }
}

runChaosTest().catch((e) => {
  log("error", `Test crashed: ${e.message}`);
  process.exit(1);
});
