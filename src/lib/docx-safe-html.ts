/**
 * Makes tenant-written HTML safe to hand to `html-to-docx`.
 *
 * `html-to-docx` downloads every `<img src="http(s)://…">` from the SERVER and embeds the
 * response in the .docx. Concept-note sections are free text a tenant user writes, so an
 * export used to be a server-side request forgery primitive: `<img src="http://169.254.169.254/…">`
 * or any internal address was fetched from our network and, when the answer looked like an
 * image, handed back inside the document (TASK-MUN66T2HM4A4E Y-1). The library has no option
 * that turns the download off, and it follows redirects, so filtering hosts is not enough —
 * a public URL can redirect inward and a DNS name can resolve inward on the second lookup.
 *
 * The rule here is therefore structural, not a URL blocklist: the input is parsed and the
 * output is REBUILT from an allowlist of formatting tags. No URL of any kind survives as an
 * image source. The only image that survives is an inline `data:` PNG/JPEG/GIF whose bytes
 * start with that format's signature, under a size cap; it is re-encoded, so the `src` we emit
 * is `data:image/<type>;base64,<alphabet only>` and cannot contain `://`.
 *
 * The signature check also closes TASK-MUN66T2HM4A4E O-3: `html-to-docx` BUNDLES its own copy
 * of `image-size` (its dist has no `require('image-size')`), and that copy loops forever on
 * crafted HEIF/ICNS/JXL bytes (GHSA-5p2g-fcmc-qvqq, GHSA-w3rx-r6r6-pgpr). A package override
 * cannot reach a bundled copy; refusing every byte stream that is not PNG/JPEG/GIF keeps those
 * parsers from ever running.
 */

import { parseFragment, type DefaultTreeAdapterTypes } from 'parse5';

type Node = DefaultTreeAdapterTypes.ChildNode;
type Element = DefaultTreeAdapterTypes.Element;

/** Decoded bytes allowed for one inline image. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
/** Decoded bytes allowed for all inline images of one sanitize call. */
export const MAX_TOTAL_IMAGE_BYTES = 8 * 1024 * 1024;
/** Elements nested deeper than this are flattened to their text (no recursion blow-up). */
const MAX_DEPTH = 32;

/** Tags kept as-is (attributes are dropped unless listed in `keepAttributes`). */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'div', 'span',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ins', 'sub', 'sup', 'mark', 'code', 'pre',
  'blockquote', 'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  'a', 'img',
]);
const VOID_TAGS = new Set(['br', 'hr', 'img']);

/** Tags removed together with everything inside them. Anything else unknown is unwrapped. */
const DROPPED_WITH_CONTENT = new Set([
  'script', 'style', 'template', 'noscript', 'title', 'head', 'iframe', 'frame', 'frameset',
  'object', 'embed', 'svg', 'math', 'textarea', 'select', 'video', 'audio', 'canvas',
]);

const IMAGE_SIGNATURES: ReadonlyArray<{ mime: string; bytes: readonly number[] }> = [
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] }, // "GIF8" (87a / 89a)
];

const DATA_IMAGE_URI = /^data:image\/(?:png|jpe?g|gif);base64,([A-Za-z0-9+/=\s]+)$/i;

export function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value).replace(/"/g, '&quot;');
}

/**
 * True when the bundled `image-size` 1.x inside `html-to-docx` will size `bytes` without throwing
 * (TASK-MUNDTW8O2IV6V, İNCELEME-53 B-2). The signature alone is not enough: "GIF8"+junk, a PNG
 * signature without IHDR or a JPEG whose marker table runs off the end all reach `sizeOf`, which
 * throws, and the export answered 500. Each branch reads exactly what that parser reads, in
 * bounds, so an image it cannot size is dropped here like any other refused image.
 */
function sizeable(mime: string, bytes: Buffer): boolean {
  if (mime === 'image/gif') {
    // GIF.validate is /^GIF8[79]a/ on 6 bytes; otherwise the detector falls through to the
    // other parsers (SVG, …). GIF.calculate reads width/height at 6..9.
    return /^GIF8[79]a$/.test(bytes.toString('latin1', 0, 6)) && bytes.length >= 10;
  }
  if (mime === 'image/png') {
    // PNG.calculate reads width/height at 16..23 of the IHDR chunk, which must come first.
    return bytes.toString('latin1', 12, 16) === 'IHDR' && bytes.length >= 24;
  }
  return jpegSizeable(bytes);
}

/** The JPG.calculate walk of image-size 1.x, without the throws. */
function jpegSizeable(bytes: Buffer): boolean {
  let buffer = bytes.subarray(4);
  while (buffer.length > 0) {
    if (buffer.length < 2) return false;
    const i = buffer.readUInt16BE(0);
    if (buffer.toString('hex', 2, 6) === '45786966' && !exifReadable(buffer.subarray(2, i))) return false;
    if (i > buffer.length || buffer[i] !== 0xff) return false;
    const next = buffer[i + 1];
    if (next === 0xc0 || next === 0xc1 || next === 0xc2) return i + 9 <= buffer.length;
    buffer = buffer.subarray(i + 2);
  }
  return false; // "Invalid JPG, no size found"
}

