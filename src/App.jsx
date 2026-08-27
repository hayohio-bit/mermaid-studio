import { useRef, useState, useCallback, useEffect } from 'react'
import { toPng, toSvg } from 'html-to-image'
import {
  ReactFlow, Background, Controls, MiniMap, ReactFlowProvider,
  applyNodeChanges, applyEdgeChanges, addEdge, reconnectEdge, MarkerType, useReactFlow
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import mermaid from 'mermaid'
import { flowToMermaid } from './flowToMermaid'

mermaid.initialize({ startOnLoad: false })

const defaultCode = `flowchart LR
  A[시작] --> B[처리] --> C[끝]`

const STORAGE_KEY = 'mermaid-studio'
const THEME_KEY = 'mermaid-studio-theme'
const VIEW_KEY = 'mermaid-studio-view'

// 패널·사이드바에 쓰는 중립 색상 테마. 노드·엣지 색은 사용자 콘텐츠라 바꾸지 않는다.
const themes = {
  light: {
    panelBg: '#fafafa',
    border: '#e5e5e5',
    text: '#374151',
    subText: '#6b7280',
    inputBg: '#ffffff',
    syntax: {
      keyword: '#7c3aed',
      label: '#0f766e',
      string: '#b45309',
      arrow: '#dc2626',
      comment: '#9ca3af',
    },
  },
  dark: {
    panelBg: '#1f2937',
    border: '#374151',
    text: '#e5e7eb',
    subText: '#9ca3af',
    inputBg: '#111827',
    syntax: {
      keyword: '#c4b5fd',
      label: '#5eead4',
      string: '#fcd34d',
      arrow: '#fca5a5',
      comment: '#6b7280',
    },
  },
}

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

// 캔버스 보조 UI(미니맵·컨트롤·격자)의 표시 여부. 저장된 값이 없으면 셋 다 켠 상태로 시작한다.
const defaultView = { miniMap: true, controls: true, background: true }

function loadView() {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_KEY))
    return saved ? { ...defaultView, ...saved } : defaultView
  } catch {
    return defaultView
  }
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
function shapeStyle(shape) {
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

function svgToFlow(svgEl, dbEdges, subGraphs = [], vertices = null) {
  const nodes = []
  const svgRect = svgEl.getBoundingClientRect()

  // subgraph는 SVG의 .cluster 요소(위치·크기)와 파서 DB(소속 노드 목록)를 합쳐
  // React Flow 그룹 노드로 만든다. 부모가 배열에서 자식보다 앞에 있어야 한다.
  const parentOf = new Map() // 노드 id → 그룹 노드 id
  const groupRects = new Map() // 그룹 노드 id → 절대 위치
  subGraphs.forEach((sg) => {
    const clusterEl = svgEl.querySelector(`.cluster[id="${CSS.escape(sg.id)}"]`)
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
    const label =
      el.querySelector('span')?.textContent ||
      el.querySelector('text')?.textContent ||
      el.id
    // SVG id 형식은 flowchart-<노드id>-<일련번호>. 노드 id에 하이픈이 들어갈 수 있으므로
    // 탐욕적 매칭으로 마지막 -숫자만 일련번호로 떼어낸다.
    const rawId = el.id
    const idMatch = rawId.match(/^flowchart-(.+)-\d+$/)
    const nodeId = idMatch ? idMatch[1] : rawId
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
    labelStyle: { fontSize: '12px' },
    labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9 },
    labelBgPadding: [4, 2],
    labelBgBorderRadius: 4,
  }))

  return { nodes, edges }
}

// stateDiagram SVG의 엣지 id(edge0 등)에는 출발·도착 정보가 없어서,
// 노드 위치는 SVG에서 읽고 엣지는 파서 DB의 relations에서 가져온다
function stateSvgToFlow(svgEl, relations) {
  const nodes = []
  const svgRect = svgEl.getBoundingClientRect()
  const svgIds = new Set()

  svgEl.querySelectorAll('.node').forEach((el) => {
    const rect = el.getBoundingClientRect()
    const idMatch = el.id.match(/^state-(.+)-\d+$/)
    const nodeId = idMatch ? idMatch[1] : el.id
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
    labelStyle: { fontSize: '12px' },
    labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9 },
    labelBgPadding: [4, 2],
    labelBgBorderRadius: 4,
  }))

  return { nodes, edges }
}

// classDiagram: 노드 위치·멤버 목록은 SVG에서, 관계는 파서 DB에서 가져온다.
// 관계의 type1이 'none'이 아니면 화살촉이 id1 쪽이므로 흐름은 id2 → id1이다.
function classSvgToFlow(svgEl, relations) {
  const nodes = []
  const svgRect = svgEl.getBoundingClientRect()

  svgEl.querySelectorAll('.node').forEach((el) => {
    const rect = el.getBoundingClientRect()
    const idMatch = el.id.match(/^classId-(.+)-\d+$/)
    const nodeId = idMatch ? idMatch[1] : el.id
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
      labelStyle: { fontSize: '12px' },
      labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9 },
      labelBgPadding: [4, 2],
      labelBgBorderRadius: 4,
    }
  })

  return { nodes, edges }
}

// erDiagram: 엔티티는 SVG에서, 관계는 파서 DB에서 가져온다.
// 관계의 entityA·entityB는 SVG id(entity-<이름>-<번호>)와 같은 형식이라 이름만 추출해 맞춘다.
function erSvgToFlow(svgEl, relationships) {
  const nodes = []
  const svgRect = svgEl.getBoundingClientRect()
  const entityName = (rawId) => rawId.match(/^entity-(.+)-\d+$/)?.[1] ?? rawId

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
      labelStyle: { fontSize: '12px' },
      labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9 },
      labelBgPadding: [4, 2],
      labelBgBorderRadius: 4,
    }
  })

  return { nodes, edges }
}

