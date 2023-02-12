"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ErrorNote from "../components/ErrorNote";
import IssueContextMenu from "../components/IssueContextMenu";
import IssueDrawer from "../components/IssueDrawer";
import PhaseChips from "../components/PhaseChips";
import PhaseModal from "../components/PhaseModal";
import ProjectTitle from "../components/ProjectTitle";
import { PROJECTS_CHANGED } from "../components/Sidebar";
import { api } from "../lib/api";
import { dayNumber, fromDayNumber, isOverdue, issueSpan, today } from "../lib/dates";
import { Category, Issue, IssuePhase, Phase, Project, Status } from "../lib/types";
import { usePhases } from "../lib/usePhases";

const ROW_HEIGHT = 36;
const SECTION_HEIGHT = 44;
const LEFT_WIDTH = 360;
const ZOOMS: Record<string, number> = { 일: 28, 주: 10, 월: 4 };
const PROGRESS: Record<Category, number> = { todo: 0, doing: 50, done: 100 };

type Mode = "move" | "start" | "end";

/** 프로젝트 하나와 그 안의 이슈, 상태를 묶은 것. 타임라인의 섹션 하나가 된다. */
interface Board {
  project: Project;
  issues: Issue[];
  statuses: Status[];
}

/** 끌고 있는 막대의 상태. 시작·종료는 일 수(dayNumber) 이고 delta 는 끈 만큼의 일 수이다. */
interface Drag {
  projectKey: string;
  number: number;
  phase: number;
  mode: Mode;
  originX: number;
  start: number;
  end: number;
  delta: number;
}

type Row = { type: "section"; board: Board } | { type: "issue"; board: Board; issue: Issue; depth: number };

