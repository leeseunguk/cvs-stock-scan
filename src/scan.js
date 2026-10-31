import { REGIONS, resolveRegions } from './regions.js';
import { cuFindItem, cuScanRegion, cuInStock, cuStoreInfo } from './cu.js';
import { e24FindItem, e24StoresByArea, e24Stocks, e24StoreInfo } from './emart24.js';
import { s7FindItem, s7StoresByQuery, s7Stocks, s7StoreInfo } from './seveneleven.js';

export const CHAINS = ['cu', 'emart24', 'seven'];

export async function findItem(chain, keyword) {
  if (chain === 'cu') {
    const item = await cuFindItem(keyword);
    return item ? { name: item.item_nm, code: item.item_cd, raw: item } : null;
  }
  if (chain === 'emart24') {
    const item = await e24FindItem(keyword);
    return item ? { name: item.goodsNm, code: item.pluCd, raw: item } : null;
  }
  const item = await s7FindItem(keyword);
  return item ? { name: item.itemOnm, code: item.itemCd, raw: item } : null;
}

export async function scanChain(chain, item, regions, options, onProgress) {
  const { step = 0.0145, concurrency = 6, limit = Infinity } = options;
  const hits = [];
  const stats = [];
  for (const r of regions) {
    if (chain === 'cu') {
      const { calls, stores } = await cuScanRegion(item.raw, REGIONS[r].bbox, step, onProgress ? (c, n) => onProgress(r, c, n) : undefined);
      const hit = stores.filter(cuInStock).map((s) => ({ chain: 'CU', region: r, ...cuStoreInfo(s) }));
      hits.push(...hit);
      stats.push({ region: r, calls, stores: stores.length, inStock: hit.length });
    } else if (chain === 'emart24') {
      const storeMap = new Map();
      for (const a1 of REGIONS[r].area1) {
        for (const s of await e24StoresByArea(a1)) if (!storeMap.has(s.CODE)) storeMap.set(s.CODE, s);
      }
      const qtyMap = await e24Stocks(item.code, [...storeMap.keys()], concurrency);
      const hit = [...storeMap.values()].map((s) => ({ chain: 'E24', region: r, ...e24StoreInfo(s, qtyMap.get(String(s.CODE))) })).filter((x) => x.stock > 0);
      hits.push(...hit);
      stats.push({ region: r, stores: storeMap.size, inStock: hit.length });
    } else {
      const storeMap = new Map();
      for (const q of REGIONS[r].queries) {
        for (const s of await s7StoresByQuery(q)) if (!storeMap.has(s.storeCd)) storeMap.set(s.storeCd, s);
      }
      let list = [...storeMap.values()];
      if (list.length > limit) list = list.slice(0, limit);
      const qtyMap = await s7Stocks(item.raw, list, concurrency);
      const hit = list.map((s) => ({ chain: '7-ELEVEN', region: r, ...s7StoreInfo(s, qtyMap.get(s.storeCd)) })).filter((x) => x.stock > 0);
      hits.push(...hit);
      stats.push({ region: r, stores: list.length, inStock: hit.length });
    }
    if (onProgress) onProgress(r, null, null);
  }
  return { hits, stats };
}

export { resolveRegions };
