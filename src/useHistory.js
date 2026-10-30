import { useRef, useCallback, useEffect } from 'react'

// 캔버스(nodes·edges)의 실행 취소·다시 실행 기록과 Ctrl+Z·Ctrl+Shift+Z·Ctrl+Y 단축키.
// stateRef.current는 항상 최신 { nodes, edges }를 가리켜야 한다. 선택 상태를 비우는 setter도 받는다.
export default function useHistory({ stateRef, setNodes, setEdges, setSelectedNode, setSelectedEdge }) {
  // 스냅샷은 편집 동작이 시작되기 직전에 기록한다. 슬라이더 드래그처럼 연속으로
  // 발생하는 변경은 500ms 안에 재기록하지 않아 한 동작으로 묶인다.
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
  }, [stateRef])

  const undo = useCallback(() => {
    const prev = pastRef.current.pop()
    if (!prev) return
    futureRef.current.push({ nodes: stateRef.current.nodes, edges: stateRef.current.edges })
    setNodes(prev.nodes)
    setEdges(prev.edges)
    setSelectedNode(null)
    setSelectedEdge(null)
  }, [stateRef, setNodes, setEdges, setSelectedNode, setSelectedEdge])

  const redo = useCallback(() => {
    const next = futureRef.current.pop()
    if (!next) return
    pastRef.current.push({ nodes: stateRef.current.nodes, edges: stateRef.current.edges })
    setNodes(next.nodes)
    setEdges(next.edges)
    setSelectedNode(null)
    setSelectedEdge(null)
  }, [stateRef, setNodes, setEdges, setSelectedNode, setSelectedEdge])

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

  return { record, undo, redo }
}
