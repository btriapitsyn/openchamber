import { EventEmitter } from "events";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";

const MESSAGE_TYPES = new Set([
  "spawn",
  "barrier_sync",
  "leader_election",
  "task_partition",
  "status_update",
  "result",
  "error",
]);

const BARRIER_TIMEOUT_MS = 5 * 60 * 1000;
const ELECTION_TIMEOUT_MS = 30 * 1000;
const SWARM_STATE_FILE = ".openchamber/swarm-state.json";

class SwarmCoordinator extends EventEmitter {
  constructor() {
    super();
    this.activeBarriers = new Map();
    this.activeElections = new Map();
    this.taskPartitions = new Map();
    this.messageSubscribers = new Map();
    this.worktreeAgents = new Map();
    this.isDirty = false;
    this.persistenceLock = Promise.resolve();
  }

  async initialize(directory) {
    this.directory = directory;
    this.statePath = path.join(directory, SWARM_STATE_FILE);
    await this.loadFromDisk();
  }

  async loadFromDisk() {
    try {
      const data = await fs.readFile(this.statePath, "utf8");
      const parsed = JSON.parse(data);

      if (!parsed || typeof parsed !== "object") {
        console.warn("[swarm-coordinator] Invalid state format, resetting");
        return;
      }

      this.worktreeAgents = new Map();
      if (Array.isArray(parsed.worktreeAgents)) {
        for (const entry of parsed.worktreeAgents) {
          if (entry.worktree && Array.isArray(entry.agents)) {
            this.worktreeAgents.set(entry.worktree, new Set(entry.agents));
          }
        }
      }

      this.taskPartitions = new Map();
      if (Array.isArray(parsed.taskPartitions)) {
        for (const entry of parsed.taskPartitions) {
          if (entry.partitionId) {
            this.taskPartitions.set(entry.partitionId, entry);
          }
        }
      }

      console.log("[swarm-coordinator] Loaded state from disk");
    } catch (error) {
      if (error?.code === "ENOENT") {
        console.log("[swarm-coordinator] No existing state found");
        return;
      }
      console.error("[swarm-coordinator] Failed to load state:", error);
    }
  }

  async persistToDisk() {
    await this.persistenceLock;

    this.persistenceLock = (async () => {
      try {
        await fs.mkdir(path.dirname(this.statePath), { recursive: true });

        const worktreeAgents = Array.from(this.worktreeAgents.entries()).map(([worktree, agents]) => ({
          worktree,
          agents: Array.from(agents),
        }));

        const taskPartitions = Array.from(this.taskPartitions.values());

        const data = JSON.stringify({
          worktreeAgents,
          taskPartitions,
        }, null, 2);

        await fs.writeFile(this.statePath, data, "utf8");

        this.isDirty = false;
      } catch (error) {
        console.error("[swarm-coordinator] Failed to persist state:", error);
        throw error;
      }
    })();

    return this.persistenceLock;
  }

  markDirty() {
    if (!this.isDirty) {
      this.isDirty = true;
      this.persistToDisk().catch((err) => {
        console.error("[swarm-coordinator] Background persistence failed:", err);
      });
    }
  }

  registerWorktreeAgent(agentId, worktreePath) {
    const normalizedWorktree = path.resolve(worktreePath);

    if (!this.worktreeAgents.has(normalizedWorktree)) {
      this.worktreeAgents.set(normalizedWorktree, new Set());
    }

    this.worktreeAgents.get(normalizedWorktree).add(agentId);

    this.markDirty();
    console.log(`[swarm-coordinator] Agent ${agentId} registered for worktree: ${normalizedWorktree}`);

    this.publish("spawn", {
      agentId,
      worktree: normalizedWorktree,
      timestamp: Date.now(),
    });
  }

  unregisterWorktreeAgent(agentId, worktreePath) {
    const normalizedWorktree = path.resolve(worktreePath);

    const agentSet = this.worktreeAgents.get(normalizedWorktree);
    if (agentSet) {
      agentSet.delete(agentId);

      if (agentSet.size === 0) {
        this.worktreeAgents.delete(normalizedWorktree);
      }
    }

    this.markDirty();
  }

  subscribe(messageType, handler) {
    if (!MESSAGE_TYPES.has(messageType)) {
      throw new Error(`Invalid message type: ${messageType}`);
    }

    if (!this.messageSubscribers.has(messageType)) {
      this.messageSubscribers.set(messageType, new Set());
    }

    this.messageSubscribers.get(messageType).add(handler);

    return () => {
      const subscribers = this.messageSubscribers.get(messageType);
      if (subscribers) {
        subscribers.delete(handler);
      }
    };
  }

