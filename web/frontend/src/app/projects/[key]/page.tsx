"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

import ErrorNote from "../../../components/ErrorNote";
import ProjectTitle from "../../../components/ProjectTitle";
import { PROJECTS_CHANGED } from "../../../components/Sidebar";
import StatusPanel from "../../../components/StatusPanel";
import { api } from "../../../lib/api";
import { isOverdue, schedule } from "../../../lib/dates";
import { ISSUE_TYPES, Issue, IssueType, PRIORITIES, Priority, Status } from "../../../lib/types";

const ORDERINGS = [
  ["-number", "Newest"],
  ["number", "Oldest"],
  ["-updated_at", "Recently updated"],
  ["due_date", "Due date (soonest first)"],
  ["-due_date", "Due date (latest first)"],
  ["-priority", "Priority (high first)"],
  ["priority", "Priority (low first)"],
  ["title", "Title"],
];

export default function ProjectPage({ params }: { params: { key: string } }) {
  const { key } = params;
  const router = useRouter();
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [ordering, setOrdering] = useState("-number");

  const [title, setTitle] = useState("");
  const [issueType, setIssueType] = useState<IssueType>("task");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);

  const loadStatuses = useCallback(() => {
    api<Status[]>(`/projects/${key}/statuses`).then(setStatuses).catch((e) => setError(e.message));
  }, [key]);

  const loadIssues = useCallback(() => {
    const query = new URLSearchParams({ ordering });
    if (q) query.set("q", q);
    if (statusFilter) query.set("status", statusFilter);
    if (priorityFilter) query.set("priority", priorityFilter);
    if (typeFilter) query.set("issue_type", typeFilter);
    if (overdueOnly) query.set("overdue", "1");
    api<Issue[]>(`/projects/${key}/issues?${query}`)
      .then((list) => {
        setIssues(list);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [key, q, statusFilter, priorityFilter, typeFilter, overdueOnly, ordering]);

  useEffect(() => {
    loadStatuses();
  }, [key, loadStatuses]);

  useEffect(loadIssues, [loadIssues]);

  async function create(event: FormEvent) {
    event.preventDefault();
    try {
      await api(`/projects/${key}/issues`, {
        method: "POST",
        body: { title, issue_type: issueType, priority, due_date: dueDate || null },
      });
      setTitle("");
      setDueDate("");
      loadIssues();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeProject() {
    if (!confirm(`Delete ${key} and all of its issues?`)) return;
    await api(`/projects/${key}`, { method: "DELETE" });
    window.dispatchEvent(new Event(PROJECTS_CHANGED));
    router.push("/");
  }

  const statusName = (id: number) => statuses.find((s) => s.id === id)?.name ?? id;

  return (
    <main>
      <ProjectTitle projectKey={key}>
        <button className="link danger" onClick={removeProject}>
          Delete project
        </button>
      </ProjectTitle>
      <ErrorNote message={error} />

      <form onSubmit={create} className="row">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New issue title" required />
        <select value={issueType} onChange={(e) => setIssueType(e.target.value as IssueType)}>
          {ISSUE_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
          {PRIORITIES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} title="Due date" />
        <button type="submit">Create issue</button>
      </form>

      <h2>Issues</h2>
      <div className="row filters">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Any status</option>
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">Any type</option>
          {ISSUE_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} /> Overdue
        </label>
        <select value={ordering} onChange={(e) => setOrdering(e.target.value)}>
          {ORDERINGS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <table>
        <thead>
          <tr>
            <th>Issue</th>
            <th>Title</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Type</th>
            <th>Schedule</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((issue) => (
            <tr key={issue.number}>
              <td>
                <Link href={`/projects/${key}/issues/${issue.number}`}>{issue.ref}</Link>
              </td>
              <td>{issue.title}</td>
              <td>{statusName(issue.status)}</td>
              <td>{issue.priority}</td>
              <td>{issue.issue_type}</td>
              <td className={isOverdue(issue, statuses) ? "overdue" : undefined}>{schedule(issue)}</td>
            </tr>
          ))}
          {issues.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No issues.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <StatusPanel projectKey={key} statuses={statuses} onChange={() => { loadStatuses(); loadIssues(); }} />
    </main>
  );
}
