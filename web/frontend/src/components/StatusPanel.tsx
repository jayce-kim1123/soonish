"use client";

import { FormEvent, useState } from "react";

import { api } from "../lib/api";
import { CATEGORIES, Category, Status } from "../lib/types";
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
    const next = prompt("Status name", status.name);
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
      <h2>Statuses</h2>
      <ErrorNote message={error} />
      <ul className="list">
        {statuses.map((status) => (
          <li key={status.id}>
            <span>
              {status.name} <span className="muted">({status.category})</span>
            </span>
            <span>
              <button className="link" onClick={() => move(status, -1)}>
                Up
              </button>
              <button className="link" onClick={() => move(status, 1)}>
                Down
              </button>
              <button className="link" onClick={() => rename(status)}>
                Rename
              </button>
              <button
                className="link"
                onClick={() => run(() => api(`/projects/${projectKey}/statuses/${status.id}`, { method: "DELETE" }))}
              >
                Delete
              </button>
            </span>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New status" required />
        <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button type="submit">Add status</button>
      </form>
    </section>
  );
}
