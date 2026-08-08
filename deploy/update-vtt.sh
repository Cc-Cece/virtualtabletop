#!/usr/bin/env bash
set -Eeuo pipefail

SERVICE_NAME="${VTT_SERVICE_NAME:-virtualtabletop}"
TARGET_BRANCH="${VTT_UPDATE_BRANCH:-main}"
REMOTE_NAME="${VTT_UPDATE_REMOTE:-origin}"

if [[ "${VTT_UPDATE_SELF_COPY:-0}" != "1" ]]; then
  repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
  tmp_script="$(mktemp)"
  cp -- "${BASH_SOURCE[0]}" "$tmp_script"
  exec env \
    VTT_UPDATE_SELF_COPY=1 \
    VTT_UPDATE_REPO_DIR="$repo_dir" \
    VTT_UPDATE_TMP_SCRIPT="$tmp_script" \
    bash "$tmp_script" "$@"
fi

REPO_DIR="${VTT_UPDATE_REPO_DIR:?missing repository path}"
TMP_SCRIPT="${VTT_UPDATE_TMP_SCRIPT:-}"
trap '[[ -n "${TMP_SCRIPT:-}" ]] && rm -f -- "$TMP_SCRIPT"' EXIT

log() {
  printf '\n==> %s\n' "$*"
}

fail() {
  printf '\nERROR: %s\n' "$*" >&2
  exit 1
}

if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
  fail "Run this updater as the deployment user, not as root."
fi

cd "$REPO_DIR"

for command in git sudo systemctl timeout; do
  command -v "$command" >/dev/null 2>&1 || fail "$command is not available."
done
[[ -d .git ]] || fail "$REPO_DIR is not a Git working tree."

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh"
  nvm use default >/dev/null
fi

for command in node npm; do
  command -v "$command" >/dev/null 2>&1 || fail "$command is not available after loading NVM."
done

SYSTEMCTL="$(command -v systemctl)"

service_cmd() {
  sudo -n "$SYSTEMCTL" "$@"
}

rollback() {
  local reason="$1"
  log "Update failed: $reason"
  log "Rolling back to ${old_head:0:12}"

  git reset --hard "$old_head"
  if [[ "$old_lock" != "$new_lock" || "$dependencies_touched" == "1" ]]; then
    log "Restoring npm dependencies (maximum 60 seconds)"
    timeout --signal=KILL 60s npm ci || fail "Rollback restored the old commit, but npm dependencies could not be restored within 60 seconds."
  fi

  service_cmd restart "$SERVICE_NAME.service" || fail "Rollback restored the old commit, but the service could not be restarted."
  sleep 2
  if ! service_cmd is-active --quiet "$SERVICE_NAME.service"; then
    service_cmd --no-pager --full status "$SERVICE_NAME.service" || true
    fail "Update failed and the rollback service did not become active."
  fi

  fail "Update failed ($reason). Rolled back successfully to ${old_head:0:12}."
}

log "Checking $REMOTE_NAME/$TARGET_BRANCH"
git fetch --prune "$REMOTE_NAME"
git show-ref --verify --quiet "refs/remotes/$REMOTE_NAME/$TARGET_BRANCH" \
  || fail "Remote branch $REMOTE_NAME/$TARGET_BRANCH does not exist."

old_head="$(git rev-parse HEAD)"
old_lock="$(git rev-parse HEAD:package-lock.json 2>/dev/null || true)"
remote_head="$(git rev-parse "$REMOTE_NAME/$TARGET_BRANCH")"
current_branch="$(git branch --show-current)"
tracked_changes="$(git status --porcelain --untracked-files=no)"

if [[ "$old_head" == "$remote_head" && "$current_branch" == "$TARGET_BRANCH" && -z "$tracked_changes" ]]; then
  log "Already up to date"
  exit 0
fi

log "Synchronizing the deployment checkout to $REMOTE_NAME/$TARGET_BRANCH"
if [[ -n "$tracked_changes" ]]; then
  printf '%s\n' "$tracked_changes"
  log "Discarding tracked server-side changes"
fi

git reset --hard HEAD
git switch -C "$TARGET_BRANCH" "$REMOTE_NAME/$TARGET_BRANCH"
git reset --hard "$REMOTE_NAME/$TARGET_BRANCH"

new_head="$(git rev-parse HEAD)"
new_lock="$(git rev-parse HEAD:package-lock.json 2>/dev/null || true)"
dependencies_touched=0

if [[ ! -d node_modules || "$old_lock" != "$new_lock" ]]; then
  dependencies_touched=1
  log "Installing exact npm dependencies (maximum 60 seconds)"
  timeout --signal=KILL 60s npm ci || rollback "npm ci failed or timed out after 60 seconds"
else
  log "package-lock.json unchanged; keeping existing node_modules"
fi

log "Restarting $SERVICE_NAME.service"
service_cmd restart "$SERVICE_NAME.service" || rollback "systemd restart failed"
sleep 2

if ! service_cmd is-active --quiet "$SERVICE_NAME.service"; then
  service_cmd --no-pager --full status "$SERVICE_NAME.service" || true
  rollback "service did not become active"
fi

log "Update complete"
printf 'Updated: %s -> %s\n' "${old_head:0:12}" "${new_head:0:12}"
service_cmd --no-pager --full status "$SERVICE_NAME.service" | sed -n '1,8p'
