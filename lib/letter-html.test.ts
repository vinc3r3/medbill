import { describe, expect, it } from 'vitest';
import { letterToHtml } from './letter-html';

describe('letterToHtml', () => {
  it('turns blank-line paragraphs into <p> and single newlines into <br>', () => {
    const html = letterToHtml('Line one\nLine two\n\nNext paragraph');
    expect(html).toContain('<p>Line one<br>Line two</p>');
    expect(html).toContain('<p>Next paragraph</p>');
  });

  it('escapes anything that looks like markup', () => {
    const html = letterToHtml('<script>alert(1)</script> & "quotes"');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;');
  });

  it('normalises Windows line endings', () => {
    expect(letterToHtml('a\r\n\r\nb')).toContain('<p>a</p>\n<p>b</p>');
  });
});
