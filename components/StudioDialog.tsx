"use client";
import { useEffect, useRef, type ReactNode, type KeyboardEvent } from "react";
export default function StudioDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog=ref.current; const main=document.querySelector("main");
    const pageOverflow=document.documentElement.style.overflow; const mainOverflow=main?.style.overflow;
    document.documentElement.style.overflow="hidden"; if(main)main.style.overflow="hidden";
    dialog?.showModal();
    return ()=>{dialog?.close();document.documentElement.style.overflow=pageOverflow;if(main)main.style.overflow=mainOverflow??"";};
  }, []);
  function containFocus(e:KeyboardEvent<HTMLDialogElement>) {
    if(e.key!=="Tab")return;
    e.stopPropagation();
    const dialog=e.currentTarget;
    const fields=Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex]:not([tabindex="-1"])')).filter(el=>el.getClientRects().length && el.closest("dialog")===dialog);
    const first=fields[0],last=fields.at(-1);
    if(first && ((e.shiftKey && document.activeElement===first) || (!e.shiftKey && document.activeElement===last))) {e.preventDefault();(e.shiftKey?last:first)?.focus();}
  }
  return <dialog ref={ref} className="studio-dialog" onKeyDown={containFocus} onCancel={e => { e.preventDefault(); e.stopPropagation(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }} aria-label={title}><div className="studio-dialog-body"><header className="dialog-sticky-header mb-6 flex items-start justify-between gap-4"><h2 className="text-xl font-bold">{title}</h2><button autoFocus type="button" className="studio-icon-button" aria-label="閉じる" onClick={e => { e.preventDefault(); e.stopPropagation(); ref.current?.close(); onClose(); }}>✕</button></header>{children}</div></dialog>;
}
