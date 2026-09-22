/**
 * 把一批相对路径渲染成目录树，用于创建前的预览。
 * entries: [{ rel, type: 'dir' | 'file' }]
 */
export function renderTree(entries, rootLabel = '.') {
  const root = { name: '', kids: new Map(), type: 'dir' };

  for (const entry of entries) {
    const segs = String(entry.rel).replace(/\\/g, '/').split('/').filter(Boolean);
    let node = root;
    segs.forEach((seg, i) => {
      if (!node.kids.has(seg)) {
        node.kids.set(seg, { name: seg, kids: new Map(), type: 'dir' });
      }
      node = node.kids.get(seg);
      if (i === segs.length - 1) node.type = entry.type || 'file';
    });
  }

  const lines = [rootLabel];
  const walk = (node, prefix) => {
    const kids = [...node.kids.values()].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name < b.name ? -1 : 1;
    });
    kids.forEach((kid, i) => {
      const last = i === kids.length - 1;
      const branch = last ? '└─ ' : '├─ ';
      const suffix = kid.type === 'dir' && kid.kids.size > 0 ? '/' : '';
      lines.push(`${prefix}${branch}${kid.name}${suffix}`);
      walk(kid, prefix + (last ? '   ' : '│  '));
    });
  };
  walk(root, '');
  return lines;
}
