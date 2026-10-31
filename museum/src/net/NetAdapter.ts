import type { Entity } from "koota";

/**
 * The seam where multiplayer plugs in (plan §8). Phase 1 ships LocalAdapter, which does nothing;
 * phase 5 adds a PartyServer adapter that sends the local player's state and spawns entities for
 * remote guests.
 */
export interface NetAdapter {
  connect(local: Entity): Promise<void>;
  /** Called after each fixed simulation step. */
  tick(): void;
  disconnect(): void;
}

export class LocalAdapter implements NetAdapter {
  async connect() {}
  tick() {}
  disconnect() {}
}
