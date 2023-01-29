"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";

import { api } from "../lib/api";
import { Project } from "../lib/types";
import ErrorNote from "./ErrorNote";
import { PROJECTS_CHANGED } from "./Sidebar";

// Page heading "KEY · name". The key is fixed; clicking the name edits it in place.
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
        <span title="The key cannot be changed">{projectKey}</span>
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
          <button className="title-name" onClick={start} title="Click to rename">
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
