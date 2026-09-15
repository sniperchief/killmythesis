import { SavedResearch } from "@/components/history/SavedResearch";
import { PAGE } from "@/components/ui/styles";

export default async function ResearchPage({ params }: PageProps<"/research/[id]">) {
  const { id } = await params;
  return (
    <div className={`${PAGE} py-8 lg:py-10`}>
      <SavedResearch id={decodeURIComponent(id)} />
    </div>
  );
}
