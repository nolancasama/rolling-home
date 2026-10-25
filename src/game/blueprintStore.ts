import { parseBlueprint, type Blueprint } from '../sim/blueprints';
import { fail, type Result } from '../sim/core';

// The blueprint library is shared by every save on this machine. Storage goes
// through one small adapter so a desktop build can keep blueprints as files;
// in the browser they live in localStorage (every access wrapped: blocked or
// private storage must never break play).

export interface BlueprintBackend {
  load(): string | null;
  save(json: string): boolean;
}

const KEY = 'rollinghome:blueprints';

export const localBackend: BlueprintBackend = {
  load: () => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  save: (json) => {
    try {
      localStorage.setItem(KEY, json);
      return true;
    } catch {
      return false;
    }
  },
};

export class BlueprintStore {
  constructor(private backend: BlueprintBackend = localBackend) {}

  list(): Blueprint[] {
    let raw: unknown[] = [];
    try {
      const parsed = JSON.parse(this.backend.load() ?? '[]');
      raw = Array.isArray(parsed) ? parsed : [];
    } catch {
      raw = [];
    }
    const out: Blueprint[] = [];
    for (const entry of raw) {
      const r = parseBlueprint(JSON.stringify(entry));
      if (r.ok) out.push(r.blueprint);
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private write(list: Blueprint[]): boolean {
    return this.backend.save(JSON.stringify(list));
  }

  put(bp: Blueprint): boolean {
    const list = this.list().filter((b) => b.id !== bp.id);
    list.push(bp);
    return this.write(list);
  }

  remove(id: string): boolean {
    return this.write(this.list().filter((b) => b.id !== id));
  }

  rename(id: string, name: string): boolean {
    const list = this.list();
    const bp = list.find((b) => b.id === id);
    if (!bp) return false;
    bp.name = name.trim() || bp.name;
    return this.write(list);
  }

  duplicate(id: string): Blueprint | null {
    const bp = this.list().find((b) => b.id === id);
    if (!bp) return null;
    const copy: Blueprint = { ...structuredClone(bp), id: newBlueprintId(), name: `${bp.name} (copy)`, createdAt: new Date().toISOString() };
    return this.put(copy) ? copy : null;
  }
}

export function newBlueprintId(): string {
  return `bp-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e8).toString(36)}`;
}

/** Hand the player a .json file of one blueprint. */
export function downloadBlueprint(bp: Blueprint) {
  const blob = new Blob([JSON.stringify(bp, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${bp.name.replace(/[^\w\- ]+/g, '').trim() || 'blueprint'}.rolling-home.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}

export async function readBlueprintFile(file: File): Promise<Result<{ blueprint: Blueprint }>> {
  try {
    return parseBlueprint(await file.text());
  } catch {
    return fail('Could not read that file.');
  }
}
