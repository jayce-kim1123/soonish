"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { api } from "../lib/api";
import { Project } from "../lib/types";

/** 메인 화면은 프로젝트의 타임라인이다. 첫 번째 프로젝트를 기본으로 연다. */
export default function Home() {
  const router = useRouter();
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    api<Project[]>("/projects")
      .then((projects) => {
        if (projects.length > 0) router.replace(`/projects/${projects[0].key}/timeline`);
        else setEmpty(true);
      })
      .catch(() => setEmpty(true));
  }, [router]);

  return (
    <main>
      {empty && (
        <>
          <h1>Soonish</h1>
          <p className="muted">왼쪽 메뉴에서 첫 프로젝트를 만들어 주세요.</p>
        </>
      )}
    </main>
  );
}
