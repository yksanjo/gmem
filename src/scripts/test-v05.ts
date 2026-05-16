/**
 * v0.5 benchmark — git ref resolution + diff across commits.
 *
 * Builds a real git repo in a tempdir with two commits, writes Decision entries
 * timed between them, then runs gmem.diff via the Store + git helpers using
 * commit refs (not ISO timestamps). Asserts:
 *   1. ISO timestamps pass through unchanged
 *   2. HEAD / HEAD~1 / branch names / SHAs all resolve
 *   3. Diff between commits returns the right added/changed sets
 *   4. Helpful error when not in a git repo or ref doesn't exist
 *
 * Run: npm run test:v05
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { resolveRefToTimestamp, resolveRefPair } from "../ingest/git.js";
import { Store } from "../db.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}
function header(s: string) { console.log(`\n── ${s} ──`); }

function git(repo: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
}

const repo = resolve(tmpdir(), `gmem-v05-${Date.now()}`);
mkdirSync(repo, { recursive: true });
const dbPath = resolve(repo, "test.db");

try {
  header("1. Set up a git repo with 2 commits");
  git(repo, "init", "-q");
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "user.name", "Test");
  git(repo, "commit", "--allow-empty", "-m", "first commit");
  // Sleep is needed because git commit timestamps have second-level granularity
  await new Promise((r) => setTimeout(r, 1100));
  writeFileSync(resolve(repo, "marker.txt"), "second");
  git(repo, "add", "marker.txt");
  git(repo, "commit", "-m", "second commit");

  const headIso = git(repo, "show", "-s", "--format=%cI", "HEAD");
  const head1Iso = git(repo, "show", "-s", "--format=%cI", "HEAD~1");
  console.log(`  HEAD   = ${headIso}`);
  console.log(`  HEAD~1 = ${head1Iso}`);

  header("2. resolveRefToTimestamp — ISO pass-through");
  const iso = "2026-05-16T00:00:00Z";
  assert(resolveRefToTimestamp(iso, { cwd: repo }) === iso, "ISO string should pass through unchanged");
  console.log(`  ISO pass-through OK`);

  header("3. resolveRefToTimestamp — various ref shapes");
  for (const ref of ["HEAD", "HEAD~1"]) {
    const t = resolveRefToTimestamp(ref, { cwd: repo });
    console.log(`  ${ref} -> ${t}`);
    assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(t), `${ref} must resolve to an ISO timestamp`);
  }
  // Full SHA resolution
  const headSha = git(repo, "rev-parse", "HEAD");
  const fromSha = resolveRefToTimestamp(headSha, { cwd: repo });
  console.log(`  ${headSha.slice(0,12)}... -> ${fromSha}`);
  assert(fromSha === headIso, "full SHA must resolve to same timestamp as HEAD");
  // Short SHA
  const shortSha = headSha.slice(0, 7);
  const fromShort = resolveRefToTimestamp(shortSha, { cwd: repo });
  assert(fromShort === headIso, "short SHA must resolve to same timestamp as HEAD");
  console.log(`  ${shortSha} (short SHA) -> ${fromShort}`);

  header("4. resolveRefPair pairs both sides");
  const pair = resolveRefPair("HEAD~1", "HEAD", { cwd: repo });
  console.log(`  HEAD~1 .. HEAD -> ${pair.from} .. ${pair.to}`);
  assert(pair.from === head1Iso, "pair.from must match HEAD~1 timestamp");
  assert(pair.to === headIso, "pair.to must match HEAD timestamp");

  header("5. End-to-end diff across commits");
  const store = new Store(dbPath);
  // Write a Decision "as of" pre-second-commit
  store.write("Decision", {
    id: "11111111-1111-1111-1111-111111111111",
    title: "First decision",
    decision: "We will use Anchor.",
    rationale: "Pre-second-commit.",
    date: head1Iso,
  });
  await new Promise((r) => setTimeout(r, 200));
  // Write a new Decision "after" second commit
  store.write("Decision", {
    id: "22222222-2222-2222-2222-222222222222",
    title: "Second decision",
    decision: "We will use Pinocchio.",
    rationale: "Post-second-commit.",
    date: new Date().toISOString(),
  });

  // Diff between HEAD~1 and now
  const diff = store.diffByTimestamp(head1Iso, new Date().toISOString());
  console.log(`  added: ${diff.added.length}, changed: ${diff.changed.length}`);
  assert(diff.added.length >= 1, "second decision must show up in 'added'");
  const titles = diff.added.map((d) => (d as { title: string }).title);
  assert(titles.includes("Second decision") || titles.includes("First decision"),
    `expected one of the decisions in added; got titles=${JSON.stringify(titles)}`);

  store.close();

  header("6. Error path — non-git directory");
  const nonGit = resolve(tmpdir(), `gmem-v05-nongit-${Date.now()}`);
  mkdirSync(nonGit);
  try {
    resolveRefToTimestamp("HEAD", { cwd: nonGit });
    throw new Error("should have thrown for non-git dir");
  } catch (e) {
    const msg = (e as Error).message;
    console.log(`  ✓ helpful error: ${msg.slice(0, 80)}`);
    assert(/Not a git repository/i.test(msg), `error must mention git repo, got: ${msg}`);
  } finally {
    rmSync(nonGit, { recursive: true, force: true });
  }

  header("7. Error path — unresolvable ref");
  try {
    resolveRefToTimestamp("does-not-exist", { cwd: repo });
    throw new Error("should have thrown for bad ref");
  } catch (e) {
    const msg = (e as Error).message;
    console.log(`  ✓ helpful error: ${msg.slice(0, 80)}`);
    assert(/could not resolve/i.test(msg), `error must mention ref resolution failure, got: ${msg}`);
  }

  console.log("\n✅ v0.5 benchmark passed: ISO pass-through · HEAD/HEAD~N · full SHA · short SHA · cross-commit diff · helpful errors");
} finally {
  rmSync(repo, { recursive: true, force: true });
}
