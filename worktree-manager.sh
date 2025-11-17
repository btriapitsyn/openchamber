#!/usr/bin/env bash

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT=""
WORKSPACES_DIR=""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}!${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Ensure we know the repo root and workspace directory
ensure_repo_context() {
    if [[ -n "$WORKSPACES_DIR" ]]; then
        return
    fi

    if ! REPO_ROOT=$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null); then
        print_error "Not a git repository"
        exit 1
    fi

    WORKSPACES_DIR="$REPO_ROOT/.agent-workspaces"
}

# Add .agent-workspaces to git exclude
add_to_git_exclude() {
    ensure_repo_context

    local exclude_file
    exclude_file=$(git -C "$REPO_ROOT" rev-parse --git-path info/exclude)
    local exclude_pattern="/.agent-workspaces/"

    if [[ -f "$exclude_file" ]]; then
        if ! grep -qxF "$exclude_pattern" "$exclude_file"; then
            echo "$exclude_pattern" >> "$exclude_file"
            print_success "Added $exclude_pattern to git exclude"
        fi
    else
        mkdir -p "$(dirname "$exclude_file")"
        echo "$exclude_pattern" > "$exclude_file"
        print_success "Created git exclude and added $exclude_pattern"
    fi
}

# Ensure we're in a git repository
check_git_repo() {
    ensure_repo_context
}

# Create workspaces directory if it doesn't exist
ensure_workspaces_dir() {
    ensure_repo_context

    if [[ ! -d "$WORKSPACES_DIR" ]]; then
        mkdir -p "$WORKSPACES_DIR"
        print_success "Created $WORKSPACES_DIR directory"
    fi

    add_to_git_exclude
}

# Create new workspace
create_workspace() {
    ensure_workspaces_dir

    print_info "Creating new workspace..."

    # Get workspace name
    workspace_name=$(gum input --placeholder "Enter workspace name (will be used for branch name)")

    if [[ -z "$workspace_name" ]]; then
        print_error "Workspace name cannot be empty"
        return 1
    fi

    # Check if workspace already exists
    if [[ -d "$WORKSPACES_DIR/$workspace_name" ]]; then
        print_error "Workspace '$workspace_name' already exists"
        return 1
    fi

    # Get base branch
    base_branch=$(gum input --placeholder "Enter base branch (e.g., origin/main)" --value "origin/main")

    if [[ -z "$base_branch" ]]; then
        print_error "Base branch cannot be empty"
        return 1
    fi

    # Validate base branch exists
    if ! git -C "$REPO_ROOT" rev-parse --verify "$base_branch" > /dev/null 2>&1; then
        print_error "Base branch '$base_branch' does not exist"
        return 1
    fi

    local workspace_path="$WORKSPACES_DIR/$workspace_name"
    local display_path="${workspace_path#$REPO_ROOT/}"

    print_info "Creating worktree at $workspace_path from $base_branch..."
    # Create worktree with new branch
    if git -C "$REPO_ROOT" worktree add -b "$workspace_name" "$workspace_path" "$base_branch"; then
        cd "$workspace_path"

        # Install Node.js dependencies if package.json is present
        if [[ -f "package.json" ]]; then
            print_info "Running pnpm install..."
            if pnpm install > /dev/null 2>&1; then
                print_success "pnpm install completed"
            else
                print_warning "pnpm install failed; check logs"
            fi
        fi

        # Push branch to origin
        print_info "Pushing branch to origin..."
        if git push -u origin "$workspace_name" > /dev/null 2>&1; then
            print_success "Branch pushed to origin"
        else
            print_warning "Failed to push branch to origin; you may need to push manually"
        fi

        cd - > /dev/null
        print_success "Workspace '$workspace_name' created successfully"
        print_info "Path: ${display_path:-$workspace_path}"
        print_info "Branch: $workspace_name"
    else
        print_error "Failed to create workspace"
        return 1
    fi
}

