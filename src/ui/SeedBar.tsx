import { randomSeed } from "../lib/store";

interface Props {
  seed: string;
  history: string[];
  onSeed(seed: string): void;
  onBack(): void;
}

export function SeedBar({ seed, history, onSeed, onBack }: Props) {
  return (
    <div className="seedbar">
      <button className="icon" onClick={onBack} disabled={!history.length} aria-label="Previous seed" title="Previous seed">‹</button>
      <input
        className="seed-input"
        aria-label="Seed"
        value={seed}
        onChange={(e) => onSeed(e.target.value.slice(0, 40))}
        spellCheck={false}
      />
      <button className="icon" onClick={() => onSeed(randomSeed())} aria-label="New random seed" title="New random seed">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="4" />
          <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" /><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
}
