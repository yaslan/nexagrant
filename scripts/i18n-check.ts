#!/usr/bin/env ts-node
import * as fs from 'fs';
import * as path from 'path';

interface AuditReport {
  timestamp: string;
  summary: {
    totalKeysInCode: number;
    totalKeysInTurkish: number;
    totalKeysInEnglish: number;
    missingInTurkish: string[];
    missingInEnglish: string[];
    unusedInTurkish: string[];
    unusedInEnglish: string[];
    missingInBoth: string[];
  };
  details: {
    codeKeys: string[];
    turkishKeys: string[];
    englishKeys: string[];
  };
}

// Recursively extract all keys from nested objects (dot-notation)
function flattenKeys(obj: any, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...flattenKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

// Recursively find all .ts and .tsx files
function findFiles(dir: string, extensions: string[] = ['.ts', '.tsx']): string[] {
  const files: string[] = [];

  function traverse(currentDir: string) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          traverse(fullPath);
        } else if (extensions.some(ext => entry.name.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    } catch (err) {
      // silently ignore read errors
    }
  }

  traverse(dir);
  return files;
}

// Extract all t() calls from source files, respecting namespaces
async function extractTranslationKeysFromCode(): Promise<string[]> {
  const srcDir = path.join(process.cwd(), 'src');
  const files = findFiles(srcDir);

  const keysSet = new Set<string>();

  // Regex to extract useTranslations namespace
  const namespaceRegex = /useTranslations\(\s*['"`]([^'"`]+)['"`]\s*\)/;
  // Regex to match t('key') or t("key")
  const translationRegex = /(?:^|[^.\w])t\((['"`])([^'"`]+)\1\)/gm;

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');

      // Only process files that import useTranslations
      if (!content.includes('useTranslations')) {
        continue;
      }

      // Extract namespace from useTranslations
      const namespaceMatch = content.match(namespaceRegex);
      const namespace = namespaceMatch ? namespaceMatch[1] : '';

      let match;
      while ((match = translationRegex.exec(content)) !== null) {
        const key = match[2];
        // If there's a namespace, prepend it
        const fullKey = namespace ? `${namespace}.${key}` : key;
        keysSet.add(fullKey);
      }
    } catch (err) {
      console.warn(`Warning: Could not read file ${file}:`, err);
    }
  }

  return Array.from(keysSet).sort();
}

// Load message files and extract keys
function loadMessageKeys(lang: 'tr' | 'en'): string[] {
  const messageFile = path.join(process.cwd(), 'messages', `${lang}.json`);
  try {
    const content = fs.readFileSync(messageFile, 'utf-8');
    const messages = JSON.parse(content);
    return flattenKeys(messages).sort();
  } catch (err) {
    console.error(`Error loading ${lang}.json:`, err);
    return [];
  }
}

// Main audit function
async function audit(): Promise<AuditReport> {
  const codeKeys = await extractTranslationKeysFromCode();
  const turkishKeys = loadMessageKeys('tr');
  const englishKeys = loadMessageKeys('en');

  const codeKeysSet = new Set(codeKeys);
  const turkishKeysSet = new Set(turkishKeys);
  const englishKeysSet = new Set(englishKeys);

  // Find missing keys
  const missingInTurkish = Array.from(codeKeysSet).filter(k => !turkishKeysSet.has(k)).sort();
  const missingInEnglish = Array.from(codeKeysSet).filter(k => !englishKeysSet.has(k)).sort();
  const missingInBoth = missingInTurkish.filter(k => missingInEnglish.includes(k));

  // Find unused keys
  const unusedInTurkish = turkishKeys.filter(k => !codeKeysSet.has(k)).sort();
  const unusedInEnglish = englishKeys.filter(k => !codeKeysSet.has(k)).sort();

  return {
    timestamp: new Date().toISOString(),
    summary: {
      totalKeysInCode: codeKeys.length,
      totalKeysInTurkish: turkishKeys.length,
      totalKeysInEnglish: englishKeys.length,
      missingInTurkish,
      missingInEnglish,
      unusedInTurkish,
      unusedInEnglish,
      missingInBoth,
    },
    details: {
      codeKeys,
      turkishKeys,
      englishKeys,
    },
  };
}

// Format and display report
function displayReport(report: AuditReport): void {
  const { summary } = report;

  console.log('\n=== i18n Translation Audit Report ===\n');
  console.log(`Report generated: ${report.timestamp}\n`);

  console.log('📊 Summary Statistics:');
  console.log(`  Total keys in code: ${summary.totalKeysInCode}`);
  console.log(`  Total keys in Turkish: ${summary.totalKeysInTurkish}`);
  console.log(`  Total keys in English: ${summary.totalKeysInEnglish}\n`);

  if (summary.missingInBoth.length > 0) {
    console.log(`❌ Missing in BOTH languages (${summary.missingInBoth.length}):`);
    summary.missingInBoth.forEach(k => console.log(`   - ${k}`));
    console.log();
  }

  if (summary.missingInTurkish.length > 0) {
    console.log(`⚠️  Missing in Turkish (${summary.missingInTurkish.length}):`);
    summary.missingInTurkish.forEach(k => console.log(`   - ${k}`));
    console.log();
  }

  if (summary.missingInEnglish.length > 0) {
    console.log(`⚠️  Missing in English (${summary.missingInEnglish.length}):`);
    summary.missingInEnglish.forEach(k => console.log(`   - ${k}`));
    console.log();
  }

  if (summary.unusedInTurkish.length > 0) {
    console.log(`💤 Unused in code but in Turkish (${summary.unusedInTurkish.length}):`);
    summary.unusedInTurkish.slice(0, 10).forEach(k => console.log(`   - ${k}`));
    if (summary.unusedInTurkish.length > 10) {
      console.log(`   ... and ${summary.unusedInTurkish.length - 10} more`);
    }
    console.log();
  }

  if (summary.unusedInEnglish.length > 0) {
    console.log(`💤 Unused in code but in English (${summary.unusedInEnglish.length}):`);
    summary.unusedInEnglish.slice(0, 10).forEach(k => console.log(`   - ${k}`));
    if (summary.unusedInEnglish.length > 10) {
      console.log(`   ... and ${summary.unusedInEnglish.length - 10} more`);
    }
    console.log();
  }

  if (summary.missingInBoth.length === 0 &&
      summary.missingInTurkish.length === 0 &&
      summary.missingInEnglish.length === 0) {
    console.log('✅ All translation keys are present in both languages!\n');
  }
}

// Main execution
async function main() {
  try {
    const report = await audit();

    // Output JSON for CI/CD parsing
    console.log(JSON.stringify(report, null, 2));

    // Display human-readable report
    displayReport(report);

    // Exit with appropriate code
    const hasGaps =
      report.summary.missingInBoth.length > 0 ||
      report.summary.missingInTurkish.length > 0 ||
      report.summary.missingInEnglish.length > 0;

    process.exit(hasGaps ? 1 : 0);
  } catch (err) {
    console.error('Error during audit:', err);
    process.exit(1);
  }
}

main();
