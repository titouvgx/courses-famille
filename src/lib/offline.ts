// Liste de courses hors connexion.
//
// Au fond d'un magasin, le réseau tombe souvent. On garde donc sur le téléphone :
//   1. la dernière version de la liste (pour l'afficher sans réseau)
//   2. les cochages faits sans réseau, en file d'attente, renvoyés dès que le
//      réseau revient (événement « online » ou prochain chargement)
// Stockage : localStorage (quelques Ko). Tout est protégé par try/catch :
// navigation privée ou stockage plein → l'appli marche simplement sans cache.

import type { ShoppingList, ShoppingListItemWithCategory, ShoppingCategory } from './types'
import { toggleItem } from './api/shopping'

const LIST_KEY = (familyId: string) => `courses:liste:${familyId}`
const QUEUE_KEY = 'courses:cochages-en-attente'

export interface CachedList {
  list: ShoppingList | null
  items: ShoppingListItemWithCategory[]
  categories: ShoppingCategory[]
  savedAt: string
}

export interface PendingToggle {
  itemId: string
  checked: boolean
  userId: string
  at: string
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // stockage indisponible : on continue sans cache
  }
}

// ── Dernière liste connue ──

export function loadCachedList(familyId: string): CachedList | null {
  return read<CachedList>(LIST_KEY(familyId))
}

export function saveCachedList(familyId: string, data: Omit<CachedList, 'savedAt'>): void {
  write(LIST_KEY(familyId), { ...data, savedAt: new Date().toISOString() })
}

// ── Cochages en attente ──

export function pendingToggles(): PendingToggle[] {
  return read<PendingToggle[]>(QUEUE_KEY) ?? []
}

/** Ajoute (ou remplace) le cochage d'un article : seul le dernier état compte. */
export function queueToggle(t: Omit<PendingToggle, 'at'>): void {
  const queue = pendingToggles().filter((p) => p.itemId !== t.itemId)
  queue.push({ ...t, at: new Date().toISOString() })
  write(QUEUE_KEY, queue)
}

/** Réapplique les cochages en attente sur une liste (affichage cohérent). */
export function applyPending(items: ShoppingListItemWithCategory[]): ShoppingListItemWithCategory[] {
  const queue = pendingToggles()
  if (queue.length === 0) return items
  const byId = new Map(queue.map((p) => [p.itemId, p]))
  return items.map((i) => {
    const p = byId.get(i.id)
    return p ? { ...i, checked: p.checked } : i
  })
}

/**
 * Renvoie les cochages en attente. Ceux qui échouent encore restent dans la file.
 * Un article supprimé entre-temps est simplement ignoré.
 * @returns le nombre de cochages envoyés
 */
export async function flushPending(): Promise<number> {
  const queue = pendingToggles()
  if (queue.length === 0) return 0
  const stillPending: PendingToggle[] = []
  let sent = 0
  for (const p of queue) {
    try {
      await toggleItem(p.itemId, p.checked, p.userId)
      sent++
    } catch (e) {
      if (isNetworkError(e)) stillPending.push(p)
      // autre erreur (article supprimé, droits) : on abandonne ce cochage
    }
  }
  write(QUEUE_KEY, stillPending)
  return sent
}

/** Vrai si l'erreur vient d'une absence de réseau (et pas d'un refus du serveur). */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const msg = String((e as any)?.message ?? e).toLowerCase()
  return msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('network request failed') || msg.includes('load failed')
}
