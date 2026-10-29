export type DiffLine = { kind: "same" | "add" | "del"; text: string };

/** Line diff via LCS. Good enough for sketch-sized files (a few hundred lines). */
export function diffLines(a: string, b: string): DiffLine[] {
  const x = a.split("\n"), y = b.split("\n");
  const n = x.length, m = y.length;
  if (n * m > 4_000_000) return [...x.map((t) => ({ kind: "del" as const, text: t })), ...y.map((t) => ({ kind: "add" as const, text: t }))];
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) out.push({ kind: "same", text: x[i++] }), j++;
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ kind: "del", text: x[i++] });
    else out.push({ kind: "add", text: y[j++] });
  }
  while (i < n) out.push({ kind: "del", text: x[i++] });
  while (j < m) out.push({ kind: "add", text: y[j++] });
  return out;
}

/** Collapse long unchanged runs, keeping `ctx` lines of context around changes. */
export function compact(lines: DiffLine[], ctx = 2): (DiffLine | { kind: "gap"; count: number })[] {
  const keep = lines.map((l, i) => l.kind !== "same" || lines.slice(Math.max(0, i - ctx), i + ctx + 1).some((k) => k.kind !== "same"));
  const out: (DiffLine | { kind: "gap"; count: number })[] = [];
  let gap = 0;
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (gap) out.push({ kind: "gap", count: gap }), (gap = 0);
      out.push(l);
    } else gap++;
  });
  if (gap) out.push({ kind: "gap", count: gap });
  return out;
}
