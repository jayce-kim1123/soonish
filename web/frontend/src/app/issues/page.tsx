"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import ErrorNote from "../../components/ErrorNote";
import IssueDrawer from "../../components/IssueDrawer";
import NewIssueModal from "../../components/NewIssueModal";
import { PROJECTS_CHANGED } from "../../components/Sidebar";
import { api } from "../../lib/api";
import { isOverdue, issueSpan, schedule } from "../../lib/dates";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  Category,
  ISSUE_TYPES,
  Issue,
  Member,
  PRIORITIES,
  PRIORITY_LABEL,
  Project,
  Status,
  TYPE_LABEL,
} from "../../lib/types";
import { usePhases } from "../../lib/usePhases";

const ORDERINGS: [string, string][] = [
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
const PRIORITY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, urgent: 3 };
const MAX_ASSIGNEES = 3;

/** 프로젝트 하나와 그 안의 이슈, 상태. 목록의 섹션 하나가 된다. */
interface Board {
  project: Project;
  issues: Issue[];
  statuses: Status[];
}

/** 이슈를 담당하는 멤버 id 들. 이슈가 고른 단계의 담당자를 모두 모으고 중복은 뺀다. */
function assigneeIds(issue: Issue): number[] {
  return Array.from(new Set(issue.phases.filter((p) => p.selected).flatMap((p) => p.assignees)));
}

