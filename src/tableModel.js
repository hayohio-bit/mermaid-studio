// 미리보기 전용 유형 가운데 행 구조가 뚜렷한 네 가지(pie·gantt·journey·timeline)를
// 표로 편집하기 위한 파서와 직렬화기다.
//
// 파서 DB(diagram.db) 대신 코드 원문을 줄 단위로 읽는다. DB는 값을 정규화하면서
// gantt의 상대 날짜(`after a1`)나 timeline의 이어지는 줄 같은 표현을 잃어버리는데,
// 표 편집은 사용자가 쓴 코드를 그대로 유지한 채 한 칸만 바꾸는 것이 목적이기 때문이다.
// 따라서 편집은 항상 "해당 행이 나온 줄 하나만 다시 쓰기"로 처리하고,
// title·dateFormat 같은 나머지 줄은 손대지 않는다.

export const TABLE_TYPES = ['pie', 'gantt', 'journey', 'timeline']

const COLUMNS = {
  pie: [
    { key: 'label', label: '항목', flex: 2 },
    { key: 'value', label: '값', flex: 1 },
  ],
  gantt: [
    { key: 'name', label: '작업', flex: 2 },
    { key: 'spec', label: '속성 (태그, id, 시작, 기간)', flex: 3 },
  ],
  journey: [
    { key: 'task', label: '작업', flex: 2 },
    { key: 'score', label: '점수', flex: 1 },
    { key: 'actors', label: '참여자', flex: 2 },
  ],
  timeline: [
    { key: 'period', label: '시점', flex: 1 },
    { key: 'events', label: '사건 (여러 개는 " : "로 구분)', flex: 3 },
  ],
}

const BLANK = {
  pie: { label: '새 항목', value: '1' },
  gantt: { name: '새 작업', spec: '1d' },
  journey: { task: '새 작업', score: '3', actors: '' },
  timeline: { period: '새 시점', events: '새 사건' },
}

const indentOf = (line) => line.match(/^\s*/)[0]

// 한 줄이 표의 행인지 판별하고, 행이면 열 값으로 쪼갠다.
function parseLine(type, line) {
  const body = line.trim()
  if (!body || body.startsWith('%%')) return null
  if (/^section\b/.test(body)) return null

  if (type === 'pie') {
    // "항목" : 42.9  — 따옴표는 mermaid 문법상 필수다.
    const m = body.match(/^"([^"]*)"\s*:\s*(.+)$/)
    return m ? { label: m[1], value: m[2].trim() } : null
  }
  if (type === 'gantt') {
    // 작업 이름 : 태그·id·날짜·기간이 쉼표로 이어진다.
    // 지시어(title, dateFormat, excludes 등)는 콜론이 없으므로 자연히 걸러진다.
    const m = body.match(/^([^:]+?)\s*:\s*(.*)$/)
    if (!m) return null
    if (/^(title|dateFormat|axisFormat|excludes|includes|todayMarker|tickInterval|weekday|displayMode|accTitle|accDescr)\b/i.test(body)) {
      return null
    }
    return { name: m[1].trim(), spec: m[2].trim() }
  }
  if (type === 'journey') {
    // 작업: 점수: 참여자1, 참여자2
    const parts = body.split(':')
    if (parts.length < 2) return null
    if (/^title\b/i.test(body)) return null
    return {
      task: parts[0].trim(),
      score: (parts[1] || '').trim(),
      actors: parts.slice(2).join(':').trim(),
    }
  }
  if (type === 'timeline') {
    // 시점 : 사건 : 사건 …  (시점을 비우고 콜론으로 시작하면 앞 시점에 사건을 더한다)
    if (!body.includes(':')) return null
    if (/^title\b/i.test(body)) return null
    const idx = body.indexOf(':')
    return {
      period: body.slice(0, idx).trim(),
      events: body.slice(idx + 1).split(':').map((s) => s.trim()).join(' : '),
    }
  }
  return null
}

function serializeRow(type, values) {
  if (type === 'pie') return `"${values.label.replace(/"/g, '')}" : ${values.value}`
  if (type === 'gantt') return `${values.name} : ${values.spec}`
  if (type === 'journey') return `${values.task}: ${values.score}: ${values.actors}`
  if (type === 'timeline') {
    const events = values.events
      .split(':')
      .map((s) => s.trim())
      .filter(Boolean)
      .join(' : ')
    return `${values.period} : ${events}`
  }
  return ''
}

// 코드 전체를 훑어 표의 열 정의와 행 목록을 만든다.
// 각 행은 자기가 나온 줄 번호(lineIndex)와 직전 section 이름을 함께 들고 있다.
export function parseTable(type, code) {
  const columns = COLUMNS[type]
  if (!columns) return null
  const lines = code.split('\n')
  const rows = []
  let section = null
  lines.forEach((line, lineIndex) => {
    const body = line.trim()
    const sectionMatch = body.match(/^section\s+(.*)$/)
    if (sectionMatch) {
      section = sectionMatch[1].trim()
      return
    }
    const values = parseLine(type, line)
    if (values) rows.push({ lineIndex, section, values })
  })
  return { columns, rows }
}

export function updateCell(type, code, row, key, value) {
  const lines = code.split('\n')
  const values = { ...row.values, [key]: value }
  lines[row.lineIndex] = indentOf(lines[row.lineIndex]) + serializeRow(type, values)
  return lines.join('\n')
}

export function deleteRow(code, row) {
  const lines = code.split('\n')
  lines.splice(row.lineIndex, 1)
  return lines.join('\n')
}

// 새 행은 기준 행 바로 아래에 같은 들여쓰기로 넣는다.
// 기준 행이 없으면(표가 비어 있으면) 코드 마지막에 붙인다.
export function addRow(type, code, row) {
  const lines = code.split('\n')
  const line = serializeRow(type, BLANK[type])
  if (row) {
    lines.splice(row.lineIndex + 1, 0, indentOf(lines[row.lineIndex]) + line)
  } else {
    lines.push(`    ${line}`)
  }
  return lines.join('\n')
}
