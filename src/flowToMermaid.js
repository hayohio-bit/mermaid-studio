// 캔버스의 노드·엣지를 mermaid 코드로 역변환한다.
// 원본 유형(sourceType)에 따라 내보내는 문법이 달라지고, 표현할 수 없는 구조가 있으면
// { code, warning } 의 warning으로 알린다. 지원하지 않는 유형은 flowchart로 통일해서 내보낸다.
export function flowToMermaid(nodes, edges, sourceType = 'flowchart') {
  if (sourceType === 'mindmap') return mindmapFromFlow(nodes, edges)
  if (sourceType === 'requirement') return requirementFromFlow(nodes, edges)
  return flowchartFromFlow(nodes, edges)
}

// stateDiagram·classDiagram 등으로 만든 캔버스도 이 함수로 flowchart 형식으로 통일해서 내보낸다.
function flowchartFromFlow(nodes, edges) {
  const lines = ['flowchart LR']

  const groups = nodes.filter((n) => n.type === 'labeledGroup')
  const plainNodes = nodes.filter((n) => n.type !== 'labeledGroup')
  const byId = new Map(plainNodes.map((n) => [n.id, n]))

  // 노드 모양(data.shape)을 mermaid 괄호 문법으로 되살린다
  const wrappers = {
    rect: ['["', '"]'],
    round: ['("', '")'],
    stadium: ['(["', '"])'],
    circle: ['(("', '"))'],
    diamond: ['{"', '"}'],
    hexagon: ['{{"', '"}}'],
    subroutine: ['[["', '"]]'],
    lean_right: ['[/"', '"/]'],
    lean_left: ['[\\"', '"\\]'],
    trapezoid: ['[/"', '"\\]'],
    inv_trapezoid: ['[\\"', '"/]'],
  }

  // 라벨의 큰따옴표는 작은따옴표로 바꾸고, 백슬래시는 mermaid 문법과 충돌하므로 제거한다
  const nodeRef = (n) => {
    const [open, close] = wrappers[n.data?.shape] || wrappers.rect
    const label = (n.data?.label || n.id).replace(/"/g, "'").replace(/\\/g, '')
    return `${n.id}${open}${label}${close}`
  }

  // 노드 정의를 전부 먼저 내보낸다: subgraph 소속 노드는 블록 안에, 나머지는 밖에.
  // 엣지 라인에서는 id만 쓰므로 정의가 중복되지 않는다.
  groups.forEach((g) => {
    const title = (g.data?.label || '').replace(/"/g, "'")
    const gid = g.data?.subgraphId || g.id
    lines.push(title ? `  subgraph ${gid}[${title}]` : `  subgraph ${gid}`)
    plainNodes
      .filter((n) => n.parentId === g.id)
      .forEach((n) => lines.push(`    ${nodeRef(n)}`))
    lines.push('  end')
  })
  plainNodes.filter((n) => !n.parentId).forEach((n) => lines.push(`  ${nodeRef(n)}`))

  // 엣지: 점선·굵은 선은 data.stroke에 보존된 값으로 되살린다
  edges.forEach((e) => {
    if (!byId.has(e.source) || !byId.has(e.target)) return
    const label = e.label ? String(e.label).replace(/\|/g, '/') : ''
    let arrow
    if (e.data?.stroke === 'dotted') {
      // 점선의 라벨은 -. 라벨 .-> 형태가 공식 문법이다
      arrow = label ? `-. ${label} .->` : '-.->'
    } else if (e.data?.stroke === 'thick') {
      arrow = label ? `==>|${label}|` : '==>'
    } else {
      arrow = label ? `-->|${label}|` : '-->'
    }
    lines.push(`  ${e.source} ${arrow} ${e.target}`)
  })

  // 기본값에서 바뀐 노드 스타일은 style 지시문으로 내보낸다.
  // clip-path로 그리는 모양들은 변환기가 회색 배경을 기본으로 주므로 사용자 변경으로 치지 않는다.
  const grayBg = '#e5e7eb'
  const defaultBg = {
    diamond: grayBg,
    hexagon: grayBg,
    lean_right: grayBg,
    lean_left: grayBg,
    trapezoid: grayBg,
    inv_trapezoid: grayBg,
  }
  plainNodes.forEach((n) => {
    const st = n.style || {}
    const parts = []
    const baseBg = defaultBg[n.data?.shape] || '#ffffff'
    if (st.background && st.background !== baseBg) parts.push(`fill:${st.background}`)
    if (st.borderColor && st.borderColor !== '#d1d5db') parts.push(`stroke:${st.borderColor}`)
    if (st.color && st.color !== '#000000') parts.push(`color:${st.color}`)
    if (st.borderWidth && st.borderWidth !== '1px') parts.push(`stroke-width:${st.borderWidth}`)
    if (parts.length) lines.push(`  style ${n.id} ${parts.join(',')}`)
  })

  return { code: lines.join('\n'), warning: null }
}

// ---- mindmap ----

// MindmapDB.nodeType의 번호와 mermaid 괄호 문법의 대응.
// 0(DEFAULT)은 괄호 없이 텍스트만 쓰는 형태라 여기에 넣지 않는다.
export const MINDMAP_WRAPPERS = {
  1: ['(', ')'], // ROUNDED_RECT
  2: ['[', ']'], // RECT
  3: ['((', '))'], // CIRCLE
  4: [')', '('], // CLOUD
  5: ['))', '(('], // BANG
  6: ['{{', '}}'], // HEXAGON
}

// 캔버스에서 모양을 바꿨을 때 어떤 mindmap 유형으로 내보낼지 정하는 대응표.
// mindmapSvgToFlow가 유형마다 붙이는 모양과 짝을 이룬다.
export const SHAPE_TO_MINDMAP_TYPE = {
  rect: 2,
  round: 1,
  stadium: 4,
  circle: 3,
  hexagon: 6,
}
export const MINDMAP_TYPE_TO_SHAPE = {
  0: 'rect',
  1: 'round',
  2: 'rect',
  3: 'circle',
  4: 'stadium',
  5: 'hexagon',
  6: 'hexagon',
}

// mindmap은 트리 하나만 표현할 수 있으므로, 엣지에서 부모-자식 관계를 세운 다음
// 가장 큰 트리 하나를 깊이 우선으로 순회하며 들여쓰기로 내보낸다.
function mindmapFromFlow(nodes, edges) {
  const plainNodes = nodes.filter((n) => n.type !== 'labeledGroup')
  if (plainNodes.length === 0) return { code: 'mindmap', warning: null }

  const byId = new Map(plainNodes.map((n) => [n.id, n]))
  const childrenOf = new Map(plainNodes.map((n) => [n.id, []]))
  const indegree = new Map(plainNodes.map((n) => [n.id, 0]))
  let droppedEdges = 0

  edges.forEach((e) => {
    if (!byId.has(e.source) || !byId.has(e.target)) return
    // 이미 부모가 있는 노드에 또 연결된 엣지는 트리로 표현할 수 없으므로 버린다
    if (indegree.get(e.target) > 0 || e.source === e.target) {
      droppedEdges += 1
      return
    }
    childrenOf.get(e.source).push(e.target)
    indegree.set(e.target, indegree.get(e.target) + 1)
  })

  // 루트 후보는 들어오는 엣지가 없는 노드다. 여러 개면 자손이 가장 많은 것을 루트로 삼는다.
  const roots = plainNodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id)
  const subtreeSize = (id, seen = new Set()) => {
    if (seen.has(id)) return 0
    seen.add(id)
    return 1 + childrenOf.get(id).reduce((sum, c) => sum + subtreeSize(c, seen), 0)
  }
  const root = roots.length
    ? roots.reduce((best, id) => (subtreeSize(id) > subtreeSize(best) ? id : best))
    : plainNodes[0].id

  const lines = ['mindmap']
  const visited = new Set()
  const emit = (id, depth) => {
    if (visited.has(id)) return
    visited.add(id)
    const n = byId.get(id)
    const label = String(n.data?.label ?? id).replace(/[()[\]{}\n]/g, ' ').trim() || id
    // 저장된 유형을 기본으로 쓰되, 캔버스에서 모양을 바꿨으면 바뀐 모양을 따른다
    const stored = n.data?.mindmapType
    const shape = n.data?.shape
    const changedShape = shape && stored !== undefined && MINDMAP_TYPE_TO_SHAPE[stored] !== shape
    const type = changedShape
      ? SHAPE_TO_MINDMAP_TYPE[shape] ?? 2
      : stored ?? SHAPE_TO_MINDMAP_TYPE[shape] ?? 0
    const wrapper = MINDMAP_WRAPPERS[type]
    const indent = '  '.repeat(depth + 1)
    if (!wrapper) {
      // 유형 0은 텍스트만 쓰는 형태라 노드 id 없이 라벨만 내보낸다
      lines.push(`${indent}${label}`)
    } else {
      const nodeId = String(n.data?.nodeId || id).replace(/[()[\]{}\s]/g, '')
      lines.push(`${indent}${nodeId}${wrapper[0]}${label}${wrapper[1]}`)
    }
    childrenOf.get(id).forEach((c) => emit(c, depth + 1))
  }
  emit(root, 0)

  const orphans = plainNodes.length - visited.size
  const notes = []
  if (orphans > 0) notes.push(`트리에 연결되지 않은 노드 ${orphans}개`)
  if (droppedEdges > 0) notes.push(`부모가 둘 이상이 되는 엣지 ${droppedEdges}개`)

  return {
    code: lines.join('\n'),
    warning: notes.length
      ? `mindmap은 트리 하나만 표현할 수 있어서 ${notes.join('와 ')}는 코드에서 제외했습니다.`
      : null,
  }
}

// ---- requirementDiagram ----

const REQUIREMENT_TYPE_KEYWORD = {
  Requirement: 'requirement',
  'Functional Requirement': 'functionalRequirement',
  'Interface Requirement': 'interfaceRequirement',
  'Performance Requirement': 'performanceRequirement',
  'Physical Requirement': 'physicalRequirement',
  'Design Constraint': 'designConstraint',
}
const RISKS = ['low', 'medium', 'high']
const VERIFY_METHODS = ['analysis', 'demonstration', 'inspection', 'test']
export const RELATIONSHIP_TYPES = [
  'contains', 'copies', 'derives', 'satisfies', 'verifies', 'refines', 'traces',
]

// requirementDiagram의 이름·값 토큰은 ASCII 단어만 따옴표 없이 쓸 수 있다.
// 공백이나 한글이 들어가면 파서가 거부하므로 그럴 때만 따옴표로 감싼다.
function reqToken(value) {
  const text = String(value).replace(/["\n]/g, ' ').trim()
  return /^[A-Za-z0-9_.]+$/.test(text) ? text : `"${text}"`
}

// 노드 라벨은 requirementSvgToFlow가 만든 "키: 값" 여러 줄이다.
// 라벨을 그대로 다시 읽어서 내보내므로, 캔버스에서 라벨을 고치면 코드에도 반영된다.
function parseRequirementLabel(label) {
  const fields = {}
  let header = null
  String(label || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const headerMatch = line.match(/^<<(.+)>>$/)
      if (headerMatch) {
        header = headerMatch[1].trim()
        return
      }
      const fieldMatch = line.match(/^([^:]+):\s*(.*)$/)
      if (fieldMatch) fields[fieldMatch[1].trim().toLowerCase()] = fieldMatch[2].trim()
    })
  return { header, fields }
}

function requirementFromFlow(nodes, edges) {
  const plainNodes = nodes.filter((n) => n.type !== 'labeledGroup')
  const byId = new Map(plainNodes.map((n) => [n.id, n]))
  const lines = ['requirementDiagram', '']
  const invalidValues = []

  plainNodes.forEach((n) => {
    const { header, fields } = parseRequirementLabel(n.data?.label)
    const isElement = header === 'Element' || (!header && n.data?.reqKind === 'element')
    const name = reqToken(n.id)

    if (isElement) {
      lines.push(`element ${name} {`)
      if (fields.type) lines.push(`  type: ${reqToken(fields.type)}`)
      if (fields['doc ref']) lines.push(`  docref: ${reqToken(fields['doc ref'])}`)
      lines.push('}', '')
      return
    }

    const keyword = REQUIREMENT_TYPE_KEYWORD[header] || 'requirement'
    lines.push(`${keyword} ${name} {`)
    if (fields.id) lines.push(`  id: ${reqToken(fields.id)}`)
    if (fields.text) lines.push(`  text: ${reqToken(fields.text)}`)
    const risk = fields.risk?.toLowerCase()
    if (risk) {
      if (RISKS.includes(risk)) lines.push(`  risk: ${risk}`)
      else invalidValues.push(`${n.id}의 risk "${fields.risk}"`)
    }
    const verify = fields.verification?.toLowerCase()
    if (verify) {
      if (VERIFY_METHODS.includes(verify)) lines.push(`  verifymethod: ${verify}`)
      else invalidValues.push(`${n.id}의 verifymethod "${fields.verification}"`)
    }
    lines.push('}', '')
  })

  edges.forEach((e) => {
    if (!byId.has(e.source) || !byId.has(e.target)) return
    const raw = String(e.data?.relType || e.label || '').trim().toLowerCase()
    const type = RELATIONSHIP_TYPES.includes(raw) ? raw : 'traces'
    if (!RELATIONSHIP_TYPES.includes(raw)) {
      invalidValues.push(`${e.source} → ${e.target} 관계 "${e.label || ''}"`)
    }
    lines.push(`${reqToken(e.source)} - ${type} -> ${reqToken(e.target)}`)
  })

  return {
    code: lines.join('\n').trim(),
    warning: invalidValues.length
      ? `requirementDiagram이 허용하지 않는 값이 있어 제외하거나 traces로 대체했습니다: ${invalidValues.join(', ')}.`
      : null,
  }
}
