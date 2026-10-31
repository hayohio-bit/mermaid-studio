// 코드 → 캔버스 변환기의 스모크 테스트.
// 유형별 샘플 코드를 편집기에 넣고, 캔버스에 만들어진 노드·엣지 수와 라벨이 기대값과 같은지 확인한다.
// mermaid 버전이 바뀌어 SVG 구조가 달라지면 여기서 먼저 걸린다(PR #4에서 겪은 회귀가 그 사례다).
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

// 캔버스 유형: 노드 수(서브그래프 그룹 포함)·엣지 수·노드 라벨
const canvasCases = [
  {
    type: 'flowchart',
    code: [
      'flowchart TD',
      '  A[요청 접수] --> B{유효성 검사}',
      '  B -->|통과| C[처리 대기열 등록]',
      '  B -->|실패| D[오류 응답]',
      '  C -.-> E([작업 실행])',
      '  E ==> F[[결과 저장]]',
      '  F --> G((완료))',
      '  D --> G',
      '  subgraph S[후처리]',
      '    H[/알림/] --> I[\\기록\\]',
      '  end',
      '  G --> H',
    ].join('\n'),
    nodes: 10,
    edges: 9,
    labels: ['기록', '알림', '오류 응답', '요청 접수', '완료', '유효성 검사', '작업 실행', '처리 대기열 등록', '결과 저장', '후처리'],
    edgeLabels: ['실패', '통과'],
  },
  {
    type: 'classDiagram',
    code: ['classDiagram', '  class Animal {', '    +String name', '    +speak()', '  }', '  class Dog', '  class Cat', '  Animal <|-- Dog', '  Animal <|-- Cat', '  Dog ..> Cat : chases'].join('\n'),
    nodes: 3,
    edges: 3,
    edgeLabels: ['chases'],
  },
  {
    type: 'stateDiagram',
    code: ['stateDiagram-v2', '  [*] --> Idle', '  Idle --> Running : start', '  Running --> Idle : stop', '  Running --> [*]'].join('\n'),
    nodes: 4,
    edges: 4,
    edgeLabels: ['start', 'stop'],
  },
  {
    type: 'erDiagram',
    code: ['erDiagram', '  CUSTOMER ||--o{ ORDER : places', '  ORDER ||--|{ LINE_ITEM : contains', '  CUSTOMER }|..|{ ADDRESS : uses'].join('\n'),
    nodes: 4,
    edges: 3,
    edgeLabels: ['contains', 'places', 'uses'],
  },
  {
    type: 'sequenceDiagram',
    code: ['sequenceDiagram', '  participant A as 브라우저', '  participant B as 서버', '  A->>B: 요청', '  B-->>A: 응답', '  A->>B: 재요청'].join('\n'),
    nodes: 2,
    edges: 3,
    labels: ['브라우저', '서버'],
    edgeLabels: ['1. 요청', '2. 응답', '3. 재요청'],
    status: /근사 변환/,
  },
  {
    type: 'mindmap',
    code: ['mindmap', '  root((중심))', '    가지1', '      잎1', '      잎2', '    가지2[사각]', '      잎3(둥근)'].join('\n'),
    nodes: 6,
    edges: 5,
    labels: ['가지1', '둥근', '사각', '잎1', '잎2', '중심'],
  },
  {
    type: 'requirementDiagram',
    code: ['requirementDiagram', '  requirement r1 {', '    id: 1', '    text: "로그인 기능"', '    risk: high', '    verifymethod: test', '  }', '  element e1 {', '    type: simulation', '  }', '  e1 - satisfies -> r1'].join('\n'),
    nodes: 2,
    edges: 1,
    edgeLabels: ['satisfies'],
    status: /요구사항 다이어그램/,
  },
]

// 표 편집 유형: 미리보기 + 표의 입력 칸 수(행 수 × 열 수)
const tableCases = [
  { type: 'pie', code: ['pie title 점유율', '  "A" : 40', '  "B" : 35', '  "C" : 25'].join('\n'), inputs: 6 },
  { type: 'gantt', code: ['gantt', '  title 일정', '  dateFormat YYYY-MM-DD', '  section 설계', '  요구 분석 :a1, 2026-01-01, 3d', '  설계서 :after a1, 2d', '  section 구현', '  개발 :2026-01-07, 5d'].join('\n'), inputs: 6 },
  { type: 'journey', code: ['journey', '  title 하루', '  section 아침', '    기상: 3: 나', '    출근: 2: 나, 동료', '  section 저녁', '    퇴근: 5: 나'].join('\n'), inputs: 9 },
  { type: 'timeline', code: ['timeline', '  title 연혁', '  2024 : 창립', '  2025 : 출시 : 확장', '  2026 : 해외 진출'].join('\n'), inputs: 6 },
]

