import { useRef, useState, useCallback } from 'react'
import { toPng } from 'html-to-image'
import {
  ReactFlow, Background, Controls, MiniMap,
  applyNodeChanges, applyEdgeChanges
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

  const edgeEls = svgEl.querySelectorAll('.flowchart-link')
  edgeEls.forEach((el, i) => {
    const edgeId = el.id || `edge-${i}`
    const match = edgeId.match(/L_([^_]+)_([^_]+)_\d+/)
    if (match) {
      edges.push({
        id: `e-${match[1]}-${match[2]}`,
        source: match[1],
        target: match[2],
      })
    }
  })

  return { nodes, edges }
}

// 사이드패널 컴포넌트
function SidePanel({ node, onChange, onClose }) {
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
        onClick={onClose}
        style={{
          marginTop: 'auto',
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
  const mermaidRef = useRef(null)

  const onNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  )
  const onEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  )
  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node)
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

  const renderDiagram = async () => {
    if (!mermaidRef.current) return
    try {
      mermaidRef.current.innerHTML = ''
      const { svg } = await mermaid.render('mermaid-diagram', code)
      mermaidRef.current.innerHTML = svg

      const svgEl = mermaidRef.current.querySelector('svg')
      const { nodes: newNodes, edges: newEdges } = svgToFlow(svgEl)
      setNodes(newNodes)
      setEdges(newEdges)
      setSelectedNode(null)
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
          onNodeClick={onNodeClick}
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
      />

      {/* mermaid 숨김 렌더링 영역 */}
      <div
        ref={mermaidRef}
        style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none' }}
      />
    </div>
  )
}