import type { ComponentType } from "react";
import type { WallSlot } from "../../../shared/museum/generate";
import type { Exhibit, Medium } from "../../../shared/museum/manifest";
import { WallArt } from "./WallArt";

/**
 * How each medium is shown (plan §9). 3D works will add PlinthArt, SculptureArt and ImmersiveArt
 * here, placed in floor slots.
 */
export const DISPLAYS: Record<Medium, ComponentType<{ exhibit: Exhibit; slot: WallSlot; accent: string }>> = {
  "2d": WallArt,
};