// sequenceDiagram: 참가자를 노드로, 메시지를 순번 라벨 엣지로 근사 변환한다.
// 시간 축(라이프라인)은 캔버스 모델에 없으므로 메시지 순서는 라벨의 번호로 표현한다.
function sequenceSvgToFlow(svgEl, actors, messages) {
  const svgRect = svgEl.getBoundingClientRect()
  const actorIds = new Set(actors.keys())

  const nodes = [...actors.entries()].map(([id, actor], i) => {
    const rectEl = svgEl.querySelector(`.actor-top[name="${CSS.escape(id)}"]`)
    const rect = rectEl?.getBoundingClientRect()
    return {
      id,
      position: rect
        ? { x: rect.left - svgRect.left, y: rect.top - svgRect.top }
        : { x: i * 220, y: 0 },
      data: { label: actor.description || actor.name || id, shape: 'rect' },
      style: shapeStyle('rect'),
    }
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
        labelStyle: { fontSize: '12px' },
        labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9 },
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 4,
      }
    })

  return { nodes, edges }
}

// subgraph를 표현하는 그룹 노드: 좌상단에 제목을 표시하는 반투명 컨테이너
function GroupNode({ data }) {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      border: '1px dashed #9ca3af',
      borderRadius: '8px',
      background: 'rgba(156, 163, 175, 0.08)',
    }}>
      <div style={{
        padding: '4px 10px',
        fontSize: '12px',
        fontWeight: 600,
        color: '#6b7280',
      }}>
        {data.label}
      </div>
    </div>
  )
}

// 매 렌더마다 객체가 새로 만들어지지 않도록 컴포넌트 밖 상수로 둔다
const nodeTypes = { labeledGroup: GroupNode }

