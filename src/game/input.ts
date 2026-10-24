// Keyboard + mouse input with pointer lock and per-frame edge detection.

export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  mouseButtons = new Set<number>();
  clicked = new Set<number>();
  mouseX = 0;
  mouseY = 0;
  /** True while a UI text field has focus. */
  typing = false;
  /** Suppresses game input while menus are open. */
  blocked = false;
  pointerLocked = false;
  /** Fallback look: right-drag rotates the camera when pointer lock is unavailable. */
  dragLook = false;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement;
      this.typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
      if (this.typing) return;
      const k = norm(e.code);
      if (!this.down.has(k)) this.pressed.add(k);
      this.down.add(k);
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      const k = norm(e.code);
      this.down.delete(k);
      this.released.add(k);
    });
    window.addEventListener('blur', () => this.down.clear());
    window.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      if (this.pointerLocked || (this.dragLook && this.mouseButtons.has(2))) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      this.mouseButtons.add(e.button);
      this.clicked.add(e.button);
    });
    window.addEventListener('mouseup', (e) => this.mouseButtons.delete(e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      this.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    });
  }

  requestLock() {
    if (this.pointerLocked) return;
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => (this.dragLook = true));
    } catch {
      this.dragLook = true;
    }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(k: string): boolean {
    return !this.blocked && this.down.has(k);
  }

  wasPressed(k: string): boolean {
    return !this.blocked && this.pressed.has(k);
  }

  /** Pressed regardless of UI blocking (Escape, Tab). */
  rawPressed(k: string): boolean {
    return this.pressed.has(k);
  }

  wasReleased(k: string): boolean {
    return this.released.has(k);
  }

  axis(neg: string[], pos: string[]): number {
    let v = 0;
    if (pos.some((k) => this.isDown(k))) v += 1;
    if (neg.some((k) => this.isDown(k))) v -= 1;
    return v;
  }

  /** Simulated key events for automation/tests. */
  press(k: string) {
    if (!this.down.has(k)) this.pressed.add(k);
    this.down.add(k);
  }

  release(k: string) {
    this.down.delete(k);
    this.released.add(k);
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.clicked.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}

function norm(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'Control';
  return code;
}