/** 이슈 목록 화면. 모든 프로젝트의 이슈를 프로젝트별 섹션으로 묶어서 보여 주고, 거르고 정렬할 수 있다. */
export default function IssuesPage() {
  const { phases } = usePhases();
  const [boards, setBoards] = useState<Board[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<{ projectKey: string; number: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const [q, setQ] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [ordering, setOrdering] = useState("-number");

  const load = useCallback(() => {
    Promise.all([api<Project[]>("/projects"), api<Member[]>("/members")])
      .then(([projects, mem]) => {
        setMembers(mem);
        return Promise.all(
          projects.map(async (project) => {
            const [issues, statuses] = await Promise.all([
              api<Issue[]>(`/projects/${project.key}/issues?ordering=number`),
              api<Status[]>(`/projects/${project.key}/statuses`),
            ]);
            return { project, issues, statuses };
          }),
        );
      })
      .then((next) => {
        setBoards(next);
        setLoaded(true);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(PROJECTS_CHANGED, load);
    return () => window.removeEventListener(PROJECTS_CHANGED, load);
  }, [load]);

  const phaseById = useMemo(() => new Map(phases.map((p) => [p.id, p])), [phases]);

  // 조건에 맞는 이슈만 남기고 정렬한다. 일정이 없는 이슈는 일정 기준 정렬에서 항상 맨 뒤에 둔다.
  const sections = useMemo(() => {
    const field = ordering.replace(/^-/, "");
    const desc = ordering.startsWith("-");
    return boards
      .filter((b) => !projectFilter || b.project.key === projectFilter)
      .map((board) => {
        const categoryOf = (issue: Issue): Category => board.statuses.find((s) => s.id === issue.status)?.category ?? "todo";
        const matched = board.issues.filter(
          (issue) =>
            (!q || issue.title.toLowerCase().includes(q.toLowerCase()) || issue.ref.toLowerCase().includes(q.toLowerCase())) &&
            (!categoryFilter || categoryOf(issue) === categoryFilter) &&
            (!priorityFilter || issue.priority === priorityFilter) &&
            (!typeFilter || issue.issue_type === typeFilter) &&
            (!assigneeFilter || assigneeIds(issue).includes(Number(assigneeFilter))) &&
            (!overdueOnly || isOverdue(issue, board.statuses)),
        );
        const key = (issue: Issue): string | number | null => {
          if (field === "number") return issue.number;
          if (field === "updated_at") return issue.updated_at;
          if (field === "title") return issue.title;
          if (field === "priority") return PRIORITY_RANK[issue.priority];
          const span = issueSpan(issue);
          return span ? span[field === "start" ? 0 : 1] : null;
        };
        const sorted = [...matched].sort((a, b) => {
          const ka = key(a);
          const kb = key(b);
          if (ka === null && kb === null) return a.number - b.number;
          if (ka === null) return 1; // 일정 없는 이슈는 뒤로 보낸다
          if (kb === null) return -1;
          const diff = ka < kb ? -1 : ka > kb ? 1 : a.number - b.number;
          return desc ? -diff : diff;
        });
        return { board, issues: sorted };
      })
      .filter((section) => section.issues.length > 0);
  }, [boards, q, projectFilter, categoryFilter, priorityFilter, typeFilter, assigneeFilter, overdueOnly, ordering]);

  function toggleProject(key: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const memberName = (id: number) => members.find((m) => m.id === id)?.name ?? "";

  return (
    <main className="wide">
      <div className="page-head">
        <h1>이슈 목록</h1>
        <button className="primary" onClick={() => setCreating(true)} disabled={boards.length === 0}>
          + 새 이슈
        </button>
      </div>

      <div className="filter-bar">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="제목이나 번호로 검색" />
        <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="">모든 프로젝트</option>
          {boards.map((b) => (
            <option key={b.project.key} value={b.project.key}>
              {b.project.key} · {b.project.name}
            </option>
          ))}
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">모든 상태</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
          <option value="">모든 우선순위</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">모든 유형</option>
          {ISSUE_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
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
      <ErrorNote message={error} />

      <div className="issue-list">
        <div className="issue-row issue-head">
          <span>이슈</span>
          <span>상태</span>
          <span>우선순위</span>
          <span>유형</span>
          <span>담당자</span>
          <span>단계</span>
          <span>일정</span>
        </div>
        {sections.map(({ board, issues }) => {
          const closed = collapsed.has(board.project.key);
          return (
            <div key={board.project.key}>
              <div className="issue-group" onClick={() => toggleProject(board.project.key)}>
                <span className="tl-chevron">{closed ? "▸" : "▾"}</span>
                <strong>{board.project.key}</strong>
                <span>{board.project.name}</span>
              </div>
              {!closed &&
                issues.map((issue) => {
                  const status = board.statuses.find((s) => s.id === issue.status);
                  const ids = assigneeIds(issue);
                  const late = isOverdue(issue, board.statuses);
                  return (
                    <div
                      key={issue.ref}
                      className="issue-row"
                      onClick={() => setDrawer({ projectKey: board.project.key, number: issue.number })}
                    >
                      <span className="issue-title">
                        <span className="muted">{issue.ref}</span>
                        <span>{issue.title}</span>
                        {issue.parent && <span className="muted small">↳ {board.project.key}-{issue.parent}</span>}
                      </span>
                      <span>
                        <span className={`badge ${status?.category ?? "todo"}`}>{status?.name}</span>
                      </span>
                      <span>
                        <span className={`badge priority-${issue.priority}`}>{PRIORITY_LABEL[issue.priority]}</span>
                      </span>
                      <span className="muted">{TYPE_LABEL[issue.issue_type]}</span>
                      <span>
                        {ids.slice(0, MAX_ASSIGNEES).map((id) => (
                          <span key={id} className="assignee">
                            {memberName(id)}
                          </span>
                        ))}
                        {ids.length > MAX_ASSIGNEES && <span className="muted small">+{ids.length - MAX_ASSIGNEES}</span>}
                      </span>
                      <span className="phase-dots">
                        {issue.phases
                          .filter((p) => p.selected && phaseById.has(p.phase))
                          .map((p) => {
                            const phase = phaseById.get(p.phase)!;
                            return (
                              <span
                                key={p.phase}
                                className="dot"
                                style={{ background: phase.color, opacity: p.start_date ? 1 : 0.35 }}
                                title={`${phase.name}${p.start_date ? `: ${p.start_date}${p.end_date && p.end_date !== p.start_date ? ` → ${p.end_date}` : ""}` : " (일정 없음)"}`}
                              />
                            );
                          })}
                      </span>
                      <span className={late ? "overdue" : "muted"}>{schedule(issue)}</span>
                    </div>
                  );
                })}
            </div>
          );
        })}
        {loaded && sections.length === 0 && (
          <p className="muted empty">{boards.length === 0 ? "아직 프로젝트가 없습니다. 타임라인에서 프로젝트를 먼저 만들어 주세요." : "조건에 맞는 이슈가 없습니다."}</p>
        )}
      </div>

      {creating && <NewIssueModal projects={boards.map((b) => b.project)} onClose={() => setCreating(false)} onCreated={load} />}
      {drawer && <IssueDrawer projectKey={drawer.projectKey} number={drawer.number} onClose={() => setDrawer(null)} onChanged={load} />}
    </main>
  );
}
