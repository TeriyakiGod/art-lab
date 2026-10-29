import { useEffect, useState, useSyncExternalStore } from "react";
import { api } from "./lib/api";
import { pullSketches, pushPending } from "./lib/store";
import { pullPalettes, pushPalettes } from "./lib/palettes";
import { Gallery } from "./ui/Gallery";
import { Home } from "./ui/Home";
import { LessonList, LessonPage } from "./ui/Learn";
import { Studio, type StudioTab } from "./ui/Studio";

const subscribeHash = (cb: () => void) => (window.addEventListener("hashchange", cb), () => window.removeEventListener("hashchange", cb));
const useHash = () => useSyncExternalStore(subscribeHash, () => location.hash || "#/");

function useMedia(query: string) {
  const [match, setMatch] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const on = () => setMatch(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}

const DONE_KEY = "art-lab:lessons-done";
function loadDone(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(DONE_KEY) ?? "[]")); } catch { return new Set(); }
}

export function App() {
  const hash = useHash();
  const desktop = useMedia("(min-width: 960px)");
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [authError, setAuthError] = useState(false);
  const [done, setDone] = useState(loadDone);
  const [tab, setTab] = useState<StudioTab>("canvas");
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    api<{ id: string; email: string }>("/me")
      .then((u) => {
        setUser(u);
        try { localStorage.setItem("art-lab:user", JSON.stringify(u)); } catch { /* ignore */ }
        void pullSketches().catch(() => {});
        void pushPending();
        void pullPalettes().catch(() => {});
        void pushPalettes();
        void api<string[]>("/progress").then((ids) => setDone((d) => new Set([...d, ...ids]))).catch(() => {});
      })
      .catch(() => {
        // Offline: fall back to the last known user so local sketches still work.
        try {
          const cached = localStorage.getItem("art-lab:user");
          if (cached) return setUser(JSON.parse(cached));
        } catch { /* ignore */ }
        setAuthError(true);
      });
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);

  useEffect(() => {
    try { localStorage.setItem(DONE_KEY, JSON.stringify([...done])); } catch { /* ignore */ }
  }, [done]);

  const completeLesson = (id: string) => {
    setDone((d) => new Set([...d, id]));
    void api(`/progress/${id}`, { method: "PUT" }).catch(() => {});
  };

  const [, route, param] = hash.match(/^#\/([^/]*)\/?(.*)$/) ?? [];
  const inStudio = route === "sketch" && !!param;

  let page;
  if (authError && !user) page = <div className="pad"><p>Couldn't verify your sign-in.</p><button onClick={() => location.reload()}>Retry</button></div>;
  else if (!user) page = <div className="pad muted">Loading…</div>;
  else if (inStudio) page = <Studio sketchId={param} userId={user.id} desktop={desktop} tab={tab} onTab={setTab} done={done} onComplete={completeLesson} />;
  else if (route === "learn" && param) page = <LessonPage id={param} done={done} onComplete={completeLesson} />;
  else if (route === "learn") page = <LessonList done={done} />;
  else if (route === "gallery") page = <Gallery />;
  else page = <Home done={done} />;

  return (
    <div className={`app ${inStudio ? "in-studio" : ""}`}>
      <header className="topbar">
        <a href="#/" className="brand">◐ Art Lab</a>
        <nav className="topnav">
          <a href="#/" className={!route ? "on" : ""}>Sketches</a>
          <a href="#/gallery" className={route === "gallery" ? "on" : ""}>Gallery</a>
          <a href="#/learn" className={route === "learn" ? "on" : ""}>Learn</a>
        </nav>
        {!online && <span className="badge">offline</span>}
      </header>
      <main className="main">{page}</main>
      {!desktop && inStudio && (
        <nav className="bottomnav" aria-label="Studio views">
          {(["canvas", "tweak", "code", "lesson", "chat"] as const).map((t) => (
            <button key={t} className={tab === t ? "on" : ""} aria-current={tab === t} onClick={() => setTab(t)}>
              <NavIcon tab={t} />
              {t === "canvas" ? "Canvas" : t === "tweak" ? "Tweak" : t === "code" ? "Code" : t === "lesson" ? "Lesson" : "Assistant"}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

const ICONS: Record<StudioTab, string> = {
  canvas: "M4 4h16v16H4z",
  tweak: "M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6",
  code: "M9 7l-5 5 5 5M15 7l5 5-5 5",
  lesson: "M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z",
  chat: "M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z",
};

function NavIcon({ tab }: { tab: StudioTab }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[tab]} />
    </svg>
  );
}
