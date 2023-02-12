import Link from "next/link";

/** 프로젝트의 이슈 목록 화면에서 타임라인과 캘린더로 돌아가는 링크 줄. */
export default function ProjectNav({ projectKey }: { projectKey: string }) {
  return (
    <p className="muted">
      <Link href="/">타임라인</Link> · <Link href="/calendar">캘린더</Link> · <Link href={`/projects/${projectKey}`}>이슈 목록</Link>
    </p>
  );
}
