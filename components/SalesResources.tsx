import { salesResources } from "@/lib/salesResources";

export default function SalesResources() {
  return (
    <section aria-label="営業代行の資料" className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
      <h2 className="text-[16px] font-black text-stone-800">カンペ・営業資料</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-stone-500">
        PCでもスマホでも、同じGoogle Driveの資料を開けます。
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {salesResources.map((resource) => (
          <a
            key={resource.href}
            href={resource.href}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-2xl bg-stone-50 p-3 transition-colors hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-600"
          >
            <span className="block text-[14px] font-bold text-accent-dark">{resource.label} ↗</span>
            <span className="mt-1 block text-[13px] leading-relaxed text-stone-500">{resource.description}</span>
          </a>
        ))}
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-stone-500">
        資料へのアクセス権があるGoogleアカウントで開いてください。PDFは保存版のため、アプリ内の編集は自動反映されません。
      </p>
    </section>
  );
}
