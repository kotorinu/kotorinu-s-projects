import type { ReactNode } from "react";
export default function StudioHeader({ eyebrow, title, subtitle, kind, action }: { eyebrow: string; title: string; subtitle: string; kind: "tasks" | "goals" | "review"; action?: ReactNode }) {
  return <header className="studio-header"><div className="relative z-10 min-w-0"><p className="studio-eyebrow">{eyebrow}</p><h1>{title}</h1><p className="studio-subtitle">{subtitle}</p>{action && <div className="mt-5 flex flex-wrap gap-3">{action}</div>}</div><div className={`desk-object desk-object-${kind}`} aria-hidden="true"><div className="object-shadow" /><div className="object-back" /><div className="object-front"><span>{kind === "tasks" ? "✓" : kind === "goals" ? "◎" : "↗"}</span></div><div className="object-pebble" /></div></header>;
}
