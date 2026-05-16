# Publishing gmem — npm + MCP Registry

Everything below is one-time-only setup that needs your auth. The package itself is fully prepared (publish dry-run is clean at 25.5 kB / 26 files).

## Step 1 — Publish to npm (~3 min)

```bash
cd ~/gmem
npm login              # opens browser for auth
npm publish --access public
```

After this, anyone in the world can run `npm install -g gmem` and start using the server. Verify at https://www.npmjs.com/package/gmem.

## Step 2 — Install the MCP Registry publisher (~1 min)

The registry has its own CLI. Pick one:

```bash
# macOS via Homebrew (cleanest):
brew install mcp-publisher

# Or curl pre-built binary:
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher && sudo mv mcp-publisher /usr/local/bin/
```

Verify:

```bash
mcp-publisher --help
```

## Step 3 — Submit to the MCP Registry (~1 min)

`server.json` is already in the repo root.

```bash
cd ~/gmem
mcp-publisher login    # opens browser for GitHub OAuth (the mcpName field is io.github.yksanjo/gmem, so GitHub-based auth is the right path)
mcp-publisher publish
```

After this, gmem shows up at https://registry.modelcontextprotocol.io and is discoverable from inside Claude Code / Cursor / any MCP client's registry view.

## Step 4 — Verify both registries are live

```bash
# npm
npm view gmem version          # should print 1.0.0
npx -y gmem --help              # should boot the server (will hang on stdin — that's correct, Ctrl-C)

# MCP Registry (via official API)
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=gmem" | jq .
```

## Future releases

For v1.1+ you'll re-run:

1. Bump `version` in `package.json` AND `server.json` (they must match)
2. `npm publish`
3. `mcp-publisher publish`

That's it.

## What's already done

- ✅ `package.json` is public (`private: true` removed)
- ✅ `mcpName: "io.github.yksanjo/gmem"` set (required for GitHub auth)
- ✅ `files` allowlist set — clean 25.5 kB tarball, no test cruft
- ✅ `engines.node >= 20`
- ✅ `keywords` covers `mcp`, `solana`, `anchor`, `ai`, `agent`, `claude-code`, etc
- ✅ `server.json` at repo root
- ✅ `dist/index.js` has shebang + is chmod +x
- ✅ `prepublishOnly` script rebuilds before publish
- ✅ `npm publish --dry-run` verified clean
