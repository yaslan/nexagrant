import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockEnv = vi.hoisted(() => ({ NEXT_PUBLIC_CORDIS_WIDGET_KEY: undefined as string | undefined }));
vi.mock('@/lib/env', () => ({ env: mockEnv }));

import { GET } from './route';
import { CORDIS_IFRAME_SANDBOX, CORDIS_PROJECT_QUERY, CORDIS_WIDGET_LOADER_URL } from '@/lib/cordis-widget';

const call = (locale: string, nonce = 'abc123', dest?: string) =>
  GET(
    new NextRequest(`http://localhost/${locale}/embed/cordis`, {
      headers: { 'x-nonce': nonce, ...(dest ? { 'sec-fetch-dest': dest } : {}) },
    }),
    { params: Promise.resolve({ locale }) }
  );

describe('CORDIS embed route (FO-169, K-573263)', () => {
  beforeEach(() => {
    mockEnv.NEXT_PUBLIC_CORDIS_WIDGET_KEY = 'test-key"<x>';
  });

  it('no key: 404, no widget page', async () => {
    mockEnv.NEXT_PUBLIC_CORDIS_WIDGET_KEY = '  ';
    const res = await call('tr');
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('');
  });

  it('renders the loader with the request nonce and the owner’s parameters, attribute-escaped', async () => {
    const res = await call('en');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/html/);
    const html = await res.text();
    expect(html).toContain(`<script nonce="abc123" id="cordis-widget-loader" src="${CORDIS_WIDGET_LOADER_URL}"`);
    expect(html).toContain(`data-query="${CORDIS_PROJECT_QUERY}"`);
    expect(html).toContain('data-nbi="6"');
    expect(html).toContain('data-lv="en"');
    // the key cannot break out of its attribute
    expect(html).toContain('data-apikey="test-key&quot;&lt;x&gt;"');
    expect(html).not.toContain('test-key"<x>');
    // every script carries the nonce; links leave the frame
    expect(html.match(/<script(?![^>]*nonce="abc123")/g)).toBeNull();
    expect(html).toContain('<base target="_blank">');
  });

  it('the Turkish page asks CORDIS for English (no Turkish labels there); unknown locales fall back to tr framing', async () => {
    expect(await (await call('tr')).text()).toContain('data-lv="en"');
    const other = await (await call('xx')).text();
    expect(other).toContain('<html lang="tr">');
  });

  it('a nonce cannot inject markup', async () => {
    const html = await (await call('tr', '"><script>alert(1)</script>')).text();
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('opened on its own (Sec-Fetch-Dest: document): 404, no widget page', async () => {
    const res = await call('en', 'abc123', 'document');
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('');
  });

  it('framed by the home page (Sec-Fetch-Dest: iframe): the page; without the header (old browsers): the page too', async () => {
    expect((await call('en', 'abc123', 'iframe')).status).toBe(200);
    expect((await call('en')).status).toBe(200);
  });
});

describe('the home page iframe sandbox', () => {
  it('lets scripts and popups run but never gives the frame our origin', () => {
    const tokens = CORDIS_IFRAME_SANDBOX.split(/\s+/);
    expect(tokens).toEqual(['allow-scripts', 'allow-popups', 'allow-popups-to-escape-sandbox']);
    expect(tokens).not.toContain('allow-same-origin');
    expect(tokens).not.toContain('allow-top-navigation');
  });
});
