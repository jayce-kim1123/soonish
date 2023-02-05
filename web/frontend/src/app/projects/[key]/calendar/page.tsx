"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import ErrorNote from "../../../../components/ErrorNote";
import PhaseChips from "../../../../components/PhaseChips";
import ProjectNav from "../../../../components/ProjectNav";
import ProjectTitle from "../../../../components/ProjectTitle";
import { api } from "../../../../lib/api";
import { isOverdue, pad, toIso } from "../../../../lib/dates";
import { Issue, Status } from "../../../../lib/types";
import { usePhases } from "../../../../lib/usePhases";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default function CalendarPage({ params }: { params: { key: string } }) {
  const { key } = params;
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based
  const { phases, visible, toggle } = usePhases();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 달력은 1일이 속한 주의 일요일부터 시작하고, 한 주 단위로 끝까지 채운다.
  const first = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - first.getDay());
  const weeks = Math.ceil((first.getDay() + new Date(year, month + 1, 0).getDate()) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  const from = toIso(days[0]);
  const to = toIso(days[days.length - 1]);

  useEffect(() => {
    api<Status[]>(`/projects/${key}/statuses`).then(setStatuses).catch((e) => setError(e.message));
  }, [key]);

  useEffect(() => {
    api<Issue[]>(`/projects/${key}/issues?from=${from}&to=${to}&ordering=due_date`)
      .then((list) => {
        setIssues(list);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [key, from, to]);

  function step(delta: number) {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  }

  // 날마다, 켜 둔 단계 중 그날을 포함하는 일정을 단계 색 칩으로 그린다.
  const onDay = (iso: string) =>
    issues.flatMap((issue) =>
      issue.phases
        .filter((d) => d.start_date && d.end_date && visible.has(d.phase) && d.start_date <= iso && iso <= d.end_date)
        .map((d) => ({ issue, phase: phases.find((k) => k.id === d.phase) })),
    );

  return (
    <main className="wide">
      <ProjectNav projectKey={key} />
      <ProjectTitle projectKey={key} suffix={`캘린더 · ${year}년 ${month + 1}월`} />
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
              {onDay(iso).map(({ issue, phase }) => (
                <Link
                  key={`${issue.number}-${phase?.id}`}
                  href={`/projects/${key}/issues/${issue.number}`}
                  className={isOverdue(issue, statuses) ? "chip overdue" : "chip"}
                  style={{ borderLeft: `4px solid ${phase?.color ?? "#888"}` }}
                  title={`${phase?.name}: ${issue.title}`}
                >
                  {issue.ref} {issue.title}
                </Link>
              ))}
            </div>
          );
        })}
      </div>
    </main>
  );
}
