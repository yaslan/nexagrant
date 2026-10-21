import React from 'react';

/**
 * Validates that a URL uses an approved protocol (http, https) or a relative path.
 * Disallows javascript:, data:, vbscript: to prevent XSS.
 */
/**
 * Allows same-site paths, fragments, https and mailto. `//host` and `/\host`
 * are protocol-relative and leave the site, so they are rejected; `http:` is
 * rejected too, so user-written links cannot be downgraded.
 */
export function isSafeUrl(urlStr: string): boolean {
  const trimmed = urlStr.trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return false;
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'mailto:';
  } catch {
    return false;
  }
}

/**
 * Renders inline markdown tokens (bold, italic, links, images, code) as safe React nodes.
 * No HTML is injected — no dangerouslySetInnerHTML — so XSS is structurally prevented.
 */
export function renderInline(text: string): React.ReactNode {
  // Tokenizer pattern: images, links, bold, code, and single-asterisk italic
  const tokenRegex = /(!?\[[^\]]*\]\([^)]+\)|\*\*[^*]+\*\*|(?<!\*)\*[^*]+\*(?!\*)|\`[^`]+\`)/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, i) => {
    if (!part) return null;

    // Image: ![alt](url)
    if (part.startsWith('![') && part.endsWith(')')) {
      const match = part.match(/^!\[(.*?)\]\((.*?)\)$/);
      if (match) {
        const [, alt = '', url = ''] = match;
        const cleanUrl = url.trim();
        if (isSafeUrl(cleanUrl)) {
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={cleanUrl}
              alt={alt}
              className="inline-block max-h-48 rounded-lg border border-border align-middle my-1 shadow-2xs"
              loading="lazy"
            />
          );
        }
        return <span key={i}>[{alt}]</span>;
      }
    }

    // Link: [text](url)
    if (part.startsWith('[') && part.endsWith(')')) {
      const match = part.match(/^\[(.*?)\]\((.*?)\)$/);
      if (match) {
        const [, linkText = '', url = ''] = match;
        const cleanUrl = url.trim();
        if (isSafeUrl(cleanUrl)) {
          return (
            <a
              key={i}
              href={cleanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline hover:opacity-80 font-medium break-words"
            >
              {linkText}
            </a>
          );
        }
        return <span key={i}>{linkText}</span>;
      }
    }

    // Bold: **text**
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return <strong key={i}>{renderInline(part.slice(2, -2))}</strong>;
    }

    // Italic: *text*
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2 && !part.startsWith('**')) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }

    // Inline Code: `text`
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 rounded bg-ground border border-border font-mono text-xs text-accent"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    return part;
  });
}

/**
 * Builds block React nodes line-by-line from stored markdown text (BlogPost.content).
 * Handles headings, full block figures, blockquotes, lists, and paragraphs.
 */
export function renderBlogContent(content: string): React.ReactNode[] {
  const blocks: React.ReactNode[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let quoteLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    blocks.push(
      <p key={blocks.length} className="text-ink-2 leading-relaxed">
        {renderInline(paragraphLines.join(' '))}
      </p>
    );
    paragraphLines = [];
  };

  const flushList = () => {
    if (listItems.length === 0 || !listType) return;
    const items = listItems;
    blocks.push(
      listType === 'ul' ? (
        <ul key={blocks.length} className="list-disc pl-5 space-y-1 my-2">
          {items.map((item, i) => (
            <li key={i} className="text-ink-2 leading-relaxed">{renderInline(item)}</li>
          ))}
        </ul>
      ) : (
        <ol key={blocks.length} className="list-decimal pl-5 space-y-1 my-2">
          {items.map((item, i) => (
            <li key={i} className="text-ink-2 leading-relaxed">{renderInline(item)}</li>
          ))}
        </ol>
      )
    );
    listItems = [];
    listType = null;
  };

  const flushQuote = () => {
    if (quoteLines.length === 0) return;
    const lines = quoteLines;
    blocks.push(
      <blockquote
        key={blocks.length}
        className="border-l-4 border-accent pl-4 py-1.5 italic text-ink-2 my-4 bg-ground/40 rounded-r-xl"
      >
        {lines.map((l, i) => (
          <p key={i} className="my-1">{renderInline(l)}</p>
        ))}
      </blockquote>
    );
    quoteLines = [];
  };

  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();

    if (line.length === 0) {
      flushAll();
      continue;
    }

    const h3 = line.match(/^###\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);
    const h1 = line.match(/^#\s+(.*)$/);
    const blockImg = line.match(/^!\[(.*?)\]\((.*?)\)$/);
    const quote = line.match(/^>\s*(.*)$/);
    const ulItem = line.match(/^\*\s+(.*)$/);
    const olItem = line.match(/^\d+\.\s+(.*)$/);

    if (h3) {
      flushAll();
      blocks.push(
        <h4 key={blocks.length} className="text-lg font-bold text-accent font-heading pt-2 pb-1">
          {renderInline(h3[1] ?? '')}
        </h4>
      );
    } else if (h2) {
      flushAll();
      blocks.push(
        <h3 key={blocks.length} className="text-xl font-bold text-ink font-heading pt-3 pb-1">
          {renderInline(h2[1] ?? '')}
        </h3>
      );
    } else if (h1) {
      flushAll();
      blocks.push(
        <h2 key={blocks.length} className="text-2xl font-bold text-ink font-heading pt-4 pb-2 border-b border-border">
          {renderInline(h1[1] ?? '')}
        </h2>
      );
    } else if (blockImg) {
      flushAll();
      const [, alt = '', url = ''] = blockImg;
      const cleanUrl = url.trim();
      if (isSafeUrl(cleanUrl)) {
        blocks.push(
          <figure key={blocks.length} className="my-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cleanUrl}
              alt={alt}
              className="rounded-xl border border-border w-full max-h-[520px] object-cover shadow-2xs"
              loading="lazy"
            />
            {alt ? (
              <figcaption className="text-center text-xs text-muted mt-2">
                {alt}
              </figcaption>
            ) : null}
          </figure>
        );
      }
    } else if (quote) {
      flushParagraph();
      flushList();
      quoteLines.push(quote[1] ?? '');
    } else if (ulItem) {
      flushParagraph();
      flushQuote();
      if (listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(ulItem[1] ?? '');
    } else if (olItem) {
      flushParagraph();
      flushQuote();
      if (listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(olItem[1] ?? '');
    } else {
      flushList();
      flushQuote();
      paragraphLines.push(line);
    }
  }

  flushAll();
  return blocks;
}
