'use strict';
/**
 * Startup file for cPanel "Setup Node.js App" (CloudLinux Node.js Selector +
 * Passenger). Application root /home/fonbridge/fonbridge-app, Startup file
 * `app.js` (docs: deploy/cpanel/KURULUM.md, TASK-MUST2PP2NHP6L).
 *
 * The Next standalone server lives in ./app with its own node_modules, so the
 * application root holds no `node_modules` directory: the Node.js Selector
 * keeps that name for a symlink into its virtual environment and refuses an
 * application root that already has one. "Run NPM Install" is not needed —
 * package.json here lists no dependencies.
 *
 * Passenger replaces `listen()` with its own socket, so PORT does not matter
 * under it. Started by hand (`node app.js`) the server binds 127.0.0.1 unless
 * FB_LISTEN_HOST says otherwise; the shell's HOSTNAME (the machine name) is
 * never used as the bind address.
 *
 * The production checks stay where they are: src/instrumentation.ts stops the
 * process when AUTH_SECRET is missing or DEMO_LOGIN_ENABLED=true.
 *
 * Links: the build's `serverExternalPackages` are reached through a few relative
 * symlinks under app/.next/node_modules (pg-<hash> → ../../node_modules/pg …).
 * The zip stores them as links, but an extractor may drop them or write them as
 * plain files. app/.next/node_modules-links.json lists each one; anything that
 * is not that exact link is replaced by it before the server loads.
 */
const fs = require('node:fs');
const path = require('node:path');

function restoreLinks(appDir) {
  const manifest = path.join(appDir, '.next', 'node_modules-links.json');
  if (!fs.existsSync(manifest)) return;
  for (const { link, target } of JSON.parse(fs.readFileSync(manifest, 'utf8'))) {
    const at = path.join(appDir, link);
    let current = null;
    try {
      current = fs.lstatSync(at).isSymbolicLink() ? fs.readlinkSync(at) : '';
    } catch {
      // missing
    }
    if (current === target) continue;
    if (current !== null) fs.rmSync(at, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(at), { recursive: true });
    fs.symlinkSync(target, at, 'dir');
    console.log(`[app.js] restored link ${link} -> ${target}`);
  }
}

restoreLinks(path.join(__dirname, 'app'));

process.env.NODE_ENV = 'production';
process.env.NEXT_TELEMETRY_DISABLED = '1';
process.env.HOSTNAME = process.env.FB_LISTEN_HOST || '127.0.0.1';

require(path.join(__dirname, 'app', 'server.js'));
