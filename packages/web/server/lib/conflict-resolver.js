import { getFileDiff, getDiff } from "./git-service.js";
import fs from "fs/promises";
import path from "path";

const CONFLICT_TYPE = {
  SAME_LINE: "same-line",
  DELETE_MODIFY: "delete-modify",
  IMPORT_CONFLICT: "import-conflict",
  EXPORT_CONFLICT: "export-conflict",
  STRUCTURAL: "structural",
};

const RESOLUTION_ACTION = {
  KEEP_THEIRS: "keep-theirs",
  KEEP_OURS: "keep-ours",
  MANUAL: "manual",
  UNION: "union",
  REJECT: "reject",
};

const CONFLICT_STATE_FILE = path.join(
  process.env.HOME || process.env.USERPROFILE || "~",
  ".config",
  "openchamber",
  "conflict-state.json",
);

let stateCache = null;
let stateCacheTimestamp = 0;
const STATE_CACHE_TTL = 5000;

const readConflictState = async () => {
  const now = Date.now();
  if (stateCache && (now - stateCacheTimestamp) < STATE_CACHE_TTL) {
    return stateCache;
  }

  try {
    await fs.mkdir(path.dirname(CONFLICT_STATE_FILE), { recursive: true });
    const data = await fs.readFile(CONFLICT_STATE_FILE, "utf8");
    stateCache = JSON.parse(data);
    stateCacheTimestamp = now;
    return stateCache;
  } catch (error) {
    if (error?.code === "ENOENT") {
      const initialState = { conflictSessions: [] };
      stateCache = initialState;
      stateCacheTimestamp = now;
      return initialState;
    }
    throw error;
  }
};

const writeConflictState = async (state) => {
  try {
    await fs.mkdir(path.dirname(CONFLICT_STATE_FILE), { recursive: true });
    await fs.writeFile(
      CONFLICT_STATE_FILE,
      JSON.stringify(state, null, 2),
      "utf8",
    );
    stateCache = state;
    stateCacheTimestamp = Date.now();
  } catch (error) {
    console.error("[conflict-resolver] Failed to write state:", error);
    throw error;
  }
};

const parseUnifiedDiff = (diff) => {
  const lines = diff.split("\n");
  const parsed = {
    filePath: null,
    hunks: [],
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.startsWith("diff --git")) {
      const match = line.match(/diff --git a\/(.+?) b\/(.+?)/);
      if (match) {
        parsed.filePath = match[1];
      }
    } else if (line.startsWith("@@")) {
      const match = line.match(/@@ -(\d+),?(\d+)? \+(\d+),?(\d+)? @@/);
      if (match) {
        const hunk = {
          oldStart: parseInt(match[1], 10),
          oldLines: parseInt(match[2], 10) || 1,
          newStart: parseInt(match[3], 10),
          newLines: parseInt(match[4], 10) || 1,
          oldLinesContent: [],
          newLinesContent: [],
        };
        
        for (let j = i + 1; j < lines.length && !lines[j].startsWith("@@") && !lines[j].startsWith("diff"); j++) {
          const contentLine = lines[j];
          if (contentLine.startsWith("-") && !contentLine.startsWith("---")) {
            hunk.oldLinesContent.push(contentLine);
          } else if (contentLine.startsWith("+") && !contentLine.startsWith("+++")) {
            hunk.newLinesContent.push(contentLine);
          }
        }
        
        parsed.hunks.push(hunk);
      }
    }
  }

  return parsed;
};

const detectSameLineConflicts = (diffA, diffB) => {
  const parsedA = parseUnifiedDiff(diffA);
  const parsedB = parseUnifiedDiff(diffB);
  
  if (parsedA.filePath !== parsedB.filePath) {
    return [];
  }

  const conflicts = [];

  for (const hunkA of parsedA.hunks) {
    for (const hunkB of parsedB.hunks) {
      const hAEnd = hunkA.oldStart + hunkA.oldLines - 1;
      const hBEnd = hunkB.oldStart + hunkB.oldLines - 1;

      if (hunkA.oldStart <= hBEnd && hunkB.oldStart <= hAEnd) {
        const overlapStart = Math.max(hunkA.oldStart, hunkB.oldStart);
        const overlapEnd = Math.min(hAEnd, hBEnd);

        for (let line = overlapStart; line <= overlapEnd; line++) {
          const hALineContent = hunkA.oldLinesContent.find((l, idx) => 
            hunkA.oldStart + idx === line
          );
          const hBLineContent = hunkB.oldLinesContent.find((l, idx) => 
            hunkB.oldStart + idx === line
          );

          if (hALineContent && hBLineContent && hALineContent !== hBLineContent) {
            conflicts.push({
              type: CONFLICT_TYPE.SAME_LINE,
              filePath: parsedA.filePath,
              lineNumber: line,
              contentA: hALineContent,
              contentB: hBLineContent,
            });
          }
        }
      }
    }
  }

  return conflicts;
};

