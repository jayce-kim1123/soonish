"use client";

import { useEffect, useRef, useState } from "react";

import { api } from "../lib/api";
import {
  CATEGORY_LABEL,
  ISSUE_TYPES,
  Issue,
  PRIORITIES,
  PRIORITY_LABEL,
  Phase,
  Status,
  TYPE_LABEL,
} from "../lib/types";

/**
 * 이슈를 오른쪽 마우스로 눌렀을 때 뜨는 메뉴. 상태, 우선순위, 유형, 사용할 단계를 바로 바꾼다.
 *
 * 항목을 고르면 서버에 저장하고 메뉴를 닫은 뒤 onChanged 를 부른다.
 *
 * @param x 메뉴를 띄울 화면 가로 좌표.
 * @param y 메뉴를 띄울 화면 세로 좌표.
 * @param projectKey 이슈가 속한 프로젝트 키.
 * @param issue 대상 이슈.
 * @param statuses 그 프로젝트의 상태 목록.
 * @param phases 전체 단계 목록.
 * @param onClose 메뉴를 닫을 때 부르는 함수.
 * @param onChanged 이슈가 바뀐 뒤 화면을 다시 불러오는 함수.
 * @param onOpen 이슈 열기를 눌렀을 때 부르는 함수 (이슈 드로워를 연다).
 * @param onPhase 단계 칩을 눌렀을 때 부르는 함수. 일정과 담당자를 고르는 모달은 부른 쪽에서 띄운다.
 */
export default function IssueContextMenu({
  x,
  y,
  projectKey,
  issue,
  statuses,
  phases,
  onClose,
  onChanged,
  onOpen,
  onPhase,
}: {
  x: number;
  y: number;
  projectKey: string;
  issue: Issue;
  statuses: Status[];
  phases: Phase[];
  onClose: () => void;
  onChanged: () => void;
  onOpen: () => void;
  onPhase: (phase: Phase) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const base = `/projects/${projectKey}/issues/${issue.number}`;

  // 바깥을 누르거나 Esc 를 누르거나 스크롤하면 닫는다.
  useEffect(() => {
    const outside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", outside);
    window.addEventListener("keydown", key);
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("mousedown", outside);
      window.removeEventListener("keydown", key);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  /** 요청을 보내고 성공하면 닫는다. 실패하면 메뉴 안에 오류를 보여 준다. */
  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      onChanged();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const patch = (body: Record<string, unknown>) => run(() => api(base, { method: "PATCH", body }));

  const chosen = (phase: Phase) => issue.phases.find((p) => p.phase === phase.id)?.selected ?? false;

  function addSub() {
    const title = prompt("새 하위 이슈 제목");
    if (title) run(() => api(`/projects/${projectKey}/issues`, { method: "POST", body: { title, parent: issue.number } }));
  }

  function remove() {
    if (confirm(`이슈 ${issue.ref}와 모든 하위 이슈를 삭제할까요?`)) run(() => api(base, { method: "DELETE" }));
  }

  const left = Math.min(x, window.innerWidth - 380);
  const top = Math.min(y, window.innerHeight - 330);

  return (
    <div ref={ref} className="ctx-menu" style={{ left: Math.max(8, left), top: Math.max(8, top) }} onContextMenu={(e) => e.preventDefault()}>
      <div className="ctx-title">
        <span className="muted">{issue.ref}</span> {issue.title}
      </div>
      {error && <p className="error">{error}</p>}

      <div className="ctx-group">
        <span className="ctx-label">상태</span>
        {statuses.map((s) => (
          <button key={s.id} className={s.id === issue.status ? "ctx-item on" : "ctx-item"} onClick={() => patch({ status: s.id })} title={CATEGORY_LABEL[s.category]}>
            {s.name}
          </button>
        ))}
      </div>
      <div className="ctx-group">
        <span className="ctx-label">우선순위</span>
        {PRIORITIES.map((p) => (
          <button key={p} className={p === issue.priority ? "ctx-item on" : "ctx-item"} onClick={() => patch({ priority: p })}>
            {PRIORITY_LABEL[p]}
          </button>
        ))}
      </div>
      <div className="ctx-group">
        <span className="ctx-label">유형</span>
        {ISSUE_TYPES.map((t) => (
          <button key={t} className={t === issue.issue_type ? "ctx-item on" : "ctx-item"} onClick={() => patch({ issue_type: t })}>
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      <div className="ctx-group">
        <span className="ctx-label" title="누르면 일정과 담당자를 고르는 창이 열립니다">단계</span>
        {phases.map((phase) => (
          <button key={phase.id} className={chosen(phase) ? "ctx-item on" : "ctx-item"} onClick={() => onPhase(phase)}>
            <span className="dot" style={{ background: phase.color }} /> {phase.name}
          </button>
        ))}
      </div>
      <div className="ctx-actions">
        <button className="link" onClick={() => {
            onOpen();
            onClose();
          }}>
          이슈 열기
        </button>
        <button className="link" onClick={addSub}>
          하위 이슈 추가
        </button>
        <button className="link danger" onClick={remove}>
          삭제
        </button>
      </div>
    </div>
  );
}