// 사이드패널 컴포넌트
function SidePanel({ node, onChange, onClose, onDelete, T }) {
  if (!node) return null

  const style = node.style || {}

  return (
    <div style={{
      width: '260px',
      padding: '20px',
      borderLeft: `1px solid ${T.border}`,
      background: T.panelBg,
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      overflowY: 'auto',
    }}>
      <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: T.text }}>노드 편집</h3>

      {/* 텍스트 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: T.subText }}>텍스트</label>
        <input
          value={node.data.label}
          onChange={(e) => onChange('label', e.target.value)}
          style={{
            padding: '6px 8px',
            border: `1px solid ${T.border}`,
            borderRadius: '6px',
            fontSize: '14px',
            background: T.inputBg,
            color: T.text,
          }}
        />
      </div>

      {/* 모양 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: T.subText }}>모양</label>
        <select
          value={node.data.shape || 'rect'}
          onChange={(e) => onChange('shape', e.target.value)}
          style={{
            padding: '6px 8px',
            border: `1px solid ${T.border}`,
            borderRadius: '6px',
            fontSize: '13px',
            background: T.inputBg,
            color: T.text,
          }}
        >
          <option value="rect">사각형 [ ]</option>
          <option value="round">둥근 사각형 ( )</option>
          <option value="stadium">스타디움 ([ ])</option>
          <option value="circle">원 (( ))</option>
          <option value="diamond">마름모 {'{ }'}</option>
          <option value="hexagon">육각형 {'{{ }}'}</option>
          <option value="subroutine">서브루틴 [[ ]]</option>
          <option value="lean_right">평행사변형 [/ /]</option>
          <option value="lean_left">평행사변형(역) [\ \]</option>
          <option value="trapezoid">사다리꼴 [/ \]</option>
          <option value="inv_trapezoid">사다리꼴(역) [\ /]</option>
        </select>
      </div>

      {/* 배경색 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: T.subText }}>배경색</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="color"
            value={style.background || '#ffffff'}
            onChange={(e) => onChange('background', e.target.value)}
            style={{ width: '36px', height: '36px', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
          />
          <span style={{ fontSize: '13px', color: T.subText }}>{style.background || '#ffffff'}</span>
        </div>
      </div>

      {/* 텍스트 색상 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: T.subText }}>텍스트 색상</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="color"
            value={style.color || '#000000'}
            onChange={(e) => onChange('color', e.target.value)}
            style={{ width: '36px', height: '36px', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
          />
          <span style={{ fontSize: '13px', color: T.subText }}>{style.color || '#000000'}</span>
        </div>
      </div>

      {/* 테두리 색상 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: T.subText }}>테두리 색상</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="color"
            value={style.borderColor || '#d1d5db'}
            onChange={(e) => onChange('borderColor', e.target.value)}
            style={{ width: '36px', height: '36px', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
          />
          <span style={{ fontSize: '13px', color: T.subText }}>{style.borderColor || '#d1d5db'}</span>
        </div>
      </div>

      {/* 폰트 크기 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: T.subText }}>폰트 크기: {style.fontSize || '14px'}</label>
        <input
          type="range"
          min="10"
          max="24"
          value={parseInt(style.fontSize) || 14}
          onChange={(e) => onChange('fontSize', `${e.target.value}px`)}
          style={{ width: '100%' }}
        />
      </div>

      {/* 테두리 굵기 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: T.subText }}>테두리 굵기: {style.borderWidth || '1px'}</label>
        <input
          type="range"
          min="1"
          max="6"
          value={parseInt(style.borderWidth) || 1}
          onChange={(e) => onChange('borderWidth', `${e.target.value}px`)}
          style={{ width: '100%' }}
        />
      </div>

      {/* 테두리 둥글기 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: T.subText }}>모서리 둥글기: {style.borderRadius || '6px'}</label>
        <input
          type="range"
          min="0"
          max="30"
          value={parseInt(style.borderRadius) || 6}
          onChange={(e) => onChange('borderRadius', `${e.target.value}px`)}
          style={{ width: '100%' }}
        />
      </div>

      <button
        onClick={onDelete}
        style={{
          marginTop: 'auto',
          padding: '8px',
          border: '1px solid #fca5a5',
          borderRadius: '6px',
          background: '#fef2f2',
          color: '#dc2626',
          cursor: 'pointer',
          fontSize: '13px',
        }}
      >
        노드 삭제
      </button>
      <button
        onClick={onClose}
        style={{
          padding: '8px',
          border: `1px solid ${T.border}`,
          borderRadius: '6px',
          background: T.inputBg,
          cursor: 'pointer',
          fontSize: '13px',
        }}
      >
        닫기
      </button>
    </div>
  )
}

// 여러 노드를 선택했을 때의 일괄 편집 패널
function BulkPanel({ nodes, onChange, onDelete, T }) {
  const first = nodes[0]
  const style = first.style || {}

  const colorRow = (label, key, fallback) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={{ fontSize: '12px', color: T.subText }}>{label}</label>
      <input
        type="color"
        value={style[key] || fallback}
        onChange={(e) => onChange(key, e.target.value)}
        style={{ width: '36px', height: '36px', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
      />
    </div>
  )

  return (
    <div style={{
      width: '260px',
      padding: '20px',
      borderLeft: `1px solid ${T.border}`,
      background: T.panelBg,
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      overflowY: 'auto',
    }}>
      <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: T.text }}>
        일괄 편집 ({nodes.length}개 노드)
      </h3>

      {colorRow('배경색', 'background', '#ffffff')}
      {colorRow('텍스트 색상', 'color', '#000000')}
      {colorRow('테두리 색상', 'borderColor', '#d1d5db')}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: T.subText }}>폰트 크기: {style.fontSize || '14px'}</label>
        <input
          type="range"
          min="10"
          max="24"
          value={parseInt(style.fontSize) || 14}
          onChange={(e) => onChange('fontSize', `${e.target.value}px`)}
          style={{ width: '100%' }}
        />
      </div>

      <button
        onClick={onDelete}
        style={{
          marginTop: 'auto',
          padding: '8px',
          border: '1px solid #fca5a5',
          borderRadius: '6px',
          background: '#fef2f2',
          color: '#dc2626',
          cursor: 'pointer',
          fontSize: '13px',
        }}
      >
        선택한 노드 모두 삭제
      </button>
      <p style={{ margin: 0, fontSize: '11px', color: T.subText, lineHeight: 1.5 }}>
        Shift+드래그 또는 Ctrl+클릭으로 여러 노드를 선택할 수 있습니다.
      </p>
    </div>
  )
}

// 엣지 편집 사이드패널
function EdgePanel({ edge, onChange, onClose, onDelete, T }) {
  if (!edge) return null

  const style = edge.style || {}

  return (
    <div style={{
      width: '260px',
      padding: '20px',
      borderLeft: `1px solid ${T.border}`,
      background: T.panelBg,
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      overflowY: 'auto',
    }}>
      <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: T.text }}>엣지 편집</h3>

      {/* 라벨 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: T.subText }}>라벨</label>
        <input
          value={edge.label || ''}
          onChange={(e) => onChange('label', e.target.value)}
          style={{
            padding: '6px 8px',
            border: `1px solid ${T.border}`,
            borderRadius: '6px',
            fontSize: '14px',
            background: T.inputBg,
            color: T.text,
          }}
        />
      </div>

      {/* 선 모양 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: T.subText }}>선 모양</label>
        <select
          value={edge.type || 'default'}
          onChange={(e) => onChange('type', e.target.value)}
          style={{
            padding: '6px 8px',
            border: `1px solid ${T.border}`,
            borderRadius: '6px',
            fontSize: '13px',
            background: T.inputBg,
            color: T.text,
          }}
        >
          <option value="default">곡선</option>
          <option value="smoothstep">계단</option>
          <option value="straight">직선</option>
        </select>
      </div>

      {/* 선 색상 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: T.subText }}>선 색상</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="color"
            value={style.stroke || '#9ca3af'}
            onChange={(e) => onChange('stroke', e.target.value)}
            style={{ width: '36px', height: '36px', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
          />
          <span style={{ fontSize: '13px', color: T.subText }}>{style.stroke || '#9ca3af'}</span>
        </div>
      </div>

      {/* 선 굵기 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: T.subText }}>선 굵기: {style.strokeWidth || 1.5}px</label>
        <input
          type="range"
          min="1"
          max="6"
          step="0.5"
          value={parseFloat(style.strokeWidth) || 1.5}
          onChange={(e) => onChange('strokeWidth', Number(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>

      {/* 애니메이션 */}
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#444', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={!!edge.animated}
          onChange={(e) => onChange('animated', e.target.checked)}
        />
        흐름 애니메이션
      </label>

      <button
        onClick={onDelete}
        style={{
          marginTop: 'auto',
          padding: '8px',
          border: '1px solid #fca5a5',
          borderRadius: '6px',
          background: '#fef2f2',
          color: '#dc2626',
          cursor: 'pointer',
          fontSize: '13px',
        }}
      >
        엣지 삭제
      </button>
      <button
        onClick={onClose}
        style={{
          padding: '8px',
          border: `1px solid ${T.border}`,
          borderRadius: '6px',
          background: T.inputBg,
          cursor: 'pointer',
          fontSize: '13px',
        }}
      >
        닫기
      </button>
    </div>
  )
}

