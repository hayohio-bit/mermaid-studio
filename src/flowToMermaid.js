// 캔버스의 노드·엣지를 mermaid flowchart 코드로 역변환한다.
// stateDiagram으로 만든 캔버스도 flowchart 형식으로 통일해서 내보낸다.
export function flowToMermaid(nodes, edges) {
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

  return lines.join('\n')
}
