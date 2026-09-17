"use client";
import { useEffect, useRef, type ReactNode } from "react";
export default function StudioDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="studio-dialog" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }} aria-label={title}><div className="studio-dialog-body"><header className="mb-6 flex items-start justify-between gap-4"><h2 className="text-xl font-bold">{title}</h2><button autoFocus type="button" className="studio-icon-button" aria-label="閉じる" onClick={onClose}>✕</button></header>{children}</div></dialog>;
}
