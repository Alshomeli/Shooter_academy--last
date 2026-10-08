/** Keyset pagination: does not stop early when the server caps a response. */
export async function collectPages<T extends { id: string }>(
  fetchPage: (after: string | undefined) => Promise<T[]>,
): Promise<T[]> {
  const rows: T[] = [];
  let after: string | undefined;
  for (;;) {
    const page = await fetchPage(after);
    if (!page.length) return rows;
    const last = page[page.length - 1].id;
    if (!last || last === after) throw new Error('Pagination did not advance');
    rows.push(...page);
    after = last;
  }
}
