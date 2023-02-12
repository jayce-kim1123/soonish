"use client";

import { useEffect, useState } from "react";

import IssueDetail from "./IssueDetail";

/**
 * 타임라인 오른쪽에서 열리는 이슈 드로워. 이슈 화면과 같은 내용을 페이지 이동 없이 보여 준다.
 *
 * 상위·하위 이슈를 누르면 드로워 안에서 그 이슈로 바뀐다. 바깥 영역을 누르거나 Esc 를 누르면 닫힌다.
 *
 * @param projectKey 이슈가 속한 프로젝트 키.
 * @param number 처음 열 이슈 번호.
 * @param onClose 드로워를 닫을 때 부르는 함수.
 * @param onChanged 이슈가 바뀔 때마다 타임라인을 다시 불러오는 함수.
 */
export default function IssueDrawer({
  projectKey,
  number,
  onClose,
  onChanged,
}: {
  projectKey: string;
  number: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [current, setCurrent] = useState(number);
  // 같은 드로워가 열려 있는 채로 다른 이슈를 누르면 그 이슈로 바꾼다.
  useEffect(() => setCurrent(number), [number, projectKey]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="drawer" onMouseDown={(e) => e.stopPropagation()}>
        <button type="button" className="drawer-close" onClick={onClose} title="닫기">
          ×
        </button>
        <IssueDetail projectKey={projectKey} number={current} onChanged={onChanged} onOpen={setCurrent} onClose={onClose} />
      </aside>
    </div>
  );
}
