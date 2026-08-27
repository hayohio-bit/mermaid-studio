import { useRef, useState, useCallback } from 'react'
import { toPng } from 'html-to-image'
import {
  ReactFlow, Background, Controls, MiniMap,
  applyNodeChanges, applyEdgeChanges, addEdge
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import mermaid from 'mermaid'

mermaid.initialize({ startOnLoad: false })

const defaultCode = `flowchart LR
  A[시작] --> B[처리] --> C[끝]`

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

    nodes.push({
      id: nodeId,
      position: {
        x: rect.left - svgRect.left,
        y: rect.top - svgRect.top,
      },
      data: { label: label.trim() },
      style: {
        background: '#ffffff',
        border: '1px solid #d1d5db',
        borderRadius: '6px',
        padding: '8px 16px',
        fontSize: '14px',
      },
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
        style: { stroke: '#9ca3af', strokeWidth: 1.5 },
        labelStyle: { fontSize: '12px' },
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
    style: { stroke: '#9ca3af', strokeWidth: 1.5 },
    labelStyle: { fontSize: '12px' },
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

export default function App() {
  const [code, setCode] = useState(defaultCode)
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [selectedNode, setSelectedNode] = useState(null)
  const [selectedEdge, setSelectedEdge] = useState(null)
  const mermaidRef = useRef(null)

  const onNodesChange = useCallback((changes) => {
    setNodes((nds) => applyNodeChanges(changes, nds))
    // 키보드 삭제 등으로 노드가 제거되면 열려 있던 편집 패널을 닫는다
    changes.forEach((c) => {
      if (c.type === 'remove') {
        setSelectedNode((prev) => (prev?.id === c.id ? null : prev))
      }
    })
  }, [])
  const onEdgesChange = useCallback((changes) => {
    setEdges((eds) => applyEdgeChanges(changes, eds))
    changes.forEach((c) => {
      if (c.type === 'remove') {
        setSelectedEdge((prev) => (prev?.id === c.id ? null : prev))
      }
    })
  }, [])
  const onConnect = useCallback(
    (connection) =>
      setEdges((eds) =>
        addEdge(
          { ...connection, style: { stroke: '#9ca3af', strokeWidth: 1.5 }, labelStyle: { fontSize: '12px' } },
          eds
        )
      ),
    []
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
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== selectedNode.id) return n
        if (key === 'label') {
          return { ...n, data: { ...n.data, label: value } }
        }
        return { ...n, style: { ...n.style, [key]: value } }
      })
    )
    setSelectedNode((prev) => {
      if (key === 'label') {
        return { ...prev, data: { ...prev.data, label: value } }
      }
      return { ...prev, style: { ...prev.style, [key]: value } }
    })
  }

  const addNodeIdRef = useRef(0)
  const addNode = () => {
    let id
    do {
      id = `n${++addNodeIdRef.current}`
    } while (nodes.some((n) => n.id === id))
    const offset = addNodeIdRef.current
    setNodes((nds) => [
      ...nds,
      {
        id,
        position: { x: 60 + (offset % 5) * 30, y: 60 + (offset % 5) * 30 },
        data: { label: '새 노드' },
        style: {
          background: '#ffffff',
          border: '1px solid #d1d5db',
          borderRadius: '6px',
          padding: '8px 16px',
          fontSize: '14px',
        },
      },
    ])
  }

  const deleteSelectedNode = () => {
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id))
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id))
    setSelectedNode(null)
  }

  const deleteSelectedEdge = () => {
    setEdges((eds) => eds.filter((e) => e.id !== selectedEdge.id))
    setSelectedEdge(null)
  }

  const onEdgePanelChange = (key, value) => {
    const apply = (e) => {
      if (key === 'label' || key === 'animated') {
        return { ...e, [key]: value }
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
        console.log(`지원하지 않는 다이어그램 유형: ${diagram.type} (flowchart, stateDiagram만 변환 가능)`)
        return
      }

      setNodes(result.nodes)
      setEdges(result.edges)
      setSelectedNode(null)
      setSelectedEdge(null)
    } catch (e) {
      console.log('렌더링 에러:', e)
    }
  }

  const exportToPng = useCallback(() => {
  const flowEl = document.querySelector('.react-flow')
  if (!flowEl) return

  toPng(flowEl, {
    backgroundColor: '#ffffff',
    quality: 1,
  }).then((dataUrl) => {
    const link = document.createElement('a')
    link.download = 'mermaid-studio.png'
    link.href = dataUrl
    link.click()
  })
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
  onClick={exportToPng}
  style={{
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
  PNG 내보내기
</button>
      </div>

      {/* 가운데: React Flow */}
      <div style={{ flex: 1 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          deleteKeyCode={['Backspace', 'Delete']}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>

      {/* 오른쪽: 사이드패널 */}
      <SidePanel
        node={selectedNode}
        onChange={onPanelChange}
        onClose={() => setSelectedNode(null)}
        onDelete={deleteSelectedNode}
      />
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