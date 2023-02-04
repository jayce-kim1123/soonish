"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { api } from "../lib/api";
import { Project } from "../lib/types";

/** 프로젝트 목록이 바뀐 화면은 이 이벤트로 사이드바에 알린다. */
export const PROJECTS_CHANGED = "projects-changed";

const VIEWS = [
  ["timeline", "타임라인"],
  ["calendar", "캘린더"],
  ["", "이슈 목록"],
];

export default function Sidebar() {
  const pathname = usePathname() ?? "/";
  const [projects, setProjects] = useState<Project[]>([]);
  const [adding, setAdding] = useState(false);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Project[]>("/projects").then(setProjects).catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(PROJECTS_CHANGED, load);
    return () => window.removeEventListener(PROJECTS_CHANGED, load);
  }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/projects", { method: "POST", body: { key: key.toUpperCase(), name } });
      setKey("");
      setName("");
      setAdding(false);
      setError(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const activeKey = pathname.startsWith("/projects/") ? pathname.split("/")[2] : null;
  const activeView = pathname.split("/")[3] ?? "";

  return (
    <nav className="sidebar">
      <Link href="/" className="brand">
        Soonish
      </Link>
      <div className="side-title">프로젝트</div>
      <ul>
        {projects.map((project) => (
          <li key={project.key}>
            <Link
              href={`/projects/${project.key}/timeline`}
              className={project.key === activeKey ? "side-link active" : "side-link"}
            >
              <strong>{project.key}</strong> {project.name}
            </Link>
            {project.key === activeKey && (
              <ul className="side-sub">
                {VIEWS.map(([path, label]) => (
                  <li key={label}>
                    <Link
                      href={`/projects/${project.key}${path ? `/${path}` : ""}`}
                      className={path === activeView || (path === "" && activeView === "issues") ? "side-link active" : "side-link"}
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
        {projects.length === 0 && <li className="muted side-empty">아직 프로젝트가 없습니다.</li>}
      </ul>
      <div className="side-title side-settings">설정</div>
      <Link href="/settings/phases" className={pathname.startsWith("/settings/phases") ? "side-link active" : "side-link"}>
        단계 관리
      </Link>
      <Link href="/settings/members" className={pathname.startsWith("/settings/members") ? "side-link active" : "side-link"}>
        멤버 관리
      </Link>
      {adding ? (
        <form onSubmit={create} className="side-form">
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="KEY" maxLength={10} required autoFocus />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="프로젝트 이름" required />
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button type="submit">만들기</button>
            <button type="button" onClick={() => setAdding(false)}>
              취소
            </button>
          </div>
        </form>
      ) : (
        <button className="side-add" onClick={() => setAdding(true)}>
          + 새 프로젝트
        </button>
      )}
    </nav>
  );
}
