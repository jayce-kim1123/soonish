"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import ErrorNote from "../../../../components/ErrorNote";
import ProjectTitle from "../../../../components/ProjectTitle";
import { api } from "../../../../lib/api";
import { isOverdue, pad, toIso } from "../../../../lib/dates";
import { Issue, Status } from "../../../../lib/types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarPage({ params }: { params: { key: string } }) {
  const { key } = params;
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based
  const [issues, setIssues] = useState<Issue[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [error, setError] = useState<string | null>(null);

  // The grid starts on the Sunday on or before the 1st and covers whole weeks.
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

  // An issue is drawn on every day from its start to its due date (or on the single date it has).
  const onDay = (iso: string) =>
    issues.filter((i) => {
      const start = i.start_date ?? i.due_date;
      const end = i.due_date ?? i.start_date;
      return start !== null && end !== null && start <= iso && iso <= end;
    });

  return (
    <main className="wide">
      <ProjectTitle projectKey={key} suffix={`calendar · ${year}-${pad(month + 1)}`} />
      <div className="row">
        <button onClick={() => step(-1)}>Previous</button>
        <button
          onClick={() => {
            setYear(now.getFullYear());
            setMonth(now.getMonth());
          }}
        >
          Today
        </button>
        <button onClick={() => step(1)}>Next</button>
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
              {onDay(iso).map((issue) => (
                <Link
                  key={issue.number}
                  href={`/projects/${key}/issues/${issue.number}`}
                  className={isOverdue(issue, statuses) ? "chip overdue" : "chip"}
                  title={issue.title}
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
