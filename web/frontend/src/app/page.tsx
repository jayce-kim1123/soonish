"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { api } from "../lib/api";
import { Project } from "../lib/types";

// The main screen is the timeline of a project; the first project is opened by default.
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
          <p className="muted">Create your first project from the menu on the left.</p>
        </>
      )}
    </main>
  );
}
