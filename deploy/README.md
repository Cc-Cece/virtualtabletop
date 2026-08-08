# Server deployment

This directory contains the Linux/systemd deployment files for a GitHub-driven VirtualTabletop server. Application code stays in the Git checkout; runtime data stays outside it.

## Fresh install

Prerequisites: Git, Node.js/NVM, npm, sudo, and systemd are already installed.

```bash
git clone https://github.com/Cc-Cece/virtualtabletop.git
cd virtualtabletop
bash deploy/install-server.sh
```

By default the installer creates a sibling data directory named `virtualtabletop-data`. To choose another location:

```bash
VTT_DATA_DIR=/srv/virtualtabletop-data bash deploy/install-server.sh
```

The installer:

- skips `npm ci` when `node_modules` already exists; otherwise it gives `npm ci` at most 120 seconds and continues with a warning if it times out or fails;
- creates external `save` and `library` data directories;
- seeds an empty external library once from the repository's bundled `library`;
- writes the Git-ignored local `config.json` so `library` points outside the checkout;
- sets `VTT_SAVE_DIR` in the systemd service so rooms, states, and uploaded assets stay outside the checkout;
- installs and starts `virtualtabletop.service`;
- installs a timer that checks `origin/main` every five minutes.

The final systemd service health check remains authoritative: if dependencies are incomplete and VTT cannot start, installation fails there instead of hanging indefinitely in `npm ci`.

## Updates

The deployment checkout is intentionally disposable: GitHub `main` is the source of truth. The updater discards tracked server-side edits, synchronizes to `origin/main`, runs `npm ci` only when needed, restarts the service, and rolls back to the previous commit if the updated service does not start.

A clean, unchanged checkout is not restarted on every timer tick.

Manual update:

```bash
bash deploy/update-vtt.sh
```

Useful status commands:

```bash
sudo systemctl status virtualtabletop.service
sudo systemctl status virtualtabletop-update.timer
sudo journalctl -u virtualtabletop.service -n 100 --no-pager
sudo journalctl -u virtualtabletop-update.service -n 100 --no-pager
```

`config.json` remains local and Git-ignored. Runtime data is not deleted by code updates.
