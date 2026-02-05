# 🤖 Agent Manager: Parallel Swarm Orchestration

Welcome to the **Agent Manager**, the high-performance core of OpenChamber’s parallel development workflow. By leveraging isolated Git worktrees, the Agent Manager allows you to deploy multiple specialized agents simultaneously, each working in its own sandboxed environment. Overcome the single-thread bottleneck and achieve maximum collective flow.

---

## 🚀 Feature Overview: Why Parallelize?

In traditional environments, you are limited by the serial nature of discovery and refactoring. The Agent Manager unlocks **10x Velocity** by:

- **Parallel Refactoring**: Task one agent with updating documentation, another with backend logic, and a third with UI polish—all at the same time.
- **Hypothesis Testing**: Spawn agents to experiment with different architectural patterns in isolated branches.
- **Zero Race Conditions**: Each agent operates in a dedicated Git Worktree, ensuring they never overwrite each other's "train of thought" or intermediate file states.

---

## 🛠️ Workflow Walkthrough

### 1. Spawning Your Swarm

To initiate a new agent, open the **Agent Deployment Dialog** (assigned to `Ctrl/Cmd + Alt + A` by default).

- **Skill Selection**: Choose from personas like _The Architect_, _The Debugger_, or _The Aegis-Reviewer_.
- **Task Definition**: Provide a clear, actionable directive.
- **Branch Strategy**: The manager automatically creates a unique worktree branch (e.g., `agent/refactor-auth-8d56287`) derived from your specified base branch.

### 2. Monitoring the Pulse

Once spawned, track your swarm via the **Swarm Dashboard**:

- **Worktree Graph**: A custom, interactive SVG visualization showing the relationship between your main branch and active agent worktrees. Watch as agents branch out, commit progress, and prepare for merging.
- **Real-time Logs**: Stream the stdout/stderr of any agent without leaving your primary workspace.
- **Glassmorphism UI**: View the status (Pending, Active, Completed, Failed) in a sleek, non-intrusive overlay that respects your focus.

### 3. Merging the Collective Output

When an agent completes its task, it's time to bring the wisdom back to the main branch through the **Result Merge Panel**.

- **Auto-Score**: The Swarm Coordinator analyzes the results and scores them based on heuristic correctness.
- **Conflict Resolution**:
  - **Auto-Merge**: For non-overlapping changes.
  - **Voting Mode**: Let multiple agents "vote" on the best implementation of a single function.
  - **Manual Intervention**: Use the side-by-side diff view to cherry-pick the exact lines you want to keep.

---

## ❓ FAQ & Troubleshooting

**"What if an agent gets stuck in a loop?"**
Every agent is governed by a **24-hour Time-To-Live (TTL)**. If an agent stops reporting health beats, the system automatically terminates the process and marks the status as `Failed`.

**"How do I clean up completed worktrees?"**
You can trigger a manual cleanup via the "Purge Stale" button in the dashboard. The Agent Manager handles the `git worktree remove` and `git branch -D` operations safely, ensuring your project directory stays lean.

**"Can I spawn agents on a remote server?"**
Currently, the Agent Manager optimizes for local performance where it can directly manage the filesystem and Git worktree layer. Remote swarm orchestration is planned for v1.8.0.

---

_“The swarm does not wait. It only iterates.”_ — **The Swarm Orchestrator**

![Dashboard Screenshot Placeholder]
