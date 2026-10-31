import { fetchRetry } from './util.js';

const UA =
  'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36;BGFCU';
const H = {
  'content-type': 'application/json',
  'x-requested-with': 'XMLHttpRequest',
  'user-agent': UA,
  accept: 'application/json, text/javascript, */*; q=0.01',
};

async function post(path, body) {
  const r = await fetchRetry('https://www.pocketcu.co.kr' + path, {
    method: 'POST',
    headers: H,
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`CU ${path} -> HTTP ${r.status}`);
  return r.json();
}

export async function cuFindItem(keyword) {
  const j = await post('/api/search/rest/stock/main', {
    searchWord: keyword,
    spellModifyUseYn: 'Y',
    offset: 0,
    limit: 1,
    searchSort: 'recom',
  });
  return j?.data?.stockResult?.result?.rows?.[0]?.fields ?? null;
}

export function cuStoreBody(item, lat, lng) {
  const la = lat.toFixed(4);
  const lo = lng.toFixed(4);
  return {
    latVal: la,
    longVal: lo,
    baseLatVal: la,
    baseLongVal: lo,
    pageType: 'search_improve stock_sch_improve',
    tabId: '2',
    filterSvcList: [],
    filterAdtList: [],
    pickupType: 'change',
    getRoute: 'IOS',
    areaTplNo: '0',
    childMealPickUpYn: 'N',
    isCurrentSearch: 'N',
    searchStock: false,
    stockCdcYn: 'N',
    jipCd: item.item_cd,
    itemCd: item.item_cd,
    item_cd: item.item_cd,
    onItemNo: item.on_item_no,
    isRecommend: 'Y',
    recommendId: 'stock',
  };
}

export async function cuScanRegion(item, bbox, step = 0.0145, onProgress) {
  const found = new Map();
  let calls = 0;
  const lngStep = step * 1.25;
  for (let la = bbox[0]; la <= bbox[1]; la += step) {
    for (let lo = bbox[2]; lo <= bbox[3]; lo += lngStep) {
      const j = await post('/api/store', cuStoreBody(item, la, lo));
      calls++;
      for (const s of j?.storeList ?? []) if (!found.has(s.storeCd)) found.set(s.storeCd, s);
      if (onProgress && calls % 500 === 0) onProgress(calls, found.size);
    }
  }
  return { calls, stores: [...found.values()] };
}

export function cuInStock(store) {
  return Number(store.stock) > 0;
}

export function cuStoreInfo(store) {
  return {
    name: store.storeNm,
    stock: Number(store.stock),
    address: store.doroStoreAddr1 ?? store.addrFst ?? '',
  };
}
