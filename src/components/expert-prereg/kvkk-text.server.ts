import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseKvkkMarkdown, type KvkkBlock } from './kvkk-text';

/**
 * Reads the notice for the page's locale. Both paths are written out in full
 * (no template) so Next's output file tracing copies the files into the
 * standalone build. The Turkish text is the governing one and the fallback.
 */
export async function loadKvkkNotice(locale: string): Promise<KvkkBlock[]> {
  const file =
    locale === 'en'
      ? path.join(process.cwd(), 'content/kvkk-uzman-v2.en.md')
      : path.join(process.cwd(), 'content/kvkk-uzman-v2.md');
  return parseKvkkMarkdown(await readFile(file, 'utf8'));
}
