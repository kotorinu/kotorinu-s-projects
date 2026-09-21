import { areaProfiles } from "@/lib/dummy-data";
import AreaHomeView from "@/components/AreaHomeView";
import RialaAiOps from "@/components/RialaAiOps";
import RialaGmailPanel from "@/components/RialaGmailPanel";

export function generateStaticParams() {
  return areaProfiles.map((p) => ({ slug: p.slug }));
}

export default async function AreaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    // The area itself comes first: what this area is at, what is unanswered,
    // what is next. The AI desk and the mail read are how some of that work
    // gets done, but opening the page on a login panel buried the area behind
    // its own tooling.
    <>
      <AreaHomeView slug={slug} />
      {slug === "riala" && <div className="px-5 pb-4 pt-2"><RialaAiOps /><RialaGmailPanel /></div>}
    </>
  );
}

