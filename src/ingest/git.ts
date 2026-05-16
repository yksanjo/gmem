/**
 * Git ref → timestamp resolution — Milestone 5 / v0.5.
 *
 * `gmem.diff` accepts git commit refs (HEAD, HEAD~3, branch names, full or short SHAs)
 * and turns them into ISO 8601 commit timestamps via `git show -s --format=%cI`.
 * The Store's existing diffByTimestamp then computes added / changed entity sets
 * between those two points.
 *
 * No network. No write access. Read-only `git` invocation on the active project.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const ISO = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/;

export interface ResolveOptions {
  /** Project root to run `git` in. Defaults to cwd. */
  cwd?: string;
}

/**
 * Resolve a git ref to an ISO 8601 commit timestamp.
 * Returns the input unchanged if it already looks like an ISO timestamp.
 * Throws if the ref doesn't resolve or `git` isn't available.
 */
export function resolveRefToTimestamp(ref: string, opts: ResolveOptions = {}): string {
  const trimmed = ref.trim();
  if (ISO.test(trimmed)) return trimmed; // already a timestamp

  const cwd = opts.cwd ?? process.cwd();
  if (!existsSync(resolve(cwd, ".git"))) {
    throw new Error(`Not a git repository: ${cwd}. Pass ISO timestamps instead of refs, or run gmem from a git checkout.`);
  }

  let out: string;
  try {
    out = execFileSync("git", ["show", "-s", "--format=%cI", trimmed], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    })
      .toString()
      .trim();
  } catch (e) {
    throw new Error(`git could not resolve ref '${trimmed}' in ${cwd}: ${(e as Error).message.slice(0, 200)}`);
  }

  if (!out || !ISO.test(out)) {
    throw new Error(`git returned an unexpected timestamp for '${trimmed}': '${out}'`);
  }
  return out;
}

/**
 * Resolve two refs in a single call, preserving order.
 * Convenience for the gmem.diff tool.
 */
export function resolveRefPair(from: string, to: string, opts: ResolveOptions = {}): { from: string; to: string } {
  return {
    from: resolveRefToTimestamp(from, opts),
    to: resolveRefToTimestamp(to, opts),
  };
}
