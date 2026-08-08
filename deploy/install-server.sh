#!/usr/bin/env bash
set -Eeuo pipefail

SERVICE_NAME="virtualtabletop"
UPDATE_SERVICE_NAME="virtualtabletop-update"
REPO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${VTT_DATA_DIR:-$(dirname "$REPO_DIR")/virtualtabletop-data}"
DEPLOY_DIR="$REPO_DIR/deploy"
SYSTEMD_DIR="$DEPLOY_DIR/systemd"

log() {
  printf '\n==> %s\n' "$*"
}

fail() {
  printf '\nERROR: %s\n' "$*" >&2
  exit 1
}

if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
  fail "Run this installer as the deployment user, not as root. It will use sudo for system files."
fi

for command in git sudo systemctl timeout; do
  command -v "$command" >/dev/null 2>&1 || fail "$command is not available."
done
[[ -d "$REPO_DIR/.git" ]] || fail "$REPO_DIR is not a Git working tree."
[[ -f "$REPO_DIR/config.template.json" ]] || fail "config.template.json is missing."
[[ -f "$SYSTEMD_DIR/virtualtabletop.service.in" ]] || fail "systemd templates are missing."

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh"
  nvm use default >/dev/null
fi

for command in node npm; do
  command -v "$command" >/dev/null 2>&1 || fail "$command is not available after loading NVM."
done

NODE_BIN="$(command -v node)"
SYSTEMCTL="$(command -v systemctl)"
DEPLOY_USER="$(id -un)"
DEPLOY_GROUP="$(id -gn)"
DEPLOY_HOME="$HOME"

cd "$REPO_DIR"
if [[ -d "$REPO_DIR/node_modules" ]]; then
  log "node_modules already exists; skipping npm ci"
else
  log "Installing npm dependencies (maximum 120 seconds)"
  set +e
  timeout --signal=KILL 120s npm ci
  npm_status=$?
  set -e
  if [[ $npm_status -ne 0 ]]; then
    printf '\nWARNING: npm ci did not complete successfully within the install window (exit %s); continuing deployment.\n' "$npm_status" >&2
  fi
fi

log "Creating external runtime data at $DATA_DIR"
mkdir -p \
  "$DATA_DIR/save/rooms" \
  "$DATA_DIR/save/states" \
  "$DATA_DIR/save/links" \
  "$DATA_DIR/save/errors" \
  "$DATA_DIR/save/assets" \
  "$DATA_DIR/library"

if [[ -d "$REPO_DIR/library" && -z "$(find "$DATA_DIR/library" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  log "Seeding the external public library from the repository"
  cp -a "$REPO_DIR/library/." "$DATA_DIR/library/"
fi

log "Writing local config.json"
if [[ ! -f "$REPO_DIR/config.json" ]]; then
  cp "$REPO_DIR/config.template.json" "$REPO_DIR/config.json"
fi
node - "$REPO_DIR/config.json" "$DATA_DIR/library" <<'NODE'
import fs from 'fs';

const [configPath, libraryPath] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
config.directories ||= {};
config.directories.library = libraryPath;
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
NODE

render_template() {
  local source="$1"
  local target="$2"
  node - "$source" "$target" "$DEPLOY_USER" "$DEPLOY_GROUP" "$DEPLOY_HOME" "$REPO_DIR" "$DATA_DIR" "$NODE_BIN" <<'NODE'
import fs from 'fs';

const [source, target, user, group, home, repo, data, node] = process.argv.slice(2);
let text = fs.readFileSync(source, 'utf8');
const values = {
  '@VTT_USER@': user,
  '@VTT_GROUP@': group,
  '@VTT_HOME@': home,
  '@VTT_REPO_DIR@': repo,
  '@VTT_DATA_DIR@': data,
  '@NODE_BIN@': node
};
for(const [token, value] of Object.entries(values))
  text = text.split(token).join(value);
fs.writeFileSync(target, text);
NODE
}

tmp_dir="$(mktemp -d)"
trap 'rm -rf -- "$tmp_dir"' EXIT

render_template "$SYSTEMD_DIR/virtualtabletop.service.in" "$tmp_dir/$SERVICE_NAME.service"
render_template "$SYSTEMD_DIR/virtualtabletop-update.service.in" "$tmp_dir/$UPDATE_SERVICE_NAME.service"
cp "$SYSTEMD_DIR/virtualtabletop-update.timer" "$tmp_dir/$UPDATE_SERVICE_NAME.timer"

cat > "$tmp_dir/virtualtabletop-update.sudoers" <<EOF_SUDOERS
$DEPLOY_USER ALL=(root) NOPASSWD: $SYSTEMCTL restart $SERVICE_NAME.service, $SYSTEMCTL is-active --quiet $SERVICE_NAME.service, $SYSTEMCTL --no-pager --full status $SERVICE_NAME.service
EOF_SUDOERS

VISUDO="$(command -v visudo || true)"
if [[ -z "$VISUDO" && -x /usr/sbin/visudo ]]; then
  VISUDO=/usr/sbin/visudo
fi
[[ -n "$VISUDO" ]] || fail "visudo is not available."
sudo "$VISUDO" -cf "$tmp_dir/virtualtabletop-update.sudoers" >/dev/null

log "Installing systemd units"
sudo install -m 0644 "$tmp_dir/$SERVICE_NAME.service" "/etc/systemd/system/$SERVICE_NAME.service"
sudo install -m 0644 "$tmp_dir/$UPDATE_SERVICE_NAME.service" "/etc/systemd/system/$UPDATE_SERVICE_NAME.service"
sudo install -m 0644 "$tmp_dir/$UPDATE_SERVICE_NAME.timer" "/etc/systemd/system/$UPDATE_SERVICE_NAME.timer"
sudo install -m 0440 "$tmp_dir/virtualtabletop-update.sudoers" "/etc/sudoers.d/virtualtabletop-update"

sudo "$SYSTEMCTL" daemon-reload
sudo "$SYSTEMCTL" enable --now "$SERVICE_NAME.service"
sudo "$SYSTEMCTL" enable --now "$UPDATE_SERVICE_NAME.timer"
sleep 2

if ! sudo "$SYSTEMCTL" is-active --quiet "$SERVICE_NAME.service"; then
  sudo "$SYSTEMCTL" --no-pager --full status "$SERVICE_NAME.service" || true
  fail "$SERVICE_NAME.service did not become active."
fi

log "Installation complete"
printf 'Repository: %s\n' "$REPO_DIR"
printf 'Runtime data: %s\n' "$DATA_DIR"
printf 'Node: %s\n' "$NODE_BIN"
printf 'Service: active\n'
printf 'Auto-update: every 5 minutes\n'
printf '\nManual update: bash %s/deploy/update-vtt.sh\n' "$REPO_DIR"
