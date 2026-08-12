/**
 * `vanta` ships no types at all (checked: no `.d.ts` anywhere in the
 * package, no `@types/vanta` on npm). Its per-effect entry points
 * (`vanta/src/vanta.<effect>.js`) each default-export a factory —
 * `VANTA.register(name, Effect)` returns `(opts) => new Effect(opts)`,
 * confirmed by reading `vanta/src/_base.js` directly — so every effect
 * module has the same shape. Only declaring the one effect this fork
 * actually imports (`vanta.net.js`) rather than every effect in the
 * package.
 */
declare module "vanta/src/vanta.net.js" {
  import type * as THREE from "three";

  interface VantaNetOptions {
    el: HTMLElement;
    THREE?: typeof THREE;
    mouseControls?: boolean;
    touchControls?: boolean;
    gyroControls?: boolean;
    minHeight?: number;
    minWidth?: number;
    scale?: number;
    scaleMobile?: number;
    color?: number;
    backgroundColor?: number;
    points?: number;
    maxDistance?: number;
    spacing?: number;
    showDots?: boolean;
  }

  interface VantaEffect {
    destroy(): void;
  }

  export default function NET(options: VantaNetOptions): VantaEffect;
}
