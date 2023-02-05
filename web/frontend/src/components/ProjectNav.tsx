import Link from "next/link";

/** 프로젝트 화면들(타임라인, 이슈 목록, 캘린더)을 오가는 링크 줄. */
export default function ProjectNav({ projectKey }: { projectKey: string }) {
  return (
    <p className="muted">
      <Link href="/">타임라인</Link> · <Link href={`/projects/${projectKey}`}>이슈 목록</Link> ·{" "}
      <Link href={`/projects/${projectKey}/calendar`}>캘린더</Link>
    </p>
  );
}
