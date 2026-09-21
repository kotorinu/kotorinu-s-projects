import type { ReactNode } from "react";

/**
 * The page header.
 *
 * The desk object is decoration, so it sits last in the DOM and is hidden
 * outright on phones — at 390px the first screen belongs to the one thing the
 * page is for, not to an illustration. The action row carries its own class:
 * it used to be styled through `div:last-child`, which actually matched the
 * decoration and quietly overrode the rule that hides it.
 *
 * `eyebrow` is optional. A decorative English label above a Japanese title
 * costs a line and says nothing, so most pages pass nothing at all.
 */
export default function StudioHeader({ eyebrow, title, subtitle, kind, action }: {
  eyebrow?: string; title: string; subtitle?: string;
  kind: "tasks" | "goals" | "review"; action?: ReactNode;
}) {
  return (
    <header className="studio-header">
      <div className="relative z-10 min-w-0">
        {eyebrow ? <p className="studio-eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {subtitle ? <p className="studio-subtitle">{subtitle}</p> : null}
        {action ? <div className="studio-actions">{action}</div> : null}
      </div>
      <div className={`desk-object desk-object-${kind}`} aria-hidden="true">
        <div className="object-shadow" />
        <div className="object-back" />
        <div className="object-front"><span>{kind === "tasks" ? "✓" : kind === "goals" ? "◎" : "↗"}</span></div>
        <div className="object-pebble" />
      </div>
    </header>
  );
}
