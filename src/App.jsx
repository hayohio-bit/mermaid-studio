import { useState, useCallback } from 'react'
import { ReactFlow, Background, Controls, MiniMap, applyNodeChanges, applyEdgeChanges } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

const initialNodes = [
  { id: '1', position: { x: 100, y: 100 }, data: { label: '시작' } },
  { id: '2', position: { x: 300, y: 250 }, data: { label: '처리' } },
  { id: '3', position: { x: 500, y: 100 }, data: { label: '끝' } },
]

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e2-3', source: '2', target: '3' },
]

export default function App() {
  const [nodes, setNodes] = useState(initialNodes)
  const [edges, setEdges] = useState(initialEdges)
  const [selectedNode, setSelectedNode] = useState(null)

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

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh' }}>

      {/* 다이어그램 영역 */}
      <div style={{ flex: 1 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>

      {/* 사이드패널 */}
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
          <h3 style={{ margin: 0, fontSize: '14px', color: '#333' }}>노드 편집</h3>
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

    </div>
  )
}