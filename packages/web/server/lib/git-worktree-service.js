import fs from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";
import { spawn } from "child_process";
import { getWorktrees, addWorktree, removeWorktree } from "./git-service.js";

const AGENT_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  COMPLETED: "completed",
  FAILED: "failed",
};

const WORKTREE_STATE_FILE = path.join(
  os.homedir(),
  ".config",
  "openchamber",
  "agents-worktree-state.json",
);

let stateCache = null;
let stateCacheTimestamp = 0;
const STATE_CACHE_TTL = 5000;

const readState = async () => {
  const now = Date.now();
  if (stateCache && now - stateCacheTimestamp < STATE_CACHE_TTL) {
    return stateCache;
  }

  try {
    await fs.mkdir(path.dirname(WORKTREE_STATE_FILE), { recursive: true });
    const data = await fs.readFile(WORKTREE_STATE_FILE, "utf8");
    stateCache = JSON.parse(data);
    stateCacheTimestamp = now;
    return stateCache;
  } catch (error) {
    if (error?.code === "ENOENT") {
      const initialState = { agents: [] };
      stateCache = initialState;
      stateCacheTimestamp = now;
      return initialState;
    }
    throw error;
  }
};

const writeState = async (state) => {
  try {
    await fs.mkdir(path.dirname(WORKTREE_STATE_FILE), { recursive: true });
    await fs.writeFile(
      WORKTREE_STATE_FILE,
      JSON.stringify(state, null, 2),
      "utf8",
    );
    stateCache = state;
    stateCacheTimestamp = Date.now();
  } catch (error) {
    console.error("[git-worktree-service] Failed to write state:", error);
    throw error;
  }
};

class Mutex {
  constructor() {
    this._queue = [];
    this._locked = false;
  }

  lock() {
    return new Promise((resolve) => {
      if (this._locked) {
        this._queue.push(resolve);
      } else {
        this._locked = true;
        resolve();
      }
    });
  }

  unlock() {
    if (this._queue.length > 0) {
      const resolve = this._queue.shift();
      resolve();
    } else {
      this._locked = false;
    }
  }
}

const stateMutex = new Mutex();

const runWithLock = async (fn) => {
  await stateMutex.lock();
  try {
    return await fn();
  } finally {
    stateMutex.unlock();
  }
};

export const getAgent = async (agentId) => {
  const state = await readState();
  return state.agents.find((a) => a.id === agentId) || null;
};

export const getAllAgents = async (options = {}) => {
  const { projectDirectory, status } = options;
  const state = await readState();

  let agents = [...state.agents];

  if (status) {
    agents = agents.filter((a) => a.status === status);
  }

  if (projectDirectory) {
    agents = agents.filter((a) => a.projectDirectory === projectDirectory);
  }

  return agents;
};

export const spawnAgent = async (params) => {
  const {
    projectDirectory,
    agentName,
    agentType = "subagent",
    task,
    branchName,
    baseBranch = "main",
  } = params;

  if (!projectDirectory) {
    throw new Error("projectDirectory is required");
  }

  if (!agentName) {
    throw new Error("agentName is required");
  }

  const existingAgents = await getAllAgents({ projectDirectory });
  const activeAgentCount = existingAgents.filter(
    (a) => a.status === AGENT_STATUS.ACTIVE,
  ).length;

  if (activeAgentCount >= 10) {
    throw new Error("Maximum of 10 concurrent active agents reached");
  }

  const agentId = crypto.randomUUID();
  const timestamp = Date.now();

  const worktreeDir = path.join(
    projectDirectory,
    ".opencode",
    "worktrees",
    agentId,
  );

  const finalBranchName =
    branchName ||
    `agent/${agentName.toLowerCase().replace(/\s+/g, "-")}-${agentId.slice(0, 8)}`;

  const agent = {
    id: agentId,
    name: agentName,
    type: agentType,
    status: AGENT_STATUS.PENDING,
    projectDirectory,
    worktreePath: worktreeDir,
    branchName: finalBranchName,
    baseBranch,
    task: task || null,
    processId: null,
    createdAt: timestamp,
    startedAt: null,
    completedAt: null,
    error: null,
  };

  try {
    await runWithLock(async () => {
      const state = await readState();
      state.agents.push(agent);
      await writeState(state);
    });

    const worktreeResult = await addWorktree(
      projectDirectory,
      worktreeDir,
      finalBranchName,
      {
        createBranch: true,
        startPoint: baseBranch,
      },
    );

    if (!worktreeResult.success) {
      throw new Error("Failed to create worktree");
    }

    await updateAgent(agentId, {
      status: AGENT_STATUS.ACTIVE,
      startedAt: Date.now(),
    });

    console.log(
      `[git-worktree-service] Agent spawned: ${agentId} (${agentName}) on branch ${finalBranchName}`,
    );

    return agent;
  } catch (error) {
    await updateAgent(agentId, {
      status: AGENT_STATUS.FAILED,
      error: error.message,
      completedAt: Date.now(),
    });

    try {
      await removeWorktree(projectDirectory, worktreeDir, { force: true });
    } catch (cleanupError) {
      console.warn(
        "[git-worktree-service] Failed to cleanup worktree:",
        cleanupError,
      );
    }

    throw error;
  }
};

