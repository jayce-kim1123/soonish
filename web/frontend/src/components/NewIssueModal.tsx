"use client";

import { FormEvent, useEffect, useState } from "react";

import { api } from "../lib/api";
import { ISSUE_TYPES, PRIORITIES, PRIORITY_LABEL, Project, TYPE_LABEL } from "../lib/types";
import ErrorNote from "./ErrorNote";

/**
 * 새 이슈를 만드는 모달. 프로젝트를 고르고 제목, 유형, 우선순위를 정한다.
 *
 * 상태는 프로젝트의 첫 번째 상태로 들어간다. 일정과 담당자는 만든 뒤에 이슈에서 정한다.
 *
 * @param projects 고를 수 있는 프로젝트 목록.
 * @param onClose 모달을 닫을 때 부르는 함수.
 * @param onCreated 이슈를 만든 뒤 화면을 다시 불러오는 함수.
 */
export default function NewIssueModal({
  projects,
  onClose,
  onCreated,
}: {
  projects: Project[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [projectKey, setProjectKey] = useState(projects[0]?.key ?? "");
  const [title, setTitle] = useState("");
  const [issueType, setIssueType] = useState("task");
  const [priority, setPriority] = useState("medium");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  async function create(event: FormEvent) {
    event.preventDefault();
    try {
      await api(`/projects/${projectKey}/issues`, { method: "POST", body: { title, issue_type: issueType, priority } });
      onCreated();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal" onSubmit={create} onMouseDown={(e) => e.stopPropagation()}>
        <h3>새 이슈</h3>
        <ErrorNote message={error} />
        <label className="modal-field">
          <span>프로젝트</span>
          <select value={projectKey} onChange={(e) => setProjectKey(e.target.value)}>
            {projects.map((p) => (
              <option key={p.key} value={p.key}>
                {p.key} · {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="modal-field">
          <span>제목</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="이슈 제목" maxLength={200} required autoFocus />
        </label>
        <label className="modal-field">
          <span>유형</span>
          <select value={issueType} onChange={(e) => setIssueType(e.target.value)}>
            {ISSUE_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="modal-field">
          <span>우선순위</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        <div className="row modal-actions">
          <button type="submit">만들기</button>
          <button type="button" onClick={onClose}>
            취소
          </button>
        </div>
      </form>
    </div>
  );
}
