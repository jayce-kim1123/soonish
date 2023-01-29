"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { api } from "../lib/api";
import { Project } from "../lib/types";

// Pages that change the project list announce it with this event.
export const PROJECTS_CHANGED = "projects-changed";

const VIEWS = [
  ["timeline", "Timeline"],
  ["calendar", "Calendar"],
  ["", "Issues"],
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
      <div className="side-title">Projects</div>
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
        {projects.length === 0 && <li className="muted side-empty">No projects yet.</li>}
      </ul>
      {adding ? (
        <form onSubmit={create} className="side-form">
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="KEY" maxLength={10} required autoFocus />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" required />
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button type="submit">Create</button>
            <button type="button" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button className="side-add" onClick={() => setAdding(true)}>
          + New project
        </button>
      )}
    </nav>
  );
}
