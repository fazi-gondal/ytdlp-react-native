const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const BIN_DIR = path.join(PROJECT_ROOT, 'node_modules', '.bin');

// Resolve binaries like `tsc`/`jest` from the local node_modules/.bin instead
// of relying on PATH. Lifecycle scripts run by some package managers (e.g.
// `bun pack`) do not always put node_modules/.bin on PATH.
function resolveBin(command) {
  // If the caller passed a path (not a bare name), use it unchanged.
  if (command.includes(path.sep) || command.includes('/')) {
    return command;
  }

  const candidates = [command, `${command}.cmd`, `${command}.exe`, `${command}.ps1`];
  for (const candidate of candidates) {
    const full = path.join(BIN_DIR, candidate);
    if (fs.existsSync(full)) {
      // Quote Windows paths so spaces in the project path are preserved when
      // the command is handed to a shell.
      if (process.platform === 'win32') {
        return `"${full}"`;
      }
      return full;
    }
  }

  // Local binary not found; fall back to PATH resolution.
  return command;
}

// On Windows, executables like `tsc` and `jest` are `.cmd` batch files and cannot be
// spawned directly — they require shell: true to resolve. On Unix, shell: true is
// unnecessary.
function spawnSyncWithAutoShell(command, args, options) {
  const resolved = resolveBin(command);
  return spawnSync(resolved, args, { ...options, shell: process.platform === 'win32' });
}

module.exports = { spawnSyncWithAutoShell };
