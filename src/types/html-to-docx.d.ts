/**
 * `html-to-docx` ships a UMD bundle with no type declarations, so importing it
 * is an implicit `any` — which used to be silenced with `// @ts-ignore`. This
 * declares the one call the exporter makes.
 */
declare module 'html-to-docx' {
  interface HTMLtoDOCXOptions {
    orientation?: 'portrait' | 'landscape';
    margins?: { top?: number; right?: number; bottom?: number; left?: number };
    title?: string;
    creator?: string;
    table?: { row?: { cantSplit?: boolean } };
    footer?: boolean;
    pageNumber?: boolean;
    [option: string]: unknown;
  }

  /**
   * Resolves to the .docx bytes. The library returns a Node `Buffer` (a `Uint8Array`)
   * under Node and a `Blob` in the browser; the only caller is a route handler,
   * so the Node return is what is declared.
   */
  export default function HTMLtoDOCX(
    htmlString: string,
    headerHTMLString?: string | null,
    documentOptions?: HTMLtoDOCXOptions,
    footerHTMLString?: string | null
  ): Promise<Uint8Array<ArrayBuffer>>;
}
