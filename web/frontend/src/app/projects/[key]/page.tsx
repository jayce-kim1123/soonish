"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

import ErrorNote from "../../../components/ErrorNote";
import ProjectNav from "../../../components/ProjectNav";
import ProjectTitle from "../../../components/ProjectTitle";
import { PROJECTS_CHANGED } from "../../../components/Sidebar";
import StatusPanel from "../../../components/StatusPanel";
import { api } from "../../../lib/api";
import { isOverdue, schedule } from "../../../lib/dates";
import { ISSUE_TYPES, Issue, IssueType, PRIORITIES, PRIORITY_LABEL, Priority, Member, Status, TYPE_LABEL } from "../../../lib/types";

const ORDERINGS = [
  ["-number", "최신순"],
  ["number", "오래된 순"],
  ["-updated_at", "최근 수정순"],
  ["start", "시작이 빠른 순"],
  ["end", "종료가 빠른 순"],
  ["-end", "종료가 늦은 순"],
  ["-priority", "우선순위 높은 순"],
  ["priority", "우선순위 낮은 순"],
  ["title", "제목순"],
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
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [ordering, setOrdering] = useState("-number");

  const [title, setTitle] = useState("");
  const [issueType, setIssueType] = useState<IssueType>("task");
  const [priority, setPriority] = useState<Priority>("medium");
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
    if (assigneeFilter) query.set("assignee", assigneeFilter);
    if (overdueOnly) query.set("overdue", "1");
    api<Issue[]>(`/projects/${key}/issues?${query}`)
      .then((list) => {
        setIssues(list);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [key, q, statusFilter, priorityFilter, typeFilter, assigneeFilter, overdueOnly, ordering]);

  useEffect(() => {
    loadStatuses();
    api<Member[]>("/members").then(setMembers).catch(() => setMembers([]));
  }, [key, loadStatuses]);

  useEffect(loadIssues, [loadIssues]);

  async function create(event: FormEvent) {
    event.preventDefault();
    try {
      await api(`/projects/${key}/issues`, {
        method: "POST",
        body: { title, issue_type: issueType, priority },
      });
      setTitle("");
      loadIssues();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeProject() {
    if (!confirm(`${key} 프로젝트와 안에 있는 모든 이슈를 삭제할까요?`)) return;
    await api(`/projects/${key}`, { method: "DELETE" });
    window.dispatchEvent(new Event(PROJECTS_CHANGED));
    router.push("/");
  }

  const statusName = (id: number) => statuses.find((s) => s.id === id)?.name ?? id;

  return (
    <main>
      <ProjectNav projectKey={key} />
      <ProjectTitle projectKey={key}>
        <button className="link danger" onClick={removeProject}>
          프로젝트 삭제
        </button>
      </ProjectTitle>
      <ErrorNote message={error} />

      <form onSubmit={create} className="row">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="새 이슈 제목" required />
        <select value={issueType} onChange={(e) => setIssueType(e.target.value as IssueType)}>
          {ISSUE_TYPES.map((t) => (
            <option key={t} value={t}>{TYPE_LABEL[t]}</option>
          ))}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
          ))}
        </select>
        <button type="submit">이슈 만들기</button>
      </form>

      <h2>Issues</h2>
      <div className="row filters">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="제목 검색" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">모든 상태</option>
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
          <option value="">모든 우선순위</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
          ))}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">모든 유형</option>
          {ISSUE_TYPES.map((t) => (
            <option key={t} value={t}>{TYPE_LABEL[t]}</option>
          ))}
        </select>
        <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
          <option value="">모든 담당자</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} /> 마감 초과
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
            <th>이슈</th>
            <th>제목</th>
            <th>상태</th>
            <th>우선순위</th>
            <th>유형</th>
            <th>상위 이슈</th>
            <th>일정</th>
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
              <td>{PRIORITY_LABEL[issue.priority]}</td>
              <td>{TYPE_LABEL[issue.issue_type]}</td>
              <td>{issue.parent ? `${key}-${issue.parent}` : ""}</td>
              <td className={isOverdue(issue, statuses) ? "overdue" : undefined}>{schedule(issue)}</td>
            </tr>
          ))}
          {issues.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
                이슈가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <StatusPanel projectKey={key} statuses={statuses} onChange={() => { loadStatuses(); loadIssues(); }} />
    </main>
  );
}
