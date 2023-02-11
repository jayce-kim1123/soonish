"use client";

import { FormEvent, useEffect, useState } from "react";

import { api } from "../lib/api";
import { Issue, Member, Phase } from "../lib/types";
import ErrorNote from "./ErrorNote";

/**
 * 이슈에 단계를 추가하거나 고칠 때 뜨는 모달. 일정과 담당자를 고른다.
 *
 * 일정은 비워 둘 수 있다. 비워 두면 하위 이슈들의 일정을 따라간다.
 *
 * @param projectKey 이슈가 속한 프로젝트 키.
 * @param issue 대상 이슈.
 * @param phase 추가하거나 고칠 단계.
 * @param onClose 모달을 닫을 때 부르는 함수.
 * @param onSaved 저장하거나 단계를 뺀 뒤 화면을 다시 불러오는 함수.
 */
export default function PhaseModal({
  projectKey,
  issue,
  phase,
  onClose,
  onSaved,
}: {
  projectKey: string;
  issue: Issue;
  phase: Phase;
  onClose: () => void;
  onSaved: () => void;
}) {
  const existing = issue.phases.find((p) => p.phase === phase.id);
  const adding = !existing?.selected;
  // 하위 이슈에서 계산된 일정은 입력칸에 채우지 않는다. 직접 정한 일정만 채운다.
  const own = existing?.source === "own" ? existing : undefined;

  const [members, setMembers] = useState<Member[]>([]);
  const [start, setStart] = useState(own?.start_date ?? "");
  const [end, setEnd] = useState(own?.end_date ?? "");
  const [assignees, setAssignees] = useState<number[]>(existing?.selected ? existing.assignees : []);
  const [error, setError] = useState<string | null>(null);
  const base = `/projects/${projectKey}/issues/${issue.number}/phases/${phase.id}`;

  useEffect(() => {
    api<Member[]>("/members").then(setMembers).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const toggleAssignee = (id: number) =>
    setAssignees((current) => (current.includes(id) ? current.filter((a) => a !== id) : [...current, id]));

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!start && end) {
      setError("종료일만 입력할 수 없습니다. 시작일도 골라 주세요.");
      return;
    }
    if (start && end && end < start) {
      setError("종료일은 시작일보다 빠를 수 없습니다.");
      return;
    }
    try {
      await api(base, {
        method: "PUT",
        body: {
          start_date: start || null,
          end_date: start ? (phase.is_range ? end || start : start) : null,
          assignees,
        },
      });
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function drop() {
    try {
      await api(base, { method: "DELETE" });
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal" onSubmit={save} onMouseDown={(e) => e.stopPropagation()}>
        <h3>
          <span className="dot" style={{ background: phase.color }} /> {phase.name} 단계 {adding ? "추가" : "수정"}
        </h3>
        <p className="muted">
          {issue.ref} {issue.title}
        </p>
        <ErrorNote message={error} />

        <label className="modal-field">
          <span>{phase.is_range ? "시작일" : "날짜"}</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} autoFocus />
        </label>
        {phase.is_range && (
          <label className="modal-field">
            <span>종료일</span>
            <input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} disabled={!start} />
          </label>
        )}
        {existing?.source === "rollup" && !start && <p className="muted">일정을 비워 두면 하위 이슈들의 일정을 따라갑니다.</p>}

        <div className="modal-field">
          <span>담당자</span>
          <div className="modal-assignees">
            {members.map((m) => (
              <label key={m.id} className={assignees.includes(m.id) ? "ctx-item on" : "ctx-item"}>
                <input type="checkbox" hidden checked={assignees.includes(m.id)} onChange={() => toggleAssignee(m.id)} />
                {m.name}
                {m.position && <span className="muted"> {m.position}</span>}
              </label>
            ))}
            {members.length === 0 && <span className="muted">등록된 멤버가 없습니다. 설정에서 멤버를 먼저 추가해 주세요.</span>}
          </div>
        </div>

        <div className="row modal-actions">
          <button type="submit">{adding ? "추가" : "저장"}</button>
          <button type="button" onClick={onClose}>
            취소
          </button>
          {!adding && (
            <button type="button" className="danger" onClick={drop}>
              단계 빼기
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
