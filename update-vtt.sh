#!/usr/bin/env bash
set -Eeuo pipefail

SERVICE_NAME="virtualtabletop"
TARGET_BRANCH="main"
REMOTE_NAME="origin"
REPO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

log() {
  printf '\n==> %s\n' "$*"
}

fail() {
  printf '\nERROR: %s\n' "$*" >&2
  exit 1
}

if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
  fail "Run this script as the deployment user, not with sudo. The script will use sudo only for systemd commands."
fi

cd "$REPO_DIR"

command -v git >/dev/null 2>&1 || fail "git is not installed."
[[ -d .git ]] || fail "$REPO_DIR is not a Git working tree."

# Load the same NVM environment normally used by the VTT systemd service.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh"
  nvm use default >/dev/null
fi

command -v node >/dev/null 2>&1 || fail "node is not available for user $(id -un)."
command -v npm >/dev/null 2>&1 || fail "npm is not available for user $(id -un)."
command -v sudo >/dev/null 2>&1 || fail "sudo is required to restart $SERVICE_NAME.service."

log "Repository: $REPO_DIR"
printf 'User: %s\n' "$(id -un)"
printf 'Node: %s\n' "$(node --version)"
printf 'npm:  %s\n' "$(npm --version)"

# Tracked server-side edits are dangerous because an update could overwrite them.
# Untracked files are intentionally ignored here so local config/save files can remain
# beside the checkout when they are not tracked by Git.
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  git status --short
  fail "Tracked files have local changes. Commit/revert them before updating."
fi

log "Fetching $REMOTE_NAME"
git fetch --prune "$REMOTE_NAME"

git show-ref --verify --quiet "refs/remotes/$REMOTE_NAME/$TARGET_BRANCH" \
  || fail "Remote branch $REMOTE_NAME/$TARGET_BRANCH does not exist."

current_branch="$(git branch --show-current)"
if [[ "$current_branch" != "$TARGET_BRANCH" ]]; then
  log "Switching from ${current_branch:-detached HEAD} to $TARGET_BRANCH"
  git switch "$TARGET_BRANCH"
fi

# Refuse divergent deployments. A production checkout should only move forward to
# the exact history already reviewed and merged on GitHub.
if ! git merge-base --is-ancestor HEAD "$REMOTE_NAME/$TARGET_BRANCH"; then
  fail "Local $TARGET_BRANCH has commits that are not in $REMOTE_NAME/$TARGET_BRANCH. Refusing to overwrite them."
fi

old_head="$(git rev-parse HEAD)"
old_lock="$(git rev-parse HEAD:package-lock.json 2>/dev/null || true)"

log "Fast-forwarding $TARGET_BRANCH"
git merge --ff-only "$REMOTE_NAME/$TARGET_BRANCH"

new_head="$(git rev-parse HEAD)"
new_lock="$(git rev-parse HEAD:package-lock.json 2>/dev/null || true)"

if [[ "$old_head" == "$new_head" ]]; then
  log "Already up to date"
else
  printf 'Updated: %s -> %s\n' "${old_head:0:12}" "${new_head:0:12}"
fi

if [[ ! -d node_modules || "$old_lock" != "$new_lock" ]]; then
  log "Installing exact npm dependencies"
  npm ci
else
  log "package-lock.json unchanged; keeping existing node_modules"
fi

log "Restarting $SERVICE_NAME.service"
sudo systemctl restart "$SERVICE_NAME.service"

# Give systemd a moment to observe an immediate startup failure.
sleep 2

if ! sudo systemctl is-active --quiet "$SERVICE_NAME.service"; then
  sudo systemctl --no-pager --full status "$SERVICE_NAME.service" || true
  fail "$SERVICE_NAME.service did not become active after the update."
fi

log "Update complete"
sudo systemctl --no-pager --full status "$SERVICE_NAME.service" | sed -n '1,8p'
printf '\nCurrent commit: %s\n' "$(git rev-parse --short=12 HEAD)"
