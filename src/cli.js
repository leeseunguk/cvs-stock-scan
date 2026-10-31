#!/usr/bin/env bun
import { REGIONS, resolveRegions } from './regions.js';
import { cuFindItem, cuScanRegion, cuInStock, cuStoreInfo } from './cu.js';
import { e24FindItem, e24StoresByArea, e24Stocks, e24StoreInfo } from './emart24.js';
import { s7FindItem, s7StoresByQuery, s7Stocks, s7StoreInfo } from './seveneleven.js';

const CHAINS = ['cu', 'emart24', 'seven'];

function usage() {
  console.log(`사용법:
  bun src/cli.js <상품키워드> [옵션]

옵션:
  --region <지역>    서울,경기,인천,부산,대구,대전,광주,울산,세종,강원,충북,충남,전북,전남,경북,경남,제주
                     쉼표로 여러 개 가능. '전국' 또는 생략 시 전국.
  --chain <체인>     cu | emart24 | seven (쉼표로 여러 개, 생략 시 cu)
  --step <도>        CU 격자 간격(기본 0.0145)
  --concurrency <n>  이마트24/세븐일레븐 재고 조회 동시성(기본 6)
  --limit <n>        세븐일레븐 재고 조회할 점포 최대 수(기본 제한 없음)

예시:
  bun src/cli.js "이스까이말벡" --region 대전
  bun src/cli.js "이스까이말벡" --region 전국 --chain cu
  bun src/cli.js "삼각김밥" --region 제주 --chain seven
  bun src/cli.js "생수" --region 충남 --chain emart24`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { keyword: null, region: '전국', chains: ['cu'], step: 0.0145, concurrency: 6, limit: Infinity };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--region') args.region = argv[++i];
    else if (a === '--chain') args.chains = argv[++i].split(',').map((s) => s.trim());
    else if (a === '--step') args.step = parseFloat(argv[++i]);
    else if (a === '--concurrency') args.concurrency = parseInt(argv[++i], 10);
    else if (a === '--limit') args.limit = parseInt(argv[++i], 10);
    else if (!a.startsWith('-') && !args.keyword) args.keyword = a;
    else usage();
  }
  for (const c of args.chains) if (!CHAINS.includes(c)) usage();
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (!args.keyword) usage();
const regions = resolveRegions(args.region);
const results = [];
const seen = new Set();
function add(hit, key) {
  const id = `${hit.chain}:${key}`;
  if (seen.has(id)) return;
  seen.add(id);
  results.push(hit);
}

for (const chain of args.chains) {
  console.error(`\n=== ${chain.toUpperCase()} ===`);
  try {
    if (chain === 'cu') {
      const item = await cuFindItem(args.keyword);
      if (!item) { console.error('상품 없음'); continue; }
      console.error(`상품: ${item.item_nm} (${item.item_cd})`);
      for (const r of regions) {
        const { calls, stores } = await cuScanRegion(item, REGIONS[r].bbox, args.step, (c, n) => {
          console.error(`[${r}] ${c}회 호출, 점포 ${n}개`);
        });
        for (const s of stores.filter(cuInStock))
          add({ chain: 'CU', region: r, ...cuStoreInfo(s) }, s.storeCd);
        console.error(`[${r}] 완료: 호출 ${calls}회, 점포 ${stores.length}, 재고 ${hit.length}`);
      }
    } else if (chain === 'emart24') {
      const item = await e24FindItem(args.keyword);
      if (!item) { console.error('상품 없음'); continue; }
      console.error(`상품: ${item.goodsNm} (${item.pluCd})`);
      for (const r of regions) {
        const storeMap = new Map();
        for (const a1 of REGIONS[r].area1) {
          for (const s of await e24StoresByArea(a1)) if (!storeMap.has(s.CODE)) storeMap.set(s.CODE, s);
        }
        const qtyMap = await e24Stocks(item.pluCd, [...storeMap.keys()], args.concurrency);
        let hit = 0;
        for (const s of storeMap.values()) {
          const info = e24StoreInfo(s, qtyMap.get(String(s.CODE)));
          if (info.stock > 0) {
            add({ chain: 'E24', region: r, ...info }, s.CODE);
            hit++;
          }
        }
        console.error(`[${r}] 점포 ${storeMap.size}, 재고 ${hit}`);
      }
    } else {
      const item = await s7FindItem(args.keyword);
      if (!item) { console.error('상품 없음'); continue; }
      if (item.noStockApi) { console.error(`상품: ${item.itemOnm} — 재고 API 메타 없음`); continue; }
      console.error(`상품: ${item.itemOnm} (${item.itemCd})`);
      for (const r of regions) {
        const storeMap = new Map();
        for (const q of REGIONS[r].queries) {
          for (const s of await s7StoresByQuery(q)) if (!storeMap.has(s.storeCd)) storeMap.set(s.storeCd, s);
        }
        let list = [...storeMap.values()];
        if (list.length > args.limit) list = list.slice(0, args.limit);
        const qtyMap = await s7Stocks(item, list, args.concurrency);
        let hit = 0;
        for (const s of list) {
          const info = s7StoreInfo(s, qtyMap.get(s.storeCd));
          if (info.stock > 0) {
            add({ chain: '7-ELEVEN', region: r, ...info }, s.storeCd);
            hit++;
          }
        }
        console.error(`[${r}] 점포 ${list.length}, 재고 ${hit}`);
      }
    }
  } catch (e) {
    console.error(`${chain} 오류: ${e.message}`);
  }
}

console.log(`\n=== 결과: 재고 있는 점포 ${results.length}곳 ===`);
for (const x of results) console.log(`${x.chain}\t${x.region}\t${x.name}\t${x.stock}개\t${x.address}`);
