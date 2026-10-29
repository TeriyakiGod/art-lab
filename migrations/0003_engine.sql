-- Which runtime a sketch (and an output's exact render) uses: plain Canvas 2D or p5.js.
ALTER TABLE sketches ADD COLUMN engine TEXT NOT NULL DEFAULT 'canvas';
ALTER TABLE outputs ADD COLUMN engine TEXT NOT NULL DEFAULT 'canvas';