  publish(messageType, payload) {
    if (!MESSAGE_TYPES.has(messageType)) {
      throw new Error(`Invalid message type: ${messageType}`);
    }

    const message = {
      id: crypto.randomUUID(),
      type: messageType,
      payload,
      timestamp: Date.now(),
    };

    const subscribers = this.messageSubscribers.get(messageType);
    if (subscribers) {
      for (const handler of subscribers) {
        try {
          handler(message);
        } catch (error) {
          console.error(`[swarm-coordinator] Subscriber error for ${messageType}:`, error);
        }
      }
    }

    this.emit(`message:${messageType}`, message);

    return message;
  }

  async createBarrier(barrierId, expectedAgents, timeoutMs = BARRIER_TIMEOUT_MS) {
    if (this.activeBarriers.has(barrierId)) {
      throw new Error(`Barrier ${barrierId} already exists`);
    }

    const barrier = {
      id: barrierId,
      expectedAgents,
      readyAgents: new Set(),
      createdAt: Date.now(),
      timeout: timeoutMs,
      completed: false,
      resolve: null,
      reject: null,
    };

    const promise = new Promise((resolve, reject) => {
      barrier.resolve = resolve;
      barrier.reject = reject;
    });

    this.activeBarriers.set(barrierId, barrier);

    const timeoutHandle = setTimeout(() => {
      this.completeBarrier(barrierId, false, "timeout");
    }, timeoutMs);

    barrier.timeoutHandle = timeoutHandle;

    console.log(`[swarm-coordinator] Barrier ${barrierId} created, waiting for ${expectedAgents.length} agents`);

    this.publish("barrier_sync", {
      barrierId,
      action: "created",
      expectedCount: expectedAgents.length,
    });

    return promise;
  }

  signalBarrier(agentId, barrierId) {
    const barrier = this.activeBarriers.get(barrierId);
    if (!barrier) {
      console.warn(`[swarm-coordinator] Barrier ${barrierId} not found`);
      return { success: false, error: "not_found" };
    }

    if (barrier.completed) {
      console.warn(`[swarm-coordinator] Barrier ${barrierId} already completed`);
      return { success: false, error: "already_completed" };
    }

    barrier.readyAgents.add(agentId);

    console.log(`[swarm-coordinator] Agent ${agentId} reached barrier ${barrierId} (${barrier.readyAgents.size}/${barrier.expectedAgents.length})`);

    if (barrier.readyAgents.size === barrier.expectedAgents.length) {
      this.completeBarrier(barrierId, true);
    }

    return { success: true, readyCount: barrier.readyAgents.size, totalCount: barrier.expectedAgents.length };
  }

  completeBarrier(barrierId, success, reason = null) {
    const barrier = this.activeBarriers.get(barrierId);
    if (!barrier || barrier.completed) {
      return;
    }

    barrier.completed = true;

    if (barrier.timeoutHandle) {
      clearTimeout(barrier.timeoutHandle);
    }

    this.activeBarriers.delete(barrierId);

    const result = {
      barrierId,
      success,
      readyAgents: Array.from(barrier.readyAgents),
      completedAt: Date.now(),
      reason,
    };

    if (success && barrier.resolve) {
      barrier.resolve(result);
    } else if (!success && barrier.reject) {
      barrier.reject(new Error(reason || "Barrier failed"));
    }

    this.publish("barrier_sync", {
      barrierId,
      action: "completed",
      success,
      readyCount: barrier.readyAgents.size,
      reason,
    });

    console.log(`[swarm-coordinator] Barrier ${barrierId} ${success ? "completed" : "failed"}`);
  }

  async conductElection(electionId, candidates) {
    if (this.activeElections.has(electionId)) {
      throw new Error(`Election ${electionId} already in progress`);
    }

    const election = {
      id: electionId,
      candidates: new Set(candidates),
      votes: new Map(),
      createdAt: Date.now(),
      completed: false,
      resolve: null,
      reject: null,
    };

    const promise = new Promise((resolve, reject) => {
      election.resolve = resolve;
      election.reject = reject;
    });

    this.activeElections.set(electionId, election);

    const timeoutHandle = setTimeout(() => {
      this.completeElection(electionId, null, "timeout");
    }, ELECTION_TIMEOUT_MS);

    election.timeoutHandle = timeoutHandle;

    console.log(`[swarm-coordinator] Election ${electionId} started with ${candidates.length} candidates`);

    this.publish("leader_election", {
      electionId,
      action: "started",
      candidates: Array.from(candidates),
    });

    return promise;
  }

