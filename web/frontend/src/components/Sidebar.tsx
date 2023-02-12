"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** 프로젝트 목록이 바뀌면 화면들이 다시 불러오도록 알리는 이벤트 이름. */
export const PROJECTS_CHANGED = "projects-changed";

/** 왼쪽 메뉴. 프로젝트는 타임라인 화면에 섹션으로 나오므로 여기에는 나열하지 않는다. */
export default function Sidebar() {
  const pathname = usePathname() ?? "/";

  return (
    <nav className="sidebar">
      <Link href="/" className="brand">
        Soonish
      </Link>
      <Link href="/" className={pathname === "/" ? "side-link active" : "side-link"}>
        타임라인
      </Link>
      <Link href="/calendar" className={pathname.startsWith("/calendar") ? "side-link active" : "side-link"}>
        캘린더
      </Link>
      <div className="side-title side-settings">설정</div>
      <Link href="/settings/phases" className={pathname.startsWith("/settings/phases") ? "side-link active" : "side-link"}>
        단계 관리
      </Link>
      <Link href="/settings/members" className={pathname.startsWith("/settings/members") ? "side-link active" : "side-link"}>
        멤버 관리
      </Link>
    </nav>
  );
}
