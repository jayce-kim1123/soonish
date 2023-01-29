"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ErrorNote from "../../../../components/ErrorNote";
import ProjectTitle from "../../../../components/ProjectTitle";
import { api } from "../../../../lib/api";
import { dayNumber, fromDayNumber, isOverdue, today } from "../../../../lib/dates";
import { Category, Issue, Status } from "../../../../lib/types";

const ROW_HEIGHT = 36;
const LEFT_WIDTH = 340;
const ZOOMS: Record<string, number> = { Day: 28, Week: 10, Month: 4 };
const PROGRESS: Record<Category, number> = { todo: 0, doing: 50, done: 100 };

type Mode = "move" | "start" | "end";
interface Drag {
  number: number;
  mode: Mode;
  originX: number;
  start: number;
  end: number;
  delta: number;
}

function span(issue: Issue): [number, number] | null {
  const start = issue.start_date ?? issue.due_date;
  const end = issue.due_date ?? issue.start_date;
  return start && end ? [dayNumber(start), dayNumber(end)] : null;
}

export default function TimelinePage({ params }: { params: { key: string } }) {
  const { key } = params;
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [zoom, setZoom] = useState("Week");
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

  // The visible range covers every scheduled issue and today, with some slack on both sides.
  const [origin, last] = useMemo(() => {
    const todayNumber = dayNumber(today());
    let min = todayNumber - 14;
    let max = todayNumber + 28;
    for (const issue of issues) {
      const s = span(issue);
      if (s) {
        min = Math.min(min, s[0] - 7);
        max = Math.max(max, s[1] + 14);
      }
    }
    return [min, max];
  }, [issues]);
  const totalDays = last - origin + 1;
  const todayOffset = (dayNumber(today()) - origin) * dayWidth;

  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = Math.max(0, todayOffset - 200);
    // Only re-center when the zoom level changes or the first data arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, issues.length === 0]);

  const category = (issue: Issue): Category => statuses.find((s) => s.id === issue.status)?.category ?? "todo";
  const statusName = (issue: Issue) => statuses.find((s) => s.id === issue.status)?.name ?? "";

  function begin(event: React.PointerEvent, issue: Issue, mode: Mode) {
    const s = span(issue);
    if (!s) return;
    event.preventDefault();
    const next = { number: issue.number, mode, originX: event.clientX, start: s[0], end: s[1], delta: 0 };
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
      const issue = issues.find((i) => i.number === current.number);
      if (!issue) return;
      const body: Record<string, string | null> = {};
      const shift = (iso: string | null) => (iso ? fromDayNumber(dayNumber(iso) + current.delta) : null);
      if (current.mode === "move") {
        if (issue.start_date) body.start_date = shift(issue.start_date);
        if (issue.due_date) body.due_date = shift(issue.due_date);
      } else if (current.mode === "start") {
        body.start_date = shift(issue.start_date);
      } else {
        body.due_date = shift(issue.due_date);
      }
      try {
        await api(`/projects/${key}/issues/${current.number}`, { method: "PATCH", body });
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
  }, [drag !== null, dayWidth, issues, key, load, router]); // eslint-disable-line react-hooks/exhaustive-deps

  // Header: month blocks, plus a day number (or a week start) tick row.
  const months: { label: string; left: number; width: number }[] = [];
  const mondays: number[] = [];
  for (let d = origin; d <= last; d++) {
    const iso = fromDayNumber(d);
    const label = iso.slice(0, 7);
    const left = (d - origin) * dayWidth;
    const lastMonth = months[months.length - 1];
    if (lastMonth && lastMonth.label === label) lastMonth.width += dayWidth;
    else months.push({ label, left, width: dayWidth });
    if (new Date(d * 86400000).getUTCDay() === 1) mondays.push(d);
  }

  return (
    <main className="wide">
      <ProjectTitle projectKey={key} suffix="timeline" />
      <div className="row">
        {Object.keys(ZOOMS).map((name) => (
          <button key={name} className={name === zoom ? "active" : undefined} onClick={() => setZoom(name)}>
            {name}
          </button>
        ))}
        <button onClick={() => scroller.current && (scroller.current.scrollLeft = Math.max(0, todayOffset - 200))}>Today</button>
      </div>
      <ErrorNote message={error} />

      <div className="timeline" ref={scroller}>
        <div className="tl-row tl-head" style={{ height: 52 }}>
          <div className="tl-left" style={{ width: LEFT_WIDTH }}>
            Issue
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

        {issues.map((issue) => {
          const s = span(issue);
          const live = drag && drag.number === issue.number ? drag : null;
          let bar: { left: number; width: number } | null = null;
          if (s) {
            let [a, b] = s;
            if (live?.mode === "move") [a, b] = [a + live.delta, b + live.delta];
            if (live?.mode === "start") a += live.delta;
            if (live?.mode === "end") b += live.delta;
            bar = { left: (a - origin) * dayWidth, width: (b - a + 1) * dayWidth };
          }
          const cat = category(issue);
          const resizable = !!(issue.start_date && issue.due_date);
          return (
            <div key={issue.number} className="tl-row" style={{ height: ROW_HEIGHT }}>
              <div className="tl-left" style={{ width: LEFT_WIDTH }}>
                <Link href={`/projects/${key}/issues/${issue.number}`} className="tl-title">
                  <span className="muted">{issue.ref}</span> {issue.title}
                </Link>
                <span className={`tl-status ${cat}`}>{statusName(issue)}</span>
                <span className="tl-progress" title={cat}>
                  <span className={cat} style={{ width: `${PROGRESS[cat]}%` }} />
                </span>
              </div>
              <div className="tl-track" style={{ width: totalDays * dayWidth }}>
                {mondays.map((d) => (
                  <div key={d} className="tl-grid" style={{ left: (d - origin) * dayWidth }} />
                ))}
                <div className="tl-today" style={{ left: todayOffset + dayWidth / 2 }} />
                {bar && (
                  <div
                    className={`tl-bar ${cat}${isOverdue(issue, statuses) ? " late" : ""}`}
                    style={{ left: bar.left, width: bar.width }}
                    title={`${issue.ref} ${issue.title}`}
                    onPointerDown={(e) => begin(e, issue, "move")}
                  >
                    {resizable && (
                      <>
                        <span className="tl-handle left" onPointerDown={(e) => { e.stopPropagation(); begin(e, issue, "start"); }} />
                        <span className="tl-handle right" onPointerDown={(e) => { e.stopPropagation(); begin(e, issue, "end"); }} />
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {issues.length === 0 && <p className="muted">No issues.</p>}
      </div>
      <p className="muted">Drag a bar to move it, drag its ends to change the start or due date.</p>
    </main>
  );
}