  castVote(electionId, voterId, candidateId) {
    const election = this.activeElections.get(electionId);
    if (!election) {
      return { success: false, error: "not_found" };
    }

    if (election.completed) {
      return { success: false, error: "already_completed" };
    }

    if (!election.candidates.has(candidateId)) {
      return { success: false, error: "invalid_candidate" };
    }

    election.votes.set(voterId, candidateId);

    console.log(`[swarm-coordinator] ${voterId} voted for ${candidateId} in election ${electionId}`);

    const voteCounts = new Map();
    for (const candidate of election.votes.values()) {
      voteCounts.set(candidate, (voteCounts.get(candidate) || 0) + 1);
    }

    const maxVotes = Math.max(...voteCounts.values());
    const leaders = Array.from(voteCounts.entries()).filter(([_, count]) => count === maxVotes);

    if (leaders.length === 1 && voteCounts.get(leaders[0][0]) > Math.floor(candidates.length / 2)) {
      this.completeElection(electionId, leaders[0][0]);
    }

    return { success: true, votes: Array.from(election.votes.entries()) };
  }

  completeElection(electionId, winner, reason = null) {
    const election = this.activeElections.get(electionId);
    if (!election || election.completed) {
      return;
    }

    election.completed = true;

    if (election.timeoutHandle) {
      clearTimeout(election.timeoutHandle);
    }

    this.activeElections.delete(electionId);

    const result = {
      electionId,
      winner,
      votes: Array.from(election.votes.entries()),
      completedAt: Date.now(),
      reason,
    };

    if (winner && election.resolve) {
      election.resolve(result);
    } else if (!winner && election.reject) {
      election.reject(new Error(reason || "Election failed"));
    }

    this.publish("leader_election", {
      electionId,
      action: "completed",
      winner,
      reason,
    });

    console.log(`[swarm-coordinator] Election ${electionId} completed, winner: ${winner}`);
  }

  partitionTask(partitionId, task, agentCount, strategy = "round-robin") {
    const partitions = [];

    switch (strategy) {
      case "round-robin":
        for (let i = 0; i < agentCount; i++) {
          partitions.push({
            partitionId: `${partitionId}-${i}`,
            agentIndex: i,
            task: { ...task, partitionIndex: i, totalPartitions: agentCount },
          });
        }
        break;

      case "hash":
        for (let i = 0; i < agentCount; i++) {
          partitions.push({
            partitionId: `${partitionId}-${i}`,
            agentIndex: i,
            task: { ...task, partitionIndex: i, totalPartitions: agentCount },
          });
        }
        break;

      default:
        throw new Error(`Unknown partition strategy: ${strategy}`);
    }

    this.taskPartitions.set(partitionId, {
      id: partitionId,
      partitions,
      createdAt: Date.now(),
      strategy,
      agentCount,
    });

    this.markDirty();

    console.log(`[swarm-coordinator] Task partitioned into ${partitions.length} parts using ${strategy}`);

    this.publish("task_partition", {
      partitionId,
      partitions: partitions.length,
      strategy,
    });

    return partitions;
  }

  getWorktreeAgents(worktreePath) {
    const normalizedWorktree = path.resolve(worktreePath);
    const agentSet = this.worktreeAgents.get(normalizedWorktree);
    return agentSet ? Array.from(agentSet) : [];
  }

  getAllWorktrees() {
    return Array.from(this.worktreeAgents.keys());
  }

  getPartition(partitionId) {
    return this.taskPartitions.get(partitionId) || null;
  }

  getStatus() {
    return {
      activeBarriers: Array.from(this.activeBarriers.keys()),
      activeElections: Array.from(this.activeElections.keys()),
      worktreeCount: this.worktreeAgents.size,
      totalAgents: Array.from(this.worktreeAgents.values()).reduce((sum, set) => sum + set.size, 0),
      activePartitions: Array.from(this.taskPartitions.keys()),
    };
  }

  async cleanup() {
    for (const [barrierId, barrier] of this.activeBarriers) {
      if (barrier.timeoutHandle) {
        clearTimeout(barrier.timeoutHandle);
      }
      this.completeBarrier(barrierId, false, "shutdown");
    }

    for (const [electionId, election] of this.activeElections) {
      if (election.timeoutHandle) {
        clearTimeout(election.timeoutHandle);
      }
      this.completeElection(electionId, null, "shutdown");
    }

    this.activeBarriers.clear();
    this.activeElections.clear();
    this.messageSubscribers.clear();
    this.taskPartitions.clear();

    return { success: true };
  }
}

let globalCoordinator = null;

export async function getSwarmCoordinator(directory) {
  if (!globalCoordinator) {
    globalCoordinator = new SwarmCoordinator();
    await globalCoordinator.initialize(directory);
  }
  return globalCoordinator;
}

export function resetSwarmCoordinator() {
  globalCoordinator = null;
}

export async function createSwarmCoordinator(directory) {
  const coordinator = new SwarmCoordinator();
  await coordinator.initialize(directory);
  return coordinator;
}

export { SwarmCoordinator, MESSAGE_TYPES };
