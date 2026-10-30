// mermaid가 그린 SVG와 파서 DB를 React Flow 노드·엣지로 바꾸는 변환기 모음.
// 노드 위치는 SVG 요소의 getBoundingClientRect에서, 엣지·관계는 파서 DB에서 가져온다.
import { MarkerType } from '@xyflow/react'
import { MINDMAP_TYPE_TO_SHAPE } from './flowToMermaid'

// 엣지 라벨의 공통 표시 속성. 라벨은 흰 배경 위에 그리므로 글자색도 함께 고정한다 —
// 글자색을 지정하지 않으면 캔버스 다크 모드에서 React Flow가 글자를 밝은 색으로 바꿔
// 흰 배경과 구분되지 않는다.
export const edgeLabelProps = {
  labelStyle: { fontSize: '12px', fill: '#111827' },
  labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9 },
  labelBgPadding: [4, 2],
  labelBgBorderRadius: 4,
}

// mermaid는 svg에 width="100%"와 max-width를 붙이므로, 숨김 렌더링 영역의 폭에 맞춰
// 축소된 크기로 그려진다. 변환기들은 getBoundingClientRect로 노드 위치를 읽기 때문에
// 축소된 채로 두면 노드 사이 간격만 줄고 캔버스의 노드 크기는 그대로여서 서로 겹친다.
// viewBox에 적힌 원래 크기로 고정해 1:1 배율로 그리게 만든다.
export function unscaleSvg(svgEl) {
  const box = svgEl?.viewBox?.baseVal
  if (!box || !box.width || !box.height) return
  svgEl.setAttribute('width', box.width)
  svgEl.setAttribute('height', box.height)
  svgEl.style.maxWidth = 'none'
}

// mermaid SVG의 도형 요소로 노드 모양을 판별한다.
// 도형 본체는 label-container 클래스가 붙은 요소이고, 라벨 배경용 민무늬 rect가 따로 있으므로
// rect는 반드시 label-container만 검사한다. 스타디움은 rect가 아니라 path로 그려진다.
function detectShape(el) {
  if (el.querySelector('polygon')) return 'diamond' // {마름모}
  if (el.querySelector('circle')) return 'circle' // ((원))
  const rect = el.querySelector('rect.label-container, rect.basic')
  if (rect) {
    const rx = parseFloat(rect.getAttribute('rx') || '0')
    return rx > 0 ? 'round' : 'rect' // (둥근 사각형) / [사각형]
  }
  if (el.querySelector('path')) return 'stadium' // ([스타디움])
  return 'rect'
}

// 파서 DB의 vertex type → 캔버스 shape 매핑.
// cylinder·ellipse·doublecircle 등 표현이 어려운 모양은 가장 가까운 모양으로 근사한다.
const vertexTypeToShape = {
  square: 'rect',
  round: 'round',
  stadium: 'stadium',
  circle: 'circle',
  doublecircle: 'circle',
  ellipse: 'circle',
  diamond: 'diamond',
  hexagon: 'hexagon',
  subroutine: 'subroutine',
  cylinder: 'round',
  lean_right: 'lean_right',
  lean_left: 'lean_left',
  trapezoid: 'trapezoid',
  inv_trapezoid: 'inv_trapezoid',
  odd: 'rect',
}

