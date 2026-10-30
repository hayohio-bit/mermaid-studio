import { useRef } from 'react'

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
export default function CodeEditor({ value, onChange, T }) {
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
