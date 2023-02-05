"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, useState } from "react";

import { api } from "../lib/api";

/** 프로젝트 목록이 바뀌면 화면들이 다시 불러오도록 알리는 이벤트 이름. */
export const PROJECTS_CHANGED = "projects-changed";

/** 왼쪽 메뉴. 프로젝트는 타임라인 화면에 섹션으로 나오므로 여기에는 나열하지 않는다. */
export default function Sidebar() {
  const pathname = usePathname() ?? "/";
  const [adding, setAdding] = useState(false);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function create(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/projects", { method: "POST", body: { key: key.toUpperCase(), name } });
      setKey("");
      setName("");
      setAdding(false);
      setError(null);
      window.dispatchEvent(new Event(PROJECTS_CHANGED));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <nav className="sidebar">
      <Link href="/" className="brand">
        Soonish
      </Link>
      <Link href="/" className={pathname === "/" ? "side-link active" : "side-link"}>
        타임라인
      </Link>
      <div className="side-title side-settings">설정</div>
      <Link href="/settings/phases" className={pathname.startsWith("/settings/phases") ? "side-link active" : "side-link"}>
        단계 관리
      </Link>
      <Link href="/settings/members" className={pathname.startsWith("/settings/members") ? "side-link active" : "side-link"}>
        멤버 관리
      </Link>
      {adding ? (
        <form onSubmit={create} className="side-form">
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="KEY" maxLength={10} required autoFocus />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="프로젝트 이름" required />
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button type="submit">만들기</button>
            <button type="button" onClick={() => setAdding(false)}>
              취소
            </button>
          </div>
        </form>
      ) : (
        <button className="side-add" onClick={() => setAdding(true)}>
          + 새 프로젝트
        </button>
      )}
    </nav>
  );
}
