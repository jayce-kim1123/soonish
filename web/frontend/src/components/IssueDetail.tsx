"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

import ErrorNote from "./ErrorNote";
import { api } from "../lib/api";
import { Comment, ISSUE_TYPES, Issue, IssuePhase, Member, PRIORITIES, PRIORITY_LABEL, Phase, Status, TYPE_LABEL } from "../lib/types";

/**
 * 이슈 하나의 내용을 보여 주고 고치는 화면. 이슈 화면과 타임라인의 드로워가 같이 쓴다.
 *
 * @param projectKey 이슈가 속한 프로젝트 키.
 * @param number 이슈 번호.
 * @param onChanged 이슈가 바뀔 때마다 부르는 함수. 바깥 화면을 다시 불러오는 데 쓴다.
 * @param onOpen 있으면 드로워 모드이다. 상위·하위 이슈를 누르면 페이지를 옮기지 않고 이 함수를 부른다.
 * @param onClose 드로워 모드에서 이슈를 지운 뒤 드로워를 닫는 함수.
 */
export default function IssueDetail({
  projectKey: key,
  number,
  onChanged,
  onOpen,
  onClose,
}: {
  projectKey: string;
  number: number;
  onChanged?: () => void;
  onOpen?: (number: number) => void;
  onClose?: () => void;
}) {
  const base = `/projects/${key}/issues/${number}`;
  const router = useRouter();

  const [issue, setIssue] = useState<Issue | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [subTitle, setSubTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([
      api<Issue>(base),
      api<Issue[]>(`/projects/${key}/issues?ordering=number`),
      api<Status[]>(`/projects/${key}/statuses`),
      api<Phase[]>("/phases"),
      api<Member[]>("/members"),
      api<Comment[]>(`${base}/comments`),
    ])
      .then(([i, all, s, k, mem, c]) => {
        setIssue(i);
        setIssues(all);
        setStatuses(s);
        setPhases(k);
        setMembers(mem);
        setComments(c);
      })
      .catch((e) => setError(e.message));
  }, [base, key]);

  useEffect(load, [load]);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      setError(null);
      load();
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!issue) return;
    run(() =>
      api(base, {
        method: "PATCH",
        body: {
          title: issue.title,
          description: issue.description,
          status: issue.status,
          priority: issue.priority,
          issue_type: issue.issue_type,
          parent: issue.parent,
        },
      }),
    );
  }

  async function remove() {
    const sub = issues.filter((i) => i.parent === issue?.number).length;
    if (!confirm(`이슈 ${issue?.ref}${sub ? "와 모든 하위 이슈를" : "를"} 삭제할까요?`)) return;
    await api(base, { method: "DELETE" });
    onChanged?.();
    if (onClose) onClose();
    else router.push("/");
  }

  /**
   * 이슈의 단계 하나를 고르거나 바꾼다. 보낸 항목만 바뀐다.
   *
   * @param phase 대상 단계.
   * @param body 바꿀 항목 (start_date, end_date, assignees).
   */
  const savePhase = (phase: Phase, body: Record<string, unknown>) =>
    run(() => api(`${base}/phases/${phase.id}`, { method: "PUT", body }));

  const dropPhase = (phase: Phase) => run(() => api(`${base}/phases/${phase.id}`, { method: "DELETE" }));

  function addSub(event: FormEvent) {
    event.preventDefault();
    run(async () => {
      await api(`/projects/${key}/issues`, { method: "POST", body: { title: subTitle, parent: issue?.number } });
      setSubTitle("");
    });
  }

  function addComment(event: FormEvent) {
    event.preventDefault();
    run(async () => {
      await api(`${base}/comments`, { method: "POST", body: { body } });
      setBody("");
    });
  }

  if (!issue) return <ErrorNote message={error} />;

  /** 다른 이슈로 가는 링크. 드로워에서는 드로워 안에서 바꾸고, 이슈 화면에서는 페이지를 옮긴다. */
  const issueLink = (target: number, children: React.ReactNode) =>
    onOpen ? (
      <button type="button" className="link" onClick={() => onOpen(target)}>
        {children}
      </button>
    ) : (
      <Link href={`/projects/${key}/issues/${target}`}>{children}</Link>
    );

  const update = (patch: Partial<Issue>) => setIssue({ ...issue, ...patch });
  const subIssues = issues.filter((i) => i.parent === issue.number);
  const phaseOf = (phase: Phase): IssuePhase | undefined => issue.phases.find((d) => d.phase === phase.id);
  const chosen = phases.filter((phase) => phaseOf(phase)?.selected);
  const rollupOnly = phases.filter((phase) => phaseOf(phase) && !phaseOf(phase)?.selected);
  const available = phases.filter((phase) => !phaseOf(phase)?.selected);

  return (
    <>
      <p>
        {!onOpen && <Link href="/">타임라인으로</Link>}
        {issue.parent && (
          <>
            {!onOpen && " · "}
            {issueLink(issue.parent, `상위 이슈 ${key}-${issue.parent}`)}
          </>
        )}
      </p>
      <h1>{issue.ref}</h1>
      <ErrorNote message={error} />
      <form onSubmit={save} className="stack">
        <input value={issue.title} onChange={(e) => update({ title: e.target.value })} required />
        <textarea
          value={issue.description}
          onChange={(e) => update({ description: e.target.value })}
          rows={6}
          placeholder="설명"
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
              <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
            ))}
          </select>
          <select value={issue.issue_type} onChange={(e) => update({ issue_type: e.target.value as Issue["issue_type"] })}>
            {ISSUE_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </select>
          <select value={issue.parent ?? ""} onChange={(e) => update({ parent: e.target.value ? Number(e.target.value) : null })}>
            <option value="">상위 이슈 없음</option>
            {issues
              .filter((i) => i.number !== issue.number)
              .map((i) => (
                <option key={i.number} value={i.number}>
                  {i.ref} {i.title} 아래
                </option>
              ))}
          </select>
          <button type="submit">저장</button>
          <button type="button" className="danger" onClick={remove}>
            삭제
          </button>
        </div>
      </form>

      <h2>단계</h2>
      <p className="muted">
        이 이슈에 필요한 단계만 골라서 쓰세요. 단계마다 일정과 담당자를 정할 수 있고, 일정을 비워 두면 하위 이슈들의 일정을 따라갑니다.
      </p>
      <table>
        <tbody>
          {chosen.map((phase) => {
            const item = phaseOf(phase) as IssuePhase;
            return (
              <tr key={phase.id}>
                <td>
                  <span className="dot" style={{ background: phase.color }} /> {phase.name}
                </td>
                <td>
                  <input
                    type="date"
                    value={item.start_date ?? ""}
                    onChange={(e) =>
                      savePhase(phase, { start_date: e.target.value || null, end_date: phase.is_range ? item.end_date : null })
                    }
                  />
                  {phase.is_range && (
                    <>
                      {" → "}
                      <input
                        type="date"
                        value={item.end_date ?? ""}
                        onChange={(e) => e.target.value && savePhase(phase, { start_date: item.start_date ?? e.target.value, end_date: e.target.value })}
                      />
                    </>
                  )}
                  {item.source === "rollup" && <span className="muted"> 하위 이슈에서 계산됨</span>}
                </td>
                <td>
                  {item.assignees.map((id) => (
                    <span key={id} className="assignee">
                      {members.find((m) => m.id === id)?.name}
                      <button type="button" title="담당에서 빼기" onClick={() => savePhase(phase, { assignees: item.assignees.filter((a) => a !== id) })}>
                        ×
                      </button>
                    </span>
                  ))}
                  <select
                    value=""
                    onChange={(e) => e.target.value && savePhase(phase, { assignees: [...item.assignees, Number(e.target.value)] })}
                  >
                    <option value="">+ 담당자</option>
                    {members
                      .filter((m) => !item.assignees.includes(m.id))
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </td>
                <td>
                  {item.source === "own" && item.start_date && (
                    <button type="button" className="link" onClick={() => savePhase(phase, { start_date: null, end_date: null })}>
                      {subIssues.length > 0 ? "하위 이슈를 따르기" : "일정 지우기"}
                    </button>
                  )}
                  <button type="button" className="link" onClick={() => dropPhase(phase)}>
                    단계 빼기
                  </button>
                </td>
              </tr>
            );
          })}
          {chosen.length === 0 && (
            <tr>
              <td className="muted">아직 고른 단계가 없습니다.</td>
            </tr>
          )}
          {rollupOnly.map((phase) => {
            const item = phaseOf(phase) as IssuePhase;
            return (
              <tr key={phase.id} className="muted">
                <td>
                  <span className="dot" style={{ background: phase.color }} /> {phase.name}
                </td>
                <td>
                  {item.start_date}
                  {item.end_date && item.end_date !== item.start_date ? ` → ${item.end_date}` : ""} (하위 이슈에서 계산됨)
                </td>
                <td />
                <td>
                  <button type="button" className="link" onClick={() => savePhase(phase, {})}>
                    이 이슈에서도 고르기
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {available.length > 0 && (
        <div className="row">
          <select value="" onChange={(e) => e.target.value && savePhase(phases.find((p) => p.id === Number(e.target.value)) as Phase, {})}>
            <option value="">+ 단계 추가</option>
            {available.map((phase) => (
              <option key={phase.id} value={phase.id}>
                {phase.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <h2>하위 이슈</h2>
      <ul className="list">
        {subIssues.map((sub) => (
          <li key={sub.number}>
            {issueLink(
              sub.number,
              <>
                <span className="muted">{sub.ref}</span> {sub.title}
              </>,
            )}
          </li>
        ))}
        {subIssues.length === 0 && <li className="muted">하위 이슈가 없습니다.</li>}
      </ul>
      <form onSubmit={addSub} className="row">
        <input value={subTitle} onChange={(e) => setSubTitle(e.target.value)} placeholder="새 하위 이슈 제목" required />
        <button type="submit">하위 이슈 추가</button>
      </form>

      <h2>댓글</h2>
      <ul className="list">
        {comments.map((comment) => (
          <li key={comment.id}>
            <span>
              {comment.body}
              <span className="muted"> · {new Date(comment.created_at).toLocaleString()}</span>
            </span>
            <button className="link" onClick={() => run(() => api(`${base}/comments/${comment.id}`, { method: "DELETE" }))}>
              삭제
            </button>
          </li>
        ))}
        {comments.length === 0 && <li className="muted">아직 댓글이 없습니다.</li>}
      </ul>
      <form onSubmit={addComment} className="stack">
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="댓글을 입력하세요" required />
        <div className="row">
          <button type="submit">댓글 달기</button>
        </div>
      </form>
    </>
  );
}