export const updateAgent = async (agentId, updates) => {
  return runWithLock(async () => {
    const state = await readState();
    const agentIndex = state.agents.findIndex((a) => a.id === agentId);

    if (agentIndex === -1) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    state.agents[agentIndex] = {
      ...state.agents[agentIndex],
      ...updates,
    };

    await writeState(state);
    return state.agents[agentIndex];
  });
};

export const completeAgent = async (agentId, result = null) => {
  return updateAgent(agentId, {
    status: AGENT_STATUS.COMPLETED,
    completedAt: Date.now(),
    result,
  });
};

export const failAgent = async (agentId, error) => {
  const agent = await getAgent(agentId);
  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  await updateAgent(agentId, {
    status: AGENT_STATUS.FAILED,
    error: error?.message || String(error),
    completedAt: Date.now(),
  });

  try {
    if (agent.projectDirectory && agent.worktreePath) {
      await removeWorktree(agent.projectDirectory, agent.worktreePath, {
        force: true,
      });
    }
  } catch (cleanupError) {
    console.warn(
      "[git-worktree-service] Failed to cleanup worktree:",
      cleanupError,
    );
  }
};

export const terminateAgent = async (agentId) => {
  const agent = await getAgent(agentId);
  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  if (agent.processId) {
    try {
      process.kill(agent.processId);
    } catch (error) {
      console.warn("[git-worktree-service] Failed to kill process:", error);
    }
  }

  try {
    if (agent.projectDirectory && agent.worktreePath) {
      await removeWorktree(agent.projectDirectory, agent.worktreePath, {
        force: true,
      });
    }
  } catch (cleanupError) {
    console.warn(
      "[git-worktree-service] Failed to cleanup worktree:",
      cleanupError,
    );
  }

  await runWithLock(async () => {
    const state = await readState();
    state.agents = state.agents.filter((a) => a.id !== agentId);
    await writeState(state);
  });

  console.log(`[git-worktree-service] Agent terminated: ${agentId}`);
  return { success: true };
};

export const startAgentProcess = async (
  agentId,
  command,
  args = [],
  options = {},
) => {
  const agent = await getAgent(agentId);
  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  if (agent.status !== AGENT_STATUS.ACTIVE) {
    throw new Error(`Agent is not in active status: ${agent.status}`);
  }

  const {
    cwd = agent.worktreePath,
    env = process.env,
    stdio = ["pipe", "pipe", "pipe"],
  } = options;

  const childProcess = spawn(command, args, {
    cwd,
    env,
    stdio,
  });

  await updateAgent(agentId, {
    processId: childProcess.pid,
  });

  childProcess.on("exit", async (code, signal) => {
    console.log(
      `[git-worktree-service] Process ${agentId} exited: code=${code}, signal=${signal}`,
    );

    if (code === 0) {
      await completeAgent(agentId, { exitCode: 0 });
    } else {
      await failAgent(agentId, new Error(`Process exited with code ${code}`));
    }
  });

  childProcess.on("error", async (error) => {
    console.error(`[git-worktree-service] Process ${agentId} error:`, error);
    await failAgent(agentId, error);
  });

  return childProcess;
};

export const getAgentWorktrees = async (projectDirectory) => {
  const allWorktrees = await getWorktrees(projectDirectory);
  const agentWorktrees = [];

  for (const worktree of allWorktrees) {
    if (
      worktree.worktree &&
      worktree.worktree.includes(".opencode" + path.sep + "worktrees")
    ) {
      const agents = await getAllAgents();
      const agent = agents.find((a) => a.worktreePath === worktree.worktree);
      if (agent) {
        agentWorktrees.push({
          ...worktree,
          agentId: agent.id,
          agentName: agent.name,
          status: agent.status,
        });
      }
    }
  }

  return agentWorktrees;
};

export const cleanupStaleAgents = async (projectDirectory) => {
  const state = await readState();
  const allWorktrees = await getWorktrees(projectDirectory);

  const staleAgents = state.agents.filter((agent) => {
    if (
      agent.status !== AGENT_STATUS.COMPLETED &&
      agent.status !== AGENT_STATUS.FAILED
    ) {
      return false;
    }

    const isOld = Date.now() - agent.completedAt > 24 * 60 * 60 * 1000;

    const worktreeExists = allWorktrees.some(
      (wt) => wt.worktree === agent.worktreePath,
    );

    return isOld && !worktreeExists;
  });

  if (staleAgents.length === 0) {
    return { cleaned: 0 };
  }

  await runWithLock(async () => {
    const freshState = await readState();
    freshState.agents = freshState.agents.filter(
      (a) => !staleAgents.some((sa) => sa.id === a.id),
    );
    await writeState(freshState);
  });

  console.log(
    `[git-worktree-service] Cleaned up ${staleAgents.length} stale agents`,
  );
  return { cleaned: staleAgents.length };
};

export const getAgentStats = async (projectDirectory) => {
  const agents = await getAllAgents({ projectDirectory });

  const stats = {
    total: agents.length,
    pending: 0,
    active: 0,
    completed: 0,
    failed: 0,
  };

  for (const agent of agents) {
    if (stats[agent.status] !== undefined) {
      stats[agent.status]++;
    }
  }

  return stats;
};

export { AGENT_STATUS };
