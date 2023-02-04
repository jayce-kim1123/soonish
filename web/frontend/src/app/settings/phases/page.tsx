"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import ErrorNote from "../../../components/ErrorNote";
import { api } from "../../../lib/api";
import { Phase } from "../../../lib/types";

export default function PhasesPage() {
  const [phases, setKinds] = useState<Phase[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#4a90e2");
  const [isRange, setIsRange] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Phase[]>("/phases").then(setKinds).catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      setError(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const patch = (phase: Phase, body: Partial<Phase>) =>
    run(() => api(`/phases/${phase.id}`, { method: "PATCH", body }));

  function add(event: FormEvent) {
    event.preventDefault();
    run(async () => {
      await api("/phases", { method: "POST", body: { name, color, is_range: isRange, position: phases.length } });
      setName("");
    });
  }

  function move(phase: Phase, step: number) {
    const other = phases[phases.indexOf(phase) + step];
    if (!other) return;
    run(async () => {
      await api(`/phases/${phase.id}`, { method: "PATCH", body: { position: other.position } });
      await api(`/phases/${other.id}`, { method: "PATCH", body: { position: phase.position } });
    });
  }

  return (
    <main>
      <h1>단계 관리</h1>
      <p className="muted">
        이슈마다 단계(기획, 디자인, 개발, QA 등)별로 일정을 정할 수 있습니다. 타임라인은 켜 둔 단계들을 한 줄에 겹쳐서 보여 줍니다. 단계는 자유롭게 만들고 고치고 지울 수 있습니다.
      </p>
      <ErrorNote message={error} />
      <ul className="list">
        {phases.map((phase) => (
          <li key={phase.id}>
            <span className="row phase-row">
              <input type="color" value={phase.color} onChange={(e) => patch(phase, { color: e.target.value })} />
              <input
                defaultValue={phase.name}
                onBlur={(e) => e.target.value && e.target.value !== phase.name && patch(phase, { name: e.target.value })}
              />
              <label className="check">
                <input type="checkbox" checked={phase.is_range} onChange={(e) => patch(phase, { is_range: e.target.checked })} />
                기간
              </label>
            </span>
            <span>
              <button className="link" onClick={() => move(phase, -1)}>
                위로
              </button>
              <button className="link" onClick={() => move(phase, 1)}>
                아래로
              </button>
              <button
                className="link"
                onClick={() => confirm(`"${phase.name}" 단계를 삭제할까요? 이슈들에 입력한 이 단계의 일정도 함께 지워집니다.`) && run(() => api(`/phases/${phase.id}`, { method: "DELETE" }))}
              >
                삭제
              </button>
            </span>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="row">
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="새 단계 이름" required />
        <label className="check">
          <input type="checkbox" checked={isRange} onChange={(e) => setIsRange(e.target.checked)} />
          기간
        </label>
        <button type="submit">추가</button>
      </form>
    </main>
  );
}
