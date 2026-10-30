import { describe, it, expect } from 'vitest'
import { TABLE_TYPES, parseTable, updateCell, deleteRow, addRow } from './tableModel.js'

const PIE = ['pie title 점유율', '  "A" : 40', '  %% 주석', '  "B" : 35'].join('\n')
const GANTT = [
  'gantt',
  '  title 일정',
  '  dateFormat YYYY-MM-DD',
  '  section 설계',
  '  요구 분석 :a1, 2026-01-01, 3d',
  '  설계서 :after a1, 2d',
  '  section 구현',
  '  개발 :2026-01-07, 5d',
].join('\n')
const JOURNEY = ['journey', '  title 하루', '  section 아침', '    기상: 3: 나', '    출근: 2: 나, 동료'].join('\n')
const TIMELINE = ['timeline', '  title 연혁', '  2024 : 창립', '  2025 : 출시 : 확장', '  : 이어지는 사건'].join('\n')

describe('parseTable', () => {
  it('지원 유형은 네 가지이고 그 밖의 유형은 null을 돌려준다', () => {
    expect(TABLE_TYPES).toEqual(['pie', 'gantt', 'journey', 'timeline'])
    expect(parseTable('sankey', 'sankey-beta')).toBeNull()
  })

  it('pie: 따옴표 항목과 값을 읽고 title·주석은 건너뛴다', () => {
    const { columns, rows } = parseTable('pie', PIE)
    expect(columns.map((c) => c.key)).toEqual(['label', 'value'])
    expect(rows).toEqual([
      { lineIndex: 1, section: null, values: { label: 'A', value: '40' } },
      { lineIndex: 3, section: null, values: { label: 'B', value: '35' } },
    ])
  })

  it('gantt: 지시어는 건너뛰고 작업 행에 직전 section을 붙인다', () => {
    const { rows } = parseTable('gantt', GANTT)
    expect(rows.map((r) => [r.lineIndex, r.section, r.values.name, r.values.spec])).toEqual([
      [4, '설계', '요구 분석', 'a1, 2026-01-01, 3d'],
      [5, '설계', '설계서', 'after a1, 2d'],
      [7, '구현', '개발', '2026-01-07, 5d'],
    ])
  })

  it('journey: 작업·점수·참여자를 콜론으로 나눈다', () => {
    const { rows } = parseTable('journey', JOURNEY)
    expect(rows.map((r) => r.values)).toEqual([
      { task: '기상', score: '3', actors: '나' },
      { task: '출근', score: '2', actors: '나, 동료' },
    ])
    expect(rows[0].section).toBe('아침')
  })

  it('timeline: 시점과 사건을 나누고 여러 사건은 " : "로 잇는다', () => {
    const { rows } = parseTable('timeline', TIMELINE)
    expect(rows.map((r) => r.values)).toEqual([
      { period: '2024', events: '창립' },
      { period: '2025', events: '출시 : 확장' },
      { period: '', events: '이어지는 사건' },
    ])
  })
})

describe('updateCell', () => {
  it('해당 줄만 다시 쓰고 들여쓰기와 다른 줄은 유지한다', () => {
    const { rows } = parseTable('pie', PIE)
    const next = updateCell('pie', PIE, rows[1], 'value', '50')
    expect(next.split('\n')).toEqual(['pie title 점유율', '  "A" : 40', '  %% 주석', '  "B" : 50'])
  })

  it('pie 항목의 큰따옴표는 제거해서 문법이 깨지지 않게 한다', () => {
    const { rows } = parseTable('pie', PIE)
    expect(updateCell('pie', PIE, rows[0], 'label', 'A "x"').split('\n')[1]).toBe('  "A x" : 40')
  })

  it('gantt·journey·timeline을 각 문법으로 직렬화한다', () => {
    const g = parseTable('gantt', GANTT).rows[0]
    expect(updateCell('gantt', GANTT, g, 'spec', '1d').split('\n')[4]).toBe('  요구 분석 : 1d')
    const j = parseTable('journey', JOURNEY).rows[0]
    expect(updateCell('journey', JOURNEY, j, 'score', '5').split('\n')[3]).toBe('    기상: 5: 나')
    const t = parseTable('timeline', TIMELINE).rows[1]
    expect(updateCell('timeline', TIMELINE, t, 'events', 'a :: b : ').split('\n')[3]).toBe('  2025 : a : b')
  })
})

describe('deleteRow', () => {
  it('행이 나온 줄 하나만 지운다', () => {
    const { rows } = parseTable('gantt', GANTT)
    const next = deleteRow(GANTT, rows[1])
    expect(next.split('\n')).toHaveLength(GANTT.split('\n').length - 1)
    expect(next).not.toContain('설계서')
    expect(next).toContain('요구 분석')
  })
})

describe('addRow', () => {
  it('기준 행 바로 아래에 같은 들여쓰기로 새 행을 넣는다', () => {
    const { rows } = parseTable('journey', JOURNEY)
    const lines = addRow('journey', JOURNEY, rows[0]).split('\n')
    expect(lines[4]).toBe('    새 작업: 3: ')
    expect(lines[5]).toBe('    출근: 2: 나, 동료')
  })

  it('기준 행이 없으면 코드 끝에 네 칸 들여쓰기로 붙인다', () => {
    expect(addRow('pie', 'pie', null)).toBe('pie\n    "새 항목" : 1')
    expect(addRow('gantt', 'gantt', null).split('\n')[1]).toBe('    새 작업 : 1d')
    expect(addRow('timeline', 'timeline', null).split('\n')[1]).toBe('    새 시점 : 새 사건')
  })
})
