import { getDiff, getFileDiff, commit } from "./git-service.js";
import fs from "fs/promises";
import path from "path";

const MERGE_STRATEGY = {
  AUTO: "auto",
  VOTING: "voting",
  MANUAL: "manual",
  UNION: "union",
};

const CONSOLIDATION_STATE_FILE = path.join(
  process.env.HOME || process.env.USERPROFILE || "~",
  ".config",
  "openchamber",
  "consolidation-state.json",
);

let stateCache = null;
let stateCacheTimestamp = 0;
const STATE_CACHE_TTL = 5000;

const readConsolidationState = async () => {
  const now = Date.now();
  if (stateCache && now - stateCacheTimestamp < STATE_CACHE_TTL) {
    return stateCache;
  }

  try {
    await fs.mkdir(path.dirname(CONSOLIDATION_STATE_FILE), { recursive: true });
    const data = await fs.readFile(CONSOLIDATION_STATE_FILE, "utf8");
    stateCache = JSON.parse(data);
    stateCacheTimestamp = now;
    return stateCache;
  } catch (error) {
    if (error?.code === "ENOENT") {
      const initialState = { consolidations: [] };
      stateCache = initialState;
      stateCacheTimestamp = now;
      return initialState;
    }
    throw error;
  }
};

const writeConsolidationState = async (state) => {
  try {
    await fs.mkdir(path.dirname(CONSOLIDATION_STATE_FILE), { recursive: true });
    await fs.writeFile(
      CONSOLIDATION_STATE_FILE,
      JSON.stringify(state, null, 2),
      "utf8",
    );
    stateCache = state;
    stateCacheTimestamp = Date.now();
  } catch (error) {
    console.error("[result-consolidator] Failed to write state:", error);
    throw error;
  }
};

const parseDiffHunks = (diff) => {
  const lines = diff.split("\n");
  const hunks = [];
  let currentHunk = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("@@")) {
      if (currentHunk) {
        hunks.push(currentHunk);
      }
      const match = line.match(/@@ -(\d+),?(\d+)? \+(\d+),?(\d+)? @@/);
      if (match) {
        currentHunk = {
          oldStart: parseInt(match[1], 10),
          oldLines: parseInt(match[2], 10) || 1,
          newStart: parseInt(match[3], 10),
          newLines: parseInt(match[4], 10) || 1,
          content: [line],
        };
      }
    } else if (currentHunk) {
      currentHunk.content.push(line);
    }
  }

  if (currentHunk) {
    hunks.push(currentHunk);
  }

  return hunks;
};

const calculateCodeQualityMetrics = (content) => {
  const lines = content.split("\n");
  const metrics = {
    lineCount: lines.length,
    avgLineLength: 0,
    maxLineLength: 0,
    complexity: 0,
    hasComments: false,
    blankLines: 0,
  };

  if (lines.length === 0) return metrics;

  let totalLength = 0;
  let maxLineLen = 0;
  let commentLines = 0;
  let blankLineCount = 0;
  let complexityCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    totalLength += line.length;
    maxLineLen = Math.max(maxLineLen, line.length);

    if (trimmed === "" || trimmed === "\n") {
      blankLineCount++;
    }

    const commentPatterns = [/^\s*\/\//, /^\s*#/, /^\s*\/\*/, /^\s*\*/];
    if (commentPatterns.some((pattern) => pattern.test(line))) {
      commentLines++;
      metrics.hasComments = true;
    }

    if (
      /\b(if|else|for|while|switch|case|catch|try|throw|return)\b/.test(line)
    ) {
      complexityCount++;
    }
  }

  metrics.avgLineLength = Math.round(totalLength / lines.length);
  metrics.maxLineLength = maxLineLen;
  metrics.complexity = complexityCount;
  metrics.blankLines = blankLineCount;

  return metrics;
};

