import { fetchRetry, mapLimit } from './util.js';

const BASE = 'https://new.7-elevenapp.co.kr';
const SH = {
  accept: 'application/json, text/plain, */*',
  'content-type': 'application/json',
  'user-agent': 'Mozilla/5.0 (Linux; Android 15)',
};

async function post(path, body) {
  const r = await fetchRetry(BASE + path, {
    method: 'POST',
    headers: SH,
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`7-11 ${path} -> HTTP ${r.status}`);
  return r.json();
}

function docsOf(j) {
  return (j?.data?.SearchQueryResult?.Collection ?? []).flatMap((c) =>
    (c.Documentset?.Document ?? []).map((d) => d.field ?? d),
  );
}

function totalOf(j) {
  return (j?.data?.SearchQueryResult?.Collection ?? []).reduce(
    (a, c) => a + Number(c.Documentset?.totalCount ?? 0),
    0,
  );
}

export async function s7FindItem(keyword) {
  const j = await post('/api/v1/open/search/goods', {
    collection: 'goods',
    query: keyword,
    sort: 'quantity/desc,itemOnm/asc',
    startCount: 0,
    listCount: 20,
  });
  const rows = docsOf(j);
  const p = rows.find((x) => x.itemOnm?.includes(keyword)) ?? rows[0];
  if (!p?.itemCd) return null;
  const meta = await (
    await fetchRetry(
      `${BASE}/api/v1/open/product/search/stock?itemCd=${encodeURIComponent(p.itemCd)}`,
      { headers: { accept: SH.accept, 'user-agent': SH['user-agent'] } },
    )
  ).json();
  if (!meta?.smCd) return { ...p, noStockApi: true };
  return { ...p, smCd: meta.smCd, stokMngCd: meta.stokMngCd, stokMngQty: meta.stokMngQty, stockApplicationRate: meta.stockApplicationRate };
}

export async function s7StoresByQuery(query, onProgress) {
  const stores = new Map();
  let start = 0;
  const pageSize = 100;
  for (;;) {
    const j = await post('/api/v1/open/search/store', {
      collection: 'store',
      query,
      sort: 'Date/desc',
      listCount: pageSize,
      startCount: start,
    });
    const docs = docsOf(j);
    for (const s of docs) if (s.storeCd && !stores.has(s.storeCd)) stores.set(s.storeCd, s);
    const total = totalOf(j);
    start += pageSize;
    if (onProgress) onProgress(stores.size);
    if (docs.length === 0 || stores.size >= total || start >= total || start > 10000) break;
  }
  return [...stores.values()];
}

export async function s7Stock(item, storeCd) {
  const j = await post('/api/v1/open/real-stock/multi/01/stocks', {
    smCd: item.smCd,
    stokMngCd: item.stokMngCd,
    stokMngQty: item.stokMngQty,
    stockApplicationRate: String(item.stockApplicationRate),
    storeList: [storeCd],
  });
  const row = j?.data?.storeList?.find((s) => s.storeCd === storeCd);
  return row ? Number(row.stock) : null;
}

export async function s7Stocks(item, stores, concurrency = 6) {
  const result = new Map();
  await mapLimit(stores, concurrency, async (s) => {
    const q = await s7Stock(item, s.storeCd).catch(() => null);
    result.set(s.storeCd, q);
  });
  return result;
}

export function s7StoreInfo(store, qty) {
  const joined = `${store.addr1 ?? ''} ${store.addr2 ?? ''}`.trim();
  const address =
    store.address || store.addr || store.roadAddr || store.shopAddr || joined;
  const coord =
    store.storeLat && store.storeLon ? `${store.storeLat},${store.storeLon}` : '';
  return {
    name: store.storeNm,
    stock: qty ?? -1,
    address: address || coord,
  };
}
