import { parseTable, updateCell, deleteRow, addRow } from './tableModel.js'

// 미리보기 전용 유형 가운데 pie·gantt·journey·timeline은 행 구조가 뚜렷하므로
// 캔버스 대신 표로 편집한다. 편집 결과는 코드에 바로 반영되고,
// 코드가 바뀌면 기존 자동 렌더링이 미리보기를 다시 그린다.
export default function TableEditor({ type, code, onChange, T }) {
  const table = parseTable(type, code)
  if (!table) return null
  const { columns, rows } = table

  const cellStyle = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '6px 8px',
    borderRadius: '6px',
    border: `1px solid ${T.border}`,
    background: T.inputBg,
    color: T.text,
    fontSize: '13px',
  }

  // 같은 구획이 이어지는 동안에는 머리글을 한 번만 보여 준다.
  const sectionHeaders = rows.map((row, i) =>
    i === 0 || rows[i - 1].section !== row.section ? row.section : null
  )

  return (
    <div
      style={{
        borderTop: `1px solid ${T.border}`,
        background: T.panelBg,
        color: T.text,
        padding: '12px',
        maxHeight: '40%',
        overflow: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <strong style={{ fontSize: '13px' }}>표 편집</strong>
        <span style={{ fontSize: '12px', color: T.subText }}>
          칸을 고치면 코드와 미리보기에 바로 반영됩니다.
        </span>
        <button
          onClick={() => onChange(addRow(type, code, rows[rows.length - 1]))}
          style={{
            marginLeft: 'auto',
            padding: '4px 10px',
            borderRadius: '6px',
            border: `1px solid ${T.border}`,
            background: T.inputBg,
            color: T.text,
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          + 행 추가
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', padding: '0 32px 6px 0', fontSize: '12px', color: T.subText }}>
        {columns.map((c) => (
          <div key={c.key} style={{ flex: c.flex }}>
            {c.label}
          </div>
        ))}
      </div>

      {rows.length === 0 && (
        <div style={{ fontSize: '12px', color: T.subText, padding: '8px 0' }}>
          편집할 행이 없습니다. “행 추가”로 첫 행을 만들 수 있습니다.
        </div>
      )}

      {rows.map((row, i) => {
        const sectionHeader = sectionHeaders[i]
        return (
          <div key={row.lineIndex}>
            {sectionHeader && (
              <div style={{ fontSize: '12px', color: T.subText, margin: '8px 0 4px' }}>
                구획: {sectionHeader}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
              {columns.map((c) => (
                <input
                  key={c.key}
                  value={row.values[c.key]}
                  onChange={(e) => onChange(updateCell(type, code, row, c.key, e.target.value))}
                  style={{ ...cellStyle, flex: c.flex }}
                />
              ))}
              <button
                onClick={() => onChange(deleteRow(code, row))}
                title="행 삭제"
                style={{
                  width: '24px',
                  height: '24px',
                  flex: '0 0 24px',
                  borderRadius: '6px',
                  border: `1px solid ${T.border}`,
                  background: T.inputBg,
                  color: T.subText,
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