/** 메인 화면. 모든 프로젝트를 섹션으로 나눠서 하나의 타임라인에 보여 준다. */
export default function TimelinePage() {
  const scroller = useRef<HTMLDivElement>(null);
  const { phases, visible, toggle } = usePhases();
  const [boards, setBoards] = useState<Board[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [collapsedIssues, setCollapsedIssues] = useState<Set<string>>(new Set());
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState("주");
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [phaseModal, setPhaseModal] = useState<{ board: Board; issue: Issue; phase: Phase } | null>(null);
  const [editing, setEditing] = useState<{ ref: string; value: string } | null>(null);
  const editingRef = useRef(false);
  const [drawer, setDrawer] = useState<{ projectKey: string; number: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; board: Board; issue: Issue } | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const dayWidth = ZOOMS[zoom];

  const load = useCallback(() => {
    api<Project[]>("/projects")
      .then((projects) =>
        Promise.all(
          projects.map(async (project) => {
            const [issues, statuses] = await Promise.all([
              api<Issue[]>(`/projects/${project.key}/issues?ordering=number`),
              api<Status[]>(`/projects/${project.key}/statuses`),
            ]);
            return { project, issues, statuses };
          }),
        ),
      )
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
  const allIssues = useMemo(() => boards.flatMap((b) => b.issues), [boards]);

  // 프로젝트마다 상위 이슈 번호로 하위 이슈를 묶어 둔다.
  const childrenOf = useMemo(() => {
    const result = new Map<string, Map<number | null, Issue[]>>();
    for (const board of boards) {
      const byParent = new Map<number | null, Issue[]>();
      for (const issue of board.issues) {
        const list = byParent.get(issue.parent) ?? [];
        list.push(issue);
        byParent.set(issue.parent, list);
      }
      result.set(board.project.key, byParent);
    }
    return result;
  }, [boards]);

  const categoryOf = useCallback(
    (board: Board, issue: Issue): Category => board.statuses.find((s) => s.id === issue.status)?.category ?? "todo",
    [],
  );

  // 화면에 그릴 행들: 프로젝트 섹션 머리글 뒤에, 접히지 않은 이슈들이 트리 순서로 이어진다 (깊이 제한 없음).
  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const board of boards) {
      out.push({ type: "section", board });
      if (collapsedProjects.has(board.project.key)) continue;
      const byParent = childrenOf.get(board.project.key) as Map<number | null, Issue[]>;
      const walk = (parent: number | null, depth: number) => {
        for (const issue of byParent.get(parent) ?? []) {
          out.push({ type: "issue", board, issue, depth });
          if (!collapsedIssues.has(issue.ref)) walk(issue.number, depth + 1);
        }
      };
      walk(null, 0);
    }
    return out;
  }, [boards, childrenOf, collapsedProjects, collapsedIssues]);

  // 이슈의 진행률. 하위 이슈가 없으면 자기 상태로, 있으면 하위 이슈 진행률의 평균으로 구한다.
  const progress = useCallback(
    (board: Board, issue: Issue): number => {
      const sub = childrenOf.get(board.project.key)?.get(issue.number) ?? [];
      if (sub.length === 0) return PROGRESS[categoryOf(board, issue)];
      return sub.reduce((sum, child) => sum + progress(board, child), 0) / sub.length;
    },
    [childrenOf, categoryOf],
  );

  // 보이는 범위는 모든 프로젝트의 일정과 오늘을 포함하고, 양쪽에 며칠 씩 여유를 둔다.
  const [origin, last] = useMemo(() => {
    const todayNumber = dayNumber(today());
    let min = todayNumber - 14;
    let max = todayNumber + 28;
    for (const issue of allIssues) {
      const span = issueSpan(issue, visible);
      if (span) {
        min = Math.min(min, dayNumber(span[0]) - 7);
        max = Math.max(max, dayNumber(span[1]) + 14);
      }
    }
    return [min, max];
  }, [allIssues, visible]);
  const totalDays = last - origin + 1;
  const todayOffset = (dayNumber(today()) - origin) * dayWidth;

  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = Math.max(0, todayOffset - 200);
    // 확대 단계가 바뀌거나 처음 데이터가 도착했을 때만 오늘 위치로 다시 맞춘다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, loaded]);

  function begin(event: React.PointerEvent, projectKey: string, issue: Issue, item: IssuePhase, mode: Mode) {
    // 오른쪽 버튼은 끌기가 아니라 컨텍스트 메뉴용이다.
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const next = {
      projectKey,
      number: issue.number,
      phase: item.phase,
      mode,
      originX: event.clientX,
      start: dayNumber(item.start_date as string),
      end: dayNumber(item.end_date as string),
      delta: 0,
    };
    dragRef.current = next;
    setDrag(next);
  }

  function shifted(d: Drag): [number, number] {
    if (d.mode === "move") return [d.start + d.delta, d.end + d.delta];
    if (d.mode === "start") return [d.start + d.delta, d.end];
    return [d.start, d.end + d.delta];
  }

  useEffect(() => {
    if (!drag) return;

    function onMove(event: PointerEvent) {
      const current = dragRef.current;
      if (!current) return;
      const raw = Math.round((event.clientX - current.originX) / dayWidth);
      let delta = raw;
      if (current.mode === "start") delta = Math.min(raw, current.end - current.start);
      if (current.mode === "end") delta = Math.max(raw, current.start - current.end);
      dragRef.current = { ...current, delta };
      setDrag(dragRef.current);
    }

    async function onUp() {
      const current = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!current) return;
      if (current.delta === 0) {
        setDrawer({ projectKey: current.projectKey, number: current.number });
        return;
      }
      const [start, end] = shifted(current);
      try {
        await api(`/projects/${current.projectKey}/issues/${current.number}/phases/${current.phase}`, {
          method: "PUT",
          body: { start_date: fromDayNumber(start), end_date: fromDayNumber(end) },
        });
      } catch (e) {
        setError((e as Error).message);
      }
      load();
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag !== null, dayWidth, load]); // eslint-disable-line react-hooks/exhaustive-deps

  // 머리글: 월 블록과, 주 시작일(월요일) 눈금 줄.
  const months: { label: string; left: number; width: number }[] = [];
  const mondays: number[] = [];
  for (let d = origin; d <= last; d++) {
    const label = fromDayNumber(d).slice(0, 7);
    const left = (d - origin) * dayWidth;
    const lastMonth = months[months.length - 1];
    if (lastMonth && lastMonth.label === label) lastMonth.width += dayWidth;
    else months.push({ label, left, width: dayWidth });
    if (new Date(d * 86400000).getUTCDay() === 1) mondays.push(d);
  }

  const startTitle = (issue: Issue) => {
    editingRef.current = true;
    setEditing({ ref: issue.ref, value: issue.title });
  };

  const cancelTitle = () => {
    editingRef.current = false;
    setEditing(null);
  };

  /** 제목 입력을 마친다. 비었거나 그대로면 저장하지 않는다. Enter 와 blur 가 연달아 와도 한 번만 처리한다. */
  async function commitTitle(board: Board, issue: Issue) {
    if (!editingRef.current || !editing) return;
    editingRef.current = false;
    const title = editing.value.trim();
    setEditing(null);
    if (!title || title === issue.title) return;
    try {
      await api(`/projects/${board.project.key}/issues/${issue.number}`, { method: "PATCH", body: { title } });
    } catch (e) {
      setError((e as Error).message);
    }
    load();
  }

  const closeMenu = useCallback(() => setMenu(null), []);

  function toggleIn(setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function removeProject(project: Project) {
    if (!confirm(`${project.key} 프로젝트와 안에 있는 모든 이슈를 삭제할까요?`)) return;
    await api(`/projects/${project.key}`, { method: "DELETE" });
    load();
  }

  /** 한 이슈의 단계 선들을 그린다. 단계마다 선 하나이고, 선끼리 닿지 않게 6px 씩 아래로 민다. */
  function lines(board: Board, issue: Issue, allPhases: Phase[]) {
    return issue.phases
      .filter((d) => d.start_date && d.end_date && visible.has(d.phase) && phaseById.has(d.phase))
      .map((item) => {
        const phase = phaseById.get(item.phase) as Phase;
        let a = dayNumber(item.start_date as string);
        let b = dayNumber(item.end_date as string);
        const dragging = drag && drag.projectKey === board.project.key && drag.number === issue.number && drag.phase === item.phase;
        if (dragging) [a, b] = shifted(drag as Drag);
        const single = a === b && !phase.is_range;
        const classes = `tl-bar${single ? " single" : ""}${item.source === "rollup" ? " rollup" : ""}`;
        const label = `${phase.name}: ${fromDayNumber(a)}${a === b ? "" : ` → ${fromDayNumber(b)}`}${item.source === "rollup" ? " (하위 이슈에서 계산됨)" : ""}`;
        const top = 4 + Math.max(0, allPhases.findIndex((p) => p.id === phase.id)) * 6;
        const style = single
          ? { top, left: (a - origin) * dayWidth + dayWidth / 2 - 4, background: phase.color, zIndex: 10 + phase.position }
          : { top, left: (a - origin) * dayWidth, width: (b - a + 1) * dayWidth, background: phase.color, zIndex: 10 + phase.position };
        return (
          <div
            key={item.phase}
            className={classes}
            style={style}
            title={label}
            onPointerDown={(e) => begin(e, board.project.key, issue, item, "move")}
          >
            {!single && (
              <>
                <span className="tl-handle left" onPointerDown={(e) => begin(e, board.project.key, issue, item, "start")} />
                <span className="tl-handle right" onPointerDown={(e) => begin(e, board.project.key, issue, item, "end")} />
              </>
            )}
          </div>
        );
      });
  }

  const gridLines = mondays.map((d) => <div key={d} className="tl-grid" style={{ left: (d - origin) * dayWidth }} />);
  const todayLine = <div className="tl-today" style={{ left: todayOffset + dayWidth / 2 }} />;

  return (
    <main className="wide">
      <h1>타임라인</h1>
      <PhaseChips phases={phases} visible={visible} onToggle={toggle} />
      <div className="row">
        {Object.keys(ZOOMS).map((name) => (
          <button key={name} className={name === zoom ? "active" : undefined} onClick={() => setZoom(name)}>
            {name}
          </button>
        ))}
        <button onClick={() => scroller.current && (scroller.current.scrollLeft = Math.max(0, todayOffset - 200))}>오늘</button>
        <button
          onClick={() => {
            setCollapsedIssues(new Set());
            setCollapsedProjects(new Set());
          }}
        >
          모두 펼치기
        </button>
        <button
          onClick={() => {
            setCollapsedIssues(
              new Set(boards.flatMap((b) => b.issues.filter((i) => childrenOf.get(b.project.key)?.has(i.number)).map((i) => i.ref))),
            );
          }}
        >
          이슈 모두 접기
        </button>
      </div>
      <ErrorNote message={error} />

      <div className="timeline" ref={scroller}>
        <div className="tl-row tl-head" style={{ height: 52 }}>
          <div className="tl-left" style={{ width: LEFT_WIDTH }}>
            이슈
          </div>
          <div className="tl-track" style={{ width: totalDays * dayWidth }}>
            {months.map((m) => (
              <div key={m.label} className="tl-month" style={{ left: m.left, width: m.width }}>
                {m.width > 50 ? m.label : ""}
              </div>
            ))}
            {dayWidth >= 8 &&
              mondays.map((d) => (
                <div key={d} className="tl-tick" style={{ left: (d - origin) * dayWidth }}>
                  {fromDayNumber(d).slice(8)}
                </div>
              ))}
          </div>
        </div>

        {rows.map((row) => {
          if (row.type === "section") {
            const { project } = row.board;
            const closed = collapsedProjects.has(project.key);
            // 머리글 어디를 눌러도 접고 펼 수 있다. 단, 이름·링크 같은 조작 요소를 누른 때는 제외한다.
            const onHeaderClick = (e: React.MouseEvent) => {
              if ((e.target as HTMLElement).closest("button, a, input, form")) return;
              toggleIn(setCollapsedProjects, project.key);
            };
            return (
              <div
                key={`section-${project.key}`}
                className={closed ? "tl-row tl-section closed" : "tl-row tl-section"}
                style={{ height: SECTION_HEIGHT }}
                onClick={onHeaderClick}
              >
                <div className="tl-left" style={{ width: LEFT_WIDTH }}>
                  <span className="tl-chevron">{closed ? "▸" : "▾"}</span>
                  <ProjectTitle projectKey={project.key} tag="h2" />
                  <span className="tl-count">{row.board.issues.length}</span>
                </div>
                <div className="tl-track" style={{ width: totalDays * dayWidth }}>
                  <span className="tl-section-links" style={{ left: LEFT_WIDTH + 12 }}>
                    <Link href={`/projects/${project.key}`}>이슈 목록</Link>
                    <Link href={`/projects/${project.key}/calendar`}>캘린더</Link>
                    <button className="link" onClick={() => removeProject(project)}>
                      프로젝트 삭제
                    </button>
                  </span>
                </div>
              </div>
            );
          }
          const { board, issue, depth } = row;
          const cat = categoryOf(board, issue);
          const sub = childrenOf.get(board.project.key)?.get(issue.number) ?? [];
          const percent = progress(board, issue);
          return (
            <div
              key={issue.ref}
              className="tl-row"
              style={{ height: ROW_HEIGHT }}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, board, issue });
              }}
            >
              <div className="tl-left" style={{ width: LEFT_WIDTH, paddingLeft: 10 + depth * 18 }}>
                {sub.length > 0 ? (
                  <button className="tl-toggle" onClick={() => toggleIn(setCollapsedIssues, issue.ref)}>
                    {collapsedIssues.has(issue.ref) ? "▶" : "▼"}
                  </button>
                ) : (
                  <span className="tl-toggle" />
                )}
                <button className="tl-ref" title="이슈 열기" onClick={() => setDrawer({ projectKey: board.project.key, number: issue.number })}>
                  {issue.ref}
                </button>
                {editing?.ref === issue.ref ? (
                  <input
                    className="tl-title-input"
                    value={editing.value}
                    autoFocus
                    maxLength={200}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setEditing({ ref: issue.ref, value: e.target.value })}
                    onBlur={() => commitTitle(board, issue)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitTitle(board, issue);
                      if (e.key === "Escape") cancelTitle();
                    }}
                  />
                ) : (
                  <span className="tl-title" title="눌러서 제목 변경" onClick={() => startTitle(issue)}>
                    {issue.title}
                  </span>
                )}
                <span className={`tl-status ${cat}`}>{board.statuses.find((s) => s.id === issue.status)?.name}</span>
                {sub.length > 0 && (
                  <span className="tl-progress" title={`${Math.round(percent)}%`}>
                    <span className={percent >= 100 ? "done" : "doing"} style={{ width: `${percent}%` }} />
                  </span>
                )}
              </div>
              <div className={isOverdue(issue, board.statuses) ? "tl-track late" : "tl-track"} style={{ width: totalDays * dayWidth }}>
                {gridLines}
                {todayLine}
                {lines(board, issue, phases)}
              </div>
            </div>
          );
        })}
        {loaded && boards.length === 0 && (
          <p className="muted empty">아직 프로젝트가 없습니다. 왼쪽 아래의 &quot;+ 새 프로젝트&quot;로 첫 프로젝트를 만들어 주세요.</p>
        )}
      </div>
      {menu && (
        <IssueContextMenu
          x={menu.x}
          y={menu.y}
          projectKey={menu.board.project.key}
          issue={menu.issue}
          statuses={menu.board.statuses}
          phases={phases}
          onClose={closeMenu}
          onChanged={load}
          onOpen={() => setDrawer({ projectKey: menu.board.project.key, number: menu.issue.number })}
          onPhase={(phase) => {
            setPhaseModal({ board: menu.board, issue: menu.issue, phase });
            setMenu(null);
          }}
        />
      )}
      {drawer && (
        <IssueDrawer projectKey={drawer.projectKey} number={drawer.number} onClose={() => setDrawer(null)} onChanged={load} />
      )}
      {phaseModal && (
        <PhaseModal
          projectKey={phaseModal.board.project.key}
          issue={phaseModal.issue}
          phase={phaseModal.phase}
          onClose={() => setPhaseModal(null)}
          onSaved={load}
        />
      )}
    </main>
  );
}
