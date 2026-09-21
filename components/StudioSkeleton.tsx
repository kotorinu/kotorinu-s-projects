/**
 * The shape of the page before its content arrives.
 *
 * A line of text ("読み込んでいます…") makes the layout jump the moment the
 * real content lands, which reads as the page breaking rather than loading.
 * This holds the same space the header and cards will occupy.
 *
 * It is decorative, so it is hidden from assistive technology and the page
 * announces its state through the live region instead. Motion is dropped for
 * anyone who asked for less of it.
 */
export default function StudioSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="studio" aria-hidden="true">
      <div className="studio-header">
        <div className="min-w-0 flex-1">
          <div className="skeleton h-9 w-52 rounded-xl" />
          <div className="skeleton mt-3 h-5 w-72 max-w-full rounded-lg" />
          <div className="skeleton mt-5 h-11 w-44 rounded-xl" />
        </div>
      </div>
      <div className="space-y-4">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="studio-card p-6">
            <div className="skeleton h-5 w-2/5 rounded-lg" />
            <div className="skeleton mt-4 h-4 w-4/5 rounded" />
            <div className="skeleton mt-2.5 h-4 w-3/5 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
