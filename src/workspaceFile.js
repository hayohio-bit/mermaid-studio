// JSON 작업 파일(저장·불러오기)의 직렬화와 역직렬화.
// localStorage 자동 저장과 달리 파일은 사용자가 오래 보관하므로 형식 버전을 두고,
// 이전 버전 파일도 읽을 수 있게 유지한다.
//
// version 1: { code, nodes, edges }            — sourceType이 없어 flowchart로 읽는다
// version 2: { code, nodes, edges, sourceType } — 캔버스를 만든 원본 유형을 함께 보존한다

export const WORKSPACE_FILE_VERSION = 2
export const DEFAULT_SOURCE_TYPE = 'flowchart'

export function serializeWorkspace({ code, nodes, edges, sourceType = DEFAULT_SOURCE_TYPE }) {
  return JSON.stringify({ version: WORKSPACE_FILE_VERSION, code, nodes, edges, sourceType }, null, 2)
}

// 파일 내용을 읽어 작업 상태로 돌려준다. 형식이 맞지 않으면 사용자에게 보여 줄 메시지로 예외를 던진다.
export function parseWorkspace(text, { defaultCode = '' } = {}) {
  const data = JSON.parse(text)
  if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error('nodes·edges 배열이 없습니다')
  }
  return {
    code: typeof data.code === 'string' ? data.code : defaultCode,
    nodes: data.nodes,
    edges: data.edges,
    sourceType: typeof data.sourceType === 'string' ? data.sourceType : DEFAULT_SOURCE_TYPE,
  }
}
