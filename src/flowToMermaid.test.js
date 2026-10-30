import { describe, it, expect } from 'vitest'
import {
  flowToMermaid,
  MINDMAP_WRAPPERS,
  SHAPE_TO_MINDMAP_TYPE,
  MINDMAP_TYPE_TO_SHAPE,
} from './flowToMermaid'

// 테스트용 노드·엣지를 짧게 만드는 도우미
const node = (id, data = {}, extra = {}) => ({ id, position: { x: 0, y: 0 }, data: { label: id, ...data }, ...extra })
const edge = (source, target, extra = {}) => ({ id: `${source}-${target}`, source, target, ...extra })
const BS = '\\' // 백슬래시 한 글자. 모양 문법과 라벨 이스케이프 검사에 쓴다

describe('flowchartFromFlow (기본 유형)', () => {
  it('노드 정의를 먼저 쓰고 엣지를 뒤에 쓴다', () => {
    const { code, warning } = flowToMermaid(
      [node('A', { label: '시작' }), node('B', { label: '끝' })],
      [edge('A', 'B')],
    )
    expect(code).toBe(['flowchart LR', '  A["시작"]', '  B["끝"]', '  A --> B'].join('\n'))
    expect(warning).toBeNull()
  })

  it('sourceType이 flowchart·state·class·er·sequence·알 수 없는 값이면 모두 flowchart로 내보낸다', () => {
    const nodes = [node('A')]
    for (const type of ['flowchart', 'state', 'class', 'er', 'sequence', undefined, 'unknown']) {
      expect(flowToMermaid(nodes, [], type).code.startsWith('flowchart LR')).toBe(true)
    }
  })

  it('모양마다 대응하는 괄호 문법을 쓴다', () => {
    const expected = {
      rect: 'A["A"]',
      round: 'A("A")',
      stadium: 'A(["A"])',
      circle: 'A(("A"))',
      diamond: 'A{"A"}',
      hexagon: 'A{{"A"}}',
      subroutine: 'A[["A"]]',
      lean_right: 'A[/"A"/]',
      lean_left: `A[${BS}"A"${BS}]`,
      trapezoid: `A[/"A"${BS}]`,
      inv_trapezoid: `A[${BS}"A"/]`,
    }
    for (const [shape, line] of Object.entries(expected)) {
      expect(flowToMermaid([node('A', { shape })], []).code.split('\n')[1]).toBe(`  ${line}`)
    }
  })

  it('알 수 없는 모양과 라벨 없는 노드는 사각형과 id로 대체한다', () => {
    const { code } = flowToMermaid([node('A', { shape: 'blob', label: '' })], [])
    expect(code).toContain('  A["A"]')
  })

  it('라벨의 큰따옴표는 작은따옴표로 바꾸고 백슬래시는 제거한다', () => {
    const { code } = flowToMermaid([node('A', { label: `say "hi" ${BS}n` })], [])
    expect(code).toContain(`  A["say 'hi' n"]`)
  })

  it('subgraph 그룹의 소속 노드는 블록 안에 들여쓰고, 나머지는 밖에 쓴다', () => {
    const nodes = [
      node('sub-G', { label: '묶음 "A"', subgraphId: 'G' }, { type: 'labeledGroup' }),
      node('A', {}, { parentId: 'sub-G' }),
      node('B'),
    ]
    const { code } = flowToMermaid(nodes, [edge('A', 'B')])
    expect(code).toBe(
      ['flowchart LR', "  subgraph G[묶음 'A']", '    A["A"]', '  end', '  B["B"]', '  A --> B'].join('\n'),
    )
  })

  it('제목 없는 subgraph는 id만 쓴다', () => {
    const nodes = [node('sub-G', { label: '', subgraphId: 'G' }, { type: 'labeledGroup' })]
    expect(flowToMermaid(nodes, []).code).toContain('  subgraph G\n  end')
  })

  it('엣지 라벨과 선 종류를 화살표 문법으로 되살린다', () => {
    const nodes = [node('A'), node('B')]
    const line = (e) => flowToMermaid(nodes, [e]).code.split('\n').at(-1)
    expect(line(edge('A', 'B', { label: 'x|y' }))).toBe('  A -->|x/y| B')
    expect(line(edge('A', 'B', { data: { stroke: 'dotted' } }))).toBe('  A -.-> B')
    expect(line(edge('A', 'B', { label: 'go', data: { stroke: 'dotted' } }))).toBe('  A -. go .-> B')
    expect(line(edge('A', 'B', { data: { stroke: 'thick' } }))).toBe('  A ==> B')
    expect(line(edge('A', 'B', { label: 'go', data: { stroke: 'thick' } }))).toBe('  A ==>|go| B')
  })

  it('양 끝 노드가 없는 엣지는 건너뛴다', () => {
    const { code } = flowToMermaid([node('A')], [edge('A', 'ghost'), edge('ghost', 'A')])
    expect(code).toBe('flowchart LR\n  A["A"]')
  })

  it('기본값에서 바뀐 스타일만 style 지시문으로 쓴다', () => {
    const styled = node('A', {}, {
      style: { background: '#ff0000', borderColor: '#00ff00', color: '#0000ff', borderWidth: '3px' },
    })
    const plain = node('B', {}, {
      style: { background: '#ffffff', borderColor: '#d1d5db', color: '#000000', borderWidth: '1px' },
    })
    const { code } = flowToMermaid([styled, plain], [])
    expect(code).toContain('  style A fill:#ff0000,stroke:#00ff00,color:#0000ff,stroke-width:3px')
    expect(code).not.toContain('style B')
  })

  it('clip-path 모양의 기본 회색 배경은 사용자 변경으로 치지 않는다', () => {
    const gray = node('D', { shape: 'diamond' }, { style: { background: '#e5e7eb' } })
    const white = node('R', { shape: 'rect' }, { style: { background: '#e5e7eb' } })
    const { code } = flowToMermaid([gray, white], [])
    expect(code).not.toContain('style D')
    expect(code).toContain('  style R fill:#e5e7eb')
  })
})

