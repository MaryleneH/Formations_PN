// Diff ligne à ligne (plus longue sous-séquence commune) et rendu « unified » façon Git.

const splitLines = (s) => {
  if (s === null || s === undefined || s === '') return [];
  const lines = s.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
};

/** Liste d'opérations : { t: ' ' | '-' | '+', line, a, b } (a, b : numéros de ligne 1-based). */
export function lineOps(oldText, newText) {
  const A = splitLines(oldText);
  const B = splitLines(newText);
  const n = A.length, m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { ops.push({ t: ' ', line: A[i], a: i + 1, b: j + 1 }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { ops.push({ t: '-', line: A[i], a: i + 1 }); i++; }
    else { ops.push({ t: '+', line: B[j], b: j + 1 }); j++; }
  }
  while (i < n) { ops.push({ t: '-', line: A[i], a: i + 1 }); i++; }
  while (j < m) { ops.push({ t: '+', line: B[j], b: j + 1 }); j++; }
  return ops;
}

export function countChanges(oldText, newText) {
  let ins = 0, del = 0;
  for (const o of lineOps(oldText, newText)) {
    if (o.t === '+') ins++; else if (o.t === '-') del++;
  }
  return { ins, del };
}

/** Regroupe les opérations en blocs (hunks) avec 3 lignes de contexte. */
export function hunks(oldText, newText, context = 3) {
  const ops = lineOps(oldText, newText);
  const changed = ops.map((o, k) => (o.t !== ' ' ? k : -1)).filter((k) => k >= 0);
  if (!changed.length) return [];
  const groups = [];
  let start = Math.max(0, changed[0] - context);
  let end = Math.min(ops.length - 1, changed[0] + context);
  for (const k of changed.slice(1)) {
    if (k - context <= end + 1) end = Math.min(ops.length - 1, k + context);
    else { groups.push([start, end]); start = Math.max(0, k - context); end = Math.min(ops.length - 1, k + context); }
  }
  groups.push([start, end]);
  return groups.map(([s, e]) => {
    const part = ops.slice(s, e + 1);
    let aStart = 0, bStart = 0, aLen = 0, bLen = 0;
    for (const o of part) {
      if (o.t !== '+') { aLen++; if (!aStart) aStart = o.a; }
      if (o.t !== '-') { bLen++; if (!bStart) bStart = o.b; }
    }
    if (!aStart) { // bloc sans ligne de l'ancien fichier : Git écrit la ligne qui précède
      const prev = ops.slice(0, s).reverse().find((o) => o.t !== '+');
      aStart = prev ? prev.a : 0;
    }
    if (!bStart) {
      const prev = ops.slice(0, s).reverse().find((o) => o.t !== '-');
      bStart = prev ? prev.b : 0;
    }
    const range = (st, len) => (len === 1 ? `${st}` : `${st},${len}`);
    return { header: `@@ -${range(aStart, aLen)} +${range(bStart, bLen)} @@`, ops: part };
  });
}

/**
 * Diff unifié d'un fichier, au format de `git diff`.
 * oldText null = fichier nouveau ; newText null = fichier supprimé.
 */
export function unifiedDiff(path, oldText, newText, idx = { a: '0000000', b: '0000000' }) {
  const out = [`diff --git a/${path} b/${path}`];
  if (oldText === null) out.push('new file mode 100644', `index 0000000..${idx.b}`, '--- /dev/null', `+++ b/${path}`);
  else if (newText === null) out.push('deleted file mode 100644', `index ${idx.a}..0000000`, `--- a/${path}`, '+++ /dev/null');
  else out.push(`index ${idx.a}..${idx.b} 100644`, `--- a/${path}`, `+++ b/${path}`);
  for (const h of hunks(oldText || '', newText || '')) {
    out.push(h.header);
    for (const o of h.ops) out.push(o.t + o.line);
  }
  return out;
}