// 모양별 노드 스타일. 마름모는 CSS 테두리로 표현할 수 없어 clip-path를 쓰고 테두리를 생략한다
export function shapeStyle(shape) {
  const base = {
    background: '#ffffff',
    color: '#000000', // 캔버스 다크 모드에서 글자가 밝은 색으로 바뀌지 않게 명시한다
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    padding: '8px 16px',
    fontSize: '14px',
  }
  switch (shape) {
    case 'round':
      return { ...base, borderRadius: '12px' }
    case 'stadium':
      return { ...base, borderRadius: '9999px', padding: '8px 20px' }
    case 'circle':
      return { ...base, borderRadius: '50%', padding: '18px' }
    case 'diamond':
      return {
        ...base,
        border: 'none',
        borderRadius: 0,
        padding: '22px 30px',
        background: '#e5e7eb',
        clipPath: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
      }
    case 'hexagon':
      return {
        ...base,
        border: 'none',
        borderRadius: 0,
        padding: '12px 28px',
        background: '#e5e7eb',
        clipPath: 'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)',
      }
    case 'subroutine':
      return {
        ...base,
        borderLeft: '4px double #d1d5db',
        borderRight: '4px double #d1d5db',
        borderRadius: 0,
      }
    case 'lean_right':
      return {
        ...base,
        border: 'none',
        borderRadius: 0,
        padding: '10px 26px',
        background: '#e5e7eb',
        clipPath: 'polygon(15% 0, 100% 0, 85% 100%, 0 100%)',
      }
    case 'lean_left':
      return {
        ...base,
        border: 'none',
        borderRadius: 0,
        padding: '10px 26px',
        background: '#e5e7eb',
        clipPath: 'polygon(0 0, 85% 0, 100% 100%, 15% 100%)',
      }
    case 'trapezoid':
      return {
        ...base,
        border: 'none',
        borderRadius: 0,
        padding: '10px 26px',
        background: '#e5e7eb',
        clipPath: 'polygon(15% 0, 85% 0, 100% 100%, 0 100%)',
      }
    case 'inv_trapezoid':
      return {
        ...base,
        border: 'none',
        borderRadius: 0,
        padding: '10px 26px',
        background: '#e5e7eb',
        clipPath: 'polygon(0 0, 100% 0, 85% 100%, 15% 100%)',
      }
    default:
      return base
  }
}

const GROUP_PREFIX = 'sub-'

// 숨김 렌더링에 쓰는 mermaid 렌더 id. mermaid 11.17부터 SVG 요소 id 앞에 `<렌더 id>-`가 붙는다
// (예: flowchart-A-0 → mermaid-diagram-flowchart-A-0, 클러스터 S → mermaid-diagram-S).
// 변환기는 두 형식을 모두 받아들인다.
export const RENDER_ID = 'mermaid-diagram'

// SVG 노드 id(<유형>-<노드id>-<일련번호>)에서 노드 id를 떼어낸다. 노드 id에 하이픈이 들어갈 수 있으므로
// 탐욕적 매칭으로 마지막 -숫자만 일련번호로 본다. 형식이 다르면 렌더 id 접두어만 뗀 값을 그대로 쓴다.
function svgNodeId(id, type) {
  const rawId = id.startsWith(`${RENDER_ID}-`) ? id.slice(RENDER_ID.length + 1) : id
  return rawId.match(new RegExp(`^${type}-(.+)-\\d+$`))?.[1] ?? rawId
}

// id로 요소를 찾는다. 접두어가 있는 형식과 없는 형식을 한 번에 조회한다
function queryById(svgEl, id, selector = '') {
  const byId = (value) => `${selector}[id="${CSS.escape(value)}"]`
  return svgEl.querySelector(`${byId(id)}, ${byId(`${RENDER_ID}-${id}`)}`)
}

