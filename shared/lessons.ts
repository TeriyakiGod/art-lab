export interface Lesson {
  id: string;
  title: string;
  summary: string;
  body: string;
  /** The text of the lesson's "## Challenge" section, if it has one. */
  challenge?: string;
}

const files = import.meta.glob("./lessons/*.md", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

/** Lesson files start with a front block: `---\ntitle: ...\nsummary: ...\n---`. */
function parse(path: string, raw: string): Lesson {
  const id = path.replace(/^.*\//, "").replace(/\.md$/, "");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n/);
  const meta: Record<string, string> = {};
  if (m) for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const body = m ? raw.slice(m[0].length) : raw;
  const challenge = body.match(/\n## Challenge\n([\s\S]*?)(?=\n## |$)/)?.[1]
    .split("\n").filter((l) => !l.startsWith("*Stuck?*")).join("\n").trim();
  return { id, title: meta.title ?? id, summary: meta.summary ?? "", body, challenge: challenge || undefined };
}

export const LESSONS: Lesson[] = Object.entries(files)
  .map(([p, raw]) => parse(p, raw))
  .sort((a, b) => a.id.localeCompare(b.id));

/** Small keyword search used by the chat agent's `search_lessons` tool. */
export function searchLessons(query: string, limit = 3) {
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  return LESSONS.flatMap((l) =>
    l.body.split(/\n(?=## )/).map((section) => {
      const text = section.toLowerCase();
      const score = terms.reduce((s, t) => s + (text.split(t).length - 1), 0);
      return { lessonId: l.id, lessonTitle: l.title, excerpt: section.slice(0, 1500), score };
    }),
  )
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
