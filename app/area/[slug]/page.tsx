import { areaProfiles } from "@/lib/dummy-data";
import AreaHomeView from "@/components/AreaHomeView";

export function generateStaticParams() {
  return areaProfiles.map((p) => ({ slug: p.slug }));
}

export default async function AreaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <AreaHomeView slug={slug} />;
}