export function svgToFlow(svgEl, dbEdges, subGraphs = [], vertices = null) {
  const nodes = []
  const svgRect = svgEl.getBoundingClientRect()

  // subgraph는 SVG의 .cluster 요소(위치·크기)와 파서 DB(소속 노드 목록)를 합쳐
  // React Flow 그룹 노드로 만든다. 부모가 배열에서 자식보다 앞에 있어야 한다.
  const parentOf = new Map() // 노드 id → 그룹 노드 id
  const groupRects = new Map() // 그룹 노드 id → 절대 위치
  subGraphs.forEach((sg) => {
    const clusterEl = queryById(svgEl, sg.id, '.cluster')
    if (!clusterEl) return
    const rect = clusterEl.getBoundingClientRect()
    const groupId = `${GROUP_PREFIX}${sg.id}`
    const pos = { x: rect.left - svgRect.left, y: rect.top - svgRect.top }
    groupRects.set(groupId, pos)
    sg.nodes.forEach((n) => parentOf.set(n, groupId))
    nodes.push({
      id: groupId,
      type: 'labeledGroup',
      position: pos,
      data: { label: sg.title || sg.id, subgraphId: sg.id },
      style: { width: Math.ceil(rect.width), height: Math.ceil(rect.height) },
    })
  })

  const nodeEls = svgEl.querySelectorAll('.node')
  nodeEls.forEach((el) => {
    const rect = el.getBoundingClientRect()
    const nodeId = svgNodeId(el.id, 'flowchart')
    const label =
      el.querySelector('span')?.textContent ||
      el.querySelector('text')?.textContent ||
      nodeId
    // 모양은 파서 DB의 vertex type이 정확하다. 없을 때만 SVG 도형으로 추정한다.
    const vertexType = vertices?.get(nodeId)?.type
    const shape = (vertexType && vertexTypeToShape[vertexType]) || detectShape(el)

    const parentId = parentOf.get(nodeId)
    const abs = { x: rect.left - svgRect.left, y: rect.top - svgRect.top }
    // 자식 노드의 position은 부모 그룹 기준 상대 좌표여야 한다
    const origin = parentId ? groupRects.get(parentId) : null
    nodes.push({
      id: nodeId,
      position: origin ? { x: abs.x - origin.x, y: abs.y - origin.y } : abs,
      ...(parentId ? { parentId, extent: 'parent' } : {}),
      data: { label: label.trim(), shape },
      style: shapeStyle(shape),
    })
  })

  // 엣지는 SVG id를 파싱하는 대신 파서 DB에서 가져온다.
  // id에 언더스코어·하이픈이 있어도 안전하고, 라벨도 인덱스 대응 없이 정확하다.
  const edges = dbEdges.map((e, i) => ({
    id: `e-${e.start}-${e.end}-${i}`,
    source: e.start,
    target: e.end,
    label: e.text || undefined,
    // 점선(-.->)·굵은 선(==>)을 캔버스에도 반영하고, 역변환을 위해 data에 보존한다
    data: { stroke: e.stroke },
    // 라벨이 있는 엣지는 노드 레이어(z-index 0) 위로 올려서 라벨이 노드에 가려지지 않게 한다
    zIndex: e.text ? 1 : 0,
    style: {
      stroke: '#9ca3af',
      strokeWidth: e.stroke === 'thick' ? 3 : 1.5,
      ...(e.stroke === 'dotted' ? { strokeDasharray: '5 5' } : {}),
    },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#9ca3af' },
    ...edgeLabelProps,
  }))

  return { nodes, edges }
}

