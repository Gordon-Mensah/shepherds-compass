/**
 * useDbRefresh.js
 * A hook that re-runs a callback whenever the AI agent writes to the database.
 *
 * groqTools.js fires a "db-change" CustomEvent on window after every
 * insert / bulk_insert / update / delete. Pages that use this hook will
 * automatically reload their data when the agent makes a change.
 *
 * Usage:
 *   useDbRefresh(load);          // re-run load() on any table change
 *   useDbRefresh(load, 'sheep'); // only re-run when the sheep table changes
 */
import { useEffect } from 'react';

export function useDbRefresh(callback, table = null) {
  useEffect(() => {
    function handler(e) {
      // If a specific table was requested, only fire for that table
      if (table && e.detail?.table && e.detail.table !== table) return;
      callback();
    }
    window.addEventListener('db-change', handler);
    return () => window.removeEventListener('db-change', handler);
  }, [callback, table]);
}