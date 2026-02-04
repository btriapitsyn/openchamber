import express from "express";
import {
  spawnAgent,
  getAllAgents,
  getAgent,
  terminateAgent,
  getAgentStats,
  cleanupStaleAgents,
  AGENT_STATUS,
} from "../lib/git-worktree-service.js";
import { validateDirectoryPath } from "../lib/git-service.js";
import {
  initiateConsolidation,
  analyzeResults,
  resolveConflicts,
  executeMerge,
  getConsolidation,
  getAllConsolidations,
  deleteConsolidation,
  MERGE_STRATEGY,
} from "../lib/result-consolidator.js";
import {
  createConflictSession,
  detectConflicts,
  generateConflictResolutionData,
  applyResolution,
  batchApplyResolutions,
  getConflictSession,
  getAllConflictSessions,
  deleteConflictSession,
} from "../lib/conflict-resolver.js";

const router = express.Router();

const validateSpawnRequest = (body) => {
  const errors = [];

  if (!body.projectDirectory || typeof body.projectDirectory !== "string") {
    errors.push("projectDirectory is required and must be a string");
  }

  if (!body.agentName || typeof body.agentName !== "string") {
    errors.push("agentName is required and must be a string");
  }

  if (body.agentName && body.agentName.length > 100) {
    errors.push("agentName must be less than 100 characters");
  }

  if (body.agentType && !["subagent", "specialist", "autonomous"].includes(body.agentType)) {
    errors.push("agentType must be one of: subagent, specialist, autonomous");
  }

  if (body.branchName && typeof body.branchName !== "string") {
    errors.push("branchName must be a string");
  }

  if (body.branchName && body.branchName.length > 200) {
    errors.push("branchName must be less than 200 characters");
  }

  if (body.task && typeof body.task !== "string") {
    errors.push("task must be a string");
  }

  return errors;
};

router.post("/spawn", async (req, res) => {
  try {
    const errors = validateSpawnRequest(req.body);
    if (errors.length > 0) {
      return res.status(400).json({
        error: "Invalid request",
        details: errors,
      });
    }

    const { projectDirectory, agentName, agentType, task, branchName, baseBranch } = req.body;

    const validated = await validateDirectoryPath(projectDirectory);
    if (!validated.ok) {
      return res.status(400).json({
        error: "Invalid project directory",
        details: validated.error,
      });
    }

    const agent = await spawnAgent({
      projectDirectory: validated.directory,
      agentName,
      agentType: agentType || "subagent",
      task: task || null,
      branchName: branchName || null,
      baseBranch: baseBranch || "main",
    });

    return res.status(201).json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        type: agent.type,
        status: agent.status,
        projectDirectory: agent.projectDirectory,
        worktreePath: agent.worktreePath,
        branchName: agent.branchName,
        baseBranch: agent.baseBranch,
        task: agent.task,
        createdAt: agent.createdAt,
        startedAt: agent.startedAt,
      },
    });
  } catch (error) {
    console.error("[api/agents] Spawn error:", error);
    return res.status(500).json({
      error: "Failed to spawn agent",
      details: error.message,
    });
  }
});

