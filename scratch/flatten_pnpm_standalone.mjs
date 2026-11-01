import fs from 'node:fs';
import path from 'node:path';

// ESM has no __dirname; Node 20.11+ exposes the same value here.
const scriptDir = import.meta.dirname;

const standaloneDir = path.resolve(scriptDir, '../.next/standalone');
const targetNodeModules = path.join(standaloneDir, 'node_modules');
const pnpmDir = path.join(targetNodeModules, '.pnpm');

console.log('Flattening PNPM standalone node_modules into standard Node layout...');

function copyFolderRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      const srcPath = path.join(src, entry);
      const destPath = path.join(dest, entry);
      copyFolderRecursive(srcPath, destPath);
    }
  } else {
    try {
      fs.copyFileSync(src, dest);
    } catch {
      // A package that is already present, or a file the flattener has no
      // business owning — the next candidate copy still gets a chance.
    }
  }
}

if (fs.existsSync(pnpmDir)) {
  const pnpmEntries = fs.readdirSync(pnpmDir);
  for (const entry of pnpmEntries) {
    const pkgNodeModules = path.join(pnpmDir, entry, 'node_modules');
    if (fs.existsSync(pkgNodeModules)) {
      // Look at items inside pkgNodeModules
      const items = fs.readdirSync(pkgNodeModules);
      for (const item of items) {
        if (item === '.pnpm') continue;
        const itemPath = path.join(pkgNodeModules, item);
        if (item.startsWith('@')) {
          // Scoped package e.g. @swc, @next, @prisma
          const scopedItems = fs.readdirSync(itemPath);
          for (const scopedItem of scopedItems) {
            const subSrc = path.join(itemPath, scopedItem);
            const subDest = path.join(targetNodeModules, item, scopedItem);
            copyFolderRecursive(subSrc, subDest);
          }
        } else {
          // Unscoped package e.g. next, react, pg
          const destPath = path.join(targetNodeModules, item);
          copyFolderRecursive(itemPath, destPath);
        }
      }
    }
  }
}

// Copy extra @prisma packages from root node_modules/.pnpm
const rootPnpm = path.resolve(scriptDir, '../node_modules/.pnpm');
if (fs.existsSync(rootPnpm)) {
  const rootPnpmEntries = fs.readdirSync(rootPnpm);
  for (const entry of rootPnpmEntries) {
    if (entry.startsWith('@prisma+')) {
      const pkgName = entry.split('@prisma+')[1].split('@')[0];
      const srcDir = path.join(rootPnpm, entry, 'node_modules', '@prisma', pkgName);
      if (fs.existsSync(srcDir)) {
        const destDir = path.join(targetNodeModules, '@prisma', pkgName);
        console.log(`Copying root @prisma/${pkgName}`);
        copyFolderRecursive(srcDir, destDir);
      }
    }
  }
}

console.log('Finished copying all packages to top-level node_modules!');
