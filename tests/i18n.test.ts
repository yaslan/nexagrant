import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

interface TranslationReport {
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

// Helper: recursively extract all keys from nested objects (dot-notation)
function flattenKeys(
  obj: Record<string, unknown>,
  prefix = ''
): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...flattenKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

// Helper: recursively find all .ts and .tsx files
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
    } catch {
      // silently ignore read errors
    }
  }

  traverse(dir);
  return files;
}

// Helper: extract translation keys from source files
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
    } catch {
      // silently ignore read errors
    }
  }

  return Array.from(keysSet).sort();
}

// Helper: load message files
function loadMessageKeys(lang: 'tr' | 'en'): string[] {
  const messageFile = path.join(process.cwd(), 'messages', `${lang}.json`);
  try {
    const content = fs.readFileSync(messageFile, 'utf-8');
    const messages = JSON.parse(content);
    return flattenKeys(messages).sort();
  } catch {
    return [];
  }
}

// Helper: run audit
async function runAudit(): Promise<TranslationReport> {
  const codeKeys = await extractTranslationKeysFromCode();
  const turkishKeys = loadMessageKeys('tr');
  const englishKeys = loadMessageKeys('en');

  const codeKeysSet = new Set(codeKeys);
  const turkishKeysSet = new Set(turkishKeys);
  const englishKeysSet = new Set(englishKeys);

  const missingInTurkish = Array.from(codeKeysSet)
    .filter(k => !turkishKeysSet.has(k))
    .sort();
  const missingInEnglish = Array.from(codeKeysSet)
    .filter(k => !englishKeysSet.has(k))
    .sort();
  const missingInBoth = missingInTurkish.filter(k => missingInEnglish.includes(k));

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

describe('i18n Translation Coverage', () => {
  let report: TranslationReport;

  beforeAll(async () => {
    report = await runAudit();
  });

  it('should have t() calls in the codebase', () => {
    expect(report.summary.totalKeysInCode).toBeGreaterThan(0);
  });

  it('should have message catalogs for both languages', () => {
    expect(report.summary.totalKeysInTurkish).toBeGreaterThan(0);
    expect(report.summary.totalKeysInEnglish).toBeGreaterThan(0);
  });

  describe('Gap Detection', () => {
    it('should not have keys missing in both languages', () => {
      if (report.summary.missingInBoth.length > 0) {
        const list = report.summary.missingInBoth.slice(0, 5).join('\n  - ');
        throw new Error(
          `Missing in BOTH languages:\n  - ${list}` +
          (report.summary.missingInBoth.length > 5
            ? `\n  ... and ${report.summary.missingInBoth.length - 5} more`
            : '')
        );
      }
      expect(report.summary.missingInBoth).toHaveLength(0);
    });

    it('should not have keys missing in Turkish', () => {
      if (report.summary.missingInTurkish.length > 0) {
        const list = report.summary.missingInTurkish.slice(0, 5).join('\n  - ');
        throw new Error(
          `Missing in Turkish:\n  - ${list}` +
          (report.summary.missingInTurkish.length > 5
            ? `\n  ... and ${report.summary.missingInTurkish.length - 5} more`
            : '')
        );
      }
      expect(report.summary.missingInTurkish).toHaveLength(0);
    });

    it('should not have keys missing in English', () => {
      if (report.summary.missingInEnglish.length > 0) {
        const list = report.summary.missingInEnglish.slice(0, 5).join('\n  - ');
        throw new Error(
          `Missing in English:\n  - ${list}` +
          (report.summary.missingInEnglish.length > 5
            ? `\n  ... and ${report.summary.missingInEnglish.length - 5} more`
            : '')
        );
      }
      expect(report.summary.missingInEnglish).toHaveLength(0);
    });
  });

  describe('Catalog Consistency', () => {
    it('should have equal number of keys in both languages', () => {
      expect(report.summary.totalKeysInTurkish).toBe(report.summary.totalKeysInEnglish);
    });

    it('should have all code keys in both message catalogs', () => {
      const codeKeySet = new Set(report.details.codeKeys);
      const turkishKeySet = new Set(report.details.turkishKeys);
      const englishKeySet = new Set(report.details.englishKeys);

      for (const key of codeKeySet) {
        expect(turkishKeySet.has(key)).toBe(true);
        expect(englishKeySet.has(key)).toBe(true);
      }
    });
  });

  describe('Usage Pattern', () => {
    it('should have reasonable coverage ratio', () => {
      const codeKeyCount = report.summary.totalKeysInCode;
      const catalogKeyCount = report.summary.totalKeysInTurkish;
      const usageRatio = codeKeyCount / catalogKeyCount;

      // Allow for future keys in catalog (usage ratio can be < 1)
      expect(usageRatio).toBeGreaterThan(0);
      expect(usageRatio).toBeLessThanOrEqual(1);
    });

    it('should report unused keys for cleanup tracking', () => {
      // This is informational - unused keys can exist for future features
      expect(Array.isArray(report.summary.unusedInTurkish)).toBe(true);
      expect(Array.isArray(report.summary.unusedInEnglish)).toBe(true);
    });
  });

  describe('Key Format', () => {
    it('should use dot-notation for namespaced keys', () => {
      const codeKeys = report.details.codeKeys;
      // Most keys should use dot notation (have at least one dot)
      const namespacedKeys = codeKeys.filter(k => k.includes('.'));
      expect(namespacedKeys.length).toBeGreaterThan(codeKeys.length * 0.5);
    });

    it('should not have empty or invalid key names', () => {
      const allKeys = [
        ...report.details.codeKeys,
        ...report.details.turkishKeys,
        ...report.details.englishKeys,
      ];

      for (const key of allKeys) {
        expect(key).not.toBe('');
        expect(key.length).toBeGreaterThan(0);
        expect(key).toMatch(/^[a-zA-Z0-9._-]+$/);
      }
    });
  });
});
