import { useRef, useState, useCallback } from 'react'
import { ReactFlow, Background, Controls, MiniMap, applyNodeChanges, applyEdgeChanges } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import mermaid from 'mermaid'

mermaid.initialize({ startOnLoad: false })

const defaultCode = `flowchart LR
  A[시작] --> B[처리] --> C[끝]`

function svgToFlow(svgEl) {
  const nodes = []
  const edges = []

  // SVG 좌표 기준점
  const svgRect = svgEl.getBoundingClientRect()

  // 노드 추출
  const nodeEls = svgEl.querySelectorAll('.node')
  nodeEls.forEach((el) => {
    const rect = el.getBoundingClientRect()
    const label =
      el.querySelector('span')?.textContent ||
      el.querySelector('text')?.textContent ||
      el.id

    // id에서 실제 노드 ID 추출 (flowchart-A-0 → A)
    const rawId = el.id // flowchart-A-0
    const idMatch = rawId.match(/flowchart-([^-]+)-\d+/)
    const nodeId = idMatch ? idMatch[1] : rawId

    nodes.push({
      id: nodeId,
      position: {
        x: rect.left - svgRect.left,
        y: rect.top - svgRect.top,
      },
      data: { label: label.trim() },
    })
  })

// 엣지 추출
  const edgeEls = svgEl.querySelectorAll('.flowchart-link')
  edgeEls.forEach((el, i) => {
    const edgeId = el.id || `edge-${i}`
    // L_A_B_0 → source: A, target: B
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

  const onLabelChange = (e) => {
    const newLabel = e.target.value
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedNode.id
          ? { ...n, data: { ...n.data, label: newLabel } }
          : n
      )
    )
    setSelectedNode((prev) => ({ ...prev, data: { ...prev.data, label: newLabel } }))
  }

  const renderDiagram = async () => {
    if (!mermaidRef.current) return
    try {
      mermaidRef.current.innerHTML = ''
      const { svg } = await mermaid.render('mermaid-diagram', code)
      mermaidRef.current.innerHTML = svg

      // SVG → React Flow 변환
      const svgEl = mermaidRef.current.querySelector('svg')
      const { nodes: newNodes, edges: newEdges } = svgToFlow(svgEl)

      console.log('변환된 노드:', newNodes)
      console.log('변환된 엣지:', newEdges)

      setNodes(newNodes)
      setEdges(newEdges)
      setSelectedNode(null)
    } catch (e) {
      console.log('렌더링 에러:', e)
    }
  }

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
        gap: '12px'
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
            fontWeight: '500'
          }}
        >
          다이어그램 생성
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
      {selectedNode && (
        <div style={{
          width: '260px',
          padding: '24px',
          borderLeft: '1px solid #eee',
          background: '#fafafa',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <h3 style={{ margin: 0, fontSize: '14px' }}>노드 편집</h3>
          <div>
            <label style={{ fontSize: '12px', color: '#666' }}>텍스트</label>
            <input
              value={selectedNode.data.label}
              onChange={onLabelChange}
              style={{
                display: 'block',
                width: '100%',
                marginTop: '4px',
                padding: '6px 8px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <button
            onClick={() => setSelectedNode(null)}
            style={{
              marginTop: 'auto',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              background: 'white',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            닫기
          </button>
        </div>
      )}

      {/* mermaid 숨김 렌더링 영역 */}
      <div
        ref={mermaidRef}
        style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none' }}
      />

    </div>
  )
}