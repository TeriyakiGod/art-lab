/**
 * Inserts a `__lp();` guard at the start of every braced `for`/`while`/`do`
 * loop body so a runaway loop throws instead of freezing the tab. This is a
 * light scanner, not a parser: it skips strings, template literals and
 * comments, and leaves brace-less loop bodies alone.
 */
export function loopProtect(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  const isIdent = (c: string | undefined) => !!c && /[\w$]/.test(c);

  /** From a quote at `start`, return the index just past the closing quote. */
  const skipString = (start: number, q: string) => {
    let j = start + 1;
    while (j < n && src[j] !== q) j += src[j] === "\\" ? 2 : 1;
    return j + 1;
  };
  const skipWs = (j: number) => {
    while (j < n) {
      if (/\s/.test(src[j])) j++;
      else if (src.startsWith("//", j)) j = src.indexOf("\n", j) < 0 ? n : src.indexOf("\n", j);
      else if (src.startsWith("/*", j)) j = src.indexOf("*/", j) < 0 ? n : src.indexOf("*/", j) + 2;
      else break;
    }
    return j;
  };
  /** From an opening paren at j, return index just past its matching close paren. */
  const matchParen = (j: number) => {
    let depth = 0;
    while (j < n) {
      const c = src[j];
      if (c === '"' || c === "'" || c === "`") {
        j = skipString(j, c);
        continue;
      }
      if (c === "(") depth++;
      else if (c === ")" && --depth === 0) return j + 1;
      j++;
    }
    return n;
  };

  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const end = skipString(i, c);
      out += src.slice(i, end);
      i = end;
      continue;
    }
    if (src.startsWith("//", i) || src.startsWith("/*", i)) {
      const end = skipWs(i);
      out += src.slice(i, end);
      i = end;
      continue;
    }
    const kw = !isIdent(src[i - 1]) && (/^(for|while)\b/.exec(src.slice(i, i + 6))?.[1] ?? (/^do\b/.test(src.slice(i, i + 3)) ? "do" : null));
    if (kw) {
      let j = skipWs(i + kw.length);
      if (kw !== "do") {
        if (src[j] !== "(") { out += src.slice(i, j); i = j; continue; }
        j = skipWs(matchParen(j));
      }
      if (src[j] === "{") {
        out += src.slice(i, j + 1) + "__lp();";
        i = j + 1;
        continue;
      }
      out += src.slice(i, j);
      i = j;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}