describe('mindmapFromFlow', () => {
  it('노드가 없으면 헤더만 내보낸다', () => {
    expect(flowToMermaid([], [], 'mindmap')).toEqual({ code: 'mindmap', warning: null })
  })

  it('부모-자식 엣지를 들여쓰기로 표현하고 유형 0은 라벨만 쓴다', () => {
    const nodes = [
      node('root', { label: '중심', mindmapType: 3, nodeId: 'root' }),
      node('a', { label: '가지', mindmapType: 0 }),
      node('b', { label: '잎', mindmapType: 2, nodeId: 'b' }),
    ]
    const { code, warning } = flowToMermaid(nodes, [edge('root', 'a'), edge('a', 'b')], 'mindmap')
    expect(code).toBe(['mindmap', '  root((중심))', '    가지', '      b[잎]'].join('\n'))
    expect(warning).toBeNull()
  })

  it('저장된 유형 번호마다 MINDMAP_WRAPPERS의 괄호를 쓴다', () => {
    for (const [type, [open, close]] of Object.entries(MINDMAP_WRAPPERS)) {
      const { code } = flowToMermaid([node('n', { label: 'L', mindmapType: Number(type), nodeId: 'n' })], [], 'mindmap')
      expect(code).toBe(`mindmap\n  n${open}L${close}`)
    }
  })

  it('캔버스에서 모양을 바꿨으면 바뀐 모양의 유형으로 내보낸다', () => {
    // 원래 유형 2(사각)인데 원으로 바꿈 → 유형 3
    const changed = node('n', { label: 'L', mindmapType: 2, shape: 'circle', nodeId: 'n' })
    expect(flowToMermaid([changed], [], 'mindmap').code).toBe('mindmap\n  n((L))')
    // mindmap에 없는 모양(subroutine)으로 바꾸면 사각형(2)으로 대체
    const odd = node('n', { label: 'L', mindmapType: 1, shape: 'subroutine', nodeId: 'n' })
    expect(flowToMermaid([odd], [], 'mindmap').code).toBe('mindmap\n  n[L]')
    // 저장 유형이 없고 모양만 있으면 모양 대응표를 따른다
    const fresh = node('n', { label: 'L', shape: 'hexagon' })
    expect(flowToMermaid([fresh], [], 'mindmap').code).toBe('mindmap\n  n{{L}}')
    // 저장 유형도 모양도 없으면 유형 0(텍스트만)
    expect(flowToMermaid([node('n', { label: 'L' })], [], 'mindmap').code).toBe('mindmap\n  L')
  })

  it('모양 대응표는 서로 짝이 맞는다', () => {
    for (const [shape, type] of Object.entries(SHAPE_TO_MINDMAP_TYPE)) {
      expect(MINDMAP_TYPE_TO_SHAPE[type]).toBe(shape)
    }
  })

  it('라벨의 괄호·중괄호·줄바꿈은 공백으로 바꾸고, 비면 id를 쓴다', () => {
    const { code } = flowToMermaid([node('n', { label: 'a(b)[c]{d}\ne', mindmapType: 1, nodeId: 'n' })], [], 'mindmap')
    expect(code).toBe('mindmap\n  n(a b  c  d  e)')
    expect(flowToMermaid([node('n', { label: '()', mindmapType: 1, nodeId: 'n' })], [], 'mindmap').code).toBe('mindmap\n  n(n)')
  })

  it('연결되지 않은 노드와 부모가 둘인 엣지는 제외하고 경고한다', () => {
    const nodes = [node('r', { mindmapType: 0 }), node('a', { mindmapType: 0 }), node('b', { mindmapType: 0 }), node('lonely', { mindmapType: 0 })]
    const edges = [edge('r', 'a'), edge('r', 'b'), edge('a', 'b')]
    const { code, warning } = flowToMermaid(nodes, edges, 'mindmap')
    expect(code).toBe(['mindmap', '  r', '    a', '    b'].join('\n'))
    expect(warning).toBe('mindmap은 트리 하나만 표현할 수 있어서 트리에 연결되지 않은 노드 1개와 부모가 둘 이상이 되는 엣지 1개는 코드에서 제외했습니다.')
  })

  it('루트 후보가 여럿이면 자손이 가장 많은 노드를 루트로 삼는다', () => {
    const nodes = ['x', 'y', 'y1', 'y2'].map((id) => node(id, { mindmapType: 0 }))
    const { code } = flowToMermaid(nodes, [edge('y', 'y1'), edge('y', 'y2')], 'mindmap')
    expect(code.split('\n')[1]).toBe('  y')
  })

  it('순환만 있어 루트 후보가 없으면 첫 노드를 루트로 삼고 되돌아오는 엣지는 따라가지 않는다', () => {
    const nodes = [node('a', { mindmapType: 0 }), node('b', { mindmapType: 0 })]
    const { code, warning } = flowToMermaid(nodes, [edge('a', 'b'), edge('b', 'a')], 'mindmap')
    expect(code).toBe(['mindmap', '  a', '    b'].join('\n'))
    expect(warning).toBeNull()
  })

  it('자기 자신을 가리키는 엣지는 버린다', () => {
    const { warning } = flowToMermaid([node('a', { mindmapType: 0 })], [edge('a', 'a')], 'mindmap')
    expect(warning).toContain('부모가 둘 이상이 되는 엣지 1개')
  })
})

