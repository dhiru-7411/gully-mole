/**
 * Turns keyboard and touch into joystick axes (-127..127).
 *
 * - Keyboard: WASD or arrow keys (full speed, 8 directions).
 * - Floating joystick: touch (or click-drag) anywhere on the LEFT 60% of the
 *   screen; the stick appears under your thumb. Push further = faster.
 */
import { AXIS_MAX } from "@gully/shared";

const STICK_RADIUS = 56; // px on screen

export class Controls {
  private held = new Set<string>();
  private pointerId: number | null = null;
  private originX = 0;
  private originY = 0;
  private stickX = 0;
  private stickY = 0;

  private base: HTMLDivElement;
  private knob: HTMLDivElement;

  constructor(private area: HTMLElement) {
    this.base = document.createElement("div");
    this.base.className = "joystick hidden";
    this.knob = document.createElement("div");
    this.knob.className = "joystick-knob";
    this.base.appendChild(this.knob);
    area.appendChild(this.base);

    addEventListener("keydown", this.onKeyDown);
    addEventListener("keyup", this.onKeyUp);
    addEventListener("blur", this.onBlur);
    area.addEventListener("pointerdown", this.onPointerDown);
    addEventListener("pointermove", this.onPointerMove);
    addEventListener("pointerup", this.onPointerUp);
    addEventListener("pointercancel", this.onPointerUp);
  }

  /** Current input. The joystick wins while a thumb is on it. */
  axes(): { moveX: number; moveY: number } {
    if (this.pointerId !== null) {
      return { moveX: Math.round(this.stickX * AXIS_MAX), moveY: Math.round(this.stickY * AXIS_MAX) };
    }
    const k = (...names: string[]) => names.some((n) => this.held.has(n));
    const x = (k("d", "arrowright") ? 1 : 0) - (k("a", "arrowleft") ? 1 : 0);
    const y = (k("s", "arrowdown") ? 1 : 0) - (k("w", "arrowup") ? 1 : 0);
    return { moveX: x * AXIS_MAX, moveY: y * AXIS_MAX };
  }

  destroy() {
    removeEventListener("keydown", this.onKeyDown);
    removeEventListener("keyup", this.onKeyUp);
    removeEventListener("blur", this.onBlur);
    this.area.removeEventListener("pointerdown", this.onPointerDown);
    removeEventListener("pointermove", this.onPointerMove);
    removeEventListener("pointerup", this.onPointerUp);
    removeEventListener("pointercancel", this.onPointerUp);
    this.base.remove();
  }

  // ---------------------------------------------------------------- keyboard

  private onKeyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
      this.held.add(key);
      e.preventDefault(); // stop arrow keys scrolling the page
    }
  };
  private onKeyUp = (e: KeyboardEvent) => this.held.delete(e.key.toLowerCase());
  private onBlur = () => this.held.clear(); // tab switched away: let go of everything

  // ---------------------------------------------------------------- joystick

  private onPointerDown = (e: PointerEvent) => {
    if (this.pointerId !== null) return;
    const rect = this.area.getBoundingClientRect();
    if (e.clientX - rect.left > rect.width * 0.6) return; // right side is for action buttons (M2)
    this.pointerId = e.pointerId;
    this.originX = e.clientX;
    this.originY = e.clientY;
    this.stickX = this.stickY = 0;
    this.base.style.left = `${e.clientX - rect.left}px`;
    this.base.style.top = `${e.clientY - rect.top}px`;
    this.base.classList.remove("hidden");
    this.moveKnob();
    e.preventDefault();
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    let dx = (e.clientX - this.originX) / STICK_RADIUS;
    let dy = (e.clientY - this.originY) / STICK_RADIUS;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    this.stickX = dx;
    this.stickY = dy;
    this.moveKnob();
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.stickX = this.stickY = 0;
    this.base.classList.add("hidden");
  };

  private moveKnob() {
    this.knob.style.transform = `translate(${this.stickX * STICK_RADIUS}px, ${this.stickY * STICK_RADIUS}px)`;
  }
}
