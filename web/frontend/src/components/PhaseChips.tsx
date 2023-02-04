import { Phase } from "../lib/types";

/**
 * 화면에 보여 줄 단계를 고르는 토글 칩. 여러 개를 동시에 켤 수 있다.
 *
 * @param phases 전체 단계 목록.
 * @param visible 켜진 단계 id 집합.
 * @param onToggle 칩을 눌렀을 때 부르는 함수.
 */
export default function PhaseChips({
  phases,
  visible,
  onToggle,
}: {
  phases: Phase[];
  visible: Set<number>;
  onToggle: (id: number) => void;
}) {
  return (
    <div className="row chips">
      {phases.map((phase) => {
        const on = visible.has(phase.id);
        return (
          <button
            key={phase.id}
            className={on ? "phase-chip on" : "phase-chip"}
            style={on ? { background: phase.color + "55", borderColor: phase.color } : undefined}
            onClick={() => onToggle(phase.id)}
          >
            <span className="dot" style={{ background: phase.color }} />
            {phase.name}
          </button>
        );
      })}
    </div>
  );
}
