import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import type { Manifest } from "../../shared/museum/manifest";
import { generate } from "../../shared/museum/generate";
import { viewpoint } from "../../shared/museum/floorplan";
import { propsFor } from "../../shared/museum/props";
import { Overlay } from "./ui/Overlay";
import { ui } from "./ui/store";
import { live } from "./art/live";

// The 3D scene (three.js, Rapier) is the heavy part; the page shows first, the museum loads after.
const Museum = lazy(() => import("./world/Museum"));

/**
 * `#/w/<exhibitId>` opens the museum in front of that work, `#/w/<exhibitId>/<seed>` in front of a
 * re-roll of it. Read once: the overlay rewrites the hash.
 */
const [, linkedExhibit = null, linkedSeed = null] = /^#\/w\/([\w-]+)(?:\/([\w-]{1,40}))?$/.exec(location.hash) ?? [];

/** Dev only: `?fake=300` fills the museum with copies of the real works across many wings, to test scale. */
function fakeCollection(m: Manifest): Manifest {
  const n = Number(new URLSearchParams(location.search).get("fake"));
  if (!n || !m.exhibits.length) return m;
  const exhibits = Array.from({ length: n }, (_, i) => {
    const e = m.exhibits[i % m.exhibits.length];
    return { ...e, id: `fake-${i}`, title: `${e.title} #${i}`, wing: `Wing ${i % 14}`, position: i, hero: i % 37 === 0, live: false };
  });
  return { ...m, exhibits };
}

export function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/manifest")
      .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : Promise.reject()))
      .then((m) => setManifest(import.meta.env.DEV ? fakeCollection(m) : m), () => setError(true));
  }, []);

  const plan = useMemo(() => {
    if (!manifest) return null;
    const t = performance.now();
    const p = generate(manifest);
    if (import.meta.env.DEV) console.info(`floor plan: ${p.rooms.length} rooms in ${(performance.now() - t).toFixed(0)} ms`);
    return p;
  }, [manifest]);
  const props = useMemo(() => (plan && manifest ? propsFor(plan, manifest.layoutSeed) : []), [plan, manifest]);
  if (import.meta.env.DEV && plan) Object.assign((window as unknown as { __museum: object }).__museum, { plan, props });
  const exhibits = useMemo(() => new Map(manifest?.exhibits.map((e) => [e.id, e])), [manifest]);

  // Start in front of a linked work, focused on it; otherwise in the atrium.
  const linkedSlot = plan?.slots.find((s) => s.exhibitId === linkedExhibit);
  const start = useMemo(() => (plan ? (linkedSlot ? viewpoint(linkedSlot) : plan.spawn) : null), [plan, linkedSlot]);
  useEffect(() => {
    if (!linkedSlot) return;
    if (linkedSeed && exhibits.get(linkedSlot.exhibitId)?.live) live.reroll(linkedSlot.exhibitId, linkedSeed);
    ui.set({ focused: linkedSlot.exhibitId });
  }, [linkedSlot, exhibits]);

  return (
    <>
      {plan && start && (
        <Suspense fallback={null}>
          <Museum plan={plan} props={props} seed={manifest!.layoutSeed} exhibits={exhibits} start={start} />
        </Suspense>
      )}
      <Overlay manifest={manifest} error={error} exhibits={exhibits} />
    </>
  );
}