router.get("/status", async (req, res) => {
  try {
    const { projectDirectory, status, agentId } = req.query;

    let options = {};

    if (projectDirectory) {
      const validated = await validateDirectoryPath(projectDirectory);
      if (!validated.ok) {
        return res.status(400).json({
          error: "Invalid project directory",
          details: validated.error,
        });
      }
      options.projectDirectory = validated.directory;
    }

    if (status) {
      const validStatuses = Object.values(AGENT_STATUS);
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          error: "Invalid status",
          details: `Status must be one of: ${validStatuses.join(", ")}`,
        });
      }
      options.status = status;
    }

    if (agentId) {
      const agent = await getAgent(agentId);
      if (!agent) {
        return res.status(404).json({
          error: "Agent not found",
          details: `No agent found with id: ${agentId}`,
        });
      }
      return res.json({
        success: true,
        agent,
      });
    }

    const agents = await getAllAgents(options);
    const stats = await getAgentStats(options.projectDirectory);

    return res.json({
      success: true,
      agents: agents.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        status: a.status,
        projectDirectory: a.projectDirectory,
        worktreePath: a.worktreePath,
        branchName: a.branchName,
        baseBranch: a.baseBranch,
        task: a.task,
        createdAt: a.createdAt,
        startedAt: a.startedAt,
        completedAt: a.completedAt,
        error: a.error,
      })),
      stats,
    });
  } catch (error) {
    console.error("[api/agents] Status error:", error);
    return res.status(500).json({
      error: "Failed to get agent status",
      details: error.message,
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== "string") {
      return res.status(400).json({
        error: "Invalid agent id",
        details: "Agent id is required and must be a string",
      });
    }

    const agent = await getAgent(id);
    if (!agent) {
      return res.status(404).json({
        error: "Agent not found",
        details: `No agent found with id: ${id}`,
      });
    }

    await terminateAgent(id);

    return res.json({
      success: true,
      message: `Agent ${id} terminated successfully`,
    });
  } catch (error) {
    console.error("[api/agents] Delete error:", error);
    return res.status(500).json({
      error: "Failed to terminate agent",
      details: error.message,
    });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const { projectDirectory } = req.query;

    let validatedDir = null;
    if (projectDirectory) {
      const validated = await validateDirectoryPath(projectDirectory);
      if (!validated.ok) {
        return res.status(400).json({
          error: "Invalid project directory",
          details: validated.error,
        });
      }
      validatedDir = validated.directory;
    }

    const stats = await getAgentStats(validatedDir);

    return res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error("[api/agents] Stats error:", error);
    return res.status(500).json({
      error: "Failed to get agent stats",
      details: error.message,
    });
  }
});

router.post("/cleanup", async (req, res) => {
  try {
    const { projectDirectory } = req.body;

    if (!projectDirectory || typeof projectDirectory !== "string") {
      return res.status(400).json({
        error: "projectDirectory is required",
        details: "projectDirectory must be a string",
      });
    }

    const validated = await validateDirectoryPath(projectDirectory);
    if (!validated.ok) {
      return res.status(400).json({
        error: "Invalid project directory",
        details: validated.error,
      });
    }

    const result = await cleanupStaleAgents(validated.directory);

    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("[api/agents] Cleanup error:", error);
    return res.status(500).json({
      error: "Failed to cleanup stale agents",
      details: error.message,
    });
  }
});

router.post("/consolidate/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { projectDirectory, baseBranch, agentIds, strategy } = req.body;

    if (!projectDirectory || typeof projectDirectory !== "string") {
      return res.status(400).json({
        error: "Invalid request",
        details: "projectDirectory is required and must be a string",
      });
    }

    if (!baseBranch || typeof baseBranch !== "string") {
      return res.status(400).json({
        error: "Invalid request",
        details: "baseBranch is required and must be a string",
      });
    }

    if (!Array.isArray(agentIds) || agentIds.length === 0) {
      return res.status(400).json({
        error: "Invalid request",
        details: "agentIds must be a non-empty array",
      });
    }

    const validated = await validateDirectoryPath(projectDirectory);
    if (!validated.ok) {
      return res.status(400).json({
        error: "Invalid project directory",
        details: validated.error,
      });
    }

    const consolidation = await initiateConsolidation({
      projectDirectory: validated.directory,
      baseBranch,
      agentIds,
      strategy: strategy || MERGE_STRATEGY.AUTO,
    });

    return res.status(201).json({
      success: true,
      consolidation,
    });
  } catch (error) {
    console.error("[api/agents] Consolidation initiation error:", error);
    return res.status(500).json({
      error: "Failed to initiate consolidation",
      details: error.message,
    });
  }
});

router.post("/consolidate/:id/analyze", async (req, res) => {
  try {
    const { id } = req.params;
    const { agentResults } = req.body;

    if (!Array.isArray(agentResults)) {
      return res.status(400).json({
        error: "Invalid request",
        details: "agentResults must be an array",
      });
    }

    const preview = await analyzeResults(id, agentResults);

    return res.json({
      success: true,
      preview,
    });
  } catch (error) {
    console.error("[api/agents] Analysis error:", error);
    return res.status(500).json({
      error: "Failed to analyze results",
      details: error.message,
    });
  }
});

