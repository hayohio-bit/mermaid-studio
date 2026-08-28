# Mermaid Studio

Mermaid 코드와 시각 편집기를 양방향으로 오가며 다이어그램을 만드는 웹 도구입니다. 왼쪽 편집기에 Mermaid 코드를 입력하면 가운데 캔버스에 편집 가능한 노드·엣지로 변환되고, 캔버스에서 다듬은 결과를 다시 Mermaid 코드로 되돌릴 수 있습니다.

React 19 + Vite 기반이며, 다이어그램 파싱에는 [mermaid](https://mermaid.js.org), 캔버스에는 [React Flow(@xyflow/react)](https://reactflow.dev)를 사용합니다.

![전체 화면](docs/images/02-flowchart.jpg)

## 시작하기

```bash
npm install
npm run dev
```

개발 서버가 출력하는 주소(기본값은 `http://localhost:5173`)를 브라우저에서 엽니다. 프로덕션 번들은 `npm run build`로 만들고 `npm run preview`로 확인합니다.

## 주요 기능

- Mermaid 코드를 입력하면 600밀리초 뒤에 자동으로 캔버스에 반영됩니다.
- 노드의 텍스트, 모양, 색상, 폰트 크기, 테두리를 오른쪽 패널에서 편집합니다.
- 엣지의 라벨, 선 모양, 색상, 굵기, 흐름 애니메이션을 편집합니다.
- 캔버스에서 다듬은 결과를 Mermaid 코드로 역변환합니다.
- PNG·SVG 이미지와 JSON 작업 파일로 내보내고, JSON은 다시 불러올 수 있습니다.
- 작업 내용은 브라우저의 localStorage에 자동 저장되어 새로 고쳐도 유지됩니다.

## 지원하는 다이어그램 유형

| 유형 | 캔버스 편집 | 코드 역변환 | 비고 |
| --- | --- | --- | --- |
| `flowchart` / `graph` | 지원 | 지원 | 서브그래프와 노드 모양을 함께 옮깁니다. |
| `classDiagram` | 지원 | flowchart 형식으로 | 클래스는 노드, 관계는 엣지가 됩니다. |
| `stateDiagram` | 지원 | flowchart 형식으로 | 상태 전이를 엣지로 옮깁니다. |
| `erDiagram` | 지원 | flowchart 형식으로 | 엔티티와 관계를 옮깁니다. |
| `sequenceDiagram` | 근사 변환 | flowchart 형식으로 | 시간 축(라이프라인)은 유지되지 않습니다. |
| `mindmap` | 지원 | mindmap 형식으로 | 트리 구조와 노드 모양을 원래 문법으로 되돌립니다. |
| `requirementDiagram` | 지원 | requirementDiagram 형식으로 | 요구사항 속성은 노드 라벨의 `키: 값` 줄로 편집합니다. |
| `pie`, `gantt`, `journey`, `timeline` | 표 편집 | 표에서 고친 내용이 코드에 반영 | 미리보기 아래의 표에서 행 단위로 편집합니다. |
| 그 밖의 유형 | 미리보기 전용 | 미지원 | 화면 표시와 이미지 내보내기만 됩니다. |

자세한 사용 방법은 [사용 가이드](docs/guide.md)를 참고하십시오.
