"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import ErrorNote from "../../../components/ErrorNote";
import { api } from "../../../lib/api";
import { Member } from "../../../lib/types";

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [position, setPosition] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Member[]>("/members").then(setMembers).catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  /** 요청을 보내고, 성공하면 목록을 다시 불러온다. 실패하면 오류 문구를 보여 준다. */
  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      setError(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const patch = (member: Member, body: Partial<Member>) => run(() => api(`/members/${member.id}`, { method: "PATCH", body }));

  function add(event: FormEvent) {
    event.preventDefault();
    run(async () => {
      await api("/members", { method: "POST", body: { name, email, position } });
      setName("");
      setEmail("");
      setPosition("");
    });
  }

  return (
    <main>
      <h1>멤버 관리</h1>
      <p className="muted">
        이슈의 단계를 맡는 담당자입니다. 한 단계에 여러 명을 지정할 수 있고, 멤버를 삭제하면 맡고 있던 단계에서도 빠집니다.
      </p>
      <ErrorNote message={error} />
      <ul className="list">
        {members.map((member) => (
          <li key={member.id}>
            <span className="row phase-row">
              <input
                defaultValue={member.name}
                placeholder="별칭"
                onBlur={(e) => e.target.value && e.target.value !== member.name && patch(member, { name: e.target.value })}
              />
              <input
                defaultValue={member.email}
                placeholder="이메일"
                onBlur={(e) => e.target.value !== member.email && patch(member, { email: e.target.value })}
              />
              <input
                defaultValue={member.position}
                placeholder="포지션"
                onBlur={(e) => e.target.value !== member.position && patch(member, { position: e.target.value })}
              />
            </span>
            <button
              className="link"
              onClick={() => confirm(`멤버 "${member.name}"을(를) 삭제할까요?`) && run(() => api(`/members/${member.id}`, { method: "DELETE" }))}
            >
              삭제
            </button>
          </li>
        ))}
        {members.length === 0 && <li className="muted">아직 멤버가 없습니다.</li>}
      </ul>
      <form onSubmit={add} className="row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="별칭" required />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일 (선택)" type="email" />
        <input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="포지션 (선택)" />
        <button type="submit">추가</button>
      </form>
    </main>
  );
}
