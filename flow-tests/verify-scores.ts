import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { assembleScoreInputs, computeKolScores } from "../lib/kolScoreService";

const env = readFileSync(".env.local", "utf8");
const get = (k: string) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim() ?? "";
const sb = createClient(get("NEXT_PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"));

async function main() {
  const inputs = await assembleScoreInputs(sb as any);
  const results = computeKolScores(inputs);
  const withSnap = [...results.entries()].filter(([id]) => inputs.latestSnapshotByKol.get(id));
  const comps = withSnap.map(([, r]: any) => r.scores.channel).sort((a: number, b: number) => a - b);
  const pct = (p: number) => comps[Math.floor(p * (comps.length - 1))];
  console.log(`scored KOLs (with TG snapshot): ${comps.length}`);
  console.log(`min ${comps[0]?.toFixed(1)} | p25 ${pct(0.25)?.toFixed(1)} | median ${pct(0.5)?.toFixed(1)} | p75 ${pct(0.75)?.toFixed(1)} | max ${comps[comps.length - 1]?.toFixed(1)}`);
  console.log(`<20: ${comps.filter((c: number) => c < 20).length} | 20-40: ${comps.filter((c: number) => c >= 20 && c < 40).length} | 40-60: ${comps.filter((c: number) => c >= 40 && c < 60).length} | 60-80: ${comps.filter((c: number) => c >= 60 && c < 80).length} | 80+: ${comps.filter((c: number) => c >= 80).length}`);
  const rows = withSnap.map(([id, r]: any) => ({
    followers: inputs.latestSnapshotByKol.get(id)?.follower_count ?? 0,
    avgViews: inputs.latestSnapshotByKol.get(id)?.avg_views_per_post ?? 0,
    score: r.scores.channel,
  })).sort((a, b) => b.score - a.score);
  console.log("top 5:", rows.slice(0, 5).map(r => `f=${r.followers} v=${Math.round(Number(r.avgViews))} s=${r.score.toFixed(0)}`).join("  "));
}
main();

async function act() {
  const inputs = await (await import("../lib/kolScoreService")).assembleScoreInputs(sb as any);
  const results = (await import("../lib/kolScoreService")).computeKolScores(inputs);
  const acts = [...results.values()].map((r: any) => r.scores.activation).filter((a: any) => a != null).sort((a: number, b: number) => a - b);
  console.log(`activation scores: ${acts.length} KOLs | ${acts.map((a: number) => a.toFixed(0)).join(",")}`);
}
act();
