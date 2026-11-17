/** Colors from docs/ART.md, as numbers Phaser understands (0xRRGGBB). */
import type { Team } from "@gully/shared";

export const COLORS = {
  background: 0x1b1d24,
  ground: 0x23262f,
  outline: 0x11131a,
  text: 0xf1f2f6,
  gold: 0xffd43b,
  goldDark: 0xd4a017,
  fire: 0xff8a3d,
  fireInner: 0x3a2416,
  building: 0x3a3e4c,
  buildingTop: 0x4b5062,
  cart: 0x8a5a3c,
  cartRim: 0x5e3c27,
  chai: 0x2f8a8a,
  tree: 0x2f6b46,
  treeRim: 0x3f8a5a,
} as const;

export const TEAM_COLORS: Record<Team, { body: number; hat: number; hatDark: number; css: string }> = {
  blue: { body: 0x4a83ff, hat: 0x16316f, hatDark: 0x0d1f4a, css: "#4a83ff" },
  green: { body: 0x3fd17a, hat: 0x0f4d2c, hatDark: 0x0f4d2c, css: "#3fd17a" },
};
