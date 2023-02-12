"use client";

import { useCallback, useEffect, useState } from "react";

import IssueDetail from "./IssueDetail";

const DEFAULT_WIDTH = 560;
const MIN_WIDTH = 360;
const STORAGE_KEY = "soonish.drawerWidth";

/** 화면 폭에 맞춰 드로워 폭을 허용 범위 안으로 맞춘다. */
function clampWidth(width: number): number {
  return Math.min(Math.max(width, MIN_WIDTH), Math.max(MIN_WIDTH, window.innerWidth - 80));
}

/**
 * 타임라인 오른쪽에서 열리는 이슈 드로워. 이슈 화면과 같은 내용을 페이지 이동 없이 보여 준다.
 *
 * 상위·하위 이슈를 누르면 드로워 안에서 그 이슈로 바뀐다. 바깥 영역을 누르거나 Esc 를 누르면 닫힌다.
 * 왼쪽 가장자리를 끌면 폭을 바꿀 수 있고(더블클릭하면 기본 폭), 바꾼 폭은 브라우저에 기억해 둔다.
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
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [resizing, setResizing] = useState(false);

  // 저장해 둔 폭이 있으면 불러온다. 저장소를 못 쓰는 브라우저에서는 기본 폭으로 둔다.
  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(STORAGE_KEY));
      if (saved) setWidth(clampWidth(saved));
    } catch {
      // 무시한다
    }
  }, []);

  const saveWidth = useCallback((value: number) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(Math.round(value)));
    } catch {
      // 저장하지 못해도 이번 화면에서는 바뀐 폭을 그대로 쓴다.
    }
  }, []);

  // 왼쪽 가장자리를 끄는 동안, 마우스 위치에서 화면 오른쪽 끝까지의 거리를 폭으로 쓴다.
  useEffect(() => {
    if (!resizing) return;
    let latest = width;
    const move = (e: PointerEvent) => {
      latest = clampWidth(window.innerWidth - e.clientX);
      setWidth(latest);
    };
    const up = () => {
      setResizing(false);
      saveWidth(latest);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing, saveWidth]);

  // 같은 드로워가 열려 있는 채로 다른 이슈를 누르면 그 이슈로 바꾼다.
  useEffect(() => setCurrent(number), [number, projectKey]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="drawer" style={{ width }} onMouseDown={(e) => e.stopPropagation()}>
        <div
          className={resizing ? "drawer-resize active" : "drawer-resize"}
          title="끌어서 폭 조절 (더블클릭: 기본 폭)"
          onPointerDown={(e) => {
            e.preventDefault();
            setResizing(true);
          }}
          onDoubleClick={() => {
            setWidth(DEFAULT_WIDTH);
            saveWidth(DEFAULT_WIDTH);
          }}
        />
        <button type="button" className="drawer-close" onClick={onClose} title="닫기">
          ×
        </button>
        <IssueDetail projectKey={projectKey} number={current} onChanged={onChanged} onOpen={setCurrent} onClose={onClose} />
      </aside>
    </div>
  );
}