// ---- mermaid 코드 문법 강조 ----
// 정식 파서가 아니라 표시 전용 토크나이저다. 정확한 구문 판정은 mermaid 파서가 하고,
// 여기서는 눈으로 구조를 구분할 수 있을 정도만 나눈다.
const MERMAID_KEYWORDS = new Set([
  'flowchart', 'graph', 'subgraph', 'end', 'direction',
  'sequenceDiagram', 'participant', 'actor', 'activate', 'deactivate',
  'note', 'loop', 'alt', 'else', 'opt', 'par', 'and', 'rect',
  'classDiagram', 'class', 'classDef', 'stateDiagram', 'stateDiagram-v2', 'state',
  'erDiagram', 'journey', 'gantt', 'pie',
  'style', 'linkStyle', 'click', 'TB', 'TD', 'BT', 'RL', 'LR',
])

// 아래 순서대로 먼저 매칭된 것이 이긴다. 주석·문자열·라벨을 앞에 두어야
// 그 안에 들어 있는 하이픈이 화살표로 잘못 인식되지 않는다.
const TOKEN_RE = new RegExp(
  [
    '(%%[^\\n]*)', // 주석
    '("[^"\\n]*")', // 따옴표 문자열
    '(\\|[^|\\n]*\\|)', // 엣지 라벨 |텍스트|
    '([[({>][^\\n]*?[\\])}]+)', // 노드 라벨 [텍스트] (텍스트) {텍스트} 등
    '([<ox]?[-=.]{2,}[->ox]?)', // 화살표·연결선
    '([A-Za-z_][\\w-]*)', // 식별자 (키워드 여부는 아래에서 판정한다)
  ].join('|'),
  'g'
)

const TOKEN_TYPES = ['comment', 'string', 'label', 'label', 'arrow', 'identifier']

function highlightMermaid(code, syntax) {
  const parts = []
  let last = 0
  let key = 0
  const push = (text, color) => {
    if (!text) return
    parts.push(color ? <span key={key++} style={{ color }}>{text}</span> : text)
  }

  TOKEN_RE.lastIndex = 0
  let m
  while ((m = TOKEN_RE.exec(code)) !== null) {
    // 매칭된 그룹 번호로 토큰 종류를 구한다 (그룹 1번이 배열의 0번에 대응한다)
    const group = m.findIndex((v, i) => i > 0 && v !== undefined)
    let type = TOKEN_TYPES[group - 1]
    if (type === 'identifier') {
      if (!MERMAID_KEYWORDS.has(m[0])) type = null
      else type = 'keyword'
    }
    push(code.slice(last, m.index), null)
    push(m[0], type ? syntax[type] : null)
    last = m.index + m[0].length
  }
  push(code.slice(last), null)
  return parts
}

// textarea 위에 같은 글꼴·같은 위치로 하이라이트 레이어를 겹쳐 문법 강조를 구현한다.
// textarea의 글자는 투명하게 만들고 캐럿만 남기므로, 선택·입력 동작은 그대로 유지된다.
function CodeEditor({ value, onChange, T }) {
  const preRef = useRef(null)

  // 두 레이어의 글자가 어긋나지 않으려면 글꼴·여백·줄바꿈 규칙이 완전히 같아야 한다
  const layer = {
    margin: 0,
    padding: '8px',
    border: 'none',
    boxSizing: 'border-box',
    fontFamily: 'monospace',
    fontSize: '13px',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    wordBreak: 'break-word',
    tabSize: 2,
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: '160px',
        position: 'relative',
        background: T.inputBg,
        border: `1px solid ${T.border}`,
        borderRadius: '6px',
        overflow: 'hidden',
      }}
    >
      <pre
        ref={preRef}
        aria-hidden="true"
        style={{
          ...layer,
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
          color: T.text,
        }}
      >
        {highlightMermaid(value, T.syntax)}
        {'\n'}
      </pre>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          // 하이라이트 레이어는 스크롤바가 없으므로 textarea의 스크롤 위치를 따라가게 한다
          if (preRef.current) preRef.current.scrollTop = e.target.scrollTop
        }}
        spellCheck={false}
        style={{
          ...layer,
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          resize: 'none',
          outline: 'none',
          background: 'transparent',
          color: 'transparent',
          caretColor: T.text,
        }}
      />
    </div>
  )
}

