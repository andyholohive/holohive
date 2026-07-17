/**
 * Page through a Supabase select in 1000-row windows (audit H4).
 *
 * PostgREST caps a select at 1000 rows by default. Several all-time aggregations
 * over the ever-growing `contents` table hit that cap silently and under-reported
 * company-wide KPIs (leaderboard, "content posted", "content delivered"). This
 * helper keeps fetching until a short page proves the end, ordering by a stable
 * column so windows don't overlap or skip.
 *
 * `makeQuery` MUST return a FRESH builder each call — pass a factory
 * (`() => sb.from('contents').select(...).eq(...)`), not a pre-built builder
 * (re-awaiting one instance re-applies modifiers and corrupts the range).
 *
 * Returns the familiar `{ data, error }` shape so it drops straight into existing
 * `const { data } = await ...` / `Promise.all([...])` call sites.
 */
export async function fetchAllRows<T = any>(
  makeQuery: () => any,
  opts?: { orderCol?: string; pageSize?: number },
): Promise<{ data: T[]; error: any }> {
  const PAGE = opts?.pageSize ?? 1000;
  const orderCol = opts?.orderCol ?? 'id';
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await makeQuery().order(orderCol, { ascending: true }).range(from, from + PAGE - 1);
    if (error) return { data: all, error };
    const chunk = (data ?? []) as T[];
    all.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return { data: all, error: null };
}
