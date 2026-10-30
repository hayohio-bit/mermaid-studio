// 캔버스 오른쪽에 뜨는 편집 패널들과 subgraph 그룹 노드. 테마(T)와 콜백만 props로 받는다.

// subgraph를 표현하는 그룹 노드: 좌상단에 제목을 표시하는 반투명 컨테이너
export function GroupNode({ data }) {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      border: '1px dashed #9ca3af',
      borderRadius: '8px',
      background: 'rgba(156, 163, 175, 0.08)',
    }}>
      <div style={{
        padding: '4px 10px',
        fontSize: '12px',
        fontWeight: 600,
        color: '#6b7280',
      }}>
        {data.label}
      </div>
    </div>
  )
}

// 사이드패널 컴포넌트
export function SidePanel({ node, onChange, onClose, onDelete, T }) {
  if (!node) return null

  const style = node.style || {}

  return (
    <div style={{
      width: '260px',
      padding: '20px',
      borderLeft: `1px solid ${T.border}`,
      background: T.panelBg,
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      overflowY: 'auto',
    }}>
      <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: T.text }}>노드 편집</h3>

      {/* 텍스트: 클래스·요구사항처럼 여러 줄인 라벨은 줄 수에 맞춘 textarea로 편집한다 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: T.subText }}>텍스트</label>
        {node.data.label?.includes('\n') ? (
          <textarea
            value={node.data.label}
            rows={Math.min(node.data.label.split('\n').length + 1, 10)}
            onChange={(e) => onChange('label', e.target.value)}
            style={{
              padding: '6px 8px',
              border: `1px solid ${T.border}`,
              borderRadius: '6px',
              fontSize: '13px',
              fontFamily: 'inherit',
              resize: 'vertical',
              background: T.inputBg,
              color: T.text,
            }}
          />
        ) : (
          <input
            value={node.data.label}
            onChange={(e) => onChange('label', e.target.value)}
            style={{
              padding: '6px 8px',
              border: `1px solid ${T.border}`,
              borderRadius: '6px',
              fontSize: '14px',
              background: T.inputBg,
              color: T.text,
            }}
          />
        )}
      </div>

      {/* 모양 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: T.subText }}>모양</label>
        <select
          value={node.data.shape || 'rect'}
          onChange={(e) => onChange('shape', e.target.value)}
          style={{
            padding: '6px 8px',
            border: `1px solid ${T.border}`,
            borderRadius: '6px',
            fontSize: '13px',
            background: T.inputBg,
            color: T.text,
          }}
        >
          <option value="rect">사각형 [ ]</option>
          <option value="round">둥근 사각형 ( )</option>
          <option value="stadium">스타디움 ([ ])</option>
          <option value="circle">원 (( ))</option>
          <option value="diamond">마름모 {'{ }'}</option>
          <option value="hexagon">육각형 {'{{ }}'}</option>
          <option value="subroutine">서브루틴 [[ ]]</option>
          <option value="lean_right">평행사변형 [/ /]</option>
          <option value="lean_left">평행사변형(역) [\ \]</option>
          <option value="trapezoid">사다리꼴 [/ \]</option>
          <option value="inv_trapezoid">사다리꼴(역) [\ /]</option>
        </select>
      </div>

      {/* 배경색 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: T.subText }}>배경색</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="color"
            value={style.background || '#ffffff'}
            onChange={(e) => onChange('background', e.target.value)}
            style={{ width: '36px', height: '36px', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
          />
          <span style={{ fontSize: '13px', color: T.subText }}>{style.background || '#ffffff'}</span>
        </div>
      </div>

      {/* 텍스트 색상 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: T.subText }}>텍스트 색상</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="color"
            value={style.color || '#000000'}
            onChange={(e) => onChange('color', e.target.value)}
            style={{ width: '36px', height: '36px', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
          />
          <span style={{ fontSize: '13px', color: T.subText }}>{style.color || '#000000'}</span>
        </div>
      </div>

      {/* 테두리 색상 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: T.subText }}>테두리 색상</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="color"
            value={style.borderColor || '#d1d5db'}
            onChange={(e) => onChange('borderColor', e.target.value)}
            style={{ width: '36px', height: '36px', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
          />
          <span style={{ fontSize: '13px', color: T.subText }}>{style.borderColor || '#d1d5db'}</span>
        </div>
      </div>

      {/* 폰트 크기 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: T.subText }}>폰트 크기: {style.fontSize || '14px'}</label>
        <input
          type="range"
          min="10"
          max="24"
          value={parseInt(style.fontSize) || 14}
          onChange={(e) => onChange('fontSize', `${e.target.value}px`)}
          style={{ width: '100%' }}
        />
      </div>

      {/* 테두리 굵기 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: T.subText }}>테두리 굵기: {style.borderWidth || '1px'}</label>
        <input
          type="range"
          min="1"
          max="6"
          value={parseInt(style.borderWidth) || 1}
          onChange={(e) => onChange('borderWidth', `${e.target.value}px`)}
          style={{ width: '100%' }}
        />
      </div>

      {/* 테두리 둥글기 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: T.subText }}>모서리 둥글기: {style.borderRadius || '6px'}</label>
        <input
          type="range"
          min="0"
          max="30"
          value={parseInt(style.borderRadius) || 6}
          onChange={(e) => onChange('borderRadius', `${e.target.value}px`)}
          style={{ width: '100%' }}
        />
      </div>

      <button
        onClick={onDelete}
        style={{
          marginTop: 'auto',
          padding: '8px',
          border: '1px solid #fca5a5',
          borderRadius: '6px',
          background: '#fef2f2',
          color: '#dc2626',
          cursor: 'pointer',
          fontSize: '13px',
        }}
      >
        노드 삭제
      </button>
      <button
        onClick={onClose}
        style={{
          padding: '8px',
          border: `1px solid ${T.border}`,
          borderRadius: '6px',
          background: T.inputBg,
          color: T.text,
          cursor: 'pointer',
          fontSize: '13px',
        }}
      >
        닫기
      </button>
    </div>
  )
}

// 여러 노드를 선택했을 때의 일괄 편집 패널
export function BulkPanel({ nodes, onChange, onDelete, T }) {
  const first = nodes[0]
  const style = first.style || {}

  const colorRow = (label, key, fallback) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={{ fontSize: '12px', color: T.subText }}>{label}</label>
      <input
        type="color"
        value={style[key] || fallback}
        onChange={(e) => onChange(key, e.target.value)}
        style={{ width: '36px', height: '36px', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
      />
    </div>
  )

  return (
    <div style={{
      width: '260px',
      padding: '20px',
      borderLeft: `1px solid ${T.border}`,
      background: T.panelBg,
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      overflowY: 'auto',
    }}>
      <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: T.text }}>
        일괄 편집 ({nodes.length}개 노드)
      </h3>

      {colorRow('배경색', 'background', '#ffffff')}
      {colorRow('텍스트 색상', 'color', '#000000')}
      {colorRow('테두리 색상', 'borderColor', '#d1d5db')}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: T.subText }}>폰트 크기: {style.fontSize || '14px'}</label>
        <input
          type="range"
          min="10"
          max="24"
          value={parseInt(style.fontSize) || 14}
          onChange={(e) => onChange('fontSize', `${e.target.value}px`)}
          style={{ width: '100%' }}
        />
      </div>

      <button
        onClick={onDelete}
        style={{
          marginTop: 'auto',
          padding: '8px',
          border: '1px solid #fca5a5',
          borderRadius: '6px',
          background: '#fef2f2',
          color: '#dc2626',
          cursor: 'pointer',
          fontSize: '13px',
        }}
      >
        선택한 노드 모두 삭제
      </button>
      <p style={{ margin: 0, fontSize: '11px', color: T.subText, lineHeight: 1.5 }}>
        Shift+드래그 또는 Ctrl+클릭으로 여러 노드를 선택할 수 있습니다.
      </p>
    </div>
  )
}

// 엣지 편집 사이드패널
export function EdgePanel({ edge, onChange, onClose, onDelete, T }) {
  if (!edge) return null

  const style = edge.style || {}

  return (
    <div style={{
      width: '260px',
      padding: '20px',
      borderLeft: `1px solid ${T.border}`,
      background: T.panelBg,
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      overflowY: 'auto',
    }}>
      <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: T.text }}>엣지 편집</h3>

      {/* 라벨 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: T.subText }}>라벨</label>
        <input
          value={edge.label || ''}
          onChange={(e) => onChange('label', e.target.value)}
          style={{
            padding: '6px 8px',
            border: `1px solid ${T.border}`,
            borderRadius: '6px',
            fontSize: '14px',
            background: T.inputBg,
            color: T.text,
          }}
        />
      </div>

      {/* 선 모양 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: T.subText }}>선 모양</label>
        <select
          value={edge.type || 'default'}
          onChange={(e) => onChange('type', e.target.value)}
          style={{
            padding: '6px 8px',
            border: `1px solid ${T.border}`,
            borderRadius: '6px',
            fontSize: '13px',
            background: T.inputBg,
            color: T.text,
          }}
        >
          <option value="default">곡선</option>
          <option value="smoothstep">계단</option>
          <option value="straight">직선</option>
        </select>
      </div>

      {/* 선 색상 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: T.subText }}>선 색상</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="color"
            value={style.stroke || '#9ca3af'}
            onChange={(e) => onChange('stroke', e.target.value)}
            style={{ width: '36px', height: '36px', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
          />
          <span style={{ fontSize: '13px', color: T.subText }}>{style.stroke || '#9ca3af'}</span>
        </div>
      </div>

      {/* 선 굵기 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: T.subText }}>선 굵기: {style.strokeWidth || 1.5}px</label>
        <input
          type="range"
          min="1"
          max="6"
          step="0.5"
          value={parseFloat(style.strokeWidth) || 1.5}
          onChange={(e) => onChange('strokeWidth', Number(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>

      {/* 애니메이션 */}
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: T.text, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={!!edge.animated}
          onChange={(e) => onChange('animated', e.target.checked)}
        />
        흐름 애니메이션
      </label>

      <button
        onClick={onDelete}
        style={{
          marginTop: 'auto',
          padding: '8px',
          border: '1px solid #fca5a5',
          borderRadius: '6px',
          background: '#fef2f2',
          color: '#dc2626',
          cursor: 'pointer',
          fontSize: '13px',
        }}
      >
        엣지 삭제
      </button>
      <button
        onClick={onClose}
        style={{
          padding: '8px',
          border: `1px solid ${T.border}`,
          borderRadius: '6px',
          background: T.inputBg,
          color: T.text,
          cursor: 'pointer',
          fontSize: '13px',
        }}
      >
        닫기
      </button>
    </div>
  )
}
