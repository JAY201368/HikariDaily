import type { Metadata } from 'next';
import { BriefingSchema } from '@/domain/schemas';
import snapshot from '@/content/showcase/briefing.json';
import { ShowcaseDemo } from '@/components/showcase/demo';

export const metadata: Metadata = { title: '交互展示 · 逐光日刊', robots: { index: false, follow: false } };

export default async function ShowcaseDemoPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const params = await searchParams;
  const view = params.view === 'handbook' || params.view === 'planner' ? params.view : 'journey';
  return <ShowcaseDemo briefing={BriefingSchema.parse(snapshot)} view={view} />;
}
