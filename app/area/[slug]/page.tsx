import { areaProfiles } from "@/lib/dummy-data";
import AreaHomeView from "@/components/AreaHomeView";
import RialaAiOps from "@/components/RialaAiOps";

export function generateStaticParams() {
  return areaProfiles.map((p) => ({ slug: p.slug }));
}

export default async function AreaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <>
      {slug === "riala" && <div className="px-5 pt-4"><RialaAiOps /></div>}
      <AreaHomeView slug={slug} />
    </>
  );
}

