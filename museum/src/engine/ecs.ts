import { createWorld, trait } from "koota";

/**
 * Players are ECS entities, so the guest at this keyboard and (later) guests over the network are
 * the same kind of thing; rendering and the HUD never special-case the local one.
 */
export const world = createWorld();

/** Feet position, meters. */
export const Position = trait({ x: 0, y: 0, z: 0 });
/** yaw 0 looks north (−z); pitch > 0 looks up. Radians. */
export const Look = trait({ yaw: 0, pitch: 0 });
/** The player driven by this browser's input. */
export const IsLocal = trait();
/** Display name and color, shown to other guests in phase 5. */
export const Avatar = trait({ name: "Guest", color: "#ffffff" });
