"use client";

import { useCallback, useEffect, useState } from "react";

import { api } from "../lib/api";
import { Project, Status } from "../lib/types";
import ErrorNote from "./ErrorNote";
import StatusPanel from "./StatusPanel";

/**
 * 프로젝트 설정 모달. 이 프로젝트의 상태 목록을 관리하고, 프로젝트를 삭제할 수 있다.
 *
 * @param project 대상 프로젝트.
 * @param onClose 모달을 닫을 때 부르는 함수.
 * @param onDeleted 프로젝트를 지운 뒤 화면을 다시 불러오는 함수.
 */
export default function ProjectSettingsModal({
  project,
  onClose,
  onDeleted,
}: {
  project: Project;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Status[]>([]);

  const loadStatuses = useCallback(() => {
    api<Status[]>(`/projects/${project.key}/statuses`).then(setStatuses).catch((e) => setError(e.message));
  }, [project.key]);

  useEffect(loadStatuses, [loadStatuses]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  async function remove() {
    if (!confirm(`${project.key} 프로젝트와 안에 있는 모든 이슈를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      await api(`/projects/${project.key}`, { method: "DELETE" });
      onDeleted();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3>프로젝트 설정</h3>
        <p className="muted">
          {project.key} · {project.name}
        </p>
        <ErrorNote message={error} />
        <StatusPanel projectKey={project.key} statuses={statuses} onChange={loadStatuses} />
        <div className="danger-zone">
          <strong>프로젝트 삭제</strong>
          <p className="muted">프로젝트와 그 안의 모든 이슈, 댓글, 일정이 함께 지워지고 되돌릴 수 없습니다.</p>
          <button type="button" className="danger" onClick={remove}>
            프로젝트 삭제
          </button>
        </div>
        <div className="row modal-actions">
          <button type="button" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
