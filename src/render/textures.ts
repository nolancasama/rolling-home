import * as THREE from 'three';

// Procedural canvas textures: no image downloads.

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  return t;
}

export interface SignAtlas {
  texture: THREE.CanvasTexture;
  rect: Record<string, [number, number, number, number]>;
}

const SIGN_W = 512, SIGN_H = 112;

export function signAtlas(signs: { key: string; text: string; bg: string; fg: string }[]): SignAtlas {
  const cols = 2;
  const rows = Math.ceil(signs.length / cols);
  const [c, g] = canvas(SIGN_W * cols, SIGN_H * Math.max(1, rows));
  const rect: SignAtlas['rect'] = {};
  signs.forEach((s, i) => {
    const cx = (i % cols) * SIGN_W, cy = Math.floor(i / cols) * SIGN_H;
    g.fillStyle = s.bg;
    roundRect(g, cx + 4, cy + 4, SIGN_W - 8, SIGN_H - 8, 16);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 5;
    g.stroke();
    g.fillStyle = s.fg;
    let size = 58;
    g.font = `800 ${size}px "Trebuchet MS", "Segoe UI", sans-serif`;
    while (g.measureText(s.text).width > SIGN_W - 44 && size > 20) {
      size -= 2;
      g.font = `800 ${size}px "Trebuchet MS", "Segoe UI", sans-serif`;
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(s.text, cx + SIGN_W / 2, cy + SIGN_H / 2 + 3);
    const W = SIGN_W * cols, H = SIGN_H * Math.max(1, rows);
    // uv rect (u0, v0, du, dv) with v measured from the bottom
    rect[s.key] = [cx / W, 1 - (cy + SIGN_H) / H, SIGN_W / W, SIGN_H / H];
  });
  const t = tex(c);
  t.flipY = true;
  return { texture: t, rect };
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function woodFloor(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const plank = 32;
  for (let y = 0; y < 256; y += plank) {
    let x = -((y / plank) % 2) * 90;
    while (x < 256) {
      const w = 110 + ((x * 7 + y * 13) % 60);
      const tone = 150 + ((x * 31 + y * 17) % 40);
      g.fillStyle = `rgb(${tone + 40}, ${tone}, ${tone - 50})`;
      g.fillRect(x, y, w, plank);
      for (let k = 0; k < 6; k++) {
        g.strokeStyle = `rgba(90,60,30,${0.08 + 0.05 * (k % 2)})`;
        g.beginPath();
        const yy = y + 4 + k * 5;
        g.moveTo(x, yy);
        g.bezierCurveTo(x + w * 0.3, yy + 2, x + w * 0.6, yy - 2, x + w, yy + 1);
        g.stroke();
      }
      g.fillStyle = 'rgba(60,40,20,0.55)';
      g.fillRect(x, y, 2, plank);
      x += w;
    }
    g.fillStyle = 'rgba(60,40,20,0.6)';
    g.fillRect(0, y, 256, 2);
  }
  return tex(c, true);
}

export function wallPanel(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#f1e7d4';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(150,120,90,${Math.random() * 0.05})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  g.fillStyle = 'rgba(160,130,95,0.18)';
  g.fillRect(0, 0, 2, 128);
  g.fillRect(64, 0, 1, 128);
  return tex(c, true);
}

export function fabric(color: string, stripe: string): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  g.fillStyle = color;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = stripe;
  for (let i = 0; i < 64; i += 16) g.fillRect(i, 0, 5, 64);
  g.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < 64; i += 4) g.fillRect(0, i, 64, 1);
  return tex(c, true);
}

export function gaugeFace(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 128);
  g.fillStyle = '#16181c';
  g.fillRect(0, 0, 256, 128);
  for (const cx of [64, 192]) {
    g.strokeStyle = '#d8d8d0';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(cx, 72, 48, Math.PI * 0.8, Math.PI * 2.2);
    g.stroke();
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * 0.8 + (Math.PI * 1.4 * i) / 10;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * 40, 72 + Math.sin(a) * 40);
      g.lineTo(cx + Math.cos(a) * 48, 72 + Math.sin(a) * 48);
      g.stroke();
    }
  }
  return tex(c);
}
