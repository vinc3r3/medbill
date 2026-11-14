// Plain letter text → printable HTML for the mail provider. Everything is escaped, so nothing the user
// typed can inject markup into the printed letter.
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function letterToHtml(text: string): string {
  const paragraphs = text
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p>${p.split('\n').map(escapeHtml).join('<br>')}</p>`)
    .join('\n');
  return `<html><head><meta charset="utf-8"><style>
body { font-family: Helvetica, Arial, sans-serif; font-size: 11pt; line-height: 1.45; color: #111; margin: 0.6in 0.75in; }
p { margin: 0 0 0.9em; }
</style></head><body>
${paragraphs}
</body></html>`;
}
