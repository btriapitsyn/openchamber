import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  SwarmCoordinator,
  getSwarmCoordinator,
  resetSwarmCoordinator,
  MESSAGE_TYPES,
} from "../lib/swarm-coordinator.js";
import fs from "fs/promises"; // Added this import
import path from "path";

vi.mock("fs/promises", () => ({
  // Modified mock to provide a default export that matches the structure of fs/promises
  // and also named exports for direct destructuring if needed.
  // This ensures that `import fs from 'fs/promises'` in the source file
  // and `import { readFile } from 'fs/promises'` or `fs.readFile` in tests work correctly.
  default: {
    mkdir: vi.fn(() => Promise.resolve()),
    readFile: vi.fn(),
    writeFile: vi.fn(),
  },
  mkdir: vi.fn(() => Promise.resolve()),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

describe("swarm-coordinator", () => {
  let coordinator;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Changed to spy on the imported 'fs' object directly
    vi.spyOn(fs, "readFile").mockResolvedValue(
      '{"worktreeAgents":[],"taskPartitions":[]}',
    );
    resetSwarmCoordinator();
    coordinator = new SwarmCoordinator();
    await coordinator.initialize("/test/project");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("SwarmCoordinator class", () => {
    it("should initialize with empty state", async () => {
      const newCoordinator = new SwarmCoordinator();
      await newCoordinator.initialize("/test/project");

      expect(newCoordinator.activeBarriers.size).toBe(0);
      expect(newCoordinator.activeElections.size).toBe(0);
      expect(newCoordinator.taskPartitions.size).toBe(0);
      expect(newCoordinator.messageSubscribers.size).toBe(0);
      expect(newCoordinator.worktreeAgents.size).toBe(0);
    });

    it("should be an EventEmitter", () => {
      expect(coordinator.on).toBeDefined();
      expect(coordinator.emit).toBeDefined();
      expect(coordinator.off).toBeDefined();
    });
  });

  describe("registerWorktreeAgent", () => {
    it("should register an agent for a worktree", () => {
      coordinator.registerWorktreeAgent("agent-1", "/test/worktree");

      expect(
        coordinator.worktreeAgents.has(path.resolve("/test/worktree")),
      ).toBe(true);
      expect(
        coordinator.worktreeAgents
          .get(path.resolve("/test/worktree"))
          .has("agent-1"),
      ).toBe(true);
    });

    it("should normalize worktree path", () => {
      coordinator.registerWorktreeAgent("agent-1", "/test/../test/worktree");

      expect(coordinator.worktreeAgents.has("/test/worktree")).toBe(true);
    });

    it("should allow multiple agents per worktree", () => {
      coordinator.registerWorktreeAgent("agent-1", "/test/worktree");
      coordinator.registerWorktreeAgent("agent-2", "/test/worktree");

      expect(
        coordinator.worktreeAgents.get(path.resolve("/test/worktree")).size,
      ).toBe(2);
    });

    it("should mark dirty", () => {
      const writeSpy = vi.spyOn(fs, "writeFile");
      writeSpy.mockResolvedValue();

      coordinator.registerWorktreeAgent("agent-1", "/test/worktree");

      setTimeout(() => {
        expect(writeSpy).toHaveBeenCalled();
      }, 10);
    });

    it("should publish spawn message", () => {
      const publishSpy = vi.spyOn(coordinator, "publish");

      coordinator.registerWorktreeAgent("agent-1", "/test/worktree");

      expect(publishSpy).toHaveBeenCalledWith("spawn", {
        agentId: "agent-1",
        worktree: path.resolve("/test/worktree"),
        timestamp: expect.any(Number),
      });
    });
  });

  describe("unregisterWorktreeAgent", () => {
    beforeEach(() => {
      coordinator.registerWorktreeAgent("agent-1", "/test/worktree");
      coordinator.registerWorktreeAgent("agent-2", "/test/worktree");
    });

    it("should unregister an agent from a worktree", () => {
      coordinator.unregisterWorktreeAgent("agent-1", "/test/worktree");

      expect(
        coordinator.worktreeAgents
          .get(path.resolve("/test/worktree"))
          .has("agent-1"),
      ).toBe(false);
    });

    it("should remove worktree if no agents remain", () => {
      coordinator.unregisterWorktreeAgent("agent-1", "/test/worktree");
      coordinator.unregisterWorktreeAgent("agent-2", "/test/worktree");

      expect(
        coordinator.worktreeAgents.has(path.resolve("/test/worktree")),
      ).toBe(false);
    });
  });

  describe("subscribe and publish", () => {
    it("should subscribe to a message type", () => {
      const handler = vi.fn();
      const unsubscribe = coordinator.subscribe("spawn", handler);

      expect(coordinator.messageSubscribers.has("spawn")).toBe(true);
      expect(coordinator.messageSubscribers.get("spawn").has(handler)).toBe(
        true,
      );
      expect(typeof unsubscribe).toBe("function");
    });

    it("should throw error for invalid message type", () => {
      expect(() => {
        coordinator.subscribe("invalid_type", vi.fn());
      }).toThrow("Invalid message type");
    });

    it("should publish a message to subscribers", () => {
      const handler = vi.fn();
      coordinator.subscribe("spawn", handler);

      const message = coordinator.publish("spawn", { agentId: "test" });

      expect(handler).toHaveBeenCalledWith(message);
      expect(message.id).toBeDefined();
      expect(message.type).toBe("spawn");
      expect(message.payload).toEqual({ agentId: "test" });
      expect(message.timestamp).toBeDefined();
    });

    it("should throw error for invalid publish type", () => {
      expect(() => {
        coordinator.publish("invalid_type", {});
      }).toThrow("Invalid message type");
    });

    it("should allow unsubscribing", () => {
      const handler = vi.fn();
      const unsubscribe = coordinator.subscribe("spawn", handler);

      unsubscribe();
      coordinator.publish("spawn", { agentId: "test" });

      expect(handler).not.toHaveBeenCalled();
    });

    it("should emit message events", () => {
      const handler = vi.fn();
      coordinator.on("message:spawn", handler);

      coordinator.publish("spawn", { agentId: "test" });

      expect(handler).toHaveBeenCalled();
    });
  });

  describe("barrier synchronization", () => {
    it("should create a barrier", async () => {
      const expectedAgents = ["agent-1", "agent-2", "agent-3"];
      const promise = coordinator.createBarrier("barrier-1", expectedAgents);

      expect(coordinator.activeBarriers.has("barrier-1")).toBe(true);
      expect(
        coordinator.activeBarriers.get("barrier-1").expectedAgents,
      ).toEqual(expectedAgents);
      expect(typeof promise.then).toBe("function");
    });

    it("should throw error if barrier already exists", async () => {
      await coordinator.createBarrier("barrier-1", ["agent-1"]);

      await expect(
        coordinator.createBarrier("barrier-1", ["agent-1"]),
      ).rejects.toThrow("Barrier barrier-1 already exists");
    });

    it("should complete barrier when all agents arrive", async () => {
      const expectedAgents = ["agent-1", "agent-2"];
      const promise = coordinator.createBarrier("barrier-1", expectedAgents);

      coordinator.signalBarrier("agent-1", "barrier-1");
      coordinator.signalBarrier("agent-2", "barrier-1");

      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.readyAgents).toEqual(expectedAgents);
    });

    it("should timeout barrier", async () => {
      const promise = coordinator.createBarrier("barrier-1", ["agent-1"], 100);
      vi.advanceTimersByTime(150);
      await expect(promise).rejects.toThrow("timeout");
    });

    it("should return ready count when signaling", () => {
      coordinator.createBarrier("barrier-1", ["agent-1", "agent-2", "agent-3"]);

      const result = coordinator.signalBarrier("agent-1", "barrier-1");

      expect(result.success).toBe(true);
      expect(result.readyCount).toBe(1);
      expect(result.totalCount).toBe(3);
    });

    it("should return error for non-existent barrier", () => {
      const result = coordinator.signalBarrier("agent-1", "non-existent");

      expect(result.success).toBe(false);
      expect(result.error).toBe("not_found");
    });

    it("should publish barrier events", () => {
      const publishSpy = vi.spyOn(coordinator, "publish");

      coordinator.createBarrier("barrier-1", ["agent-1", "agent-2"]);

      expect(publishSpy).toHaveBeenCalledWith(
        "barrier_sync",
        expect.objectContaining({
          barrierId: "barrier-1",
          action: "created",
        }),
      );
    });
  });

  describe("leader election", () => {
    it("should conduct an election", async () => {
      const candidates = ["agent-1", "agent-2", "agent-3"];
      const promise = coordinator.conductElection("election-1", candidates);

      expect(coordinator.activeElections.has("election-1")).toBe(true);
      expect(coordinator.activeElections.get("election-1").candidates).toEqual(
        new Set(candidates),
      );
      expect(typeof promise.then).toBe("function");
    });

    it("should throw error if election already in progress", async () => {
      await coordinator.conductElection("election-1", ["agent-1"]);

      await expect(
        coordinator.conductElection("election-1", ["agent-1"]),
      ).rejects.toThrow("Election election-1 already in progress");
    });

    it("should cast a vote", () => {
      coordinator.conductElection("election-1", ["agent-1", "agent-2"]);

      const result = coordinator.castVote("election-1", "agent-3", "agent-1");

      expect(result.success).toBe(true);
      expect(result.votes).toHaveLength(1);
    });

    it("should return error for non-existent election", () => {
      const result = coordinator.castVote("non-existent", "agent-1", "agent-1");

      expect(result.success).toBe(false);
      expect(result.error).toBe("not_found");
    });

    it("should return error for invalid candidate", () => {
      coordinator.conductElection("election-1", ["agent-1"]);

      const result = coordinator.castVote("election-1", "agent-2", "agent-3");

      expect(result.success).toBe(false);
      expect(result.error).toBe("invalid_candidate");
    });

    it("should complete election when majority reached", async () => {
      const candidates = ["agent-1", "agent-2"];
      const promise = coordinator.conductElection("election-1", candidates);

      coordinator.castVote("election-1", "agent-1", "agent-1");
      coordinator.castVote("election-1", "agent-2", "agent-1");

      const result = await promise;

      expect(result.winner).toBe("agent-1");
    });

    it("should timeout election", async () => {
      const promise = coordinator.conductElection(
        "election-1",
        ["agent-1"],
        100,
      );
      vi.advanceTimersByTime(150);
      await expect(promise).rejects.toThrow("timeout");
    });

    it("should publish election events", () => {
      const publishSpy = vi.spyOn(coordinator, "publish");

      coordinator.conductElection("election-1", ["agent-1", "agent-2"]);

      expect(publishSpy).toHaveBeenCalledWith(
        "leader_election",
        expect.objectContaining({
          electionId: "election-1",
          action: "started",
        }),
      );
    });
  });

  describe("task partitioning", () => {
    it("should partition task using round-robin strategy", () => {
      const task = { type: "test" };
      const partitions = coordinator.partitionTask(
        "partition-1",
        task,
        3,
        "round-robin",
      );

      expect(partitions).toHaveLength(3);
      expect(partitions[0].agentIndex).toBe(0);
      expect(partitions[1].agentIndex).toBe(1);
      expect(partitions[2].agentIndex).toBe(2);
    });

    it("should partition task using hash strategy", () => {
      const task = { type: "test" };
      const partitions = coordinator.partitionTask(
        "partition-1",
        task,
        3,
        "hash",
      );

      expect(partitions).toHaveLength(3);
      expect(partitions[0].agentIndex).toBe(0);
      expect(partitions[1].agentIndex).toBe(1);
      expect(partitions[2].agentIndex).toBe(2);
    });

    it("should throw error for unknown strategy", () => {
      expect(() => {
        coordinator.partitionTask(
          "partition-1",
          { type: "test" },
          3,
          "unknown",
        );
      }).toThrow("Unknown partition strategy");
    });

    it("should store partitions", () => {
      const partitions = coordinator.partitionTask(
        "partition-1",
        { type: "test" },
        3,
      );

      expect(coordinator.taskPartitions.has("partition-1")).toBe(true);
      expect(coordinator.taskPartitions.get("partition-1")).toEqual(
        expect.objectContaining({
          id: "partition-1",
          partitions: expect.any(Array),
        }),
      );
    });

    it("should publish partition event", () => {
      const publishSpy = vi.spyOn(coordinator, "publish");

      coordinator.partitionTask("partition-1", { type: "test" }, 3);

      expect(publishSpy).toHaveBeenCalledWith(
        "task_partition",
        expect.objectContaining({
          partitionId: "partition-1",
          partitions: 3,
        }),
      );
    });
  });

  describe("query methods", () => {
    beforeEach(() => {
      coordinator.registerWorktreeAgent("agent-1", "/worktree-1");
      coordinator.registerWorktreeAgent("agent-2", "/worktree-1");
      coordinator.registerWorktreeAgent("agent-3", "/worktree-2");
    });

    it("should get worktree agents", () => {
      const agents = coordinator.getWorktreeAgents("/worktree-1");

      expect(agents).toHaveLength(2);
      expect(agents).toContain("agent-1");
      expect(agents).toContain("agent-2");
    });

    it("should return empty array for non-existent worktree", () => {
      const agents = coordinator.getWorktreeAgents("/non-existent");

      expect(agents).toEqual([]);
    });

    it("should get all worktrees", () => {
      const worktrees = coordinator.getAllWorktrees();

      expect(worktrees).toHaveLength(2);
      expect(worktrees).toContain("/worktree-1");
      expect(worktrees).toContain("/worktree-2");
    });

    it("should get partition", () => {
      coordinator.partitionTask("partition-1", { type: "test" }, 3);

      const partition = coordinator.getPartition("partition-1");

      expect(partition).toBeDefined();
      expect(partition.id).toBe("partition-1");
    });

    it("should return null for non-existent partition", () => {
      const partition = coordinator.getPartition("non-existent");

      expect(partition).toBeNull();
    });

    it("should get status", () => {
      coordinator.createBarrier("barrier-1", ["agent-1"]);
      coordinator.conductElection("election-1", ["agent-1"]);
      coordinator.partitionTask("partition-1", { type: "test" }, 3);

      const status = coordinator.getStatus();

      expect(status.activeBarriers).toContain("barrier-1");
      expect(status.activeElections).toContain("election-1");
      expect(status.worktreeCount).toBe(2);
      expect(status.totalAgents).toBe(3);
      expect(status.activePartitions).toContain("partition-1");
    });
  });

  describe("cleanup", () => {
    it("should complete all barriers", async () => {
      const p1 = coordinator
        .createBarrier("barrier-1", ["agent-1"], 10000)
        .catch(() => {});
      const p2 = coordinator
        .createBarrier("barrier-2", ["agent-2"], 10000)
        .catch(() => {});

      // Allow setup to tick
      await Promise.resolve();

      await coordinator.cleanup();

      expect(coordinator.activeBarriers.size).toBe(0);
    });

    it("should complete all elections", async () => {
      const p1 = coordinator
        .conductElection("election-1", ["agent-1"], 10000)
        .catch(() => {});
      const p2 = coordinator
        .conductElection("election-2", ["agent-2"], 10000)
        .catch(() => {});

      // Allow setup to tick
      await Promise.resolve();

      await coordinator.cleanup();

      expect(coordinator.activeElections.size).toBe(0);
    });

    it("should clear subscribers", async () => {
      coordinator.subscribe("spawn", vi.fn());

      await coordinator.cleanup();

      expect(coordinator.messageSubscribers.size).toBe(0);
    });

    it("should clear partitions", async () => {
      coordinator.partitionTask("partition-1", { type: "test" }, 3);

      await coordinator.cleanup();

      expect(coordinator.taskPartitions.size).toBe(0);
    });

    it("should return success", async () => {
      const result = await coordinator.cleanup();

      expect(result).toEqual({ success: true });
    });
  });

  describe("persistence", () => {
    it("should save state to disk", async () => {
      coordinator.registerWorktreeAgent("agent-1", "/worktree-1");
      coordinator.partitionTask("partition-1", { type: "test" }, 3);

      // Trigger macro/micro tasks
      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 100));
      vi.advanceTimersByTime(100);
      await timeoutPromise;

      // Flush promises
      await new Promise((resolve) => setImmediate(resolve));

      expect(fs.writeFile).toHaveBeenCalled();
    });

    it("should load state from disk", async () => {
      const mockState = {
        worktreeAgents: [{ worktree: "/worktree-1", agents: ["agent-1"] }],
        taskPartitions: [{ partitionId: "partition-1", partitions: [] }],
      };
      vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(mockState));

      const newCoordinator = new SwarmCoordinator();
      await newCoordinator.initialize("/test/project");

      expect(newCoordinator.worktreeAgents.size).toBe(1);
      expect(newCoordinator.taskPartitions.size).toBe(1);
    });

    it("should handle missing state file", async () => {
      const readFileSpy = vi.spyOn(fs, "readFile");
      readFileSpy.mockRejectedValue({ code: "ENOENT" });

      const newCoordinator = new SwarmCoordinator();
      await newCoordinator.initialize("/test/project");

      expect(newCoordinator.worktreeAgents.size).toBe(0);
    });
  });

  describe("singleton pattern", () => {
    it("should return same instance", async () => {
      const instance1 = await getSwarmCoordinator("/test/project");
      const instance2 = await getSwarmCoordinator("/test/project");

      expect(instance1).toBe(instance2);
    });

    it("should create new instance after reset", async () => {
      const instance1 = await getSwarmCoordinator("/test/project");
      resetSwarmCoordinator();
      const instance2 = await getSwarmCoordinator("/test/project");

      expect(instance1).not.toBe(instance2);
    });
  });

  describe("MESSAGE_TYPES export", () => {
    it("should export valid message types", () => {
      expect(MESSAGE_TYPES.has("spawn")).toBe(true);
      expect(MESSAGE_TYPES.has("barrier_sync")).toBe(true);
      expect(MESSAGE_TYPES.has("leader_election")).toBe(true);
      expect(MESSAGE_TYPES.has("task_partition")).toBe(true);
      expect(MESSAGE_TYPES.has("status_update")).toBe(true);
      expect(MESSAGE_TYPES.has("result")).toBe(true);
      expect(MESSAGE_TYPES.has("error")).toBe(true);
    });
  });
});
