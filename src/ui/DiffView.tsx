import { compact, diffLines } from "../lib/diff";

/** Line diff from `from` to `to`, with long unchanged runs collapsed. */
export function diffSummary(from: string, to: string) {
  const lines = compact(diffLines(from, to));
  return {
    lines,
    added: lines.filter((l) => l.kind === "add").length,
    removed: lines.filter((l) => l.kind === "del").length,
  };
}

export function DiffView({ lines }: { lines: ReturnType<typeof diffSummary>["lines"] }) {
  return (
    <pre className="diff">
      {lines.map((l, i) =>
        l.kind === "gap" ? (
          <div key={i} className="gap">⋯ {l.count} unchanged lines</div>
        ) : (
          <div key={i} className={l.kind}>{l.kind === "add" ? "+ " : l.kind === "del" ? "- " : "  "}{l.text}</div>
        ),
      )}
    </pre>
  );
}

export function DiffStats({ added, removed }: { added: number; removed: number }) {
  return <span className="small"><span className="add">+{added}</span> <span className="del">−{removed}</span></span>;
}
