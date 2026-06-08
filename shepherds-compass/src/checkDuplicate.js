import { supabase } from './supabase';

/**
 * Checks for duplicate names across sheep, first_timers, and shepherds.
 * Returns an array of matches: [{ table, id, name, phone, extra }]
 *
 * @param {string} name  - The name to check
 * @param {string} [excludeId] - ID to exclude (for edit mode)
 */
export async function checkDuplicateName(name, excludeId = null) {
  if (!name || name.trim().length < 2) return [];

  const q = name.trim().toLowerCase();

  const [{ data: sheep }, { data: ft }, { data: shepherds }] = await Promise.all([
    supabase.from('sheep').select('id, name, phone, shepherd_id, is_shepherd').ilike('name', `%${q}%`),
    supabase.from('first_timers').select('id, name, phone, visit_date').ilike('name', `%${q}%`),
    supabase.from('shepherds').select('id, name, phone, role').ilike('name', `%${q}%`),
  ]);

  const results = [];

  for (const p of (sheep || [])) {
    if (excludeId && p.id === excludeId) continue;
    results.push({
      table: p.is_shepherd ? 'shepherd' : 'member',
      id: p.id,
      name: p.name,
      phone: p.phone,
      extra: p.is_shepherd ? 'Shepherd' : 'Member',
      route: p.is_shepherd ? `/shepherds/${p.id}` : `/sheep/${p.id}`,
    });
  }

  for (const p of (ft || [])) {
    if (excludeId && p.id === excludeId) continue;
    // Avoid double-listing if they're also in sheep
    const alreadyListed = results.some(r => r.name.toLowerCase() === p.name.toLowerCase() && r.phone === p.phone);
    if (!alreadyListed) {
      results.push({
        table: 'first_timer',
        id: p.id,
        name: p.name,
        phone: p.phone,
        extra: `First Timer · visited ${p.visit_date || ''}`,
        route: null,
      });
    }
  }

  for (const p of (shepherds || [])) {
    if (excludeId && p.id === excludeId) continue;
    const alreadyListed = results.some(r => r.name.toLowerCase() === p.name.toLowerCase());
    if (!alreadyListed) {
      results.push({
        table: 'shepherd',
        id: p.id,
        name: p.name,
        phone: p.phone,
        extra: `Shepherd · ${p.role || ''}`,
        route: `/shepherds/${p.id}`,
      });
    }
  }

  return results;
}

/**
 * Quick exact-match check for bulk imports.
 * Returns a Set of lowercase names already in the database.
 */
export async function getExistingNames() {
  const [{ data: sheep }, { data: ft }] = await Promise.all([
    supabase.from('sheep').select('name'),
    supabase.from('first_timers').select('name'),
  ]);
  const names = new Set();
  for (const p of [...(sheep || []), ...(ft || [])]) {
    if (p.name) names.add(p.name.trim().toLowerCase());
  }
  return names;
}
