import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import type { Manifest } from "../../shared/museum/manifest";
import { generate } from "../../shared/museum/generate";
import { viewpoint } from "../../shared/museum/floorplan";
import { Overlay } from "./ui/Overlay";
import { ui } from "./ui/store";

// The 3D scene (three.js, Rapier) is the heavy part; the page shows first, the museum loads after.
const Museum = lazy(() => import("./world/Museum"));

/** `#/w/<exhibitId>` opens the museum in front of that work. Read once: the overlay rewrites the hash. */
const linkedExhibit = /^#\/w\/([\w-]+)$/.exec(location.hash)?.[1] ?? null;

export function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/manifest")
      .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : Promise.reject()))
      .then(setManifest, () => setError(true));
  }, []);

  const plan = useMemo(() => manifest && generate(manifest), [manifest]);
  const exhibits = useMemo(() => new Map(manifest?.exhibits.map((e) => [e.id, e])), [manifest]);

  // Start in front of a linked work, focused on it; otherwise in the atrium.
  const linkedSlot = plan?.slots.find((s) => s.exhibitId === linkedExhibit);
  const start = useMemo(() => (plan ? (linkedSlot ? viewpoint(linkedSlot) : plan.spawn) : null), [plan, linkedSlot]);
  useEffect(() => {
    if (linkedSlot) ui.set({ focused: linkedSlot.exhibitId });
  }, [linkedSlot]);

  return (
    <>
      {plan && start && (
        <Suspense fallback={null}>
          <Museum plan={plan} exhibits={exhibits} start={start} />
        </Suspense>
      )}
      <Overlay manifest={manifest} error={error} exhibits={exhibits} />
    </>
  );
}
