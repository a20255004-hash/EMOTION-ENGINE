/**
 * Copia de seguridad síncrona en localStorage del proyecto abierto. IndexedDB es
 * asíncrono y no garantiza terminar si la pestaña se cierra; esta copia sí, y
 * permite recuperar cambios tras una recarga o un cierre accidental.
 */
import { parseProject } from '../../shared/projectFactory';
import type { Project } from '../../shared/schema';

const KEY = 'emotion-engine:recovery';
const LAST_KEY = 'emotion-engine:last-project';

export function writeRecovery(project: Project) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...project, thumbnail: null }));
  } catch {
    /* almacenamiento lleno o bloqueado: IndexedDB sigue siendo la fuente principal */
  }
}

export function readRecovery(): Project | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const r = parseProject(JSON.parse(raw));
    return r.ok ? r.project : null;
  } catch {
    return null;
  }
}

export function clearRecovery() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}

export function setLastProjectId(id: string) {
  try {
    localStorage.setItem(LAST_KEY, id);
  } catch {
    /* noop */
  }
}

export function getLastProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}
