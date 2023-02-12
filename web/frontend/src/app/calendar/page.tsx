"use client";

import { useCallback, useEffect, useState } from "react";

import ErrorNote from "../../components/ErrorNote";
import IssueDrawer from "../../components/IssueDrawer";
import PhaseChips from "../../components/PhaseChips";
import { PROJECTS_CHANGED } from "../../components/Sidebar";
import { api } from "../../lib/api";
import { isOverdue, toIso } from "../../lib/dates";
import { Issue, Project, Status } from "../../lib/types";
import { usePhases } from "../../lib/usePhases";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 프로젝트 하나의 이슈와 상태. 달력에 그릴 때 프로젝트별 상태가 필요해서 같이 들고 있다. */
interface Board {
  project: Project;
  issues: Issue[];
  statuses: Status[];
}

/** 캘린더 화면. 모든 프로젝트의 단계 일정을 한 달력에 보여 준다. */
export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0부터 시작한다
  const { phases, visible, toggle } = usePhases();
  const [boards, setBoards] = useState<Board[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<{ projectKey: string; number: number } | null>(null);

  // 달력은 1일이 속한 주의 일요일부터 시작하고, 한 주 단위로 끝까지 채운다.
  const first = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - first.getDay());
  const weeks = Math.ceil((first.getDay() + new Date(year, month + 1, 0).getDate()) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  const from = toIso(days[0]);
  const to = toIso(days[days.length - 1]);

  const load = useCallback(() => {
    api<Project[]>("/projects")
      .then((projects) =>
        Promise.all(
          projects.map(async (project) => {
            const [issues, statuses] = await Promise.all([
              api<Issue[]>(`/projects/${project.key}/issues?from=${from}&to=${to}&ordering=start`),
              api<Status[]>(`/projects/${project.key}/statuses`),
            ]);
            return { project, issues, statuses };
          }),
        ),
      )
      .then((next) => {
        setBoards(next);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [from, to]);

  useEffect(() => {
    load();
    window.addEventListener(PROJECTS_CHANGED, load);
    return () => window.removeEventListener(PROJECTS_CHANGED, load);
  }, [load]);

  function step(delta: number) {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  }

  // 날마다, 켜 둔 단계 중 그날을 포함하는 일정을 단계 색 칩으로 그린다.
  const onDay = (iso: string) =>
    boards.flatMap((board) =>
      board.issues.flatMap((issue) =>
        issue.phases
          .filter((d) => d.start_date && d.end_date && visible.has(d.phase) && d.start_date <= iso && iso <= d.end_date)
          .map((d) => ({ board, issue, phase: phases.find((k) => k.id === d.phase) })),
      ),
    );

  return (
    <main className="wide">
      <h1>
        캘린더 <span className="muted">· {year}년 {month + 1}월</span>
      </h1>
      <PhaseChips phases={phases} visible={visible} onToggle={toggle} />
      <div className="row">
        <button onClick={() => step(-1)}>이전</button>
        <button
          onClick={() => {
            setYear(now.getFullYear());
            setMonth(now.getMonth());
          }}
        >
          오늘
        </button>
        <button onClick={() => step(1)}>다음</button>
      </div>
      <ErrorNote message={error} />
      <div className="calendar">
        {WEEKDAYS.map((d) => (
          <div key={d} className="weekday">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const iso = toIso(day);
          return (
            <div key={iso} className={day.getMonth() === month ? "day" : "day other"}>
              <span className="date">{day.getDate()}</span>
              {onDay(iso).map(({ board, issue, phase }) => (
                <button
                  key={`${issue.ref}-${phase?.id}`}
                  className={isOverdue(issue, board.statuses) ? "chip overdue" : "chip"}
                  style={{ borderLeft: `4px solid ${phase?.color ?? "#888"}` }}
                  title={`${phase?.name}: ${issue.title}`}
                  onClick={() => setDrawer({ projectKey: board.project.key, number: issue.number })}
                >
                  {issue.ref} {issue.title}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      {drawer && <IssueDrawer projectKey={drawer.projectKey} number={drawer.number} onClose={() => setDrawer(null)} onChanged={load} />}
    </main>
  );
}
