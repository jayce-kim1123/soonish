"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

import ErrorNote from "../../../../../components/ErrorNote";
import { api } from "../../../../../lib/api";
import { Comment, ISSUE_TYPES, Issue, PRIORITIES, Status } from "../../../../../lib/types";

export default function IssuePage({ params }: { params: { key: string; number: string } }) {
  const { key, number } = params;
  const base = `/projects/${key}/issues/${number}`;
  const router = useRouter();

  const [issue, setIssue] = useState<Issue | null>(null);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([
      api<Issue>(base),
      api<Status[]>(`/projects/${key}/statuses`),
      api<Comment[]>(`${base}/comments`),
    ])
      .then(([i, s, c]) => {
        setIssue(i);
        setStatuses(s);
        setComments(c);
      })
      .catch((e) => setError(e.message));
  }, [base, key]);

  useEffect(load, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!issue) return;
    try {
      const saved = await api<Issue>(base, {
        method: "PATCH",
        body: {
          title: issue.title,
          description: issue.description,
          status: issue.status,
          priority: issue.priority,
          issue_type: issue.issue_type,
          start_date: issue.start_date || null,
          due_date: issue.due_date || null,
        },
      });
      setIssue(saved);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove() {
    if (!confirm(`Delete ${issue?.ref}?`)) return;
    await api(base, { method: "DELETE" });
    router.push(`/projects/${key}`);
  }

  async function addComment(event: FormEvent) {
    event.preventDefault();
    try {
      await api(`${base}/comments`, { method: "POST", body: { body } });
      setBody("");
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeComment(id: number) {
    await api(`${base}/comments/${id}`, { method: "DELETE" });
    load();
  }

  if (!issue) {
    return (
      <main>
        <ErrorNote message={error} />
      </main>
    );
  }

  const update = (patch: Partial<Issue>) => setIssue({ ...issue, ...patch });

  return (
    <main>
      <p>
        <Link href={`/projects/${key}`}>Back to {key}</Link>
      </p>
      <h1>{issue.ref}</h1>
      <ErrorNote message={error} />
      <form onSubmit={save} className="stack">
        <input value={issue.title} onChange={(e) => update({ title: e.target.value })} required />
        <textarea
          value={issue.description}
          onChange={(e) => update({ description: e.target.value })}
          rows={6}
          placeholder="Description"
        />
        <div className="row">
          <select value={issue.status} onChange={(e) => update({ status: Number(e.target.value) })}>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select value={issue.priority} onChange={(e) => update({ priority: e.target.value as Issue["priority"] })}>
            {PRIORITIES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <select value={issue.issue_type} onChange={(e) => update({ issue_type: e.target.value as Issue["issue_type"] })}>
            {ISSUE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <label className="check">
            Start <input type="date" value={issue.start_date ?? ""} onChange={(e) => update({ start_date: e.target.value || null })} />
          </label>
          <label className="check">
            Due <input type="date" value={issue.due_date ?? ""} onChange={(e) => update({ due_date: e.target.value || null })} />
          </label>
          <button type="submit">Save</button>
          <button type="button" className="danger" onClick={remove}>
            Delete
          </button>
        </div>
      </form>

      <h2>Comments</h2>
      <ul className="list">
        {comments.map((comment) => (
          <li key={comment.id}>
            <span>
              {comment.body}
              <span className="muted"> · {new Date(comment.created_at).toLocaleString()}</span>
            </span>
            <button className="link" onClick={() => removeComment(comment.id)}>
              Delete
            </button>
          </li>
        ))}
        {comments.length === 0 && <li className="muted">No comments yet.</li>}
      </ul>
      <form onSubmit={addComment} className="stack">
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Add a comment" required />
        <div className="row">
          <button type="submit">Comment</button>
        </div>
      </form>
    </main>
  );
}
