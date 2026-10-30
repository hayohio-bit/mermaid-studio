import { useRef, useState, useCallback, useEffect } from 'react'
import { toPng, toSvg } from 'html-to-image'
import {
  ReactFlow, Background, Controls, MiniMap, ReactFlowProvider,
  applyNodeChanges, applyEdgeChanges, addEdge, reconnectEdge, MarkerType, useReactFlow
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import mermaid from 'mermaid'
import { flowToMermaid } from './flowToMermaid'
import TableEditor from './TableEditor'
import { TABLE_TYPES } from './tableModel.js'
import { serializeWorkspace, parseWorkspace } from './workspaceFile.js'
import {
  edgeLabelProps, unscaleSvg, shapeStyle, RENDER_ID,
  svgToFlow, stateSvgToFlow, classSvgToFlow, erSvgToFlow,
  sequenceSvgToFlow, mindmapSvgToFlow, requirementSvgToFlow,
} from './converters.js'
import { GroupNode, SidePanel, BulkPanel, EdgePanel } from './panels.jsx'
import CodeEditor from './CodeEditor.jsx'
import useHistory from './useHistory.js'

mermaid.initialize({ startOnLoad: false })

// React Flow nodeTypes는 매 렌더마다 객체가 새로 만들어지지 않도록 컴포넌트 밖 상수로 둔다.
// panels.jsx에서 컴포넌트와 함께 export하면 react-refresh/only-export-components 규칙에 걸리므로 여기에 둔다.
const nodeTypes = { labeledGroup: GroupNode }

const defaultCode = `flowchart LR
  A[시작] --> B[처리] --> C[끝]`

const STORAGE_KEY = 'mermaid-studio'
const THEME_KEY = 'mermaid-studio-theme'
const VIEW_KEY = 'mermaid-studio-view'

// 패널·사이드바에 쓰는 중립 색상 테마. 노드·엣지 색은 사용자 콘텐츠라 바꾸지 않는다.
const themes = {
  light: {
    panelBg: '#fafafa',
    border: '#e5e5e5',
    text: '#374151',
    subText: '#6b7280',
    inputBg: '#ffffff',
    syntax: {
      keyword: '#7c3aed',
      label: '#0f766e',
      string: '#b45309',
      arrow: '#dc2626',
      comment: '#9ca3af',
    },
  },
  dark: {
    panelBg: '#1f2937',
    border: '#374151',
    text: '#e5e7eb',
    subText: '#9ca3af',
    inputBg: '#111827',
    syntax: {
      keyword: '#c4b5fd',
      label: '#5eead4',
      string: '#fcd34d',
      arrow: '#fca5a5',
      comment: '#6b7280',
    },
  },
}

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

// 캔버스 보조 UI(미니맵·컨트롤·격자)의 표시 여부. 저장된 값이 없으면 셋 다 켠 상태로 시작한다.
const defaultView = { miniMap: true, controls: true, background: true }

function loadView() {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_KEY))
    return saved ? { ...defaultView, ...saved } : defaultView
  } catch {
    return defaultView
  }
}
function Studio() {
  // localStorage는 마운트 때 한 번만 읽어 네 초기 상태에 나눠 쓴다
  const [saved] = useState(loadSaved)
  const [code, setCode] = useState(() => saved?.code ?? defaultCode)
  const [nodes, setNodes] = useState(() => saved?.nodes ?? [])
  const [edges, setEdges] = useState(() => saved?.edges ?? [])
  // 캔버스가 어떤 mermaid 유형에서 왔는지 기억해서, 코드로 되돌릴 때 원본 문법으로 내보낸다.
  // 전용 문법이 없는 유형(state·class·er·sequence)은 flowchart로 통일한다.
  const [sourceType, setSourceType] = useState(() => saved?.sourceType ?? 'flowchart')
  const [selectedNode, setSelectedNode] = useState(null)
  const [selectedEdge, setSelectedEdge] = useState(null)
  const [status, setStatus] = useState(null) // { type: 'error' | 'info', message }
  // 노드-엣지 모델로 옮길 수 없는 유형은 mermaid가 그린 SVG를 그대로 보여 준다.
  // { type, svg }가 들어 있으면 미리보기 전용 모드이고, null이면 캔버스 편집 모드다.
  const [preview, setPreview] = useState(null)
  const previewRef = useRef(null)
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) === 'dark'
    } catch {
      return false
    }
  })
  const T = themes[dark ? 'dark' : 'light']
  const [view, setView] = useState(loadView)

  const toggleView = (key) => {
    setView((v) => {
      const next = { ...v, [key]: !v[key] }
      try {
        localStorage.setItem(VIEW_KEY, JSON.stringify(next))
      } catch {
        // 저장 실패는 무시한다 (표시 여부는 이번 세션에만 유지된다)
      }
      return next
    })
  }

  const toggleTheme = () => {
    setDark((d) => {
      try {
        localStorage.setItem(THEME_KEY, d ? 'light' : 'dark')
      } catch {
        // 저장 실패는 무시한다
      }
      return !d
    })
  }
  const mermaidRef = useRef(null)

  // 코드·노드·엣지가 바뀔 때마다 localStorage에 저장해서 새로고침해도 유지한다
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ code, nodes, edges, sourceType }))
    } catch {
      // 저장 공간 초과 등은 무시한다 (저장 실패가 편집을 막으면 안 된다)
    }
  }, [code, nodes, edges, sourceType])

  // ---- 실행 취소 / 다시 실행 ----
  // stateRef는 복사·붙여넣기도 최신 nodes·edges를 읽는 데 쓰므로 여기서 만들어 넘긴다.
  const stateRef = useRef({ nodes, edges })
  stateRef.current = { nodes, edges }
  const { record, undo, redo } = useHistory({ stateRef, setNodes, setEdges, setSelectedNode, setSelectedEdge })

  const resetAll = () => {
    record()
    localStorage.removeItem(STORAGE_KEY)
    setCode(defaultCode)
    setNodes([])
    setEdges([])
    setSourceType('flowchart')
    setSelectedNode(null)
    setSelectedEdge(null)
    setStatus(null)
    setPreview(null)
  }

  const onNodesChange = useCallback((changes) => {
    if (changes.some((c) => c.type === 'remove')) record()
    setNodes((nds) => {
      const next = applyNodeChanges(changes, nds)
      // 그룹 노드가 삭제되면 그 자식도 함께 제거한다 (고아 parentId는 오류를 일으킨다)
      const ids = new Set(next.map((n) => n.id))
      return next.filter((n) => !n.parentId || ids.has(n.parentId))
    })
    // 키보드 삭제 등으로 노드가 제거되면 열려 있던 편집 패널을 닫는다
    changes.forEach((c) => {
      if (c.type === 'remove') {
        setSelectedNode((prev) => (prev?.id === c.id ? null : prev))
      }
    })
  }, [record])
  const onEdgesChange = useCallback((changes) => {
    if (changes.some((c) => c.type === 'remove')) record()
    setEdges((eds) => applyEdgeChanges(changes, eds))
    changes.forEach((c) => {
      if (c.type === 'remove') {
        setSelectedEdge((prev) => (prev?.id === c.id ? null : prev))
      }
    })
  }, [record])
  const onConnect = useCallback(
    (connection) => {
      record()
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            style: { stroke: '#9ca3af', strokeWidth: 1.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#9ca3af' },
            ...edgeLabelProps,
          },
          eds
        )
      )
    },
    [record]
  )
  // 엣지 끝을 잡아 다른 노드로 끌면 연결 대상이 바뀐다.
  // shouldReplaceId를 꺼서 엣지 id를 유지한다 — id가 바뀌면 열려 있는 엣지 편집 패널의 대상이 사라진다.
  const onReconnect = useCallback((oldEdge, newConnection) => {
    record()
    setEdges((eds) => reconnectEdge(oldEdge, newConnection, eds, { shouldReplaceId: false }))
    setSelectedEdge((prev) =>
      prev?.id === oldEdge.id ? { ...prev, ...newConnection } : prev
    )
  }, [record])

  const onNodeClick = useCallback((event, node) => {
    // 그룹(subgraph) 노드는 노드 편집 패널의 대상이 아니다
    if (node.type === 'labeledGroup') return
    setSelectedNode(node)
    setSelectedEdge(null)
  }, [])
  const onEdgeClick = useCallback((event, edge) => {
    setSelectedEdge(edge)
    setSelectedNode(null)
  }, [])

  const onPanelChange = (key, value) => {
    record()
    const apply = (n) => {
      if (key === 'label') {
        return { ...n, data: { ...n.data, label: value } }
      }
      if (key === 'shape') {
        // 모양이 바뀌면 모양 기본 스타일로 다시 깔되, 사용자가 바꾼 색·크기는 유지한다
        const base = shapeStyle(value)
        const keep = {}
        ;['background', 'color', 'borderColor', 'fontSize', 'borderWidth'].forEach((k) => {
          if (n.style?.[k]) keep[k] = n.style[k]
        })
        // 이전 모양의 기본 배경을 그대로 쓰고 있었다면 새 모양의 기본 배경을 따른다
        if (keep.background === shapeStyle(n.data?.shape || 'rect').background) {
          delete keep.background
        }
        return { ...n, data: { ...n.data, shape: value }, style: { ...base, ...keep } }
      }
      return { ...n, style: { ...n.style, [key]: value } }
    }
    setNodes((nds) => nds.map((n) => (n.id === selectedNode.id ? apply(n) : n)))
    setSelectedNode((prev) => apply(prev))
  }

  const { screenToFlowPosition, getNodesBounds, fitView } = useReactFlow()

  const addNodeIdRef = useRef(0)
  const addNodeAt = (position) => {
    record()
    let id
    do {
      id = `n${++addNodeIdRef.current}`
    } while (nodes.some((n) => n.id === id))
    setNodes((nds) => [
      ...nds,
      {
        id,
        position,
        data: { label: '새 노드', shape: 'rect' },
        style: shapeStyle('rect'),
      },
    ])
  }

  const addNode = () => {
    const offset = (addNodeIdRef.current + 1) % 5
    addNodeAt({ x: 60 + offset * 30, y: 60 + offset * 30 })
  }

  // 캔버스 빈 곳을 더블클릭하면 그 자리에 노드를 만든다
  const onCanvasDoubleClick = (event) => {
    if (!event.target.classList?.contains('react-flow__pane')) return
    addNodeAt(screenToFlowPosition({ x: event.clientX, y: event.clientY }))
  }

  const deleteSelectedNode = () => {
    record()
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id))
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id))
    setSelectedNode(null)
  }

  // 다중 선택된 노드 (React Flow가 selected 플래그를 관리한다)
  const multiSelectedNodes = nodes.filter((n) => n.selected)

  const onBulkChange = (key, value) => {
    record()
    setNodes((nds) =>
      nds.map((n) => (n.selected ? { ...n, style: { ...n.style, [key]: value } } : n))
    )
  }

  const deleteBulkNodes = () => {
    record()
    const ids = new Set(multiSelectedNodes.map((n) => n.id))
    setNodes((nds) => nds.filter((n) => !ids.has(n.id)))
    setEdges((eds) => eds.filter((e) => !ids.has(e.source) && !ids.has(e.target)))
    setSelectedNode(null)
  }

  // ---- 노드 복사·붙여넣기 ----
  // 시스템 클립보드가 아니라 앱 내부 ref에 담는다. 다른 앱과 주고받을 필요가 없고,
  // 클립보드 권한·직렬화 문제를 겪지 않는다.
  const clipboardRef = useRef(null)
  const pasteCountRef = useRef(0)

  const copySelection = useCallback(() => {
    const { nodes: curNodes, edges: curEdges } = stateRef.current
    const picked = curNodes.filter((n) => n.selected)
    if (picked.length === 0) return
    const ids = new Set(picked.map((n) => n.id))
    clipboardRef.current = {
      nodes: picked,
      // 양쪽 끝이 모두 복사 대상인 엣지만 함께 복사한다
      edges: curEdges.filter((e) => ids.has(e.source) && ids.has(e.target)),
    }
    pasteCountRef.current = 0
    setStatus({ type: 'info', message: `노드 ${picked.length}개를 복사했습니다. Ctrl+V로 붙여넣을 수 있습니다.` })
  }, [])

  const pasteClipboard = useCallback(() => {
    const clip = clipboardRef.current
    if (!clip || clip.nodes.length === 0) return
    record()
    const offset = 40 * (pasteCountRef.current + 1)
    pasteCountRef.current += 1

    const { nodes: curNodes } = stateRef.current
    const existing = new Set(curNodes.map((n) => n.id))
    const idMap = new Map()
    const newId = () => {
      let id
      do {
        id = `n${++addNodeIdRef.current}`
      } while (existing.has(id) || idMap.has(id))
      existing.add(id)
      return id
    }
    clip.nodes.forEach((n) => idMap.set(n.id, newId()))

    const copiedNodes = clip.nodes.map((n) => {
      const parentCopied = n.parentId && idMap.has(n.parentId)
      // 부모 그룹을 함께 복사하지 않았다면 부모 기준 상대 좌표를 절대 좌표로 되돌린다
      const parentPos = !parentCopied && n.parentId
        ? clip.nodes.find((p) => p.id === n.parentId)?.position ??
          curNodes.find((p) => p.id === n.parentId)?.position
        : null
      const base = parentPos
        ? { x: n.position.x + parentPos.x, y: n.position.y + parentPos.y }
        : n.position
      const copy = {
        ...n,
        id: idMap.get(n.id),
        position: { x: base.x + offset, y: base.y + offset },
        selected: true,
      }
      if (parentCopied) {
        copy.parentId = idMap.get(n.parentId)
      } else {
        delete copy.parentId
        delete copy.extent
      }
      return copy
    })

    const copiedEdges = clip.edges.map((e, i) => ({
      ...e,
      id: `e-copy-${addNodeIdRef.current}-${i}`,
      source: idMap.get(e.source),
      target: idMap.get(e.target),
      selected: false,
    }))

    // 원본 선택을 해제해서 붙여넣은 노드만 선택된 상태로 만든다
    setNodes((nds) => [...nds.map((n) => (n.selected ? { ...n, selected: false } : n)), ...copiedNodes])
    setEdges((eds) => [...eds, ...copiedEdges])
    setSelectedNode(null)
    setSelectedEdge(null)
    setStatus({ type: 'info', message: `노드 ${copiedNodes.length}개를 붙여넣었습니다.` })
  }, [record])

  // 텍스트 입력 중에는 브라우저의 기본 복사·붙여넣기를 그대로 둔다
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key === 'c') {
        copySelection()
      } else if (key === 'v') {
        e.preventDefault()
        pasteClipboard()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [copySelection, pasteClipboard])

  const deleteSelectedEdge = () => {
    record()
    setEdges((eds) => eds.filter((e) => e.id !== selectedEdge.id))
    setSelectedEdge(null)
  }

  const onEdgePanelChange = (key, value) => {
    record()
    const apply = (e) => {
      if (key === 'label') {
        // 라벨이 생기면 노드 위 레이어로 올려서 가려지지 않게 한다 (변환기와 같은 규칙)
        return { ...e, label: value, zIndex: value ? 1 : 0 }
      }
      if (key === 'animated') {
        return { ...e, animated: value }
      }
      if (key === 'type') {
        return { ...e, type: value }
      }
      if (key === 'stroke') {
        // 화살촉 색도 선 색과 함께 바꾼다
        return { ...e, style: { ...e.style, stroke: value }, markerEnd: { ...e.markerEnd, type: MarkerType.ArrowClosed, color: value } }
      }
      return { ...e, style: { ...e.style, [key]: value } }
    }
    setEdges((eds) => eds.map((e) => (e.id === selectedEdge.id ? apply(e) : e)))
    setSelectedEdge((prev) => apply(prev))
  }

  const renderDiagram = async () => {
    if (!mermaidRef.current) return
    try {
      const diagram = await mermaid.mermaidAPI.getDiagramFromText(code)

      mermaidRef.current.innerHTML = ''
      const { svg } = await mermaid.render(RENDER_ID, code)
      mermaidRef.current.innerHTML = svg
      const svgEl = mermaidRef.current.querySelector('svg')
      unscaleSvg(svgEl)

      let result
      let notice = null
      let nextSourceType = 'flowchart'
      if (diagram.type.startsWith('flowchart')) {
        result = svgToFlow(svgEl, diagram.db.getEdges(), diagram.db.getSubGraphs(), diagram.db.getVertices())
      } else if (diagram.type.toLowerCase().startsWith('class')) {
        result = classSvgToFlow(svgEl, diagram.db.getRelations())
      } else if (diagram.type === 'sequence') {
        result = sequenceSvgToFlow(svgEl, diagram.db.getActors(), diagram.db.getMessages())
        notice = {
          type: 'info',
          message: '시퀀스 다이어그램은 근사 변환됩니다: 참가자는 노드, 메시지는 순번이 붙은 엣지로 표현되고 시간 축(라이프라인)은 유지되지 않습니다.',
        }
      } else if (diagram.type === 'er' || diagram.type === 'erDiagram') {
        result = erSvgToFlow(svgEl, diagram.db.getRelationships())
      } else if (diagram.type.toLowerCase().startsWith('state')) {
        result = stateSvgToFlow(svgEl, diagram.db.getRelations())
      } else if (diagram.type === 'mindmap') {
        result = mindmapSvgToFlow(svgEl, diagram.db.getMindmap())
        nextSourceType = 'mindmap'
      } else if (diagram.type === 'requirement' || diagram.type === 'requirementDiagram') {
        result = requirementSvgToFlow(
          svgEl,
          diagram.db.getRequirements(),
          diagram.db.getElements(),
          diagram.db.getRelationships(),
        )
        nextSourceType = 'requirement'
        notice = {
          type: 'info',
          message: '요구사항 다이어그램은 노드 라벨의 "키: 값" 줄이 곧 속성입니다. 라벨을 고치면 코드로 내보낼 때 그대로 반영됩니다.',
        }
      } else {
        // 간트·파이처럼 노드-엣지 모델로 옮길 수 없는 유형은 편집 없이 미리보기만 제공한다.
        // 숨김 영역을 비워서 같은 svg id가 문서에 두 번 들어가지 않게 한다
        // (mermaid가 만든 스타일 규칙이 렌더 id 선택자를 쓴다).
        mermaidRef.current.innerHTML = ''
        setPreview({ type: diagram.type, svg })
        setSelectedNode(null)
        setSelectedEdge(null)
        setStatus({
          type: 'info',
          message: TABLE_TYPES.includes(diagram.type)
            ? `${diagram.type} 유형은 캔버스 대신 표로 편집합니다. 표에서 고친 내용은 코드에 바로 반영됩니다.`
            : `${diagram.type} 유형은 미리보기만 지원합니다. 캔버스 편집과 코드 역변환은 사용할 수 없고, 이미지 내보내기만 됩니다.`,
        })
        return
      }

      record()
      setPreview(null)
      setSourceType(nextSourceType)
      setNodes(result.nodes)
      setEdges(result.edges)
      setSelectedNode(null)
      setSelectedEdge(null)
      setStatus(notice)
      // 변환 결과는 mermaid 레이아웃 그대로라 화면보다 클 수 있으므로 한 번 맞춰 준다.
      // 노드가 실제로 반영된 다음에 계산해야 하므로 다음 렌더를 기다린다.
      fitViewOnNextRenderRef.current = true
    } catch (e) {
      setStatus({ type: 'error', message: `문법 오류: ${e.message}` })
    }
  }

  // 코드에서 만든 다이어그램만 화면에 맞춘다. 사용자가 노드를 옮기거나 추가할 때는
  // 보고 있던 시점이 흔들리므로 발동하지 않게 플래그로 구분한다.
  const fitViewOnNextRenderRef = useRef(false)
  useEffect(() => {
    if (!fitViewOnNextRenderRef.current) return
    fitViewOnNextRenderRef.current = false
    if (nodes.length === 0) return
    fitView({ padding: 0.15 })
  }, [nodes, fitView])

  // 코드를 고치면 600ms 뒤에 자동으로 다시 렌더링한다.
  // 첫 마운트(localStorage 복원 직후)에는 실행하지 않는다 — 복원된 노드 스타일을 덮어쓰면 안 되기 때문이다.
  const isFirstCodeEffect = useRef(true)
  const skipAutoRenderRef = useRef(false)
  useEffect(() => {
    if (isFirstCodeEffect.current) {
      isFirstCodeEffect.current = false
      return
    }
    if (skipAutoRenderRef.current) {
      skipAutoRenderRef.current = false
      return
    }
    const timer = setTimeout(renderDiagram, 600)
    return () => clearTimeout(timer)
    // renderDiagram은 매 렌더마다 새로 만들어지므로 code만 의존성으로 둔다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  // 캔버스 → 코드 역변환. 자동 렌더링이 이어서 실행되면 캔버스의 위치·스타일이
  // mermaid 레이아웃으로 초기화되므로, 이 setCode 한 번은 자동 렌더링을 건너뛴다.
  const exportToCode = () => {
    if (preview) {
      setStatus({
        type: 'info',
        message: `${preview.type} 유형은 미리보기 전용이라 캔버스 → 코드 역변환을 지원하지 않습니다.`,
      })
      return
    }
    if (nodes.length === 0) {
      setStatus({ type: 'info', message: '내보낼 노드가 없습니다. 먼저 다이어그램을 만들어 주세요.' })
      return
    }
    skipAutoRenderRef.current = true
    const { code: next, warning } = flowToMermaid(nodes, edges, sourceType)
    setCode(next)
    setStatus(warning ? { type: 'info', message: warning } : null)
  }

  const downloadDataUrl = (dataUrl, filename) => {
    const link = document.createElement('a')
    link.download = filename
    link.href = dataUrl
    link.click()
  }

  // 현재 화면이 아니라 노드 전체 경계를 기준으로 캡처한다.
  // 뷰포트 요소만 찍으므로 미니맵·컨트롤은 이미지에 포함되지 않는다.
  const exportImage = (render, filename) => {
    if (nodes.length === 0) {
      setStatus({ type: 'info', message: '내보낼 노드가 없습니다. 먼저 다이어그램을 만들어 주세요.' })
      return
    }
    const viewportEl = document.querySelector('.react-flow__viewport')
    if (!viewportEl) return
    const bounds = getNodesBounds(nodes)
    const pad = 40
    const width = Math.ceil(bounds.width + pad * 2)
    const height = Math.ceil(bounds.height + pad * 2)
    render(viewportEl, {
      backgroundColor: dark ? '#141414' : '#ffffff',
      width,
      height,
      style: {
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(${pad - bounds.x}px, ${pad - bounds.y}px) scale(1)`,
      },
    }).then((dataUrl) => downloadDataUrl(dataUrl, filename))
  }

  // 미리보기 전용 모드에서는 React Flow 대신 mermaid가 만든 SVG 자체를 대상으로 삼는다.
  // SVG는 스타일이 문서 안에 들어 있어 그대로 내려도 단독으로 열린다.
  const exportPreviewSvg = () =>
    downloadDataUrl(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(preview.svg)}`,
      'mermaid-studio.svg'
    )

  const exportPreviewPng = () => {
    if (!previewRef.current) return
    toPng(previewRef.current, { backgroundColor: '#ffffff' }).then((dataUrl) =>
      downloadDataUrl(dataUrl, 'mermaid-studio.png')
    )
  }

  const exportToPng = () => (preview ? exportPreviewPng() : exportImage(toPng, 'mermaid-studio.png'))
  const exportToSvg = () => (preview ? exportPreviewSvg() : exportImage(toSvg, 'mermaid-studio.svg'))

  // ---- JSON 파일 저장·불러오기 ----
  // 형식은 workspaceFile.js가 정한다. sourceType을 함께 저장해야 불러온 뒤
  // 캔버스 → 코드가 원본 유형(mindmap·requirement)의 문법으로 나간다.
  const exportToJson = () => {
    const payload = serializeWorkspace({ code, nodes, edges, sourceType })
    downloadDataUrl(
      `data:application/json;charset=utf-8,${encodeURIComponent(payload)}`,
      'mermaid-studio.json'
    )
  }

  const fileInputRef = useRef(null)
  const importFromJson = (event) => {
    const file = event.target.files?.[0]
    event.target.value = '' // 같은 파일을 다시 선택해도 change가 발생하게 한다
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = parseWorkspace(reader.result, { defaultCode })
        record()
        skipAutoRenderRef.current = true
        setPreview(null)
        setCode(data.code)
        setNodes(data.nodes)
        setEdges(data.edges)
        setSourceType(data.sourceType)
        setSelectedNode(null)
        setSelectedEdge(null)
        setStatus(null)
      } catch (e) {
        setStatus({ type: 'error', message: `JSON 파일을 읽지 못했습니다: ${e.message}` })
      }
    }
    reader.readAsText(file)
  }

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', background: T.panelBg }}>

      {/* 왼쪽: 코드 입력 */}
      <div style={{
        width: '280px',
        display: 'flex',
        flexDirection: 'column',
        borderRight: `1px solid ${T.border}`,
        background: T.panelBg,
        padding: '16px',
        gap: '12px',
        overflowY: 'auto', // 창이 낮을 때는 사이드바 안에서만 스크롤한다
      }}>
        <h3 style={{ margin: 0, fontSize: '14px', color: T.text }}>Mermaid 코드</h3>
        <CodeEditor value={code} onChange={setCode} T={T} />
        {status && (
          <div role="status" style={{
            padding: '8px 10px',
            borderRadius: '6px',
            fontSize: '12px',
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            background: status.type === 'error' ? '#fef2f2' : '#fffbeb',
            border: `1px solid ${status.type === 'error' ? '#fca5a5' : '#fcd34d'}`,
            color: status.type === 'error' ? '#b91c1c' : '#92400e',
          }}>
            {status.message}
          </div>
        )}

        <button
          onClick={renderDiagram}
          style={{
            padding: '10px',
            background: '#6366f1',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          다이어그램 생성
        </button>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={undo}
            title="실행 취소 (Ctrl+Z)"
            style={{
              flex: 1,
              padding: '8px',
              background: T.inputBg,
              color: T.text,
              border: `1px solid ${T.border}`,
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            ↶ 실행 취소
          </button>
          <button
            onClick={redo}
            title="다시 실행 (Ctrl+Shift+Z)"
            style={{
              flex: 1,
              padding: '8px',
              background: T.inputBg,
              color: T.text,
              border: `1px solid ${T.border}`,
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            ↷ 다시 실행
          </button>
        </div>

        <button
          onClick={addNode}
          disabled={!!preview}
          title={preview ? '미리보기 전용 유형에서는 캔버스를 편집할 수 없습니다' : undefined}
          style={{
            padding: '10px',
            background: T.inputBg,
            color: T.text,
            border: `1px solid ${T.border}`,
            borderRadius: '6px',
            cursor: preview ? 'not-allowed' : 'pointer',
            opacity: preview ? 0.5 : 1,
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          노드 추가
        </button>

        <p style={{ margin: 0, fontSize: '11px', color: T.subText, lineHeight: 1.6 }}>
          선택한 노드는 Ctrl+C·Ctrl+V로 복사할 수 있고, 엣지의 끝점을 드래그하면 연결 대상을 바꿀 수 있습니다.
        </p>

        <button
          onClick={exportToCode}
          disabled={!!preview}
          title={preview ? '미리보기 전용 유형은 역변환을 지원하지 않습니다' : undefined}
          style={{
            padding: '10px',
            background: T.inputBg,
            color: T.text,
            border: `1px solid ${T.border}`,
            borderRadius: '6px',
            cursor: preview ? 'not-allowed' : 'pointer',
            opacity: preview ? 0.5 : 1,
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          캔버스 → 코드
        </button>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={exportToPng}
            style={{
              flex: 1,
              padding: '10px',
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            PNG
          </button>
          <button
            onClick={exportToSvg}
            style={{
              flex: 1,
              padding: '10px',
              background: '#0ea5e9',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            SVG
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={exportToJson}
            style={{
              flex: 1,
              padding: '8px',
              background: T.inputBg,
              color: T.text,
              border: `1px solid ${T.border}`,
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            JSON 저장
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              flex: 1,
              padding: '8px',
              background: T.inputBg,
              color: T.text,
              border: `1px solid ${T.border}`,
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            JSON 열기
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={importFromJson}
            style={{ display: 'none' }}
          />
        </div>

        <button
          onClick={resetAll}
          style={{
            padding: '10px',
            background: T.inputBg,
            color: '#dc2626',
            border: '1px solid #fca5a5',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          초기화
        </button>

        <div style={{ display: 'flex', gap: '6px' }}>
          {[
            { key: 'miniMap', label: '미니맵' },
            { key: 'controls', label: '컨트롤' },
            { key: 'background', label: '격자' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => toggleView(key)}
              title={`${label} ${view[key] ? '숨기기' : '보이기'}`}
              style={{
                flex: 1,
                padding: '8px 4px',
                background: view[key] ? '#6366f1' : T.inputBg,
                color: view[key] ? 'white' : T.subText,
                border: `1px solid ${view[key] ? '#6366f1' : T.border}`,
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          onClick={toggleTheme}
          style={{
            padding: '10px',
            background: T.inputBg,
            color: T.text,
            border: `1px solid ${T.border}`,
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          {dark ? '☀️ 라이트 모드' : '🌙 다크 모드'}
        </button>
      </div>

      {/* 가운데: 캔버스, 또는 미지원 유형일 때는 미리보기 */}
      {preview ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              borderBottom: `1px solid ${T.border}`,
              background: T.panelBg,
              color: T.subText,
              fontSize: '12px',
            }}
          >
            <span
              style={{
                padding: '2px 8px',
                borderRadius: '999px',
                background: '#fef3c7',
                color: '#92400e',
                fontWeight: 500,
                whiteSpace: 'nowrap',
              }}
            >
              {TABLE_TYPES.includes(preview.type) ? '표 편집' : '미리보기 전용'}
            </span>
            <span>
              {TABLE_TYPES.includes(preview.type)
                ? `${preview.type} 유형은 캔버스 대신 아래 표로 편집합니다. 이미지 내보내기도 됩니다.`
                : `${preview.type} 유형은 편집할 수 없고 화면 표시와 이미지 내보내기만 됩니다.`}
            </span>
          </div>
          {/* mermaid 기본 테마는 밝은 배경을 전제하므로 다크 모드에서도 흰 바탕에 그린다 */}
          <div
            ref={previewRef}
            style={{
              flex: 1,
              overflow: 'auto',
              background: '#ffffff',
              padding: '24px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'flex-start',
            }}
            dangerouslySetInnerHTML={{ __html: preview.svg }}
          />
          {TABLE_TYPES.includes(preview.type) && (
            <TableEditor
              type={preview.type}
              code={code}
              onChange={(next) => setCode(next)}
              T={T}
            />
          )}
        </div>
      ) : (
      <div style={{ flex: 1 }} onDoubleClick={onCanvasDoubleClick}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onReconnect={onReconnect}
          reconnectRadius={12}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onNodeDragStart={record}
          deleteKeyCode={['Backspace', 'Delete']}
          multiSelectionKeyCode={['Meta', 'Control']}
          zoomOnDoubleClick={false}
          nodeTypes={nodeTypes}
          colorMode={dark ? 'dark' : 'light'}
          fitView
        >
          {view.background && <Background />}
          {view.controls && <Controls />}
          {view.miniMap && <MiniMap />}
        </ReactFlow>
      </div>
      )}

      {/* 오른쪽: 사이드패널 */}
      {multiSelectedNodes.length > 1 ? (
        <BulkPanel
          nodes={multiSelectedNodes}
          onChange={onBulkChange}
          onDelete={deleteBulkNodes}
          T={T}
        />
      ) : (
        <SidePanel
          node={selectedNode}
          onChange={onPanelChange}
          onClose={() => setSelectedNode(null)}
          onDelete={deleteSelectedNode}
          T={T}
        />
      )}
      <EdgePanel
        edge={selectedEdge}
        onChange={onEdgePanelChange}
        onClose={() => setSelectedEdge(null)}
        onDelete={deleteSelectedEdge}
        T={T}
      />

      {/* mermaid 숨김 렌더링 영역 */}
      <div
        ref={mermaidRef}
        style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none' }}
      />
    </div>
  )
}

// useReactFlow 훅(screenToFlowPosition)을 쓰려면 Provider 안에 있어야 한다
export default function App() {
  return (
    <ReactFlowProvider>
      <Studio />
    </ReactFlowProvider>
  )
}