const calculateTestCoverage = async (worktreePath, filePath) => {
  const fullPath = path.join(worktreePath, filePath);

  try {
    const content = await fs.readFile(fullPath, "utf8");
    const testNamePatterns = [
      /describe\s*\(/gi,
      /test\s*\(/gi,
      /it\s*\(/gi,
      /expect\s*\(/gi,
      /assert\s*\(/gi,
    ];

    let matches = 0;
    for (const pattern of testNamePatterns) {
      const found = content.match(pattern);
      if (found) matches += found.length;
    }

    const isTestFile = /\.(test|spec)\.(js|ts|jsx|tsx|py|rs|go|java)$/.test(
      filePath,
    );
    const lines = content.split("\n");
    const testLineRatio = isTestFile ? 1 : matches / Math.max(lines.length, 1);

    return {
      isTestFile,
      testCount: matches,
      testLineRatio,
    };
  } catch (error) {
    return {
      isTestFile: false,
      testCount: 0,
      testLineRatio: 0,
    };
  }
};

const scoreAgentResult = async (
  worktreePath,
  filePath,
  diff,
  otherAgentResults = [],
) => {
  const hunks = parseDiffHunks(diff);

  let addedLines = 0;
  let removedLines = 0;
  for (const hunk of hunks) {
    for (const line of hunk.content) {
      if (line.startsWith("+") && !line.startsWith("++")) addedLines++;
      if (line.startsWith("-") && !line.startsWith("--")) removedLines++;
    }
  }

  const { original, modified } = await getFileDiff(worktreePath, {
    path: filePath,
  });
  const qualityMetrics = calculateCodeQualityMetrics(modified || "");

  const testCoverage = await calculateTestCoverage(worktreePath, filePath);

  let consistencyScore = 0;
  if (otherAgentResults.length > 0) {
    const sameFileResults = otherAgentResults.filter(
      (r) => r.path === filePath,
    );
    if (sameFileResults.length > 0) {
      const similarHunks = sameFileResults.filter((r) => {
        const rHunks = parseDiffHunks(r.diff);
        const hunkIntersection = hunks.filter((h) =>
          rHunks.some(
            (rh) =>
              Math.abs(h.oldStart - rh.oldStart) <= 3 &&
              Math.abs(h.newStart - rh.newStart) <= 3,
          ),
        );
        return hunkIntersection.length > 0;
      });
      consistencyScore = similarHunks.length / sameFileResults.length;
    }
  }

  const scores = {
    consistency: consistencyScore,
    testCoverage: testCoverage.testLineRatio,
    codeQuality: 0,
    efficiency: 0,
    total: 0,
  };

  scores.codeQuality = calculateCodeQualityScore(qualityMetrics);
  scores.efficiency = calculateEfficiencyScore(
    addedLines,
    removedLines,
    qualityMetrics,
  );

  const weights = {
    consistency: 0.3,
    testCoverage: 0.25,
    codeQuality: 0.3,
    efficiency: 0.15,
  };

  scores.total =
    scores.consistency * weights.consistency +
    scores.testCoverage * weights.testCoverage +
    scores.codeQuality * weights.codeQuality +
    scores.efficiency * weights.efficiency;

  return {
    path: filePath,
    diff,
    hunks,
    metrics: qualityMetrics,
    testCoverage,
    scores,
  };
};

const calculateCodeQualityScore = (metrics) => {
  let score = 1.0;

  if (metrics.maxLineLength > 120) score -= 0.1;
  if (metrics.avgLineLength > 80) score -= 0.05;
  if (metrics.complexity > 20) score -= 0.1;
  if (!metrics.hasComments && metrics.lineCount > 10) score -= 0.05;

  return Math.max(0, Math.min(1, score));
};

const calculateEfficiencyScore = (addedLines, removedLines, metrics) => {
  const netChange = addedLines - removedLines;
  const changeRatio =
    metrics.lineCount > 0 ? Math.abs(netChange) / metrics.lineCount : 0;

  let score = 1.0;

  if (changeRatio > 0.5) score -= 0.1;
  if (changeRatio > 1.0) score -= 0.2;
  if (removedLines > addedLines && changeRatio < 0.2) score += 0.1;

  return Math.max(0, Math.min(1, score));
};

const detectConflicts = (results) => {
  const conflicts = [];
  const fileMap = new Map();

  for (const result of results) {
    const { path: filePath, hunks } = result;

    if (!fileMap.has(filePath)) {
      fileMap.set(filePath, []);
    }
    fileMap.get(filePath).push({ agent: result.agentId, hunks });
  }

  for (const [filePath, fileResults] of fileMap.entries()) {
    if (fileResults.length < 2) continue;

    const fileConflicts = [];
    const allHunks = fileResults.flatMap((fr) =>
      fr.hunks.map((h) => ({ ...h, agent: fr.agent })),
    );

    for (let i = 0; i < allHunks.length; i++) {
      for (let j = i + 1; j < allHunks.length; j++) {
        const h1 = allHunks[i];
        const h2 = allHunks[j];

        if (h1.agent === h2.agent) continue;

        const overlap = checkHunkOverlap(h1, h2);
        if (overlap.type !== "none") {
          fileConflicts.push({
            type: overlap.type,
            agentA: h1.agent,
            agentB: h2.agent,
            hunkA: h1,
            hunkB: h2,
            overlap: overlap.details,
          });
        }
      }
    }

    if (fileConflicts.length > 0) {
      conflicts.push({
        path: filePath,
        conflicts: fileConflicts,
      });
    }
  }

  return conflicts;
};

const checkHunkOverlap = (h1, h2) => {
  const h1End = h1.oldStart + (h1.oldLines || 1) - 1;
  const h2End = h2.oldStart + (h2.oldLines || 1) - 1;

  if (h1.oldStart === h2.oldStart && h1.oldLines === h2.oldLines) {
    return { type: "exact", details: { start: h1.oldStart, end: h1End } };
  }

  if (h1.oldStart <= h2End && h2.oldStart <= h1End) {
    return {
      type: "partial",
      details: {
        start: Math.max(h1.oldStart, h2.oldStart),
        end: Math.min(h1End, h2End),
      },
    };
  }

  return { type: "none" };
};

const generateMergePreview = async (consolidationId) => {
  const state = await readConsolidationState();
  const consolidation = state.consolidations.find(
    (c) => c.id === consolidationId,
  );

  if (!consolidation) {
    throw new Error(`Consolidation not found: ${consolidationId}`);
  }

  const { agentResults, projectDirectory, baseBranch } = consolidation;
  const scoredResults = [];

  for (const result of agentResults) {
    const files = await collectAgentResultFiles(
      result.worktreePath,
      baseBranch,
    );

    for (const fileResult of files) {
      const scored = await scoreAgentResult(
        result.worktreePath,
        fileResult.path,
        fileResult.diff,
        agentResults.filter((ar) => ar.id !== result.id),
      );
      scoredResults.push({
        ...scored,
        agentId: result.id,
        agentName: result.name,
      });
    }
  }

  const conflicts = detectConflicts(scoredResults);
  const autoMergeable = scoredResults.filter(
    (sr) => !conflicts.some((c) => c.path === sr.path),
  );

  return {
    consolidationId,
    totalFiles: scoredResults.length,
    autoMergeable: autoMergeable.length,
    conflictingFiles: conflicts.length,
    files: scoredResults,
    conflicts,
    recommendedStrategy:
      conflicts.length === 0 ? MERGE_STRATEGY.AUTO : MERGE_STRATEGY.VOTING,
  };
};

const collectAgentResultFiles = async (worktreePath, baseBranch) => {
  const { getDiff: gitGetDiff } = await import("./git-service.js");
  const files = [];

  try {
    const diff = await gitGetDiff(worktreePath, {});
    if (!diff) return files;

    const fileBlocks = diff.split(/^diff --git a\/(.+?) b\/(.+?)$/gm).slice(1);

    for (let i = 0; i < fileBlocks.length; i += 2) {
      const filePath = fileBlocks[i];
      const fileDiff = fileBlocks[i + 1] || "";

      if (filePath && !filePath.startsWith(".opencode")) {
        files.push({
          path: filePath,
          diff: `diff --git a/${filePath} b/${filePath}\n${fileDiff}`,
        });
      }
    }
  } catch (error) {
    console.error(
      `[result-consolidator] Failed to collect files from ${worktreePath}:`,
      error,
    );
  }

  return files;
};

export const initiateConsolidation = async (params) => {
  const {
    projectDirectory,
    baseBranch,
    agentIds,
    strategy = MERGE_STRATEGY.AUTO,
  } = params;

  if (!projectDirectory || !baseBranch || !agentIds || agentIds.length === 0) {
    throw new Error("projectDirectory, baseBranch, and agentIds are required");
  }

  const consolidationId = `consolidation-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const state = await readConsolidationState();

  const consolidation = {
    id: consolidationId,
    projectDirectory,
    baseBranch,
    agentIds,
    strategy,
    status: "pending",
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
    mergeResult: null,
    conflicts: [],
  };

  state.consolidations.push(consolidation);
  await writeConsolidationState(state);

  console.log(
    `[result-consolidator] Consolidation initiated: ${consolidationId}`,
  );

  return consolidation;
};

export const analyzeResults = async (consolidationId, agentResults) => {
  const state = await readConsolidationState();
  const consolidationIndex = state.consolidations.findIndex(
    (c) => c.id === consolidationId,
  );

  if (consolidationIndex === -1) {
    throw new Error(`Consolidation not found: ${consolidationId}`);
  }

  state.consolidations[consolidationIndex].status = "analyzing";
  state.consolidations[consolidationIndex].startedAt = Date.now();
  state.consolidations[consolidationIndex].agentResults = agentResults;
  await writeConsolidationState(state);

  const preview = await generateMergePreview(consolidationId);

  state.consolidations[consolidationIndex].status = "analyzed";
  state.consolidations[consolidationIndex].conflicts = preview.conflicts;
  state.consolidations[consolidationIndex].preview = preview;
  await writeConsolidationState(state);

  return preview;
};

export const resolveConflicts = async (consolidationId, resolutions) => {
  const state = await readConsolidationState();
  const consolidationIndex = state.consolidations.findIndex(
    (c) => c.id === consolidationId,
  );

  if (consolidationIndex === -1) {
    throw new Error(`Consolidation not found: ${consolidationId}`);
  }

  const consolidation = state.consolidations[consolidationIndex];

  const mergePlan = {
    consolidationId,
    strategy: consolidation.strategy,
    resolutions,
    filesToMerge: [],
    filesToReject: [],
  };

  for (const resolution of resolutions) {
    if (resolution.action === "merge") {
      mergePlan.filesToMerge.push({
        path: resolution.path,
        sourceAgent: resolution.sourceAgent,
        sourceBranch: resolution.sourceBranch,
      });
    } else if (resolution.action === "reject") {
      mergePlan.filesToReject.push({
        path: resolution.path,
      });
    }
  }

  state.consolidations[consolidationIndex].status = "ready";
  state.consolidations[consolidationIndex].mergePlan = mergePlan;
  await writeConsolidationState(state);

  return mergePlan;
};

export const executeMerge = async (consolidationId, targetBranch) => {
  const state = await readConsolidationState();
  const consolidationIndex = state.consolidations.findIndex(
    (c) => c.id === consolidationId,
  );

  if (consolidationIndex === -1) {
    throw new Error(`Consolidation not found: ${consolidationId}`);
  }

  const consolidation = state.consolidations[consolidationIndex];

  if (consolidation.status !== "ready") {
    throw new Error(
      `Consolidation not ready for merge. Current status: ${consolidation.status}`,
    );
  }

  const { mergePlan, projectDirectory } = consolidation;
  const results = {
    merged: [],
    failed: [],
    errors: [],
  };

  for (const fileToMerge of mergePlan.filesToMerge) {
    try {
      const sourceWorktreePath = consolidation.agentResults.find(
        (ar) => ar.id === fileToMerge.sourceAgent,
      )?.worktreePath;

      if (!sourceWorktreePath) {
        throw new Error(
          `Agent worktree not found for ${fileToMerge.sourceAgent}`,
        );
      }

      const sourceFilePath = path.join(sourceWorktreePath, fileToMerge.path);
      const targetFilePath = path.join(projectDirectory, fileToMerge.path);

      const content = await fs.readFile(sourceFilePath, "utf8");
      await fs.mkdir(path.dirname(targetFilePath), { recursive: true });
      await fs.writeFile(targetFilePath, content, "utf8");

      results.merged.push(fileToMerge.path);
    } catch (error) {
      results.failed.push(fileToMerge.path);
      results.errors.push({
        path: fileToMerge.path,
        error: error.message,
      });
    }
  }

  const commitMessage = `Merge agent results from consolidation ${consolidationId}\n\nAgents involved: ${consolidation.agentIds.join(", ")}\nStrategy: ${consolidation.strategy}`;

  try {
    await commit(projectDirectory, commitMessage, { addAll: true });
  } catch (error) {
    console.error("[result-consolidator] Failed to commit merge:", error);
    results.errors.push({ error: error.message });
  }

  state.consolidations[consolidationIndex].status = "completed";
  state.consolidations[consolidationIndex].completedAt = Date.now();
  state.consolidations[consolidationIndex].mergeResult = results;
  await writeConsolidationState(state);

  console.log(
    `[result-consolidator] Merge completed for consolidation: ${consolidationId}`,
  );

  return results;
};

export const getConsolidation = async (consolidationId) => {
  const state = await readConsolidationState();
  return state.consolidations.find((c) => c.id === consolidationId) || null;
};

export const getAllConsolidations = async (options = {}) => {
  const { projectDirectory, status } = options;
  const state = await readConsolidationState();

  let consolidations = [...state.consolidations];

  if (status) {
    consolidations = consolidations.filter((c) => c.status === status);
  }

  if (projectDirectory) {
    consolidations = consolidations.filter(
      (c) => c.projectDirectory === projectDirectory,
    );
  }

  return consolidations;
};

export const deleteConsolidation = async (consolidationId) => {
  const state = await readConsolidationState();
  state.consolidations = state.consolidations.filter(
    (c) => c.id !== consolidationId,
  );
  await writeConsolidationState(state);
  return { success: true };
};

export { MERGE_STRATEGY };
