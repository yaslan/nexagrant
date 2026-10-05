import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

interface ComparisonResult {
  onlyInProduction: string[];
  onlyInLocal: string[];
  contentDiffer: Array<{
    relativePath: string;
    prodSize: number;
    localSize: number;
    maskedDiffSnippet?: string;
  }>;
  identicalCount: number;
  ignoredCount: number;
}

const DEFAULT_IGNORED_PATTERNS = [
  'node_modules',
  '.next',
  '.git',
  '.turbo',
  '.cache',
  'coverage',
  '.DS_Store',
  'dist',
  'build',
  'pnpm-debug.log',
  'npm-debug.log',
];

/**
 * Calculates SHA-256 hash of a file
 */
function getFileHash(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Masks sensitive values in environment files or config lines
 */
export function maskSensitiveLines(content: string): string {
  const sensitiveKeys = ['SECRET', 'PASSWORD', 'KEY', 'TOKEN', 'DATABASE_URL', 'AUTH_'];
  return content
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line;
      const eqIndex = line.indexOf('=');
      if (eqIndex !== -1) {
        const key = line.slice(0, eqIndex).trim();
        const value = line.slice(eqIndex + 1).trim();
        const isSensitive = sensitiveKeys.some((k) => key.toUpperCase().includes(k));
        if (isSensitive && value.length > 0) {
          const masked = value.length > 6 ? `${value.slice(0, 3)}***${value.slice(-3)}` : '***MASKED***';
          return `${key}=${masked}`;
        }
      }
      return line;
    })
    .join('\n');
}

/**
 * Recursively collects file relative paths from a root directory
 */
function collectFiles(dir: string, baseDir: string = dir, ignoredPatterns: string[] = DEFAULT_IGNORED_PATTERNS): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath);

    const isIgnored = ignoredPatterns.some((pattern) => {
      return relPath === pattern || relPath.startsWith(pattern + path.sep) || entry.name === pattern;
    });

    if (isIgnored) continue;

    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, baseDir, ignoredPatterns));
    } else if (entry.isFile()) {
      results.push(relPath);
    }
  }

  return results;
}

/**
 * Compares Production Backup directory against Local Repository directory
 */
export function compareDirectories(
  prodDir: string,
  localDir: string,
  ignoredPatterns: string[] = DEFAULT_IGNORED_PATTERNS
): ComparisonResult {
  const prodFiles = new Set(collectFiles(prodDir, prodDir, ignoredPatterns));
  const localFiles = new Set(collectFiles(localDir, localDir, ignoredPatterns));

  const onlyInProduction: string[] = [];
  const onlyInLocal: string[] = [];
  const contentDiffer: ComparisonResult['contentDiffer'] = [];
  let identicalCount = 0;

  // Check files in production
  for (const file of prodFiles) {
    if (!localFiles.has(file)) {
      onlyInProduction.push(file);
    } else {
      const prodPath = path.join(prodDir, file);
      const localPath = path.join(localDir, file);

      const prodHash = getFileHash(prodPath);
      const localHash = getFileHash(localPath);

      if (prodHash === localHash) {
        identicalCount++;
      } else {
        const prodStat = fs.statSync(prodPath);
        const localStat = fs.statSync(localPath);

        let snippet: string | undefined;
        if (file.endsWith('.env') || file.includes('.env.')) {
          const prodContent = fs.readFileSync(prodPath, 'utf8');
          const localContent = fs.readFileSync(localPath, 'utf8');
          snippet = `--- PRODUCTION (${file}) ---\n${maskSensitiveLines(prodContent)}\n--- LOCAL (${file}) ---\n${maskSensitiveLines(localContent)}`;
        }

        contentDiffer.push({
          relativePath: file,
          prodSize: prodStat.size,
          localSize: localStat.size,
          maskedDiffSnippet: snippet,
        });
      }
    }
  }

  // Check files only in local
  for (const file of localFiles) {
    if (!prodFiles.has(file)) {
      onlyInLocal.push(file);
    }
  }

  onlyInProduction.sort();
  onlyInLocal.sort();
  contentDiffer.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  return {
    onlyInProduction,
    onlyInLocal,
    contentDiffer,
    identicalCount,
    ignoredCount: 0,
  };
}

/**
 * Formats comparison result into Markdown report
 */
export function generateMarkdownReport(result: ComparisonResult, prodDir: string, localDir: string): string {
  let md = `# cPanel Production Backup vs Local Repository Diff Report\n\n`;
  md += `- **Production Backup Dir:** \`${prodDir}\`\n`;
  md += `- **Local Repository Dir:** \`${localDir}\`\n`;
  md += `- **Execution Time:** ${new Date().toISOString()}\n\n`;

  md += `## Overview Summary\n\n`;
  md += `| Category | Count |\n`;
  md += `|---|---|\n`;
  md += `| Identical Files | ${result.identicalCount} |\n`;
  md += `| Files Only in Production | ${result.onlyInProduction.length} |\n`;
  md += `| Files Only in Local | ${result.onlyInLocal.length} |\n`;
  md += `| Files with Content Differences | ${result.contentDiffer.length} |\n\n`;

  if (result.onlyInProduction.length > 0) {
    md += `## 🚨 Files ONLY in Production (${result.onlyInProduction.length})\n\n`;
    md += `*These files exist on cPanel production server but are MISSING locally:*\n\n`;
    for (const f of result.onlyInProduction) {
      md += `- \`${f}\`\n`;
    }
    md += `\n`;
  }

  if (result.contentDiffer.length > 0) {
    md += `## ⚠️ Files with Content Differences (${result.contentDiffer.length})\n\n`;
    md += `| File Path | Production Size (bytes) | Local Size (bytes) |\n`;
    md += `|---|---|---|\n`;
    for (const d of result.contentDiffer) {
      md += `| \`${d.relativePath}\` | ${d.prodSize} | ${d.localSize} |\n`;
    }
    md += `\n`;

    const envDiffs = result.contentDiffer.filter((d) => d.maskedDiffSnippet);
    if (envDiffs.length > 0) {
      md += `### Environment File Diffs (Masked Secrets)\n\n`;
      for (const d of envDiffs) {
        md += `\`\`\`ini\n${d.maskedDiffSnippet}\n\`\`\`\n\n`;
      }
    }
  }

  if (result.onlyInLocal.length > 0) {
    md += `## ℹ️ Files ONLY in Local Repo (${result.onlyInLocal.length})\n\n`;
    md += `*These files exist locally but are not present in production backup:*\n\n`;
    for (const f of result.onlyInLocal.slice(0, 30)) {
      md += `- \`${f}\`\n`;
    }
    if (result.onlyInLocal.length > 30) {
      md += `- ... and ${result.onlyInLocal.length - 30} more files.\n`;
    }
    md += `\n`;
  }

  return md;
}

// CLI Execution Support
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log(`Usage: npx tsx scripts/compare-production-backup.ts <path-to-prod-backup> <path-to-local-repo> [out-report-path]`);
    process.exit(1);
  }

  // args.length < 2 already exits above, so args[0] and args[1] exist here;
  // TS can't correlate the length check with index safety on its own.
  const prodDir = path.resolve(args[0]!);
  const localDir = path.resolve(args[1]!);
  const reportPath = args[2] ? path.resolve(args[2]) : null;

  console.log(`Comparing Production (${prodDir}) vs Local (${localDir})...`);
  const result = compareDirectories(prodDir, localDir);
  const report = generateMarkdownReport(result, prodDir, localDir);

  if (reportPath) {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, report, 'utf8');
    console.log(`Report written to: ${reportPath}`);
  } else {
    console.log(report);
  }
}
