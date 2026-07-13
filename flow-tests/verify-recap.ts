import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { LineupManagerService } from "../lib/lineupManagerService";
import { getTemplate } from "../lib/messageTemplates";

const env = readFileSync(".env.local", "utf8");
const get = (k: string) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim() ?? "";
const sb = createClient(get("NEXT_PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"));

async function main() {
  const campaignId = "d64f6ec5-5bbc-46e0-a2e0-1df5c1e7d60f"; // Venice Korea
  const weekOf = "2026-07-06"; // week 9 (just-ended as of 2026-07-13)
  const svc = new LineupManagerService(sb as any);
  const header = await getTemplate(sb as any, "tmpl_weekly_content_recap_header");
  const msg = await svc.formatWeeklyContentRecap(campaignId, "Venice Korea", weekOf, header);
  console.log("=== RECAP MESSAGE (null = no post) ===");
  console.log(msg ?? "<null — no content, no post>");
}
main();
