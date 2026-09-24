import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import { markdownOptions } from '../scripts/markdown.mjs';
import { getCmsUrl, getSiteUrl } from '../scripts/site-config.mjs';

test('the production Markdown pipeline removes active HTML and dangerous URLs', async () => {
    const processor = await createMarkdownProcessor(markdownOptions);
    const { code } = await processor.render(`
# Trygg overskrift

Vanlig **nyhetstekst** og [trygg lenke](https://example.org/).

<script>alert('script')</script>
<iframe src="https://evil.example/" srcdoc="<script>alert(1)</script>"></iframe>
<object data="https://evil.example/"></object>
<embed src="https://evil.example/">
<svg><a xlink:href="javascript:alert(1)">svg</a></svg>
<math><mi xlink:href="data:x,<script>alert(1)</script>">math</mi></math>
<div style="background:url(javascript:alert(1))" onclick="alert(1)">innhold</div>
<img src="/images/photo.webp" onerror="alert(1)" srcset="javascript:alert(1) 1x">
<a href="javascript:alert(1)" onmouseover="alert(1)">script-url</a>
<a href="jav&#x61;script:alert(1)">entity-url</a>
<a href="java&#x0a;script:alert(1)">control-url</a>
<a href="data:text/html,<script>alert(1)</script>">data-url</a>
<form action="https://evil.example/"><input name="password"></form>

[Markdown script](javascript:alert%281%29)

![SVG data image](data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+)
`);
    assert.match(code, /Trygg overskrift/);
    assert.match(code, /<strong>nyhetstekst<\/strong>/);
    assert.match(code, /href="https:\/\/example\.org\/"/);
    assert.doesNotMatch(code, /<\/?(?:script|iframe|object|embed|svg|math|form|base|meta)\b/i);
    assert.doesNotMatch(code, /\s(?:on[a-z]+|style|srcdoc|srcset)\s*=/i);
    assert.doesNotMatch(code, /(?:href|src|xlink:href)\s*=\s*["']?\s*(?:javascript|vbscript|data):/i);
});

test('Markdown cannot create unprefixed DOM-clobbering identifiers', async () => {
    const processor = await createMarkdownProcessor(markdownOptions);
    const { code } = await processor.render('<a id="location" name="__proto__">Innhold</a>');
    assert.match(code, /Innhold/);
    assert.doesNotMatch(code, /\s(?:id|name)="(?:location|__proto__)"/);
});

test('CMS links require HTTPS without embedded credentials', () => {
    assert.equal(new URL(getCmsUrl()).origin, 'https://app.pagescms.org');
    assert.equal(new URL(getCmsUrl('https://app.pagescms.org/club/site')).pathname, '/club/site');
    for (const value of [
        'http://app.pagescms.org', '//evil.example', 'javascript:alert(1)',
        'data:text/html,hello', 'https://user:password@evil.example',
        'https://evil.example/\nnext', 'https://evil.example/"quoted',
    ]) {
        assert.throws(() => getCmsUrl(value), undefined, value);
    }
});

test('production requires an explicit real HTTPS origin', () => {
    for (const value of [undefined, '', 'http://club.example.no', 'https://localhost',
        'https://127.0.0.1', 'https://club.invalid', 'https://club.example.no/path',
        'https://user:password@club.example.no', 'https://club.example.no/?query=true']) {
        assert.throws(() => getSiteUrl(value, { required: true }), undefined, String(value));
    }
    assert.equal(new URL(getSiteUrl('https://sgssl.no', { required: true })).origin, 'https://sgssl.no');
});
