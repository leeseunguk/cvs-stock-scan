import { fetchRetry, mapLimit } from './util.js';

const JH = {
  accept: 'application/json, text/javascript, */*; q=0.01',
  'x-requested-with': 'XMLHttpRequest',
};

export async function e24FindItem(keyword) {
  const r = await fetchRetry('https://everse.emart24.co.kr/stock/stock/search', {
    method: 'POST',
    headers: { ...JH, 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: `currentPage=1&pageCnt=10&sortType=SALE&saleProductYn=N&searchWord=${encodeURIComponent(keyword)}`,
  });
  if (!r.ok) throw new Error(`이마트24 상품검색 -> HTTP ${r.status}`);
  const j = await r.json();
  const p = (j.productList ?? []).find((x) => x.goodsNm?.includes(keyword)) ?? j.productList?.[0];
  return p ? { pluCd: p.pluCd, goodsNm: p.goodsNm } : null;
}

export async function e24StoresByArea(area1, onProgress) {
  const stores = [];
  let page = 1;
  for (;;) {
    const r = await fetchRetry(
      `https://emart24.co.kr/api1/store?page=${page}&AREA1=${encodeURIComponent(area1)}`,
      { headers: JH },
    );
    const j = await r.json();
    if (j.error === 1) break;
    const rows = j.data ?? [];
    if (rows.length === 0) break;
    stores.push(...rows);
    if (onProgress && page % 10 === 0) onProgress(stores.length);
    if (stores.length >= Number(j.count ?? 0) || rows.length < 40) break;
    page++;
    if (page > 400) break;
  }
  return stores;
}

export async function e24Stocks(pluCd, bizNos, concurrency = 6) {
  const result = new Map();
  await mapLimit(bizNos, concurrency, async (bizNo) => {
    const r = await fetchRetry(
      `https://everse.emart24.co.kr/api/stock/v3/stock-search/store?searchPluCode=${pluCd}&bizNoArr=${bizNo}`,
      { headers: JH },
    );
    if (!r.ok) return;
    const j = await r.json();
    for (const row of j.storeGoodsQty ?? []) {
      result.set(String(row.BIZNO), row.BIZQTY);
    }
  });
  return result;
}

export function e24StoreInfo(store, qty) {
  return {
    name: store.TITLE,
    stock: qty === undefined || qty === null || qty === '' ? -1 : Number(qty),
    address: `${store.ADDRESS ?? ''} ${store.ADDRESS_DE ?? ''}`.trim(),
  };
}