const detectDeleteModifyConflicts = (diffA, diffB) => {
  const parsedA = parseUnifiedDiff(diffA);
  const parsedB = parseUnifiedDiff(diffB);
  
  if (parsedA.filePath !== parsedB.filePath) {
    return [];
  }

  const conflicts = [];

  const isFileDeleted = (diff) => {
    return /new file mode/.test(diff) || /deleted file mode/.test(diff) || 
           diff.includes("Binary files") || diff.match(/^-\+\+\+ \/dev\/null/);
  };

  const isFileModified = (diff) => {
    return diff.includes("@@") && parsedA.hunks.length > 0;
  };

  const aDeleted = isFileDeleted(diffA);
  const aModified = isFileModified(diffA);
  const bDeleted = isFileDeleted(diffB);
  const bModified = isFileModified(diffB);

  if ((aDeleted && bModified) || (bDeleted && aModified)) {
    conflicts.push({
      type: CONFLICT_TYPE.DELETE_MODIFY,
      filePath: parsedA.filePath,
      action: aDeleted ? "deleted" : "modified",
      actionB: bDeleted ? "deleted" : "modified",
    });
  }

  return conflicts;
};

const detectImportExportConflicts = (diff) => {
  const parsed = parseUnifiedDiff(diff);
  const conflicts = [];

  if (!parsed.filePath.match(/\.(ts|tsx|js|jsx)$/)) {
    return conflicts;
  }

  const importRegex = /^[\+\s]*import\s+.*from\s+['"](.+?)['"];?$/gm;
  const exportRegex = /^[\+\s]*export\s+(default\s+)?(const|let|var|function|class|interface|type)\s+(\w+)/gm;

  const newImports = [];
  const newExports = [];

  for (const hunk of parsed.hunks) {
    for (const line of hunk.newLinesContent) {
      if (line.startsWith("+")) {
        const lineContent = line.substring(1);
        
        const importMatch = lineContent.match(importRegex);
        if (importMatch) {
          newImports.push({
            module: importMatch[1],
            line: lineContent.trim(),
          });
        }

        const exportMatch = lineContent.match(exportRegex);
        if (exportMatch) {
          newExports.push({
            name: exportMatch[3],
            line: lineContent.trim(),
          });
        }
      }
    }
  }

  const importMap = new Map();
  for (const imp of newImports) {
    if (importMap.has(imp.module)) {
      conflicts.push({
        type: CONFLICT_TYPE.IMPORT_CONFLICT,
        filePath: parsed.filePath,
        module: imp.module,
        existing: importMap.get(imp.module),
        duplicate: imp,
      });
    } else {
      importMap.set(imp.module, imp);
    }
  }

  const exportMap = new Map();
  for (const exp of newExports) {
    if (exportMap.has(exp.name)) {
      conflicts.push({
        type: CONFLICT_TYPE.EXPORT_CONFLICT,
        filePath: parsed.filePath,
        name: exp.name,
        existing: exportMap.get(exp.name),
        duplicate: exp,
      });
    } else {
      exportMap.set(exp.name, exp);
    }
  }

  return conflicts;
};

const detectStructuralConflicts = (diffA, diffB) => {
  const parsedA = parseUnifiedDiff(diffA);
  const parsedB = parseUnifiedDiff(diffB);
  
  if (parsedA.filePath !== parsedB.filePath) {
    return [];
  }

  const conflicts = [];

  const extractStructure = (diff) => {
    const structure = {
      functions: [],
      classes: [],
      interfaces: [],
    };

    const lines = diff.split("\n");
    for (const line of lines) {
      if (line.startsWith("+") || line.startsWith("-")) {
        const content = line.substring(1);
        
        const fnMatch = content.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
        if (fnMatch) structure.functions.push(fnMatch[1]);
        
        const classMatch = content.match(/^class\s+(\w+)/);
        if (classMatch) structure.classes.push(classMatch[1]);
        
        const interfaceMatch = content.match(/^(?:export\s+)?interface\s+(\w+)/);
        if (interfaceMatch) structure.interfaces.push(interfaceMatch[1]);
      }
    }

    return structure;
  };

  const structA = extractStructure(diffA);
  const structB = extractStructure(diffB);

  for (const fn of structA.functions) {
    if (structB.functions.includes(fn)) {
      conflicts.push({
        type: CONFLICT_TYPE.STRUCTURAL,
        filePath: parsedA.filePath,
        element: "function",
        name: fn,
      });
    }
  }

  for (const cls of structA.classes) {
    if (structB.classes.includes(cls)) {
      conflicts.push({
        type: CONFLICT_TYPE.STRUCTURAL,
        filePath: parsedA.filePath,
        element: "class",
        name: cls,
      });
    }
  }

  for (const iface of structA.interfaces) {
    if (structB.interfaces.includes(iface)) {
      conflicts.push({
        type: CONFLICT_TYPE.STRUCTURAL,
        filePath: parsedA.filePath,
        element: "interface",
        name: iface,
      });
    }
  }

  return conflicts;
};

export const createConflictSession = async (params) => {
  const { consolidationId, projectDirectory, agentResults } = params;

  const sessionId = `conflict-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const state = await readConflictState();
  
  const session = {
    id: sessionId,
    consolidationId,
    projectDirectory,
    createdAt: Date.now(),
    status: "active",
    conflicts: [],
    resolutions: [],
  };

  state.conflictSessions.push(session);
  await writeConflictState(state);

  return session;
};

export const detectConflicts = async (sessionId, diffsByAgent) => {
  const state = await readConflictState();
  const sessionIndex = state.conflictSessions.findIndex((s) => s.id === sessionId);
  
  if (sessionIndex === -1) {
    throw new Error(`Conflict session not found: ${sessionId}`);
  }

  const agentEntries = Object.entries(diffsByAgent);
  const allConflicts = [];

  for (let i = 0; i < agentEntries.length; i++) {
    for (let j = i + 1; j < agentEntries.length; j++) {
      const [agentAId, diffA] = agentEntries[i];
      const [agentBId, diffB] = agentEntries[j];

      if (!diffA || !diffB) continue;

      const sameLineConflicts = detectSameLineConflicts(diffA, diffB);
      const deleteModifyConflicts = detectDeleteModifyConflicts(diffA, diffB);
      const importExportConflictsA = detectImportExportConflicts(diffA);
      const importExportConflictsB = detectImportExportConflicts(diffB);
      const structuralConflicts = detectStructuralConflicts(diffA, diffB);

      for (const conflict of [...sameLineConflicts, ...deleteModifyConflicts, ...importExportConflictsA, ...importExportConflictsB, ...structuralConflicts]) {
        allConflicts.push({
          ...conflict,
          agentA: agentAId,
          agentB: agentBId,
          sessionId,
        });
      }
    }
  }

  const groupedByFile = new Map();
  for (const conflict of allConflicts) {
    const key = `${conflict.filePath || "unknown"}-${conflict.type}`;
    if (!groupedByFile.has(key)) {
      groupedByFile.set(key, {
        type: conflict.type,
        filePath: conflict.filePath,
        conflicts: [],
      });
    }
    groupedByFile.get(key).conflicts.push(conflict);
  }

  state.conflictSessions[sessionIndex].conflicts = Array.from(groupedByFile.values());
  state.conflictSessions[sessionIndex].status = "detected";
  await writeConflictState(state);

  return state.conflictSessions[sessionIndex];
};

export const generateConflictResolutionData = async (sessionId) => {
  const state = await readConflictState();
  const session = state.conflictSessions.find((s) => s.id === sessionId);
  
  if (!session) {
    throw new Error(`Conflict session not found: ${sessionId}`);
  }

  const resolutionData = {
    sessionId,
    conflicts: [],
    autoMergeSuggestions: [],
  };

  for (const conflictGroup of session.conflicts) {
    const conflictData = {
      type: conflictGroup.type,
      filePath: conflictGroup.filePath,
      count: conflictGroup.conflicts.length,
      sides: conflictGroup.conflicts.map((c) => ({
        agent: c.agentA,
        content: c.contentA || c.contentB,
      })),
      resolutionUI: {
        showSideBySide: true,
        enableInlineEdit: true,
        suggestedActions: getSuggestedActions(conflictGroup.type),
      },
    };

    resolutionData.conflicts.push(conflictData);

    if (conflictGroup.type === CONFLICT_TYPE.IMPORT_CONFLICT || 
        conflictGroup.type === CONFLICT_TYPE.EXPORT_CONFLICT) {
      resolutionData.autoMergeSuggestions.push({
        filePath: conflictGroup.filePath,
        action: RESOLUTION_ACTION.UNION,
        reason: "Import/export conflicts can be safely merged by union",
      });
    }
  }

  return resolutionData;
};

const getSuggestedActions = (conflictType) => {
  switch (conflictType) {
    case CONFLICT_TYPE.SAME_LINE:
      return [
        { action: RESOLUTION_ACTION.KEEP_THEIRS, label: "Keep Theirs" },
        { action: RESOLUTION_ACTION.KEEP_OURS, label: "Keep Ours" },
        { action: RESOLUTION_ACTION.MANUAL, label: "Manual Edit" },
      ];
    case CONFLICT_TYPE.DELETE_MODIFY:
      return [
        { action: RESOLUTION_ACTION.KEEP_THEIRS, label: "Keep Modified" },
        { action: RESOLUTION_ACTION.KEEP_OURS, label: "Keep Deleted" },
        { action: RESOLUTION_ACTION.MANUAL, label: "Manual Resolution" },
      ];
    case CONFLICT_TYPE.IMPORT_CONFLICT:
    case CONFLICT_TYPE.EXPORT_CONFLICT:
      return [
        { action: RESOLUTION_ACTION.UNION, label: "Union (Merge All)" },
        { action: RESOLUTION_ACTION.MANUAL, label: "Manual Review" },
      ];
    case CONFLICT_TYPE.STRUCTURAL:
      return [
        { action: RESOLUTION_ACTION.KEEP_THEIRS, label: "Keep Theirs" },
        { action: RESOLUTION_ACTION.KEEP_OURS, label: "Keep Ours" },
        { action: RESOLUTION_ACTION.MANUAL, label: "Manual Merge" },
      ];
    default:
      return [
        { action: RESOLUTION_ACTION.MANUAL, label: "Manual Resolution" },
      ];
  }
};

export const applyResolution = async (sessionId, conflictId, resolution) => {
  const state = await readConflictState();
  const sessionIndex = state.conflictSessions.findIndex((s) => s.id === sessionId);
  
  if (sessionIndex === -1) {
    throw new Error(`Conflict session not found: ${sessionId}`);
  }

  const resolutionRecord = {
    conflictId,
    ...resolution,
    appliedAt: Date.now(),
  };

  state.conflictSessions[sessionIndex].resolutions.push(resolutionRecord);
  
  const allResolved = state.conflictSessions[sessionIndex].conflicts.every(
    (cg) => state.conflictSessions[sessionIndex].resolutions.some(
      (r) => r.conflictId === `${cg.filePath}-${cg.type}`
    )
  );

  if (allResolved) {
    state.conflictSessions[sessionIndex].status = "resolved";
  }

  await writeConflictState(state);

  return resolutionRecord;
};

export const batchApplyResolutions = async (sessionId, resolutions) => {
  const state = await readConflictState();
  const sessionIndex = state.conflictSessions.findIndex((s) => s.id === sessionId);
  
  if (sessionIndex === -1) {
    throw new Error(`Conflict session not found: ${sessionId}`);
  }

  const appliedResolutions = [];

  for (const resolution of resolutions) {
    const resolutionRecord = {
      ...resolution,
      appliedAt: Date.now(),
    };
    state.conflictSessions[sessionIndex].resolutions.push(resolutionRecord);
    appliedResolutions.push(resolutionRecord);
  }

  state.conflictSessions[sessionIndex].status = "resolved";
  await writeConflictState(state);

  return appliedResolutions;
};

export const getConflictSession = async (sessionId) => {
  const state = await readConflictState();
  return state.conflictSessions.find((s) => s.id === sessionId) || null;
};

export const getAllConflictSessions = async (options = {}) => {
  const { consolidationId, status } = options;
  const state = await readConflictState();

  let sessions = [...state.conflictSessions];

  if (consolidationId) {
    sessions = sessions.filter((s) => s.consolidationId === consolidationId);
  }

  if (status) {
    sessions = sessions.filter((s) => s.status === status);
  }

  return sessions;
};

export const deleteConflictSession = async (sessionId) => {
  const state = await readConflictState();
  state.conflictSessions = state.conflictSessions.filter((s) => s.id !== sessionId);
  await writeConflictState(state);
  return { success: true };
};

export { CONFLICT_TYPE, RESOLUTION_ACTION };