// stateDiagram SVG의 엣지 id(edge0 등)에는 출발·도착 정보가 없어서,
// 노드 위치는 SVG에서 읽고 엣지는 파서 DB의 relations에서 가져온다
export function stateSvgToFlow(svgEl, relations) {
  const nodes = []
  const svgRect = svgEl.getBoundingClientRect()
  const svgIds = new Set()

  svgEl.querySelectorAll('.node').forEach((el) => {
    const rect = el.getBoundingClientRect()
    const nodeId = svgNodeId(el.id, 'state')
    svgIds.add(nodeId)
    const label = el.querySelector('.nodeLabel')?.textContent.trim() || ''
    const isMarker = !label // [*] 시작·종료 노드는 라벨이 없는 원으로 렌더링된다

    nodes.push({
      id: nodeId,
      position: {
        x: rect.left - svgRect.left,
        y: rect.top - svgRect.top,
      },
      data: { label: isMarker ? '●' : label },
      style: isMarker
        ? {
            background: '#111827',
            color: '#111827',
            border: 'none',
            borderRadius: '50%',
            width: '24px',
            height: '24px',
            padding: '0',
            fontSize: '10px',
          }
        : {
            background: '#ffffff',
            color: '#000000',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '14px',
          },
    })
  })

  // DB는 시작·종료 노드를 start1·end1처럼 부르지만 SVG id는 root_start·root_end 형태라서 맞춰준다
  const toSvgId = (dbId) => {
    if (svgIds.has(dbId)) return dbId
    const m = dbId.match(/^(start|end)\d+$/)
    if (m) {
      const candidate = [...svgIds].find((id) => id.endsWith(`_${m[1]}`) || id === m[1])
      if (candidate) return candidate
    }
    return dbId
  }

  const edges = relations.map((r, i) => ({
    id: `e-${r.id1}-${r.id2}-${i}`,
    source: toSvgId(r.id1),
    target: toSvgId(r.id2),
    label: r.relationTitle || undefined,
    zIndex: r.relationTitle ? 1 : 0,
    style: { stroke: '#9ca3af', strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#9ca3af' },
    ...edgeLabelProps,
  }))

  return { nodes, edges }
}

// classDiagram: 노드 위치·멤버 목록은 SVG에서, 관계는 파서 DB에서 가져온다.
// 관계의 type1이 'none'이 아니면 화살촉이 id1 쪽이므로 흐름은 id2 → id1이다.
export function classSvgToFlow(svgEl, relations) {
  const nodes = []
  const svgRect = svgEl.getBoundingClientRect()

  svgEl.querySelectorAll('.node').forEach((el) => {
    const rect = el.getBoundingClientRect()
    const nodeId = svgNodeId(el.id, 'classId')
    const memberLines = [...el.querySelectorAll('.nodeLabel')]
      .map((t) => t.textContent.trim())
      .filter(Boolean)
    nodes.push({
      id: nodeId,
      position: { x: rect.left - svgRect.left, y: rect.top - svgRect.top },
      data: { label: memberLines.join('\n') || nodeId, shape: 'rect' },
      style: {
        ...shapeStyle('rect'),
        whiteSpace: 'pre-line',
        textAlign: 'left',
        fontSize: '13px',
      },
    })
  })

  const edges = relations.map((r, i) => {
    const arrowAt1 = r.relation?.type1 !== 'none' && r.relation?.type1 !== undefined
    const label = r.title && r.title !== 'none' ? r.title : undefined
    const dotted = r.relation?.lineType === 1
    return {
      id: `e-${r.id1}-${r.id2}-${i}`,
      source: arrowAt1 ? r.id2 : r.id1,
      target: arrowAt1 ? r.id1 : r.id2,
      label,
      data: { stroke: dotted ? 'dotted' : 'normal' },
      zIndex: label ? 1 : 0,
      style: {
        stroke: '#9ca3af',
        strokeWidth: 1.5,
        ...(dotted ? { strokeDasharray: '5 5' } : {}),
      },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#9ca3af' },
      ...edgeLabelProps,
    }
  })

  return { nodes, edges }
}

// erDiagram: 엔티티는 SVG에서, 관계는 파서 DB에서 가져온다.
// 관계의 entityA·entityB는 SVG id(entity-<이름>-<번호>)와 같은 형식이라 이름만 추출해 맞춘다.
export function erSvgToFlow(svgEl, relationships) {
  const nodes = []
  const svgRect = svgEl.getBoundingClientRect()
  const entityName = (id) => svgNodeId(id, 'entity')

  svgEl.querySelectorAll('.node').forEach((el) => {
    const rect = el.getBoundingClientRect()
    const nodeId = entityName(el.id)
    const lines = [...el.querySelectorAll('.nodeLabel')]
      .map((t) => t.textContent.trim())
      .filter(Boolean)
    nodes.push({
      id: nodeId,
      position: { x: rect.left - svgRect.left, y: rect.top - svgRect.top },
      data: { label: lines.join('\n') || nodeId, shape: 'rect' },
      style: {
        ...shapeStyle('rect'),
        whiteSpace: 'pre-line',
        textAlign: 'left',
        fontSize: '13px',
      },
    })
  })

  const edges = relationships.map((r, i) => {
    const dotted = r.relSpec?.relType === 'NON_IDENTIFYING'
    const label = r.roleA || undefined
    return {
      id: `e-er-${i}`,
      source: entityName(r.entityA),
      target: entityName(r.entityB),
      label,
      data: { stroke: dotted ? 'dotted' : 'normal' },
      zIndex: label ? 1 : 0,
      style: {
        stroke: '#9ca3af',
        strokeWidth: 1.5,
        ...(dotted ? { strokeDasharray: '5 5' } : {}),
      },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#9ca3af' },
      ...edgeLabelProps,
    }
  })

  return { nodes, edges }
}

// sequenceDiagram: 참가자를 노드로, 메시지를 순번 라벨 엣지로 근사 변환한다.
// 시간 축(라이프라인)은 캔버스 모델에 없으므로 메시지 순서는 라벨의 번호로 표현한다.
export function sequenceSvgToFlow(svgEl, actors, messages) {
  const svgRect = svgEl.getBoundingClientRect()
  const actorIds = new Set(actors.keys())

  // 원본 SVG의 참가자 순서는 유지하되 가로 위치는 다시 계산한다. SVG의 참가자 간격은
  // 라이프라인 사이의 최소 간격이라 좁아서, 그대로 옮기면 순번이 붙은 메시지 라벨이
  // 양옆 노드를 가린다. 노드 폭도 원본 참가자 박스에 맞춰 라벨 길이에 따라 넓어지지 않게 한다.
  const SEQ_GAP = 180
  const placed = [...actors.entries()].map(([id, actor], i) => {
    const rectEl = svgEl.querySelector(`.actor-top[name="${CSS.escape(id)}"]`)
    const rect = rectEl?.getBoundingClientRect()
    return {
      id,
      actor,
      order: rect ? rect.left - svgRect.left : i * 220,
      width: rect?.width,
    }
  })
  placed.sort((a, b) => a.order - b.order)

  let cursor = 0
  const nodes = placed.map(({ id, actor, width }) => {
    const node = {
      id,
      position: { x: cursor, y: 0 },
      data: { label: actor.description || actor.name || id, shape: 'rect' },
      style: width
        ? { ...shapeStyle('rect'), width, textAlign: 'center' }
        : shapeStyle('rect'),
    }
    cursor += (width || 150) + SEQ_GAP
    return node
  })

  const edges = messages
    .filter((m) => actorIds.has(m.from) && actorIds.has(m.to) && typeof m.message === 'string')
    .map((m, i) => {
      const dotted = m.type === 1 // -->> 응답 계열은 점선
      const label = `${i + 1}. ${m.message}`
      return {
        id: `e-seq-${i}`,
        source: m.from,
        target: m.to,
        label,
        data: { stroke: dotted ? 'dotted' : 'normal' },
        zIndex: 1,
        style: {
          stroke: '#9ca3af',
          strokeWidth: 1.5,
          ...(dotted ? { strokeDasharray: '5 5' } : {}),
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#9ca3af' },
        ...edgeLabelProps,
      }
    })

  return { nodes, edges }
}

// mindmap: 트리 구조는 파서 DB의 getMindmap()에서, 노드 위치는 SVG에서 가져온다.
// SVG 노드 id는 파서가 매긴 일련번호를 붙인 node_<번호> 형식이다(실측으로 확인).
export function mindmapSvgToFlow(svgEl, root) {
  const nodes = []
  const edges = []
  const svgRect = svgEl.getBoundingClientRect()
  const usedIds = new Set()

  const walk = (mmNode, parentId) => {
    const el = queryById(svgEl, `node_${mmNode.id}`)
    const rect = el?.getBoundingClientRect()
    // 같은 이름의 노드가 여러 개면 id가 겹쳐 React Flow에서 노드가 사라지므로
    // 파서의 일련번호를 붙여 고유하게 만든다
    let id = String(mmNode.nodeId || `node_${mmNode.id}`)
    if (usedIds.has(id)) id = `${id}_${mmNode.id}`
    usedIds.add(id)
    const shape = MINDMAP_TYPE_TO_SHAPE[mmNode.type] || 'rect'
    nodes.push({
      id,
      position: rect
        ? { x: rect.left - svgRect.left, y: rect.top - svgRect.top }
        : { x: mmNode.x ?? 0, y: mmNode.y ?? 0 },
      // mindmapType은 역변환에서 원래 괄호 문법을 되살리는 데 쓴다
      data: { label: mmNode.descr || id, shape, mindmapType: mmNode.type, nodeId: mmNode.nodeId },
      style: shapeStyle(shape),
    })
    if (parentId) {
      // mindmap의 연결선에는 방향이 없으므로 화살촉을 붙이지 않는다
      edges.push({
        id: `e-mm-${parentId}-${id}`,
        source: parentId,
        target: id,
        zIndex: 0,
        style: { stroke: '#9ca3af', strokeWidth: 1.5 },
      })
    }
    mmNode.children.forEach((child) => walk(child, id))
  }

  if (root) walk(root, null)
  return { nodes, edges }
}

// requirementDiagram: 요구사항·요소의 속성은 파서 DB에서 읽어 여러 줄 라벨로 만들고,
// 위치는 SVG에서 가져온다(SVG 노드 id가 곧 요구사항·요소 이름이다).
// 라벨 형식은 flowToMermaid가 그대로 다시 읽으므로, 라벨을 고치면 코드에도 반영된다.
export function requirementSvgToFlow(svgEl, requirements, elements, relationships) {
  const svgRect = svgEl.getBoundingClientRect()
  const nodes = []

  const positionOf = (name) => {
    const el = queryById(svgEl, name, '.node')
    const rect = el?.getBoundingClientRect()
    return rect ? { x: rect.left - svgRect.left, y: rect.top - svgRect.top } : { x: 0, y: 0 }
  }
  const labelStyle = {
    ...shapeStyle('rect'),
    whiteSpace: 'pre-line',
    textAlign: 'left',
    fontSize: '13px',
  }

  requirements.forEach((req, name) => {
    const lines = [`<<${req.type}>>`, name]
    if (req.requirementId) lines.push(`ID: ${req.requirementId}`)
    if (req.text) lines.push(`Text: ${req.text}`)
    if (req.risk) lines.push(`Risk: ${req.risk}`)
    if (req.verifyMethod) lines.push(`Verification: ${req.verifyMethod}`)
    nodes.push({
      id: name,
      position: positionOf(name),
      data: { label: lines.join('\n'), shape: 'rect', reqKind: 'requirement' },
      style: labelStyle,
    })
  })

  elements.forEach((el, name) => {
    const lines = ['<<Element>>', name]
    if (el.type) lines.push(`Type: ${el.type}`)
    if (el.docRef) lines.push(`Doc Ref: ${el.docRef}`)
    nodes.push({
      id: name,
      position: positionOf(name),
      data: { label: lines.join('\n'), shape: 'rect', reqKind: 'element' },
      style: labelStyle,
    })
  })

  const ids = new Set(nodes.map((n) => n.id))
  const edges = relationships
    .filter((r) => ids.has(r.src) && ids.has(r.dst))
    .map((r, i) => ({
      id: `e-req-${i}`,
      source: r.src,
      target: r.dst,
      label: r.type,
      // 역변환에서 관계 종류를 그대로 되살리기 위해 보존한다
      data: { relType: r.type, stroke: 'normal' },
      zIndex: 1,
      style: { stroke: '#9ca3af', strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#9ca3af' },
      ...edgeLabelProps,
    }))

  return { nodes, edges }
}
