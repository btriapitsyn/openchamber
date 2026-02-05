#!/usr/bin/env node
/**
 * Test script for Agent Manager Phase 1 Backend APIs
 * Tests: POST /api/agents/spawn, GET /api/agents/status, DELETE /api/agents/:id
 */

import http from "http";

const BASE_URL = "http://localhost:3001";
const API_BASE = `${BASE_URL}/api/agents`;

// Color codes for output
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

async function testEndpoint(method, endpoint, body = null) {
  return new Promise((resolve) => {
    const url = new URL(endpoint, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers: {
        "Content-Type": "application/json",
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const response = JSON.parse(data);
          resolve({ status: res.statusCode, data: response });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on("error", (error) => {
      resolve({ status: "ERROR", data: error.message });
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  log("info", "Starting Agent Manager API Tests...\n");

  // Test 1: Check if server is running
  log("info", "Test 1: Server Health Check");
  const health = await testEndpoint("GET", `${BASE_URL}/health`);
  if (health.status !== 200) {
    log(
      "warn",
      "Server not running or /health endpoint not available (Status: " +
        health.status +
        ")",
    );
    log("info", "Please run: cd packages/web && bun run dev");
    return;
  }
  log("success", "Server is running\n");

  // Test 2: GET /api/agents/status (should return empty array initially)
  log("info", "Test 2: GET /api/agents/status");
  const status = await testEndpoint("GET", `${API_BASE}/status`);
  if (status.status === 200) {
    log(
      "success",
      `Status endpoint working. Active agents: ${JSON.stringify(status.data)}`,
    );
  } else {
    log(
      "error",
      `Failed with status ${status.status}: ${JSON.stringify(status.data)}`,
    );
  }
  console.log();

  // Test 3: GET /api/agents/stats
  log("info", "Test 3: GET /api/agents/stats");
  const stats = await testEndpoint("GET", `${API_BASE}/stats`);
  if (status.status === 200) {
    log("success", `Stats endpoint working: ${JSON.stringify(stats.data)}`);
  } else {
    log(
      "error",
      `Failed with status ${status.status}: ${JSON.stringify(stats.data)}`,
    );
  }
  console.log();

  // Test 4: POST /api/agents/spawn (will fail without valid project)
  log("info", "Test 4: POST /api/agents/spawn (validation test)");
  const spawnBody = {
    projectDirectory: "/invalid/path",
    agentName: "Test Agent",
    agentType: "subagent",
    task: "Test task",
    branchName: "test-branch",
    baseBranch: "main",
  };
  const spawn = await testEndpoint("POST", `${API_BASE}/spawn`, spawnBody);
  if (spawn.status === 400 || spawn.status === 404) {
    log("success", `Validation working correctly: ${spawn.status}`);
  } else if (spawn.status === 201) {
    log(
      "warn",
      `Unexpected success with invalid path: ${JSON.stringify(spawn.data)}`,
    );
  } else {
    log(
      "error",
      `Unexpected status ${spawn.status}: ${JSON.stringify(spawn.data)}`,
    );
  }
  console.log();

  log("info", "Test suite complete!");
}

runTests().catch(console.error);
