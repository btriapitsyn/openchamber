# Agent Manager (Worktrees) Reference

## Overview

The Agent Manager feature enables high-velocity parallel development using Git worktrees. It allows multiple specialized agents to work on separate branches simultaneously within the same project directory without interfering with each other.

## Core Components

### 1. Git Worktree Service (`packages/web/server/lib/git-worktree-service.js`)

- Handles the lifecycle of agent worktrees.
- **States**: `pending`, `active`, `completed`, `failed`.
- **Concurrent Limit**: Maximum 10 active agents by default.
- **Cleanup**: Automatically removes stale worktrees and agent metadata after 24 hours.

### 2. Swarm Coordinator (`packages/web/server/lib/swarm-coordinator.js`)

- **Barrier Sync**: Ensures multiple agents reach a common state before proceeding.
- **Leader Election**: Dynamic selection of a coordinator agent among a swarm.
- **Task Partitioning**: Strategies for distributing work (Round-Robin, Hash).
- **Event Messaging**: Pub/Sub system for inter-agent communication.

### 3. Result Consolidator (`packages/web/server/lib/result-consolidator.js`)

- **Scoring**: Evaluates agent output based on:
  - Consistency (30%)
  - Code Quality (30%)
  - Test Coverage (25%)
  - Efficiency (15%)
- **Merge Strategies**: `auto`, `voting`, `manual`, `union`.
- **Merge Preview**: Detects conflicts before final integration.

### 4. Conflict Resolver (`packages/web/server/lib/conflict-resolver.js`)

- Detects specific conflict types:
  - `SAME_LINE`: Changes to the same line.
  - `DELETE_MODIFY`: One agent deletes, another modifies.
  - `IMPORT_CONFLICT`: Duplicate or conflicting imports.
  - `EXPORT_CONFLICT`: Duplicate or conflicting exports.
  - `STRUCTURAL`: Changes to the same function/class/interface.

## API Endpoints

### Agents Management

- `POST /api/agents/spawn`: Create a new agent and its worktree.
- `GET /api/agents/status`: List all agents and their current state.
- `GET /api/agents/:id`: Get detailed information for a specific agent.
- `DELETE /api/agents/:id`: Terminate an agent and cleanup its worktree.

### Swarm Operations

- `GET /api/agents/swarm/status`: Overview of active barriers, elections, and partitions.

## UI Integration

- **Agent Dashboard**: Real-time monitoring of all active agent worktrees.
- **Worktree Graph**: Visual representation of parallel branches and their relationship to `main`.
- **Merge Center**: Conflict resolution and final consolidation UI.

## Security (Agent Isolation)

- Worktrees are isolated in `.opencode/worktrees/`.
- Process-level isolation for agent execution.
- Read-only access to base branch, write access restricted to agent's own worktree.
