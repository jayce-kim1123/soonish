"use client";

import { FormEvent, useState } from "react";

import { api } from "../lib/api";
import { CATEGORIES, CATEGORY_LABEL, Category, Status } from "../lib/types";
import ErrorNote from "./ErrorNote";

export default function StatusPanel({
  projectKey,
  statuses,
  onChange,
}: {
  projectKey: string;
  statuses: Status[];
  onChange: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("todo");
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      setError(null);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function add(event: FormEvent) {
    event.preventDefault();
    run(async () => {
      await api(`/projects/${projectKey}/statuses`, {
        method: "POST",
        body: { name, category, position: statuses.length },
      });
      setName("");
    });
  }

  function rename(status: Status) {
    const next = prompt("상태 이름", status.name);
    if (next && next !== status.name) {
      run(() => api(`/projects/${projectKey}/statuses/${status.id}`, { method: "PATCH", body: { name: next } }));
    }
  }

  function move(status: Status, step: number) {
    const other = statuses[statuses.indexOf(status) + step];
    if (!other) return;
    run(async () => {
      await api(`/projects/${projectKey}/statuses/${status.id}`, { method: "PATCH", body: { position: other.position } });
      await api(`/projects/${projectKey}/statuses/${other.id}`, { method: "PATCH", body: { position: status.position } });
    });
  }

  return (
    <section>
      <h2>상태</h2>
      <ErrorNote message={error} />
      <ul className="list">
        {statuses.map((status) => (
          <li key={status.id}>
            <span>
              {status.name}
              {status.name !== CATEGORY_LABEL[status.category] && <span className="muted"> ({CATEGORY_LABEL[status.category]})</span>}
            </span>
            <span>
              <button className="link" onClick={() => move(status, -1)}>
                위로
              </button>
              <button className="link" onClick={() => move(status, 1)}>
                아래로
              </button>
              <button className="link" onClick={() => rename(status)}>
                이름 변경
              </button>
              <button
                className="link"
                onClick={() => run(() => api(`/projects/${projectKey}/statuses/${status.id}`, { method: "DELETE" }))}
              >
                삭제
              </button>
            </span>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="새 상태 이름" required />
        <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
          ))}
        </select>
        <button type="submit">상태 추가</button>
      </form>
    </section>
  );
}
