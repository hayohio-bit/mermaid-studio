import { useRef, useState, useCallback, useEffect } from 'react'
import { toPng, toSvg } from 'html-to-image'
import {
  ReactFlow, Background, Controls, MiniMap, ReactFlowProvider,
  applyNodeChanges, applyEdgeChanges, addEdge, MarkerType, useReactFlow
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import mermaid from 'mermaid'
import { flowToMermaid } from './flowToMermaid'

mermaid.initialize({ startOnLoad: false })

const defaultCode = `flowchart LR
  A[시작] --> B[처리] --> C[끝]`

const STORAGE_KEY = 'mermaid-studio'

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY))
  } catch {
    return null
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

// 모양별 노드 스타일. 마름모는 CSS 테두리로 표현할 수 없어 clip-path를 쓰고 테두리를 생략한다
function shapeStyle(shape) {
  const base = {
    background: '#ffffff',
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
    default:
      return base
  }
}

function svgToFlow(svgEl) {
  const nodes = []
  const edges = []
  const svgRect = svgEl.getBoundingClientRect()

  const nodeEls = svgEl.querySelectorAll('.node')
  nodeEls.forEach((el) => {
    const rect = el.getBoundingClientRect()
    const label =
      el.querySelector('span')?.textContent ||
      el.querySelector('text')?.textContent ||
      el.id
    const rawId = el.id
    const idMatch = rawId.match(/flowchart-([^-]+)-\d+/)
    const nodeId = idMatch ? idMatch[1] : rawId
    const shape = detectShape(el)

    nodes.push({
      id: nodeId,
      position: {
        x: rect.left - svgRect.left,
        y: rect.top - svgRect.top,
      },
      data: { label: label.trim(), shape },
      style: shapeStyle(shape),
    })
  })

  // 엣지 라벨은 .edgeLabels 안에 엣지와 같은 순서로 렌더링되므로 인덱스로 대응시킨다.
  // .edgeLabel 클래스가 안쪽 span에도 중복으로 붙어 있어서 직계 자식(g)만 선택한다.
  const labelEls = svgEl.querySelectorAll('.edgeLabels > .edgeLabel')
  const edgeEls = svgEl.querySelectorAll('.flowchart-link')
  edgeEls.forEach((el, i) => {
    const edgeId = el.id || `edge-${i}`
    const match = edgeId.match(/L_([^_]+)_([^_]+)_\d+/)
    if (match) {
      const label = labelEls[i]?.textContent.trim() || ''
      edges.push({
        id: `e-${match[1]}-${match[2]}-${i}`,
        source: match[1],
        target: match[2],
        label: label || undefined,
        // 라벨이 있는 엣지는 노드 레이어(z-index 0) 위로 올려서 라벨이 노드에 가려지지 않게 한다
        zIndex: label ? 1 : 0,
        style: { stroke: '#9ca3af', strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#9ca3af' },
        labelStyle: { fontSize: '12px' },
        labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9 },
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 4,
      })
    }
  })

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

// 사이드패널 컴포넌트
function SidePanel({ node, onChange, onClose, onDelete }) {
  if (!node) return null

  const style = node.style || {}

  return (
    <div style={{
      width: '260px',
      padding: '20px',
      borderLeft: '1px solid #eee',
      background: '#fafafa',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      overflowY: 'auto',
    }}>
      <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>노드 편집</h3>

      {/* 텍스트 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: '#666' }}>텍스트</label>
        <input
          value={node.data.label}
          onChange={(e) => onChange('label', e.target.value)}
          style={{
            padding: '6px 8px',
            border: '1px solid #ddd',
            borderRadius: '6px',
            fontSize: '14px',
          }}
        />
      </div>

      {/* 모양 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: '#666' }}>모양</label>
        <select
          value={node.data.shape || 'rect'}
          onChange={(e) => onChange('shape', e.target.value)}
          style={{
            padding: '6px 8px',
            border: '1px solid #ddd',
            borderRadius: '6px',
            fontSize: '13px',
            background: 'white',
          }}
        >
          <option value="rect">사각형 [ ]</option>
          <option value="round">둥근 사각형 ( )</option>
          <option value="stadium">스타디움 ([ ])</option>
          <option value="circle">원 (( ))</option>
          <option value="diamond">마름모 {'{ }'}</option>
        </select>
      </div>

      {/* 배경색 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: '#666' }}>배경색</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="color"
            value={style.background || '#ffffff'}
            onChange={(e) => onChange('background', e.target.value)}
            style={{ width: '36px', height: '36px', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
          />
          <span style={{ fontSize: '13px', color: '#888' }}>{style.background || '#ffffff'}</span>
        </div>
      </div>

      {/* 텍스트 색상 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: '#666' }}>텍스트 색상</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="color"
            value={style.color || '#000000'}
            onChange={(e) => onChange('color', e.target.value)}
            style={{ width: '36px', height: '36px', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
          />
          <span style={{ fontSize: '13px', color: '#888' }}>{style.color || '#000000'}</span>
        </div>
      </div>

      {/* 테두리 색상 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: '#666' }}>테두리 색상</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="color"
            value={style.borderColor || '#d1d5db'}
            onChange={(e) => onChange('borderColor', e.target.value)}
            style={{ width: '36px', height: '36px', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
          />
          <span style={{ fontSize: '13px', color: '#888' }}>{style.borderColor || '#d1d5db'}</span>
        </div>
      </div>

      {/* 폰트 크기 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: '#666' }}>폰트 크기: {style.fontSize || '14px'}</label>
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
        <label style={{ fontSize: '12px', color: '#666' }}>테두리 굵기: {style.borderWidth || '1px'}</label>
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
        <label style={{ fontSize: '12px', color: '#666' }}>모서리 둥글기: {style.borderRadius || '6px'}</label>
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
          border: '1px solid #ddd',
          borderRadius: '6px',
          background: 'white',
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
function BulkPanel({ nodes, onChange, onDelete }) {
  const first = nodes[0]
  const style = first.style || {}

  const colorRow = (label, key, fallback) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={{ fontSize: '12px', color: '#666' }}>{label}</label>
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
      borderLeft: '1px solid #eee',
      background: '#fafafa',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      overflowY: 'auto',
    }}>
      <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>
        일괄 편집 ({nodes.length}개 노드)
      </h3>

      {colorRow('배경색', 'background', '#ffffff')}
      {colorRow('텍스트 색상', 'color', '#000000')}
      {colorRow('테두리 색상', 'borderColor', '#d1d5db')}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: '#666' }}>폰트 크기: {style.fontSize || '14px'}</label>
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
      <p style={{ margin: 0, fontSize: '11px', color: '#999', lineHeight: 1.5 }}>
        Shift+드래그 또는 Ctrl+클릭으로 여러 노드를 선택할 수 있습니다.
      </p>
    </div>
  )
}

// 엣지 편집 사이드패널
function EdgePanel({ edge, onChange, onClose, onDelete }) {
  if (!edge) return null

  const style = edge.style || {}

  return (
    <div style={{
      width: '260px',
      padding: '20px',
      borderLeft: '1px solid #eee',
      background: '#fafafa',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      overflowY: 'auto',
    }}>
      <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>엣지 편집</h3>

      {/* 라벨 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: '#666' }}>라벨</label>
        <input
          value={edge.label || ''}
          onChange={(e) => onChange('label', e.target.value)}
          style={{
            padding: '6px 8px',
            border: '1px solid #ddd',
            borderRadius: '6px',
            fontSize: '14px',
          }}
        />
      </div>

      {/* 선 색상 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: '#666' }}>선 색상</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="color"
            value={style.stroke || '#9ca3af'}
            onChange={(e) => onChange('stroke', e.target.value)}
            style={{ width: '36px', height: '36px', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
          />
          <span style={{ fontSize: '13px', color: '#888' }}>{style.stroke || '#9ca3af'}</span>
        </div>
      </div>

      {/* 선 굵기 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: '#666' }}>선 굵기: {style.strokeWidth || 1.5}px</label>
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
          border: '1px solid #ddd',
          borderRadius: '6px',
          background: 'white',
          cursor: 'pointer',
          fontSize: '13px',
        }}
      >
        닫기
      </button>
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
    setNodes((nds) => applyNodeChanges(changes, nds))
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
  const onNodeClick = useCallback((event, node) => {
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

  const { screenToFlowPosition } = useReactFlow()

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
      if (diagram.type.startsWith('flowchart')) {
        result = svgToFlow(svgEl)
      } else if (diagram.type.toLowerCase().startsWith('state')) {
        result = stateSvgToFlow(svgEl, diagram.db.getRelations())
      } else {
        setStatus({
          type: 'info',
          message: `지원하지 않는 다이어그램 유형입니다: ${diagram.type} (flowchart, stateDiagram만 변환할 수 있습니다)`,
        })
        return
      }

      record()
      setNodes(result.nodes)
      setEdges(result.edges)
      setSelectedNode(null)
      setSelectedEdge(null)
      setStatus(null)
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

  const exportToPng = useCallback(() => {
    const flowEl = document.querySelector('.react-flow')
    if (!flowEl) return
    toPng(flowEl, { backgroundColor: '#ffffff', quality: 1 }).then((dataUrl) =>
      downloadDataUrl(dataUrl, 'mermaid-studio.png')
    )
  }, [])

  const exportToSvg = useCallback(() => {
    const flowEl = document.querySelector('.react-flow')
    if (!flowEl) return
    toSvg(flowEl, { backgroundColor: '#ffffff' }).then((dataUrl) =>
      downloadDataUrl(dataUrl, 'mermaid-studio.svg')
    )
  }, [])

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh' }}>

      {/* 왼쪽: 코드 입력 */}
      <div style={{
        width: '280px',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid #eee',
        background: '#fafafa',
        padding: '16px',
        gap: '12px',
        overflowY: 'auto', // 창이 낮을 때는 사이드바 안에서만 스크롤한다
      }}>
        <h3 style={{ margin: 0, fontSize: '14px' }}>Mermaid 코드</h3>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          style={{
            flex: 1,
            padding: '8px',
            fontFamily: 'monospace',
            fontSize: '13px',
            border: '1px solid #ddd',
            borderRadius: '6px',
            resize: 'none',
          }}
        />
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
              background: 'white',
              color: '#374151',
              border: '1px solid #ddd',
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
              background: 'white',
              color: '#374151',
              border: '1px solid #ddd',
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
            background: 'white',
            color: '#374151',
            border: '1px solid #ddd',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          노드 추가
        </button>

        <button
          onClick={exportToCode}
          style={{
            padding: '10px',
            background: 'white',
            color: '#374151',
            border: '1px solid #ddd',
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

        <button
          onClick={resetAll}
          style={{
            padding: '10px',
            background: 'white',
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
      </div>

      {/* 가운데: React Flow */}
      <div style={{ flex: 1 }} onDoubleClick={onCanvasDoubleClick}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onNodeDragStart={record}
          deleteKeyCode={['Backspace', 'Delete']}
          multiSelectionKeyCode={['Meta', 'Control']}
          zoomOnDoubleClick={false}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>

      {/* 오른쪽: 사이드패널 */}
      {multiSelectedNodes.length > 1 ? (
        <BulkPanel
          nodes={multiSelectedNodes}
          onChange={onBulkChange}
          onDelete={deleteBulkNodes}
        />
      ) : (
        <SidePanel
          node={selectedNode}
          onChange={onPanelChange}
          onClose={() => setSelectedNode(null)}
          onDelete={deleteSelectedNode}
        />
      )}
      <EdgePanel
        edge={selectedEdge}
        onChange={onEdgePanelChange}
        onClose={() => setSelectedEdge(null)}
        onDelete={deleteSelectedEdge}
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