// GitHub's concurrency queue is not FIFO. Refuse an obsolete run, including a
// manually re-run old workflow, before it can replace a newer production site.
const repository = process.env.GITHUB_REPOSITORY;
const expected = process.env.GITHUB_SHA;
const token = process.env.GITHUB_TOKEN;
if (!repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !/^[a-f0-9]{40}$/.test(expected ?? '') || !token) {
  throw new Error('Deployment freshness check requires the GitHub Actions repository, commit and read-only token.');
}
const response = await fetch(`https://api.github.com/repos/${repository}/git/ref/heads/main`, {
  headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  signal: AbortSignal.timeout(15000),
});
if (!response.ok) throw new Error(`Could not verify current main commit (HTTP ${response.status}).`);
const reference = await response.json();
if (reference.object?.sha !== expected) throw new Error('main has advanced. Deploy the newest successful workflow instead of this obsolete build.');
console.log('Production artifact matches the current main commit.');