const editor = (page) => page.locator('textarea').first()
const nodes = (page) => page.locator('.react-flow__node')
const edges = (page) => page.locator('.react-flow__edge')
const statusBox = (page) => page.getByRole('status')
const nodeLabels = (page) => nodes(page).evaluateAll((els) => els.map((n) => n.textContent.trim()).sort())
const edgeLabels = (page) =>
  page.locator('.react-flow__edge-textwrapper').evaluateAll((els) => els.map((n) => n.textContent.trim()).filter(Boolean).sort())

// 테스트마다 새 브라우저 컨텍스트라 localStorage가 비어 있으므로 기본 코드(A → B → C)로 시작한다
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(nodes(page)).toHaveCount(3)
})

for (const c of canvasCases) {
  test(`${c.type}: 노드 ${c.nodes}개·엣지 ${c.edges}개로 변환된다`, async ({ page }) => {
    await editor(page).fill(c.code)
    await expect(nodes(page)).toHaveCount(c.nodes)
    await expect(edges(page)).toHaveCount(c.edges)
    if (c.labels) expect(await nodeLabels(page)).toEqual([...c.labels].sort())
    if (c.edgeLabels) expect(await edgeLabels(page)).toEqual([...c.edgeLabels].sort())
    if (c.status) await expect(statusBox(page)).toHaveText(c.status)
    else await expect(page.getByText(/문법 오류/)).toHaveCount(0)
  })
}

for (const c of tableCases) {
  test(`${c.type}: 미리보기와 표 편집기가 열린다`, async ({ page }) => {
    await editor(page).fill(c.code)
    await expect(page.locator('strong', { hasText: '표 편집' })).toBeVisible()
    await expect(page.locator('input:not([type]), input[type="text"]')).toHaveCount(c.inputs)
    await expect(statusBox(page)).toHaveText(/표로 편집합니다/)
    await expect(nodes(page)).toHaveCount(0)
  })
}

test('gitGraph: 미리보기 전용으로 표시된다', async ({ page }) => {
  await editor(page).fill(['gitGraph', '  commit', '  branch dev', '  commit', '  checkout main', '  merge dev'].join('\n'))
  await expect(page.getByText('미리보기 전용', { exact: true })).toBeVisible()
  await expect(statusBox(page)).toHaveText(/미리보기만 지원합니다/)
  await expect(nodes(page)).toHaveCount(0)
})

test('문법 오류는 상태 메시지로 보이고 캔버스는 유지된다', async ({ page }) => {
  await editor(page).fill('flowchart LR\n  A --> ')
  await expect(statusBox(page)).toHaveText(/문법 오류/)
  await expect(nodes(page)).toHaveCount(3)
})

test('JSON 저장·열기 왕복에서 원본 유형(sourceType)이 보존된다', async ({ page }) => {
  const mindmap = canvasCases.find((c) => c.type === 'mindmap')
  await editor(page).fill(mindmap.code)
  await expect(nodes(page)).toHaveCount(mindmap.nodes)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'JSON 저장' }).click(),
  ])
  const savedPath = await download.path()
  const saved = JSON.parse(readFileSync(savedPath, 'utf8'))
  expect(saved.sourceType).toBe('mindmap')

  await page.getByRole('button', { name: '초기화' }).click()
  await expect(editor(page)).toHaveValue(/^flowchart LR/)

  await page.locator('input[type="file"]').setInputFiles(savedPath)
  await expect(nodes(page)).toHaveCount(mindmap.nodes)
  await page.getByRole('button', { name: '캔버스 → 코드' }).click()
  await expect(editor(page)).toHaveValue(mindmap.code)
})

test('실행 취소·다시 실행이 단축키와 버튼으로 동작한다', async ({ page }) => {
  // 기본 코드가 캔버스로 변환될 때 renderDiagram이 record()를 호출한다. 직전 기록 후 500ms 안의
  // 편집은 기록이 생략되므로(대기 없이 실행하면 첫 실행 취소가 빈 캔버스로 돌아가 실패한다) 지나길 기다린다
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: '노드 추가' }).click()
  await expect(nodes(page)).toHaveCount(4)

  await page.keyboard.press('Control+z')
  await expect(nodes(page)).toHaveCount(3)
  await page.keyboard.press('Control+Shift+z')
  await expect(nodes(page)).toHaveCount(4)

  await page.keyboard.press('Control+z')
  await expect(nodes(page)).toHaveCount(3)
  await page.keyboard.press('Control+y')
  await expect(nodes(page)).toHaveCount(4)

  await page.getByRole('button', { name: /실행 취소/ }).click()
  await expect(nodes(page)).toHaveCount(3)
  await page.getByRole('button', { name: /다시 실행/ }).click()
  await expect(nodes(page)).toHaveCount(4)
})