# Show status of all workspaces
show_status() {
    ensure_workspaces_dir

    if [[ ! -d "$WORKSPACES_DIR" ]] || [[ -z "$(ls -A "$WORKSPACES_DIR" 2>/dev/null)" ]]; then
        print_warning "No workspaces found"
        return 0
    fi

    print_info "Workspace Status:"
    echo ""

    local original_dir
    original_dir=$(pwd)

    while IFS= read -r workspace_path; do
        if [[ -z "$workspace_path" ]] || [[ ! -d "$workspace_path" ]]; then
            continue
        fi

        workspace_name=$(basename "$workspace_path")

        echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${GREEN}Workspace:${NC} $workspace_name"

        cd "$workspace_path" || continue

        # Get branch name
        branch_name=$(git branch --show-current 2>/dev/null || echo "unknown")
        echo -e "${GREEN}Branch:${NC} $branch_name"

        # Get creation date
        if [[ "$(uname)" == "Darwin" ]]; then
            creation_date=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$workspace_path" 2>/dev/null || echo "unknown")
        else
            creation_date=$(stat -c "%y" "$workspace_path" 2>/dev/null | cut -d' ' -f1,2 | cut -d'.' -f1 || echo "unknown")
        fi
        echo -e "${GREEN}Created:${NC} $creation_date"

        # Check for uncommitted changes
        local status_output=$(git status --porcelain 2>/dev/null || echo "")
        if [[ -n "$status_output" ]]; then
            print_warning "Uncommitted changes:"

            # Show each file with line count for new files
            while IFS= read -r line; do
                local status="${line:0:2}"
                local file="${line:3}"

                # Check if it's a new untracked file (??)
                if [[ "$status" == "??" ]] && [[ -f "$file" ]]; then
                    local line_count=$(wc -l < "$file" 2>/dev/null | tr -d ' ' || echo "0")
                    echo "  ?? $file (+$line_count lines)"
                else
                    echo "  $line"
                fi
            done <<< "$status_output"
        else
            print_success "No uncommitted changes"
        fi

        # Show file changes stats
        echo -e "${GREEN}Changes from base:${NC}"
        local diff_output=""
        local base_branch=""

        # Try different approaches to show diff
        if git rev-parse --verify HEAD@{upstream} >/dev/null 2>&1; then
            base_branch="HEAD@{upstream}"
            diff_output=$(git diff --stat HEAD@{upstream} 2>/dev/null || echo "")
        elif git rev-parse --verify origin/main >/dev/null 2>&1; then
            base_branch="origin/main"
            diff_output=$(git diff --stat origin/main 2>/dev/null || echo "")
        fi

        if [[ -n "$diff_output" ]]; then
            echo "$diff_output"
            # Show total changes summary
            local files_changed=$(echo "$diff_output" | tail -1 | grep -o '[0-9]\+ file' || echo "")
            local insertions=$(echo "$diff_output" | tail -1 | grep -o '[0-9]\+ insertion' || echo "")
            local deletions=$(echo "$diff_output" | tail -1 | grep -o '[0-9]\+ deletion' || echo "")
            if [[ -n "$files_changed" ]]; then
                echo "  Summary: $files_changed changed${insertions:+, $insertions}${deletions:+, $deletions}"
            fi
        else
            echo "  No changes from base branch"
        fi

        # Check PR status
        echo -e "${GREEN}PR Status:${NC}"
        if gh pr view "$branch_name" >/dev/null 2>&1; then
            local pr_state=$(gh pr view "$branch_name" --json state --jq .state 2>/dev/null || echo "UNKNOWN")
            local pr_number=$(gh pr view "$branch_name" --json number --jq .number 2>/dev/null || echo "?")
            local pr_url=$(gh pr view "$branch_name" --json url --jq .url 2>/dev/null || echo "")
            echo "  #$pr_number - $pr_state"
            if [[ -n "$pr_url" ]]; then
                echo "  $pr_url"
            fi
        else
            echo "  No PR created"
        fi

        echo ""
    done < <(find "$WORKSPACES_DIR" -mindepth 1 -maxdepth 1 -type d -print | sort)

    cd "$original_dir" || return
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Create PR for workspace
create_pr() {
    ensure_workspaces_dir

    if [[ ! -d "$WORKSPACES_DIR" ]] || [[ -z "$(ls -A "$WORKSPACES_DIR" 2>/dev/null)" ]]; then
        print_warning "No workspaces found"
        return 0
    fi

    # Get list of workspaces
    workspace_name=$(ls -1 "$WORKSPACES_DIR" | gum filter --placeholder "Select workspace to create PR for")

    if [[ -z "$workspace_name" ]]; then
        print_warning "No workspace selected"
        return 0
    fi

    workspace_path="$WORKSPACES_DIR/$workspace_name"

    if [[ ! -d "$workspace_path" ]]; then
        print_error "Workspace path '$workspace_path' not found"
        return 1
    fi

    cd "$workspace_path"

    branch_name=$(git branch --show-current)

    # Check if PR already exists
    if gh pr view "$branch_name" > /dev/null 2>&1; then
        print_warning "PR already exists for branch '$branch_name'"
        pr_url=$(gh pr view "$branch_name" --json url --jq .url)
        print_info "URL: $pr_url"
        cd - > /dev/null
        return 0
    fi

    # Check if there are commits to push
    if ! git rev-parse --verify origin/"$branch_name" > /dev/null 2>&1; then
        print_info "Pushing branch to remote..."
        git push -u origin "$branch_name"
    else
        # Check if there are unpushed commits
        unpushed_commits=$(git log origin/"$branch_name"..HEAD --oneline | wc -l | tr -d ' ')
        if [[ "$unpushed_commits" -gt 0 ]]; then
            print_info "Pushing $unpushed_commits unpushed commit(s)..."
            git push
        fi
    fi

    print_info "Creating PR for '$workspace_name'..."

    # Get PR title
    pr_title=$(gum input --placeholder "Enter PR title" --value "$workspace_name")

    if [[ -z "$pr_title" ]]; then
        print_error "PR title cannot be empty"
        cd - > /dev/null
        return 1
    fi

    # Get PR body (optional)
    pr_body=$(gum write --placeholder "Enter PR description (optional, Ctrl+D to finish)")

    # Create PR (ready for review)
    if gh pr create --title "$pr_title" --body "$pr_body" --base main; then
        pr_url=$(gh pr view "$branch_name" --json url --jq .url)
        print_success "PR created successfully: $pr_url"
    else
        print_error "Failed to create PR"
        cd - > /dev/null
        return 1
    fi

    cd - > /dev/null
}

# Merge PR for workspace
merge_pr() {
    ensure_workspaces_dir

    if [[ ! -d "$WORKSPACES_DIR" ]] || [[ -z "$(ls -A "$WORKSPACES_DIR" 2>/dev/null)" ]]; then
        print_warning "No workspaces found"
        return 0
    fi

    # Get list of workspaces
    workspace_name=$(ls -1 "$WORKSPACES_DIR" | gum filter --placeholder "Select workspace to merge PR for")

    if [[ -z "$workspace_name" ]]; then
        print_warning "No workspace selected"
        return 0
    fi

    workspace_path="$WORKSPACES_DIR/$workspace_name"

    if [[ ! -d "$workspace_path" ]]; then
        print_error "Workspace path '$workspace_path' not found"
        return 1
    fi

    cd "$workspace_path"

    branch_name=$(git branch --show-current)

    # Check if PR exists
    if ! gh pr view "$branch_name" > /dev/null 2>&1; then
        print_error "No PR found for branch '$branch_name'"
        cd - > /dev/null
        return 1
    fi

    pr_number=$(gh pr view "$branch_name" --json number --jq .number)
    pr_url=$(gh pr view "$branch_name" --json url --jq .url)

    print_info "Attempting to merge PR #$pr_number..."
    print_info "URL: $pr_url"

    # Try to merge with squash
    if gh pr merge "$pr_number" --squash --auto=false; then
        print_success "PR #$pr_number merged successfully"
    else
        print_error "Failed to merge PR #$pr_number"

        # Check if it's a merge conflict
        print_info "Checking for merge conflicts..."

        # Try to get conflict information
        conflict_file="$workspace_path/CONFLICTS.txt"

        {
            echo "Merge Conflicts Detected"
            echo "========================"
            echo "PR: #$pr_number"
            echo "Branch: $branch_name"
            echo "Date: $(date)"
            echo ""
            echo "To resolve conflicts:"
            echo "1. Fix conflicts in the files listed below"
            echo "2. git add <resolved-files>"
            echo "3. git commit"
            echo "4. git push"
            echo "5. Try merging PR again"
            echo ""
            echo "Conflict Details:"
            echo "-----------------"

            # Try to fetch conflict info from GitHub
            gh pr view "$pr_number" --json mergeable,mergeStateStatus --jq '"Mergeable: \(.mergeable)\nMerge State: \(.mergeStateStatus)"'

        } > "$conflict_file"

        print_warning "Conflict information saved to: $conflict_file"
        print_info "Please resolve conflicts, commit, push, and try merging again"

        cd - > /dev/null
        return 1
    fi

    cd - > /dev/null
}

# Cleanup workspace
cleanup_workspace() {
    ensure_workspaces_dir

    if [[ ! -d "$WORKSPACES_DIR" ]] || [[ -z "$(ls -A "$WORKSPACES_DIR" 2>/dev/null)" ]]; then
        print_warning "No workspaces found"
        return 0
    fi

    # Get list of workspaces
    workspace_name=$(ls -1 "$WORKSPACES_DIR" | gum filter --placeholder "Select workspace to cleanup")

    if [[ -z "$workspace_name" ]]; then
        print_warning "No workspace selected"
        return 0
    fi

    workspace_path="$WORKSPACES_DIR/$workspace_name"

    if [[ ! -d "$workspace_path" ]]; then
        print_error "Workspace path '$workspace_path' not found"
        return 1
    fi

    cd "$workspace_path"

    branch_name=$(git branch --show-current)

    # Check for uncommitted changes
    has_uncommitted=false
    if [[ -n $(git status --porcelain) ]]; then
        has_uncommitted=true
        print_warning "Workspace has uncommitted changes:"
        git status --short
        echo ""
    fi

    # Check for unpushed commits
    has_unpushed=false
    if git rev-parse --verify origin/"$branch_name" > /dev/null 2>&1; then
        unpushed_commits=$(git log origin/"$branch_name"..HEAD --oneline | wc -l | tr -d ' ')
        if [[ "$unpushed_commits" -gt 0 ]]; then
            has_unpushed=true
            print_warning "Workspace has $unpushed_commits unpushed commit(s):"
            git log origin/"$branch_name"..HEAD --oneline
            echo ""
        fi
    fi

    cd - > /dev/null

    # Only ask for confirmation if there are uncommitted or unpushed changes
    if [[ "$has_uncommitted" == true ]] || [[ "$has_unpushed" == true ]]; then
        if ! gum confirm "Are you sure you want to delete workspace '$workspace_name'? All uncommitted/unpushed changes will be lost."; then
            print_info "Cleanup cancelled"
            return 0
        fi
    fi

    print_info "Removing worktree '$workspace_name'..."

    # Remove worktree
    if git -C "$REPO_ROOT" worktree remove "$workspace_path" --force; then
        print_success "Worktree removed"
    else
        print_error "Failed to remove worktree"
        return 1
    fi

    # Delete local branch
    print_info "Deleting local branch '$branch_name'..."
    if git -C "$REPO_ROOT" branch -D "$branch_name" 2>/dev/null; then
        print_success "Local branch deleted"
    else
        print_warning "Branch may have already been deleted"
    fi

    print_success "Workspace '$workspace_name' cleaned up successfully"
}

# Main menu
main_menu() {
    check_git_repo

    while true; do
        echo ""
        choice=$(gum choose \
            "Create new workspace" \
            "Show status of all workspaces" \
            "Create PR for workspace" \
            "Merge PR for workspace" \
            "Cleanup workspace" \
            "Exit" \
            --header "Git Worktree Manager" \
            --height 10)

        case "$choice" in
            "Create new workspace")
                create_workspace
                ;;
            "Show status of all workspaces")
                show_status
                ;;
            "Create PR for workspace")
                create_pr
                ;;
            "Merge PR for workspace")
                merge_pr
                ;;
            "Cleanup workspace")
                cleanup_workspace
                ;;
            "Exit")
                print_info "Goodbye!"
                exit 0
                ;;
            *)
                print_error "Invalid choice"
                ;;
        esac
    done
}

# Run main menu
main_menu
