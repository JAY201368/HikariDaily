import { GenreSchema } from "../domain/schemas";
import { getBriefing, briefingFailure } from "../server/briefing-service";
import { BriefingClient } from "../components/briefing-client";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type SearchParams = Record<string, string | string[] | undefined>;
export default async function HomePage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = await searchParams ?? {};
  const genre = GenreSchema.safeParse(params.genre);
  const result = params.place === undefined ? null : typeof params.place !== "string"
    ? briefingFailure("INVALID_LOCATION") : await getBriefing(params.place);
  return <main className={styles.paper}>
    <header className={styles.masthead}>
      <h1 aria-label="逐光日刊">逐光</h1><p className={styles.eyebrow}>HIKARI DAILY</p>
    </header>
    <BriefingClient initialPlace={params.place === undefined ? null : typeof params.place === "string" ? params.place : ""} initialGenre={genre.success ? genre.data : "landscape"} initialResult={result} />
    <footer className={styles.footer}>天气概览 · 随身仪表 · 摄影手册</footer>
  </main>;
}
