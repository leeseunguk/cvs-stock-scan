#!/usr/bin/env bun
import { CHAINS, findItem, scanChain, resolveRegions } from './scan.js';
import { NATIONWIDE } from './regions.js';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER = { name: 'cvs-stock-scan', version: '0.1.0' };

const TOOLS = [
  {
    name: 'cvs_product_search',
    description: '편의점에서 상품을 검색해 정확한 상품명·코드를 반환합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        chain: { type: 'string', enum: CHAINS, description: 'cu | emart24 | seven' },
        keyword: { type: 'string', description: '상품 키워드' },
      },
      required: ['chain', 'keyword'],
    },
  },
  {
    name: 'cvs_stock_scan',
    description: '특정 상품의 재고가 있는 편의점 점포를 지역별로 스캔합니다. CU는 격자 스캔이라 느립니다(지역당 수백~수천 회 호출).',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '상품 키워드' },
        chain: { type: 'string', enum: CHAINS, description: '기본 cu', default: 'cu' },
        region: {
          type: 'string',
          description: `쉼표로 여러 개 가능, '전국'은 전 지역. 가능: ${NATIONWIDE.join(',')},전국`,
          default: '전국',
        },
        limit: { type: 'number', description: '세븐일레븐 점포당 재고 조회 최대 수' },
        concurrency: { type: 'number', description: 'emart24/seven 재고 조회 동시성(기본 6)' },
      },
      required: ['keyword'],
    },
  },
];

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function replyError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

async function callTool(name, args) {
  if (name === 'cvs_product_search') {
    const item = await findItem(args.chain, args.keyword);
    if (!item) return { found: false };
    return { found: true, name: item.name, code: item.code };
  }
  if (name === 'cvs_stock_scan') {
    const regions = resolveRegions(args.region);
    const item = await findItem(args.chain ?? 'cu', args.keyword);
    if (!item) return { error: `상품 없음: ${args.keyword}` };
    const { hits, stats } = await scanChain(args.chain ?? 'cu', item, regions, {
      limit: args.limit ?? Infinity,
      concurrency: args.concurrency ?? 6,
    });
    return { product: { name: item.name, code: item.code }, stats, stores: hits };
  }
  throw new Error(`unknown tool ${name}`);
}

const decoder = new TextDecoder();
let buffer = '';
process.stdin.on('data', (chunk) => {
  buffer += decoder.decode(chunk, { stream: true });
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    handle(msg).catch((e) => {
      if (msg.id !== undefined) replyError(msg.id, -32603, e.message);
    });
  }
});

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    reply(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER });
  } else if (method === 'notifications/initialized') {
    // no-op
  } else if (method === 'tools/list') {
    reply(id, { tools: TOOLS });
  } else if (method === 'tools/call') {
    const { name, arguments: targs } = params;
    try {
      const result = await callTool(name, targs ?? {});
      reply(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
    } catch (e) {
      reply(id, { content: [{ type: 'text', text: `오류: ${e.message}` }], isError: true });
    }
  } else if (method === 'ping') {
    reply(id, {});
  } else if (id !== undefined) {
    replyError(id, -32601, `method not found: ${method}`);
  }
}