router.get("/consolidate/:id/conflicts", async (req, res) => {
  try {
    const { id } = req.params;

    const consolidation = await getConsolidation(id);
    if (!consolidation) {
      return res.status(404).json({
        error: "Consolidation not found",
        details: `No consolidation found with id: ${id}`,
      });
    }

    const conflictSession = await createConflictSession({
      consolidationId: id,
      projectDirectory: consolidation.projectDirectory,
      agentResults: consolidation.agentResults,
    });

    const session = await detectConflicts(conflictSession.id, {});
    const resolutionData = await generateConflictResolutionData(conflictSession.id);

    return res.json({
      success: true,
      sessionId: conflictSession.id,
      conflicts: resolutionData.conflicts,
      autoMergeSuggestions: resolutionData.autoMergeSuggestions,
    });
  } catch (error) {
    console.error("[api/agents] Conflicts detection error:", error);
    return res.status(500).json({
      error: "Failed to detect conflicts",
      details: error.message,
    });
  }
});

router.post("/consolidate/:id/resolve", async (req, res) => {
  try {
    const { id } = req.params;
    const { resolutions } = req.body;

    if (!Array.isArray(resolutions)) {
      return res.status(400).json({
        error: "Invalid request",
        details: "resolutions must be an array",
      });
    }

    const mergePlan = await resolveConflicts(id, resolutions);

    return res.json({
      success: true,
      mergePlan,
    });
  } catch (error) {
    console.error("[api/agents] Resolution error:", error);
    return res.status(500).json({
      error: "Failed to resolve conflicts",
      details: error.message,
    });
  }
});

router.get("/consolidate/:id/preview", async (req, res) => {
  try {
    const { id } = req.params;

    const consolidation = await getConsolidation(id);
    if (!consolidation) {
      return res.status(404).json({
        error: "Consolidation not found",
        details: `No consolidation found with id: ${id}`,
      });
    }

    const { generateMergePreview } = await import("../lib/result-consolidator.js");
    const preview = await generateMergePreview(id);

    return res.json({
      success: true,
      preview,
    });
  } catch (error) {
    console.error("[api/agents] Preview error:", error);
    return res.status(500).json({
      error: "Failed to generate merge preview",
      details: error.message,
    });
  }
});

router.post("/consolidate/:id/export", async (req, res) => {
  try {
    const { id } = req.params;
    const { targetBranch } = req.body;

    if (!targetBranch || typeof targetBranch !== "string") {
      return res.status(400).json({
        error: "Invalid request",
        details: "targetBranch is required and must be a string",
      });
    }

    const result = await executeMerge(id, targetBranch);

    return res.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("[api/agents] Export error:", error);
    return res.status(500).json({
      error: "Failed to export merge",
      details: error.message,
    });
  }
});

router.get("/consolidations", async (req, res) => {
  try {
    const { projectDirectory, status } = req.query;

    let options = {};

    if (projectDirectory) {
      const validated = await validateDirectoryPath(projectDirectory);
      if (!validated.ok) {
        return res.status(400).json({
          error: "Invalid project directory",
          details: validated.error,
        });
      }
      options.projectDirectory = validated.directory;
    }

    if (status) {
      options.status = status;
    }

    const consolidations = await getAllConsolidations(options);

    return res.json({
      success: true,
      consolidations,
    });
  } catch (error) {
    console.error("[api/agents] Get consolidations error:", error);
    return res.status(500).json({
      error: "Failed to get consolidations",
      details: error.message,
    });
  }
});

router.delete("/consolidate/:id", async (req, res) => {
  try {
    const { id } = req.params;

    await deleteConsolidation(id);

    return res.json({
      success: true,
      message: `Consolidation ${id} deleted successfully`,
    });
  } catch (error) {
    console.error("[api/agents] Delete consolidation error:", error);
    return res.status(500).json({
      error: "Failed to delete consolidation",
      details: error.message,
    });
  }
});

export default router;
