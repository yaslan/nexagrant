import type { NextRequest } from 'next/server';
import { env } from '@/lib/env';
import {
  CORDIS_PROJECT_COUNT,
  CORDIS_PROJECT_QUERY,
  CORDIS_PROJECT_SORT,
  CORDIS_WIDGET_CSS_URL,
  CORDIS_WIDGET_LOADER_URL,
  CORDIS_WIDGET_MESSAGE_TYPE,
  cordisWidgetLang,
} from '@/lib/cordis-widget';

/**
 * CORDIS's project-list widget on a page of its own (FO-169, decision K-573263):
 * the home page shows this route in `<iframe sandbox="allow-scripts allow-popups
 * allow-popups-to-escape-sandbox">`. Without `allow-same-origin` the document has
 * an opaque origin, so CORDIS's scripts (the loader, jQuery, its helpers, the JSONP
 * answers) cannot read the home page or our storage, and cannot call our API with
 * the visitor's cookies.
 *
 * Plain HTML, no React: the only scripts are the nonced loader and the small nonced
 * one that tells the parent page when the table is there and how tall it is. The
 * policy (CORDIS path in style/img/font-src, `frame-ancestors 'self'`) comes from
 * src/proxy.ts via `isCordisWidgetPath`.
 *
 * No key: 404 — the home page does not frame this route then, it shows the link.
 */

const TARGET_ID = 'WidgetPlaceHolder';

function attr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Runs before the loader. A sandboxed document without `allow-same-origin` has no
 * Web Storage: reading `sessionStorage` throws SecurityError, and CORDIS's loader
 * (widgetLoader.js → language.js, systemUtil.js) caches its labels there, so it
 * aborted with "Widget cannot be loaded properly" (measured, Chromium). An
 * in-memory stand-in with the Storage methods it calls lives as long as the frame.
 *
 * Then: reports `ready` (with the document height) once CORDIS's
 * `div.SearchResult` is in the target, then every height change; `error` when the
 * loader script itself fails. Anything else (an invalid key's WID-006 paragraph, a
 * hung JSONP call) sends nothing and the parent's timeout shows the link.
 */
const REPORTER = `(function () {
  function memoryStorage() {
    var items = {};
    return {
      getItem: function (k) { k = String(k); return Object.prototype.hasOwnProperty.call(items, k) ? items[k] : null; },
      setItem: function (k, v) { items[String(k)] = String(v); },
      removeItem: function (k) { delete items[String(k)]; },
      clear: function () { items = {}; },
      key: function (i) { var keys = Object.keys(items); return i < keys.length ? keys[i] : null; },
      get length() { return Object.keys(items).length; }
    };
  }
  ['sessionStorage', 'localStorage'].forEach(function (name) {
    try { window[name].length; } catch (e) {
      Object.defineProperty(window, name, { value: memoryStorage(), configurable: true });
    }
  });
  var target = document.getElementById(${JSON.stringify(TARGET_ID)});
  var ready = false;
  function send(status) {
    parent.postMessage({ type: ${JSON.stringify(CORDIS_WIDGET_MESSAGE_TYPE)}, status: status, height: document.documentElement.scrollHeight }, location.origin);
  }
  new MutationObserver(function () {
    if (!ready && target.querySelector('.SearchResult')) { ready = true; send('ready'); }
  }).observe(target, { childList: true, subtree: true });
  new ResizeObserver(function () { if (ready) send('ready'); }).observe(document.body);
  window.addEventListener('error', function (e) {
    if (e.target && e.target.id === 'cordis-widget-loader') send('error');
  }, true);
})();`;

export async function GET(req: NextRequest, { params }: { params: Promise<{ locale: string }> }) {
  const { locale: requested } = await params;
  const locale = requested === 'en' ? 'en' : 'tr';
  const apiKey = env.NEXT_PUBLIC_CORDIS_WIDGET_KEY?.trim();
  if (!apiKey) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });

  const nonce = attr(req.headers.get('x-nonce') ?? '');
  const data: Record<string, string> = {
    output: 'table',
    detailledView: 'on',
    target: TARGET_ID,
    css: CORDIS_WIDGET_CSS_URL,
    query: CORDIS_PROJECT_QUERY,
    nbi: String(CORDIS_PROJECT_COUNT),
    sort: CORDIS_PROJECT_SORT,
    type: 'search-html',
    lv: cordisWidgetLang(locale),
    apikey: apiKey,
  };
  const dataAttrs = Object.entries(data)
    .map(([k, v]) => `data-${k}="${attr(v)}"`)
    .join(' ');

  // <base target="_blank">: the home page's frame-src is 'self', so a project link
  // must open in a new tab (allow-popups-to-escape-sandbox) instead of the frame.
  const html = `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<base target="_blank">
<style>html,body{margin:0;background:#fff;color-scheme:light}body{padding:16px;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1f2937;overflow-x:auto}</style>
</head>
<body>
<div id="${TARGET_ID}"></div>
<script nonce="${nonce}">${REPORTER}</script>
<script nonce="${nonce}" id="cordis-widget-loader" src="${attr(CORDIS_WIDGET_LOADER_URL)}" ${dataAttrs}></script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
      // No X-Frame-Options here: next.config's `DENY` on every path wins over a
      // route's own value (measured). Browsers that know `frame-ancestors` ignore
      // X-Frame-Options when it is there, so `frame-ancestors 'self'` decides.
    },
  });
}