function Studio() {
  const [code, setCode] = useState(() => loadSaved()?.code ?? defaultCode)
  const [nodes, setNodes] = useState(() => loadSaved()?.nodes ?? [])
  const [edges, setEdges] = useState(() => loadSaved()?.edges ?? [])
  const [selectedNode, setSelectedNode] = useState(null)
  const [selectedEdge, setSelectedEdge] = useState(null)
  const [status, setStatus] = useState(null) // { type: 'error' | 'info', message }
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) === 'dark'
    } catch {
      return false
    }
  })
  const T = themes[dark ? 'dark' : 'light']
  const [view, setView] = useState(loadView)

  const toggleView = (key) => {
    setView((v) => {
      const next = { ...v, [key]: !v[key] }
      try {
        localStorage.setItem(VIEW_KEY, JSON.stringify(next))
      } catch {
        // 저장 실패는 무시한다 (표시 여부는 이번 세션에만 유지된다)
      }
      return next
    })
  }

  const toggleTheme = () => {
    setDark((d) => {
      try {
        localStorage.setItem(THEME_KEY, d ? 'light' : 'dark')
      } catch {
        // 저장 실패는 무시한다
      }
      return !d
    })
  }
  const mermaidRef = useRef(null)

  // 코드·노드·엣지가 바뀔 때마다 localStorage에 저장해서 새로고침해도 유지한다
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ code, nodes, edges }))
    } catch {
      // 저장 공간 초과 등은 무시한다 (저장 실패가 편집을 막으면 안 된다)
    }
  }, [code, nodes, edges])

  // ---- 실행 취소 / 다시 실행 ----
  // 스냅샷은 편집 동작이 시작되기 직전에 기록한다. 슬라이더 드래그처럼 연속으로
  // 발생하는 변경은 500ms 안에 재기록하지 않아 한 동작으로 묶인다.
  const stateRef = useRef({ nodes, edges })
  stateRef.current = { nodes, edges }
  const pastRef = useRef([])
  const futureRef = useRef([])
  const lastRecordRef = useRef(0)

  const record = useCallback(() => {
    const now = Date.now()
    if (now - lastRecordRef.current < 500) return
    lastRecordRef.current = now
    pastRef.current.push({ nodes: stateRef.current.nodes, edges: stateRef.current.edges })
    if (pastRef.current.length > 50) pastRef.current.shift()
    futureRef.current = []
  }, [])

  const undo = useCallback(() => {
    const prev = pastRef.current.pop()
    if (!prev) return
    futureRef.current.push({ nodes: stateRef.current.nodes, edges: stateRef.current.edges })
    setNodes(prev.nodes)
    setEdges(prev.edges)
    setSelectedNode(null)
    setSelectedEdge(null)
  }, [])

  const redo = useCallback(() => {
    const next = futureRef.current.pop()
    if (!next) return
    pastRef.current.push({ nodes: stateRef.current.nodes, edges: stateRef.current.edges })
    setNodes(next.nodes)
    setEdges(next.edges)
    setSelectedNode(null)
    setSelectedEdge(null)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      // 입력 필드에서는 브라우저의 텍스트 실행 취소를 방해하지 않는다
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const resetAll = () => {
    record()
    localStorage.removeItem(STORAGE_KEY)
    setCode(defaultCode)
    setNodes([])
    setEdges([])
    setSelectedNode(null)
    setSelectedEdge(null)
    setStatus(null)
  }

  const onNodesChange = useCallback((changes) => {
    if (changes.some((c) => c.type === 'remove')) record()
    setNodes((nds) => {
      const next = applyNodeChanges(changes, nds)
      // 그룹 노드가 삭제되면 그 자식도 함께 제거한다 (고아 parentId는 오류를 일으킨다)
      const ids = new Set(next.map((n) => n.id))
      return next.filter((n) => !n.parentId || ids.has(n.parentId))
    })
    // 키보드 삭제 등으로 노드가 제거되면 열려 있던 편집 패널을 닫는다
    changes.forEach((c) => {
      if (c.type === 'remove') {
        setSelectedNode((prev) => (prev?.id === c.id ? null : prev))
      }
    })
  }, [record])
  const onEdgesChange = useCallback((changes) => {
    if (changes.some((c) => c.type === 'remove')) record()
    setEdges((eds) => applyEdgeChanges(changes, eds))
    changes.forEach((c) => {
      if (c.type === 'remove') {
        setSelectedEdge((prev) => (prev?.id === c.id ? null : prev))
      }
    })
  }, [record])
  const onConnect = useCallback(
    (connection) => {
      record()
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            style: { stroke: '#9ca3af', strokeWidth: 1.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#9ca3af' },
            labelStyle: { fontSize: '12px' },
            labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9 },
            labelBgPadding: [4, 2],
            labelBgBorderRadius: 4,
          },
          eds
        )
      )
    },
    [record]
  )
  // 엣지 끝을 잡아 다른 노드로 끌면 연결 대상이 바뀐다.
  // shouldReplaceId를 꺼서 엣지 id를 유지한다 — id가 바뀌면 열려 있는 엣지 편집 패널의 대상이 사라진다.
  const onReconnect = useCallback((oldEdge, newConnection) => {
    record()
    setEdges((eds) => reconnectEdge(oldEdge, newConnection, eds, { shouldReplaceId: false }))
    setSelectedEdge((prev) =>
      prev?.id === oldEdge.id ? { ...prev, ...newConnection } : prev
    )
  }, [record])

  const onNodeClick = useCallback((event, node) => {
    // 그룹(subgraph) 노드는 노드 편집 패널의 대상이 아니다
    if (node.type === 'labeledGroup') return
    setSelectedNode(node)
    setSelectedEdge(null)
  }, [])
  const onEdgeClick = useCallback((event, edge) => {
    setSelectedEdge(edge)
    setSelectedNode(null)
  }, [])

  const onPanelChange = (key, value) => {
    record()
    const apply = (n) => {
      if (key === 'label') {
        return { ...n, data: { ...n.data, label: value } }
      }
      if (key === 'shape') {
        // 모양이 바뀌면 모양 기본 스타일로 다시 깔되, 사용자가 바꾼 색·크기는 유지한다
        const base = shapeStyle(value)
        const keep = {}
        ;['background', 'color', 'borderColor', 'fontSize', 'borderWidth'].forEach((k) => {
          if (n.style?.[k]) keep[k] = n.style[k]
        })
        // 이전 모양의 기본 배경을 그대로 쓰고 있었다면 새 모양의 기본 배경을 따른다
        if (keep.background === shapeStyle(n.data?.shape || 'rect').background) {
          delete keep.background
        }
        return { ...n, data: { ...n.data, shape: value }, style: { ...base, ...keep } }
      }
      return { ...n, style: { ...n.style, [key]: value } }
    }
    setNodes((nds) => nds.map((n) => (n.id === selectedNode.id ? apply(n) : n)))
    setSelectedNode((prev) => apply(prev))
  }

  const { screenToFlowPosition, getNodesBounds } = useReactFlow()

  const addNodeIdRef = useRef(0)
  const addNodeAt = (position) => {
    record()
    let id
    do {
      id = `n${++addNodeIdRef.current}`
    } while (nodes.some((n) => n.id === id))
    setNodes((nds) => [
      ...nds,
      {
        id,
        position,
        data: { label: '새 노드', shape: 'rect' },
        style: shapeStyle('rect'),
      },
    ])
  }

  const addNode = () => {
    const offset = (addNodeIdRef.current + 1) % 5
    addNodeAt({ x: 60 + offset * 30, y: 60 + offset * 30 })
  }

  // 캔버스 빈 곳을 더블클릭하면 그 자리에 노드를 만든다
  const onCanvasDoubleClick = (event) => {
    if (!event.target.classList?.contains('react-flow__pane')) return
    addNodeAt(screenToFlowPosition({ x: event.clientX, y: event.clientY }))
  }

  const deleteSelectedNode = () => {
    record()
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id))
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id))
    setSelectedNode(null)
  }

  // 다중 선택된 노드 (React Flow가 selected 플래그를 관리한다)
  const multiSelectedNodes = nodes.filter((n) => n.selected)

  const onBulkChange = (key, value) => {
    record()
    setNodes((nds) =>
      nds.map((n) => (n.selected ? { ...n, style: { ...n.style, [key]: value } } : n))
    )
  }

  const deleteBulkNodes = () => {
    record()
    const ids = new Set(multiSelectedNodes.map((n) => n.id))
    setNodes((nds) => nds.filter((n) => !ids.has(n.id)))
    setEdges((eds) => eds.filter((e) => !ids.has(e.source) && !ids.has(e.target)))
    setSelectedNode(null)
  }

  // ---- 노드 복사·붙여넣기 ----
  // 시스템 클립보드가 아니라 앱 내부 ref에 담는다. 다른 앱과 주고받을 필요가 없고,
  // 클립보드 권한·직렬화 문제를 겪지 않는다.
  const clipboardRef = useRef(null)
  const pasteCountRef = useRef(0)

  const copySelection = useCallback(() => {
    const { nodes: curNodes, edges: curEdges } = stateRef.current
    const picked = curNodes.filter((n) => n.selected)
    if (picked.length === 0) return
    const ids = new Set(picked.map((n) => n.id))
    clipboardRef.current = {
      nodes: picked,
      // 양쪽 끝이 모두 복사 대상인 엣지만 함께 복사한다
      edges: curEdges.filter((e) => ids.has(e.source) && ids.has(e.target)),
    }
    pasteCountRef.current = 0
    setStatus({ type: 'info', message: `노드 ${picked.length}개를 복사했습니다. Ctrl+V로 붙여넣을 수 있습니다.` })
  }, [])

  const pasteClipboard = useCallback(() => {
    const clip = clipboardRef.current
    if (!clip || clip.nodes.length === 0) return
    record()
    const offset = 40 * (pasteCountRef.current + 1)
    pasteCountRef.current += 1

    const { nodes: curNodes } = stateRef.current
    const existing = new Set(curNodes.map((n) => n.id))
    const idMap = new Map()
    const newId = () => {
      let id
      do {
        id = `n${++addNodeIdRef.current}`
      } while (existing.has(id) || idMap.has(id))
      existing.add(id)
      return id
    }
    clip.nodes.forEach((n) => idMap.set(n.id, newId()))

    const copiedNodes = clip.nodes.map((n) => {
      const parentCopied = n.parentId && idMap.has(n.parentId)
      // 부모 그룹을 함께 복사하지 않았다면 부모 기준 상대 좌표를 절대 좌표로 되돌린다
      const parentPos = !parentCopied && n.parentId
        ? clip.nodes.find((p) => p.id === n.parentId)?.position ??
          curNodes.find((p) => p.id === n.parentId)?.position
        : null
      const base = parentPos
        ? { x: n.position.x + parentPos.x, y: n.position.y + parentPos.y }
        : n.position
      const copy = {
        ...n,
        id: idMap.get(n.id),
        position: { x: base.x + offset, y: base.y + offset },
        selected: true,
      }
      if (parentCopied) {
        copy.parentId = idMap.get(n.parentId)
      } else {
        delete copy.parentId
        delete copy.extent
      }
      return copy
    })

    const copiedEdges = clip.edges.map((e, i) => ({
      ...e,
      id: `e-copy-${addNodeIdRef.current}-${i}`,
      source: idMap.get(e.source),
      target: idMap.get(e.target),
      selected: false,
    }))

    // 원본 선택을 해제해서 붙여넣은 노드만 선택된 상태로 만든다
    setNodes((nds) => [...nds.map((n) => (n.selected ? { ...n, selected: false } : n)), ...copiedNodes])
    setEdges((eds) => [...eds, ...copiedEdges])
    setSelectedNode(null)
    setSelectedEdge(null)
    setStatus({ type: 'info', message: `노드 ${copiedNodes.length}개를 붙여넣었습니다.` })
  }, [record])

  // 텍스트 입력 중에는 브라우저의 기본 복사·붙여넣기를 그대로 둔다
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key === 'c') {
        copySelection()
      } else if (key === 'v') {
        e.preventDefault()
        pasteClipboard()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [copySelection, pasteClipboard])

  const deleteSelectedEdge = () => {
    record()
    setEdges((eds) => eds.filter((e) => e.id !== selectedEdge.id))
    setSelectedEdge(null)
  }

  const onEdgePanelChange = (key, value) => {
    record()
    const apply = (e) => {
      if (key === 'label') {
        // 라벨이 생기면 노드 위 레이어로 올려서 가려지지 않게 한다 (변환기와 같은 규칙)
        return { ...e, label: value, zIndex: value ? 1 : 0 }
      }
      if (key === 'animated') {
        return { ...e, animated: value }
      }
      if (key === 'type') {
        return { ...e, type: value }
      }
      if (key === 'stroke') {
        // 화살촉 색도 선 색과 함께 바꾼다
        return { ...e, style: { ...e.style, stroke: value }, markerEnd: { ...e.markerEnd, type: MarkerType.ArrowClosed, color: value } }
      }
      return { ...e, style: { ...e.style, [key]: value } }
    }
    setEdges((eds) => eds.map((e) => (e.id === selectedEdge.id ? apply(e) : e)))
    setSelectedEdge((prev) => apply(prev))
  }

  const renderDiagram = async () => {
    if (!mermaidRef.current) return
    try {
      const diagram = await mermaid.mermaidAPI.getDiagramFromText(code)

      mermaidRef.current.innerHTML = ''
      const { svg } = await mermaid.render('mermaid-diagram', code)
      mermaidRef.current.innerHTML = svg
      const svgEl = mermaidRef.current.querySelector('svg')

      let result
      let notice = null
      if (diagram.type.startsWith('flowchart')) {
        result = svgToFlow(svgEl, diagram.db.getEdges(), diagram.db.getSubGraphs(), diagram.db.getVertices())
      } else if (diagram.type.toLowerCase().startsWith('class')) {
        result = classSvgToFlow(svgEl, diagram.db.getRelations())
      } else if (diagram.type === 'sequence') {
        result = sequenceSvgToFlow(svgEl, diagram.db.getActors(), diagram.db.getMessages())
        notice = {
          type: 'info',
          message: '시퀀스 다이어그램은 근사 변환됩니다: 참가자는 노드, 메시지는 순번이 붙은 엣지로 표현되고 시간 축(라이프라인)은 유지되지 않습니다.',
        }
      } else if (diagram.type === 'er' || diagram.type === 'erDiagram') {
        result = erSvgToFlow(svgEl, diagram.db.getRelationships())
      } else if (diagram.type.toLowerCase().startsWith('state')) {
        result = stateSvgToFlow(svgEl, diagram.db.getRelations())
      } else {
        setStatus({
          type: 'info',
          message: `지원하지 않는 다이어그램 유형입니다: ${diagram.type} (flowchart, stateDiagram, classDiagram, erDiagram, sequenceDiagram만 변환할 수 있습니다)`,
        })
        return
      }

      record()
      setNodes(result.nodes)
      setEdges(result.edges)
      setSelectedNode(null)
      setSelectedEdge(null)
      setStatus(notice)
    } catch (e) {
      setStatus({ type: 'error', message: `문법 오류: ${e.message}` })
    }
  }

  // 코드를 고치면 600ms 뒤에 자동으로 다시 렌더링한다.
  // 첫 마운트(localStorage 복원 직후)에는 실행하지 않는다 — 복원된 노드 스타일을 덮어쓰면 안 되기 때문이다.
  const isFirstCodeEffect = useRef(true)
  const skipAutoRenderRef = useRef(false)
  useEffect(() => {
    if (isFirstCodeEffect.current) {
      isFirstCodeEffect.current = false
      return
    }
    if (skipAutoRenderRef.current) {
      skipAutoRenderRef.current = false
      return
    }
    const timer = setTimeout(renderDiagram, 600)
    return () => clearTimeout(timer)
    // renderDiagram은 매 렌더마다 새로 만들어지므로 code만 의존성으로 둔다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  // 캔버스 → 코드 역변환. 자동 렌더링이 이어서 실행되면 캔버스의 위치·스타일이
  // mermaid 레이아웃으로 초기화되므로, 이 setCode 한 번은 자동 렌더링을 건너뛴다.
  const exportToCode = () => {
    if (nodes.length === 0) {
      setStatus({ type: 'info', message: '내보낼 노드가 없습니다. 먼저 다이어그램을 만들어 주세요.' })
      return
    }
    skipAutoRenderRef.current = true
    setCode(flowToMermaid(nodes, edges))
    setStatus(null)
  }

  const downloadDataUrl = (dataUrl, filename) => {
    const link = document.createElement('a')
    link.download = filename
    link.href = dataUrl
    link.click()
  }

  // 현재 화면이 아니라 노드 전체 경계를 기준으로 캡처한다.
  // 뷰포트 요소만 찍으므로 미니맵·컨트롤은 이미지에 포함되지 않는다.
  const exportImage = (render, filename) => {
    if (nodes.length === 0) {
      setStatus({ type: 'info', message: '내보낼 노드가 없습니다. 먼저 다이어그램을 만들어 주세요.' })
      return
    }
    const viewportEl = document.querySelector('.react-flow__viewport')
    if (!viewportEl) return
    const bounds = getNodesBounds(nodes)
    const pad = 40
    const width = Math.ceil(bounds.width + pad * 2)
    const height = Math.ceil(bounds.height + pad * 2)
    render(viewportEl, {
      backgroundColor: dark ? '#141414' : '#ffffff',
      width,
      height,
      style: {
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(${pad - bounds.x}px, ${pad - bounds.y}px) scale(1)`,
      },
    }).then((dataUrl) => downloadDataUrl(dataUrl, filename))
  }

  const exportToPng = () => exportImage(toPng, 'mermaid-studio.png')
  const exportToSvg = () => exportImage(toSvg, 'mermaid-studio.svg')

  // ---- JSON 파일 저장·불러오기 ----
  const exportToJson = () => {
    const payload = JSON.stringify({ version: 1, code, nodes, edges }, null, 2)
    downloadDataUrl(
      `data:application/json;charset=utf-8,${encodeURIComponent(payload)}`,
      'mermaid-studio.json'
    )
  }

  const fileInputRef = useRef(null)
  const importFromJson = (event) => {
    const file = event.target.files?.[0]
    event.target.value = '' // 같은 파일을 다시 선택해도 change가 발생하게 한다
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result)
        if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
          throw new Error('nodes·edges 배열이 없습니다')
        }
        record()
        skipAutoRenderRef.current = true
        setCode(typeof data.code === 'string' ? data.code : defaultCode)
        setNodes(data.nodes)
        setEdges(data.edges)
        setSelectedNode(null)
        setSelectedEdge(null)
        setStatus(null)
      } catch (e) {
        setStatus({ type: 'error', message: `JSON 파일을 읽지 못했습니다: ${e.message}` })
      }
    }
    reader.readAsText(file)
  }

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', background: T.panelBg }}>

      {/* 왼쪽: 코드 입력 */}
      <div style={{
        width: '280px',
        display: 'flex',
        flexDirection: 'column',
        borderRight: `1px solid ${T.border}`,
        background: T.panelBg,
        padding: '16px',
        gap: '12px',
        overflowY: 'auto', // 창이 낮을 때는 사이드바 안에서만 스크롤한다
      }}>
        <h3 style={{ margin: 0, fontSize: '14px', color: T.text }}>Mermaid 코드</h3>
        <CodeEditor value={code} onChange={setCode} T={T} />
        {status && (
          <div style={{
            padding: '8px 10px',
            borderRadius: '6px',
            fontSize: '12px',
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            background: status.type === 'error' ? '#fef2f2' : '#fffbeb',
            border: `1px solid ${status.type === 'error' ? '#fca5a5' : '#fcd34d'}`,
            color: status.type === 'error' ? '#b91c1c' : '#92400e',
          }}>
            {status.message}
          </div>
        )}

        <button
          onClick={renderDiagram}
          style={{
            padding: '10px',
            background: '#6366f1',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          다이어그램 생성
        </button>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={undo}
            title="실행 취소 (Ctrl+Z)"
            style={{
              flex: 1,
              padding: '8px',
              background: T.inputBg,
              color: T.text,
              border: `1px solid ${T.border}`,
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            ↶ 실행 취소
          </button>
          <button
            onClick={redo}
            title="다시 실행 (Ctrl+Shift+Z)"
            style={{
              flex: 1,
              padding: '8px',
              background: T.inputBg,
              color: T.text,
              border: `1px solid ${T.border}`,
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            ↷ 다시 실행
          </button>
        </div>

        <button
          onClick={addNode}
          style={{
            padding: '10px',
            background: T.inputBg,
            color: T.text,
            border: `1px solid ${T.border}`,
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          노드 추가
        </button>

        <p style={{ margin: 0, fontSize: '11px', color: T.subText, lineHeight: 1.6 }}>
          선택한 노드는 Ctrl+C·Ctrl+V로 복사할 수 있고, 엣지의 끝점을 드래그하면 연결 대상을 바꿀 수 있습니다.
        </p>

        <button
          onClick={exportToCode}
          style={{
            padding: '10px',
            background: T.inputBg,
            color: T.text,
            border: `1px solid ${T.border}`,
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          캔버스 → 코드
        </button>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={exportToPng}
            style={{
              flex: 1,
              padding: '10px',
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            PNG
          </button>
          <button
            onClick={exportToSvg}
            style={{
              flex: 1,
              padding: '10px',
              background: '#0ea5e9',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            SVG
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={exportToJson}
            style={{
              flex: 1,
              padding: '8px',
              background: T.inputBg,
              color: T.text,
              border: `1px solid ${T.border}`,
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            JSON 저장
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              flex: 1,
              padding: '8px',
              background: T.inputBg,
              color: T.text,
              border: `1px solid ${T.border}`,
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            JSON 열기
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={importFromJson}
            style={{ display: 'none' }}
          />
        </div>

        <button
          onClick={resetAll}
          style={{
            padding: '10px',
            background: T.inputBg,
            color: '#dc2626',
            border: '1px solid #fca5a5',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          초기화
        </button>

        <div style={{ display: 'flex', gap: '6px' }}>
          {[
            { key: 'miniMap', label: '미니맵' },
            { key: 'controls', label: '컨트롤' },
            { key: 'background', label: '격자' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => toggleView(key)}
              title={`${label} ${view[key] ? '숨기기' : '보이기'}`}
              style={{
                flex: 1,
                padding: '8px 4px',
                background: view[key] ? '#6366f1' : T.inputBg,
                color: view[key] ? 'white' : T.subText,
                border: `1px solid ${view[key] ? '#6366f1' : T.border}`,
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          onClick={toggleTheme}
          style={{
            padding: '10px',
            background: T.inputBg,
            color: T.text,
            border: `1px solid ${T.border}`,
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          {dark ? '☀️ 라이트 모드' : '🌙 다크 모드'}
        </button>
      </div>

      {/* 가운데: React Flow */}
      <div style={{ flex: 1 }} onDoubleClick={onCanvasDoubleClick}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onReconnect={onReconnect}
          reconnectRadius={12}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onNodeDragStart={record}
          deleteKeyCode={['Backspace', 'Delete']}
          multiSelectionKeyCode={['Meta', 'Control']}
          zoomOnDoubleClick={false}
          nodeTypes={nodeTypes}
          colorMode={dark ? 'dark' : 'light'}
          fitView
        >
          {view.background && <Background />}
          {view.controls && <Controls />}
          {view.miniMap && <MiniMap />}
        </ReactFlow>
      </div>

      {/* 오른쪽: 사이드패널 */}
      {multiSelectedNodes.length > 1 ? (
        <BulkPanel
          nodes={multiSelectedNodes}
          onChange={onBulkChange}
          onDelete={deleteBulkNodes}
          T={T}
        />
      ) : (
        <SidePanel
          node={selectedNode}
          onChange={onPanelChange}
          onClose={() => setSelectedNode(null)}
          onDelete={deleteSelectedNode}
          T={T}
        />
      )}
      <EdgePanel
        edge={selectedEdge}
        onChange={onEdgePanelChange}
        onClose={() => setSelectedEdge(null)}
        onDelete={deleteSelectedEdge}
        T={T}
      />

      {/* mermaid 숨김 렌더링 영역 */}
      <div
        ref={mermaidRef}
        style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none' }}
      />
    </div>
  )
}

// useReactFlow 훅(screenToFlowPosition)을 쓰려면 Provider 안에 있어야 한다
export default function App() {
  return (
    <ReactFlowProvider>
      <Studio />
    </ReactFlowProvider>
  )
}