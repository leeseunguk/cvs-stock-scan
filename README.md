# cvs-stock-scan

특정 상품의 재고가 있는 편의점 점포를 지역별로 스캔하는 CLI입니다.

지원 체인: **CU**, **이마트24**, **세븐일레븐** (모두 비공식 공개 API, 로그인 불필요)

> API 호출 구조는 [hmmhmmhm/daiso-mcp](https://github.com/hmmhmmhm/daiso-mcp)의 역공학 결과를 참고해 재구현했습니다. 그 저장소의 포크가 아니라, 지역 스캔만 하는 별도 도구입니다.

## 요구 사항

- [Bun](https://bun.sh) 1.x (또는 Node.js 18+, 단 shebang/실행은 bun 기준)

## 사용법

```bash
bun src/cli.js <상품키워드> [옵션]
```

| 옵션 | 설명 |
|---|---|
| `--region <지역>` | `서울,경기,인천,부산,대구,대전,광주,울산,세종,강원,충북,충남,전북,전남,경북,경남,제주` 중 쉼표로 선택. `전국` 또는 생략 시 전국 |
| `--chain <체인>` | `cu`, `emart24`, `seven` (쉼표로 여러 개). 생략 시 `cu` |
| `--step <도>` | CU 격자 간격(기본 0.0145, 약 1.6km) |
| `--concurrency <n>` | 이마트24/세븐 재고 조회 동시성(기본 6) |
| `--limit <n>` | 세븐일레븐 재고 조회할 점포 최대 수 |

### 예시

```bash
# CU에서 대전 지역만
bun src/cli.js "이스까이말벡" --region 대전

# CU 전국 스캔 (호출 수만 회, 수십 분 소요)
bun src/cli.js "이스까이말벡" --region 전국 --chain cu

# 세븐일레븐 제주
bun src/cli.js "삼각김밥" --region 제주 --chain seven

# 이마트24 충남
bun src/cli.js "생수" --region 충남 --chain emart24

# 여러 체인 동시
bun src/cli.js "이스까이말벡" --region 제주 --chain cu,seven,emart24
```

## MCP 서버로 사용

의존성 없는 stdio JSON-RPC 구현입니다. MCP 클라이언트 설정에 등록하면 됩니다.

```json
{
  "mcpServers": {
    "cvs-stock": {
      "command": "bun",
      "args": ["/절대경로/cvs-stock/src/mcp.js"]
    }
  }
}
```

제공 도구:
- `cvs_product_search` — `{chain, keyword}` → 상품명·코드
- `cvs_stock_scan` — `{keyword, chain?, region?, limit?, concurrency?}` → 지역별 점포 통계 + 재고 점포 목록

## 동작 방식

- **CU**: PocketCU 앱 API(`/api/store`). 한 번 호출에 반경 약 1km, 최대 50개 점포만 반환하고 페이지는 무시되므로 지역 상자를 약 1.6km 간격 격자로 스캔합니다. 재고 수량은 같은 응답에 포함됩니다. 5xx는 최대 4번 재시도합니다.
- **이마트24**: `api1/store?AREA1=시도`로 지역 점포 목록을 받은 뒤 점포코드(`BIZNO`)별 `stock-search/store`로 수량을 조회합니다. AREA1은 `충청남도` 같은 공식명입니다. CLI의 `--region 충남`은 내부에서 공식명으로 바꿉니다.
- **세븐일레븐**: 공식 앱 검색 API의 `collection: "store"`를 시·군·구 키워드로 페이지네이션해 점포 목록을 모은 뒤, 점포 코드를 하나씩 `real-stock/multi/01/stocks`에 넣습니다. 여러 코드를 한 요청에 넣으면 빈 목록이 나올 수 있습니다. 빈 목록은 그 점포가 취급하지 않는 것으로 봅니다.
- 지역 상자가 겹쳐도 체인과 점포 코드가 같으면 한 번만 출력합니다.

## 주의

- 비공식 API이므로 언제든 막히거나 응답이 바뀔 수 있습니다.
- 재고 수치는 조회 시점 기준이며 방문 전 점포에 확인하세요.
- CU 전국 스캔은 API 호출이 수만 회가 됩니다. 단기간 대량 호출은 서비스에 부담이 되니 간격을 두고 필요한 지역만 스캔하세요.
- GS25는 로그인 토큰이 필요해 미지원입니다.
