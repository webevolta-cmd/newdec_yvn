import { catalogIndex } from './catalog-index.js';

export interface CatalogEntry {
  id: string;
  name: string;
  category: string;
}

/** Resolves a product id sent by the browser against the published catalog. */
export function findProduct(id: string): CatalogEntry | null {
  const hit = Object.prototype.hasOwnProperty.call(catalogIndex, id) ? catalogIndex[id] : undefined;
  return hit ? { id, ...hit } : null;
}
