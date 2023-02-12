"use client";

import { FormEvent, useEffect, useState } from "react";

import { api } from "../lib/api";
import ErrorNote from "./ErrorNote";

/**
 * 새 프로젝트를 만드는 모달.
 *
 * 키는 만든 뒤에는 바꿀 수 없으므로 입력칸 옆에 안내를 보여 준다.
 *
 * @param onClose 모달을 닫을 때 부르는 함수.
 * @param onCreated 프로젝트를 만든 뒤 화면을 다시 불러오는 함수.
 */
export default function NewProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  async function create(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/projects", { method: "POST", body: { key: key.toUpperCase(), name } });
      onCreated();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal" onSubmit={create} onMouseDown={(e) => e.stopPropagation()}>
        <h3>새 프로젝트</h3>
        <ErrorNote message={error} />
        <label className="modal-field">
          <span>키</span>
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="예: WEB" maxLength={10} required autoFocus />
        </label>
        <label className="modal-field">
          <span>이름</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="프로젝트 이름" maxLength={100} required />
        </label>
        <p className="muted">영문 대문자로 시작하는 2~10자이고, 만든 뒤에는 바꿀 수 없습니다. 이슈 번호 앞에 붙습니다.</p>
        <div className="row modal-actions">
          <button type="submit">만들기</button>
          <button type="button" onClick={onClose}>
            취소
          </button>
        </div>
      </form>
    </div>
  );
}
