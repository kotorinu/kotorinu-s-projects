export default function NavIcon({ kind }: { kind: string }) {
  const paths: Record<string, string> = {
    overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    today: "M12 3v3 M12 18v3 M3 12h3 M18 12h3 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
    tasks: "M9 6h12 M9 12h12 M9 18h12 M3 6l1 1 2-2 M3 12l1 1 2-2 M3 18l1 1 2-2",
    goals: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0 M12 12h.01",
    pdca: "M4 16l5-5 4 3 7-9 M15 5h5v5 M4 3v18h17",
  };
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={paths[kind] ?? paths.overview} /></svg>;
}