/** The orientation lookup image-size runs on an "Exif" segment, bounds-checked. */
function exifReadable(block: Buffer): boolean {
  const byteAlign = block.toString('hex', 6, 8);
  const bigEndian = byteAlign === '4d4d';
  if (!bigEndian && byteAlign !== '4949') return true;
  const u16 = (b: Buffer, at: number) => (bigEndian ? b.readUInt16BE(at) : b.readUInt16LE(at));
  if (block.length < 16) return false;
  const entries = u16(block, 14);
  for (let n = 0; n < entries; n++) {
    const start = 16 + 12 * n;
    if (start > block.length) return true;
    const entry = block.subarray(start, start + 12);
    if (entry.length < 2) return false;
    if (u16(entry, 0) !== 274) continue; // orientation tag
    if (entry.length < 4) return false;
    if (u16(entry, 2) !== 3) return true;
    if (entry.length < 8) return false;
    if ((bigEndian ? entry.readUInt32BE(4) : entry.readUInt32LE(4)) !== 1) return true;
    return entry.length >= 10;
  }
  return true;
}

/**
 * Returns a canonical `data:` URI for an inline PNG/JPEG/GIF, or null for anything else —
 * every `http:`/`https:`/protocol-relative/`file:` URL included.
 */
export function safeInlineImageSrc(src: string, budget: { remaining: number }): string | null {
  const match = DATA_IMAGE_URI.exec(src.trim());
  if (!match) return null;

  const base64 = (match[1] ?? '').replace(/\s+/g, '');
  // Cheap bound before decoding: 4 base64 chars carry 3 bytes.
  if (base64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) return null;

  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES || bytes.length > budget.remaining) {
    return null;
  }

  const signature = IMAGE_SIGNATURES.find(({ bytes: magic }) =>
    magic.every((byte, i) => bytes[i] === byte)
  );
  if (!signature || !sizeable(signature.mime, bytes)) return null;

  budget.remaining -= bytes.length;
  return `data:${signature.mime};base64,${bytes.toString('base64')}`;
}

function safeHref(href: string): string | null {
  try {
    const url = new URL(href.trim());
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function attribute(element: Element, name: string): string | undefined {
  return element.attrs.find((attr) => attr.name === name)?.value;
}

/** Text of a subtree, collected without recursion. */
function textOf(node: Node): string {
  let out = '';
  const stack: Node[] = [node];
  while (stack.length > 0) {
    const current = stack.pop() as Node;
    if (current.nodeName === '#text') {
      out += (current as DefaultTreeAdapterTypes.TextNode).value;
    } else if ('childNodes' in current && !DROPPED_WITH_CONTENT.has(current.nodeName)) {
      stack.push(...[...current.childNodes].reverse());
    }
  }
  return out;
}

function serializeChildren(nodes: Node[], depth: number, budget: { remaining: number }): string {
  let out = '';
  for (const node of nodes) out += serializeNode(node, depth, budget);
  return out;
}

function serializeNode(node: Node, depth: number, budget: { remaining: number }): string {
  if (node.nodeName === '#text') {
    return escapeHtmlText((node as DefaultTreeAdapterTypes.TextNode).value);
  }
  if (!('tagName' in node)) return ''; // comments, doctype

  const element = node as Element;
  const tag = element.tagName.toLowerCase();

  // Only the HTML namespace: an `<svg><image href>` or MathML node is never an <img>.
  if (DROPPED_WITH_CONTENT.has(tag) || element.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
    return '';
  }
  if (depth >= MAX_DEPTH) return escapeHtmlText(textOf(element));

  if (tag === 'img') {
    const src = safeInlineImageSrc(attribute(element, 'src') ?? '', budget);
    return src ? `<img src="${escapeHtmlAttribute(src)}" />` : '';
  }

  const inner = serializeChildren(element.childNodes, depth + 1, budget);
  if (!ALLOWED_TAGS.has(tag)) return inner;

  let attrs = '';
  if (tag === 'a') {
    const href = safeHref(attribute(element, 'href') ?? '');
    if (href) attrs += ` href="${escapeHtmlAttribute(href)}"`;
  }
  if (tag === 'td' || tag === 'th') {
    for (const name of ['colspan', 'rowspan']) {
      const n = Number.parseInt(attribute(element, name) ?? '', 10);
      if (Number.isInteger(n) && n > 1 && n <= 50) attrs += ` ${name}="${n}"`;
    }
  }

  return VOID_TAGS.has(tag) ? `<${tag}${attrs} />` : `<${tag}${attrs}>${inner}</${tag}>`;
}

/**
 * Rebuilds `html` from the allowlist above. Output contains no URL-bearing attribute except
 * `a[href]` (http/https/mailto — a hyperlink, never fetched) and canonical inline images.
 * `budget` is shared across calls so one document's images stay under `MAX_TOTAL_IMAGE_BYTES`.
 */
export function sanitizeHtmlForDocx(
  html: string,
  budget: { remaining: number } = { remaining: MAX_TOTAL_IMAGE_BYTES }
): string {
  const fragment = parseFragment(html);
  return serializeChildren(fragment.childNodes, 0, budget);
}
