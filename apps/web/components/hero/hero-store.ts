/**
 * Shared, mutable hero state. The DOM side (GSAP timelines, ScrollTrigger)
 * writes; the WebGL side reads every frame. Plain object on purpose: nothing
 * here should cause a React re-render.
 */

export type ScreenCircle = { x: number; y: number; r: number };

export type SlotTarget = {
  el: HTMLElement;
  handle: string;
  /** rad/s, from posting frequency */
  speed: number;
  /** number of points the card draws, from posts parsed */
  density: number;
};

export const heroStore = {
  reducedMotion: false,

  /** set by the scene once it has measured the layout */
  ready: false,
  readyCallbacks: [] as Array<() => void>,
  /** where the solid "i"'s dot will first appear, for the preloader handoff */
  dotScreen: null as ScreenCircle | null,

  /** DOM box the logo is fitted into (measured in document space, then pinned) */
  logoSlot: null as HTMLElement | null,
  /** the 10 card signature boxes the clusters land on */
  slots: [] as Array<SlotTarget | null>,

  // timeline values, all 0..1
  dot: 0, // dot opacity
  stem: 0, // stem opacity
  rise: 1, // 1 = 12px low, 0 = settled
  copy: 0, // particle copy progress
  breath: 0, // idle breathing amount
  scatter: 0, // scroll progress into the cards
  repel: 0, // cursor repel enabled

  /** last pointer position in viewport px; null when outside the window */
  pointer: null as { x: number; y: number } | null,
  /** device tilt in radians, mobile only */
  tilt: { x: 0, y: 0 },
};

export function whenHeroReady(cb: () => void) {
  if (heroStore.ready) cb();
  else heroStore.readyCallbacks.push(cb);
}

export function markHeroReady() {
  heroStore.ready = true;
  const cbs = heroStore.readyCallbacks.splice(0);
  cbs.forEach((cb) => cb());
}