describe('requirementFromFlow', () => {
  const reqNode = (id, lines, kind = 'requirement') => node(id, { label: lines.join('\n'), reqKind: kind })

  it('요구사항 라벨의 키: 값 줄을 블록 속성으로 되살린다', () => {
    const n = reqNode('r1', ['<<Functional Requirement>>', 'r1', 'ID: 1', 'Text: 로그인 기능', 'Risk: High', 'Verification: Test'])
    const { code, warning } = flowToMermaid([n], [], 'requirement')
    expect(code).toBe(
      ['requirementDiagram', '', 'functionalRequirement r1 {', '  id: 1', '  text: "로그인 기능"', '  risk: high', '  verifymethod: test', '}'].join('\n'),
    )
    expect(warning).toBeNull()
  })

  it('헤더가 없거나 모르는 유형이면 requirement 키워드를 쓴다', () => {
    expect(flowToMermaid([reqNode('r1', ['r1'])], [], 'requirement').code).toContain('requirement r1 {')
    expect(flowToMermaid([reqNode('r1', ['<<Mystery>>', 'r1'])], [], 'requirement').code).toContain('requirement r1 {')
  })

  it('요소는 element 블록으로 내보내고 type·docref를 옮긴다', () => {
    const n = reqNode('e1', ['<<Element>>', 'e1', 'Type: simulation', 'Doc Ref: perf-doc'], 'element')
    const { code } = flowToMermaid([n], [], 'requirement')
    expect(code).toBe(['requirementDiagram', '', 'element e1 {', '  type: simulation', '  docref: "perf-doc"', '}'].join('\n'))
  })

  it('헤더가 없어도 reqKind가 element이면 요소로 본다', () => {
    const { code } = flowToMermaid([reqNode('e1', ['e1'], 'element')], [], 'requirement')
    expect(code).toContain('element e1 {')
  })

  it('ASCII 단어가 아닌 이름·값은 큰따옴표로 감싸고 안의 큰따옴표·줄바꿈은 공백으로 바꾼다', () => {
    const n = reqNode('요구\n1', ['r', 'Text: say "hi"'])
    const { code } = flowToMermaid([n], [], 'requirement')
    expect(code).toContain('requirement "요구 1" {')
    expect(code).toContain('  text: "say  hi"')
  })

  it('허용되지 않는 risk·verifymethod는 제외하고 경고한다', () => {
    const n = reqNode('r1', ['r1', 'Risk: extreme', 'Verification: guess'])
    const { code, warning } = flowToMermaid([n], [], 'requirement')
    expect(code).not.toContain('risk:')
    expect(code).not.toContain('verifymethod:')
    expect(warning).toBe('requirementDiagram이 허용하지 않는 값이 있어 제외하거나 traces로 대체했습니다: r1의 risk "extreme", r1의 verifymethod "guess".')
  })

  it('관계는 data.relType을 우선 쓰고, 없으면 라벨, 둘 다 허용 값이 아니면 traces로 대체하고 경고한다', () => {
    const nodes = [reqNode('a', ['a']), reqNode('b', ['b'])]
    const byRelType = flowToMermaid(nodes, [edge('a', 'b', { data: { relType: 'satisfies' }, label: 'ignored' })], 'requirement')
    expect(byRelType.code).toContain('a - satisfies -> b')
    const byLabel = flowToMermaid(nodes, [edge('a', 'b', { label: 'Verifies' })], 'requirement')
    expect(byLabel.code).toContain('a - verifies -> b')
    const invalid = flowToMermaid(nodes, [edge('a', 'b', { label: 'likes' })], 'requirement')
    expect(invalid.code).toContain('a - traces -> b')
    expect(invalid.warning).toContain('a → b 관계 "likes"')
  })

  it('양 끝 노드가 없는 관계는 건너뛴다', () => {
    const { code } = flowToMermaid([reqNode('a', ['a'])], [edge('a', 'nope')], 'requirement')
    expect(code).not.toContain('->')
  })
})
