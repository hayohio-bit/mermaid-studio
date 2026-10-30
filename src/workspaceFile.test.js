import { describe, it, expect } from 'vitest'
import { serializeWorkspace, parseWorkspace, WORKSPACE_FILE_VERSION } from './workspaceFile.js'

const nodes = [{ id: 'A', position: { x: 0, y: 0 }, data: { label: 'A' } }]
const edges = [{ id: 'A-B', source: 'A', target: 'B' }]

describe('parseWorkspace', () => {
  it('version 1 파일(sourceType 없음)은 flowchart로 읽는다', () => {
    const v1 = JSON.stringify({ version: 1, code: 'flowchart LR\n  A', nodes, edges })
    expect(parseWorkspace(v1)).toEqual({ code: 'flowchart LR\n  A', nodes, edges, sourceType: 'flowchart' })
  })

  it('nodes·edges 배열이 없으면 안내 메시지로 예외를 던진다', () => {
    expect(() => parseWorkspace('{"nodes": []}')).toThrow('nodes·edges 배열이 없습니다')
    expect(() => parseWorkspace('{"nodes": {}, "edges": []}')).toThrow('nodes·edges 배열이 없습니다')
    expect(() => parseWorkspace('null')).toThrow('nodes·edges 배열이 없습니다')
  })

  it('JSON이 아니면 JSON.parse 예외가 그대로 전달된다', () => {
    expect(() => parseWorkspace('not json')).toThrow(SyntaxError)
  })

  it('code가 문자열이 아니면 기본 코드로 대체한다', () => {
    const text = JSON.stringify({ nodes: [], edges: [] })
    expect(parseWorkspace(text, { defaultCode: 'flowchart LR' }).code).toBe('flowchart LR')
    expect(parseWorkspace(text).code).toBe('')
  })

  it('sourceType이 문자열이면 그대로 복원한다', () => {
    const text = JSON.stringify({ version: 2, code: 'mindmap', nodes: [], edges: [], sourceType: 'mindmap' })
    expect(parseWorkspace(text).sourceType).toBe('mindmap')
    const odd = JSON.stringify({ nodes: [], edges: [], sourceType: 42 })
    expect(parseWorkspace(odd).sourceType).toBe('flowchart')
  })
})

describe('serializeWorkspace', () => {
  it('현재 버전 번호와 sourceType을 포함한 들여쓰기 JSON을 만든다', () => {
    const text = serializeWorkspace({ code: 'mindmap', nodes, edges, sourceType: 'mindmap' })
    expect(text).toContain('\n  "version": 2,')
    expect(JSON.parse(text)).toEqual({ version: WORKSPACE_FILE_VERSION, code: 'mindmap', nodes, edges, sourceType: 'mindmap' })
  })

  it('sourceType을 생략하면 flowchart로 저장한다', () => {
    expect(JSON.parse(serializeWorkspace({ code: '', nodes: [], edges: [] })).sourceType).toBe('flowchart')
  })

  it('저장한 파일을 다시 읽으면 같은 상태가 된다', () => {
    const state = { code: 'requirementDiagram', nodes, edges, sourceType: 'requirement' }
    expect(parseWorkspace(serializeWorkspace(state))).toEqual(state)
  })
})
