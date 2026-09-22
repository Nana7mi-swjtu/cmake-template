export function detectEol(text) {
  return text.includes('\r\n') ? 'crlf' : 'lf';
}

/**
 * eol: 'preserve' | 'lf' | 'crlf'
 * 默认 preserve —— 渲染不会改变模板原有的换行风格。
 */
export function applyEol(text, mode = 'preserve') {
  if (!mode || mode === 'preserve') return text;
  const lf = text.replace(/\r\n/g, '\n');
  if (mode === 'lf') return lf;
  if (mode === 'crlf') return lf.replace(/\n/g, '\r\n');
  return text;
}
