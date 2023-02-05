"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ErrorNote from "../../../../components/ErrorNote";
import PhaseChips from "../../../../components/PhaseChips";
import ProjectTitle from "../../../../components/ProjectTitle";
import { api } from "../../../../lib/api";
import { dayNumber, fromDayNumber, isOverdue, issueSpan, today } from "../../../../lib/dates";
import { Category, Issue, IssuePhase, Phase, Status } from "../../../../lib/types";
import { usePhases } from "../../../../lib/usePhases";

const ROW_HEIGHT = 36;
const LEFT_WIDTH = 360;
const ZOOMS: Record<string, number> = { 일: 28, 주: 10, 월: 4 };
const PROGRESS: Record<Category, number> = { todo: 0, doing: 50, done: 100 };

type Mode = "move" | "start" | "end";
interface Drag {
  number: number;
  phase: number;
  mode: Mode;
  originX: number;
  start: number;
  end: number;
  delta: number;
}

export default function TimelinePage({ params }: { params: { key: string } }) {
  const { key } = params;
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  const { phases, visible, toggle } = usePhases();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [zoom, setZoom] = useState("주");
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const dayWidth = ZOOMS[zoom];

  const load = useCallback(() => {
    Promise.all([
      api<Issue[]>(`/projects/${key}/issues?ordering=number`),
      api<Status[]>(`/projects/${key}/statuses`),
    ])
      .then(([i, s]) => {
        setIssues(i);
        setStatuses(s);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [key]);

  useEffect(load, [load]);

  const phaseById = useMemo(() => new Map(phases.map((k) => [k.id, k])), [phases]);
  const categoryOf = useCallback(
    (issue: Issue): Category => statuses.find((s) => s.id === issue.status)?.category ?? "todo",
    [statuses],
  );

  // 이슈 트리: 이슈마다 한 행이고, 하위 이슈는 상위 이슈 밑에 들여써서 보여 준다 (깊이 제한 없음).
  const { rows, children } = useMemo(() => {
    const byParent = new Map<number | null, Issue[]>();
    for (const issue of issues) {
      const list = byParent.get(issue.parent) ?? [];
      list.push(issue);
      byParent.set(issue.parent, list);
    }
    const out: { issue: Issue; depth: number }[] = [];
    const walk = (parent: number | null, depth: number) => {
      for (const issue of byParent.get(parent) ?? []) {
        out.push({ issue, depth });
        if (!collapsed.has(issue.number)) walk(issue.number, depth + 1);
      }
    };
    walk(null, 0);
    return { rows: out, children: byParent };
  }, [issues, collapsed]);

  // 이슈의 진행률. 하위 이슈가 없으면 자기 상태로, 있으면 하위 이슈 진행률의 평균으로 구한다.
  const progress = useCallback(
    (issue: Issue): number => {
      const sub = children.get(issue.number) ?? [];
      if (sub.length === 0) return PROGRESS[categoryOf(issue)];
      return sub.reduce((sum, child) => sum + progress(child), 0) / sub.length;
    },
    [children, categoryOf],
  );

  // 보이는 범위는 그려질 모든 일정과 오늘을 포함하고, 양쪽에 몇일 씩 여유를 둔다.
  const [origin, last] = useMemo(() => {
    const todayNumber = dayNumber(today());
    let min = todayNumber - 14;
    let max = todayNumber + 28;
    for (const issue of issues) {
      const span = issueSpan(issue, visible);
      if (span) {
        min = Math.min(min, dayNumber(span[0]) - 7);
        max = Math.max(max, dayNumber(span[1]) + 14);
      }
    }
    return [min, max];
  }, [issues, visible]);
  const totalDays = last - origin + 1;
  const todayOffset = (dayNumber(today()) - origin) * dayWidth;

  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = Math.max(0, todayOffset - 200);
    // 확대 단계가 바뀌거나 처음 데이터가 도착했을 때만 오늘 위치로 다시 맞춘다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, issues.length === 0]);

  function begin(event: React.PointerEvent, issue: Issue, date: IssuePhase, mode: Mode) {
    event.preventDefault();
    event.stopPropagation();
    const next = {
      number: issue.number,
      phase: date.phase,
      mode,
      originX: event.clientX,
      start: dayNumber(date.start_date as string),
      end: dayNumber(date.end_date as string),
      delta: 0,
    };
    dragRef.current = next;
    setDrag(next);
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
        router.push(`/projects/${key}/issues/${current.number}`);
        return;
      }
      const [start, end] = shifted(current);
      try {
        await api(`/projects/${key}/issues/${current.number}/phases/${current.phase}`, {
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
  }, [drag !== null, dayWidth, key, load, router]); // eslint-disable-line react-hooks/exhaustive-deps

  function shifted(d: Drag): [number, number] {
    if (d.mode === "move") return [d.start + d.delta, d.end + d.delta];
    if (d.mode === "start") return [d.start + d.delta, d.end];
    return [d.start, d.end + d.delta];
  }

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

  function bars(issue: Issue) {
    return issue.phases
      .filter((d) => d.start_date && d.end_date && visible.has(d.phase) && phaseById.has(d.phase))
      .map((date) => {
        const phase = phaseById.get(date.phase) as Phase;
        let a = dayNumber(date.start_date as string);
        let b = dayNumber(date.end_date as string);
        if (drag && drag.number === issue.number && drag.phase === date.phase) [a, b] = shifted(drag);
        const single = a === b && !phase.is_range;
        const resizable = !single;
        const classes = `tl-bar${single ? " single" : ""}${date.source === "rollup" ? " rollup" : ""}`;
        const label = `${phase.name}: ${fromDayNumber(a)}${a === b ? "" : ` → ${fromDayNumber(b)}`}${date.source === "rollup" ? " (하위 이슈에서 계산됨)" : ""}`;
        // 단계마다 선 하나씩 6px 간격으로 아래로 밀어서, 선끼리 닿지 않고 2px씩 떨어지게 한다.
        const top = 4 + Math.max(0, phases.findIndex((p) => p.id === phase.id)) * 6;
        const style = single
          ? { top, left: (a - origin) * dayWidth + dayWidth / 2 - 4, background: phase.color, zIndex: 10 + phase.position }
          : { top, left: (a - origin) * dayWidth, width: (b - a + 1) * dayWidth, background: phase.color, zIndex: 10 + phase.position };
        return (
          <div key={date.phase} className={classes} style={style} title={label} onPointerDown={(e) => begin(e, issue, date, "move")}>
            {resizable && (
              <>
                <span className="tl-handle left" onPointerDown={(e) => begin(e, issue, date, "start")} />
                <span className="tl-handle right" onPointerDown={(e) => begin(e, issue, date, "end")} />
              </>
            )}
          </div>
        );
      });
  }

  return (
    <main className="wide">
      <ProjectTitle projectKey={key} suffix="타임라인" />
      <PhaseChips phases={phases} visible={visible} onToggle={toggle} />
      <div className="row">
        {Object.keys(ZOOMS).map((name) => (
          <button key={name} className={name === zoom ? "active" : undefined} onClick={() => setZoom(name)}>
            {name}
          </button>
        ))}
        <button onClick={() => scroller.current && (scroller.current.scrollLeft = Math.max(0, todayOffset - 200))}>오늘</button>
        <button onClick={() => setCollapsed(new Set())}>모두 펼치기</button>
        <button onClick={() => setCollapsed(new Set(issues.filter((i) => children.has(i.number)).map((i) => i.number)))}>
          모두 접기
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

        {rows.map(({ issue, depth }) => {
          const cat = categoryOf(issue);
          const sub = children.get(issue.number) ?? [];
          const percent = progress(issue);
          return (
            <div key={issue.number} className="tl-row" style={{ height: ROW_HEIGHT }}>
              <div className="tl-left" style={{ width: LEFT_WIDTH, paddingLeft: 10 + depth * 18 }}>
                {sub.length > 0 ? (
                  <button
                    className="tl-toggle"
                    onClick={() =>
                      setCollapsed((current) => {
                        const next = new Set(current);
                        if (next.has(issue.number)) next.delete(issue.number);
                        else next.add(issue.number);
                        return next;
                      })
                    }
                  >
                    {collapsed.has(issue.number) ? "▶" : "▼"}
                  </button>
                ) : (
                  <span className="tl-toggle" />
                )}
                <Link href={`/projects/${key}/issues/${issue.number}`} className="tl-title">
                  <span className="muted">{issue.ref}</span> {issue.title}
                </Link>
                <span className={`tl-status ${cat}`}>{statuses.find((s) => s.id === issue.status)?.name}</span>
                <span className="tl-progress" title={`${Math.round(percent)}%`}>
                  <span className={percent >= 100 ? "done" : "doing"} style={{ width: `${percent}%` }} />
                </span>
              </div>
              <div className={isOverdue(issue, statuses) ? "tl-track late" : "tl-track"} style={{ width: totalDays * dayWidth }}>
                {mondays.map((d) => (
                  <div key={d} className="tl-grid" style={{ left: (d - origin) * dayWidth }} />
                ))}
                <div className="tl-today" style={{ left: todayOffset + dayWidth / 2 }} />
                {bars(issue)}
              </div>
            </div>
          );
        })}
        {issues.length === 0 && <p className="muted">이슈가 없습니다.</p>}
      </div>
      <p className="muted">
        한 줄에 위에서 켜 둔 단계들의 일정이 겹쳐서 표시됩니다. 막대를 끌면 옮길 수 있고, 양쪽 끝을 끌면 기간을 늘이거나 줄일 수 있습니다. 상위 이슈는 직접 정하기 전까지 하위 이슈의 일정을 따라갑니다.
      </p>
    </main>
  );
}
