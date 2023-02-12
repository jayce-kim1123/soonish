"use client";

import IssueDetail from "../../../../../components/IssueDetail";

export default function IssuePage({ params }: { params: { key: string; number: string } }) {
  return (
    <main>
      <IssueDetail projectKey={params.key} number={Number(params.number)} />
    </main>
  );
}
