/**
 * `--only=A1,G3` for browser suites whose steps are named by an id prefix. Without `--only` every step runs and the
 * suite behaves exactly as before. With it, a prefix that matched no step, or a run in which no step ran, is a
 * failure: a typo must never turn into a green "0 / 0 passed".
 */
export function stepFilter(argv = process.argv) {
  if (argv.includes('--only')) throw new Error('Use --only=A1,G3 (step-id prefixes joined by commas).');
  const args = argv.filter(a => a.startsWith('--only='));
  const prefixes = args.length ? args.flatMap(a => a.slice(7).split(',')).map(p => p.trim()).filter(Boolean) : null;
  const matched = new Set();
  return {
    prefixes,
    /** True when the step should run; records which prefixes selected something. */
    selects(name) {
      if (!prefixes) return true;
      const hits = prefixes.filter(p => name.startsWith(p));
      for (const p of hits) matched.add(p);
      return hits.length > 0;
    },
    /** Reasons the filtered run must fail (empty without `--only`). `ran` is the number of steps that ran. */
    problems(ran) {
      if (!prefixes) return [];
      const out = [];
      if (!prefixes.length) out.push('--only= names no step prefix');
      for (const p of prefixes) if (!matched.has(p)) out.push(`--only prefix "${p}" matched no step`);
      if (ran === 0) out.push('--only selected no step: 0 steps ran');
      return out;
    },
  };
}

/** Prints each filter problem, sets a failing exit code and returns the problems (for the suite report). */
export function reportFilter(filter, ran) {
  const problems = filter.problems(ran);
  for (const p of problems) console.log('FAIL', p);
  if (problems.length) process.exitCode = 1;
  return problems;
}
