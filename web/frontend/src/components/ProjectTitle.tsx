"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";

import { api } from "../lib/api";
import { Project } from "../lib/types";
import ErrorNote from "./ErrorNote";
import { PROJECTS_CHANGED } from "./Sidebar";

/**
 * 화면 제목 "KEY · 이름" 을 그린다.
 *
 * 키는 고정이고, 이름을 누르면 그 자리에서 바로 고칠 수 있다.
 *
 * @param projectKey 프로젝트 키.
 * @param suffix 이름 뒤에 붙일 화면 이름 (예: 타임라인).
 */
export default function ProjectTitle({ projectKey, suffix, children }: { projectKey: string; suffix?: string; children?: ReactNode }) {
  const [project, setProject] = useState<Project | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () => api<Project>(`/projects/${projectKey}`).then(setProject).catch(() => setProject(null));
    load();
    window.addEventListener(PROJECTS_CHANGED, load);
    return () => window.removeEventListener(PROJECTS_CHANGED, load);
  }, [projectKey]);

  function start() {
    setName(project?.name ?? "");
    setError(null);
    setEditing(true);
  }

  async function save(event?: FormEvent) {
    event?.preventDefault();
    const next = name.trim();
    if (!next || next === project?.name) {
      setEditing(false);
      return;
    }
    try {
      setProject(await api<Project>(`/projects/${projectKey}`, { method: "PATCH", body: { name: next } }));
      window.dispatchEvent(new Event(PROJECTS_CHANGED));
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <h1 className="project-title">
        <span title="키는 바꿀 수 없습니다">{projectKey}</span>
        <span className="muted"> · </span>
        {editing ? (
          <form onSubmit={save} className="inline-form">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => save()}
              onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
              maxLength={100}
              onFocus={(e) => e.target.select()}
              autoFocus
            />
          </form>
        ) : (
          <button className="title-name" onClick={start} title="눌러서 이름 변경">
            {project?.name ?? "…"}
          </button>
        )}
        {suffix && <span className="muted"> {suffix}</span>}
        {children}
      </h1>
      <ErrorNote message={error} />
    </>
  );
}
