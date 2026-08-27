// 캔버스의 노드·엣지를 mermaid flowchart 코드로 역변환한다.
// stateDiagram으로 만든 캔버스도 flowchart 형식으로 통일해서 내보낸다.
export function flowToMermaid(nodes, edges) {
  const lines = ['flowchart LR']
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const connected = new Set()

  // 라벨의 큰따옴표는 mermaid 문법과 충돌하므로 작은따옴표로 바꾼다
  const nodeRef = (n) => `${n.id}["${(n.data?.label || n.id).replace(/"/g, "'")}"]`

  edges.forEach((e) => {
    const s = byId.get(e.source)
    const t = byId.get(e.target)
    if (!s || !t) return
    connected.add(e.source)
    connected.add(e.target)
    const arrow = e.label ? `-->|${String(e.label).replace(/\|/g, '/')}|` : '-->'
    lines.push(`  ${nodeRef(s)} ${arrow} ${nodeRef(t)}`)
  })

  // 어디에도 연결되지 않은 노드도 정의만 따로 내보낸다
  nodes.forEach((n) => {
    if (!connected.has(n.id)) lines.push(`  ${nodeRef(n)}`)
  })

  // 기본값에서 바뀐 노드 스타일은 style 지시문으로 내보낸다
  nodes.forEach((n) => {
    const st = n.style || {}
    const parts = []
    if (st.background && st.background !== '#ffffff') parts.push(`fill:${st.background}`)
    if (st.borderColor && st.borderColor !== '#d1d5db') parts.push(`stroke:${st.borderColor}`)
    if (st.color && st.color !== '#000000') parts.push(`color:${st.color}`)
    if (st.borderWidth && st.borderWidth !== '1px') parts.push(`stroke-width:${st.borderWidth}`)
    if (parts.length) lines.push(`  style ${n.id} ${parts.join(',')}`)
  })

  return lines.join('\n')
}
