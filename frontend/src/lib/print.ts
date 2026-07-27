/**
 * Opens a new browser window containing a fully self-contained HTML document
 * and triggers the print dialog. This is deliberately isolated from the app's
 * own DOM/CSS (no shared overflow:hidden ancestors, no app layout constraints)
 * which is what caused "print / Save as PDF" to come out blank previously —
 * the app's modal wrapper clipped the content before the browser could render it.
 *
 * In the print dialog, choosing "Save as PDF" as the destination produces a PDF —
 * this is the standard, dependency-free way to generate PDFs from a browser
 * without running a headless-Chrome service on the server.
 */
export function printHtmlDocument(title: string, bodyHtml: string, extraStyles = '') {
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) {
    alert('Please allow pop-ups for this site to print or save as PDF.');
    return;
  }

  win.document.open();
  win.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
    color: #0f172a;
    margin: 0;
    padding: 32px;
    background: #ffffff;
  }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 8px 6px; text-align: left; font-size: 13px; }
  thead th { border-bottom: 2px solid #cbd5e1; color: #64748b; text-transform: uppercase; font-size: 11px; letter-spacing: 0.03em; }
  tbody tr { border-bottom: 1px solid #f1f5f9; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .muted { color: #64748b; }
  .total-row td { border-top: 2px solid #0f172a; font-weight: 700; }
  @media print {
    body { padding: 12px; }
  }
  ${extraStyles}
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`);
  win.document.close();

  // Give the new window a moment to lay out images/fonts before printing
  win.onload = () => {
    win.focus();
    win.print();
  };
  // Fallback in case onload doesn't fire (some browsers with document.write)
  setTimeout(() => {
    try { win.focus(); win.print(); } catch { /* window may already be closed */ }
  }, 400);
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
