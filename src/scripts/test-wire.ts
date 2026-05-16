/**
 * Wire test — boots the gmem MCP server in a child process and exercises the 4 tools
 * via the MCP stdio protocol. No external dependencies, no Solana RPC required.
 * Run with: npm run test:wire
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
  });
  const client = new Client({ name: "gmem-wire-test", version: "0.0.1" }, { capabilities: {} });
  await client.connect(transport);

  console.log("Connected.");
  const tools = await client.listTools();
  console.log(`Tools registered: ${tools.tools.map((t) => t.name).join(", ")}`);
  if (tools.tools.length !== 4) throw new Error(`expected 4 tools, got ${tools.tools.length}`);

  // Write a Decision
  const writeRes = await client.callTool({
    name: "gmem.write",
    arguments: {
      kind: "Decision",
      entity: {
        title: "Use Anchor over native Rust",
        decision: "We will use Anchor for all on-chain programs in this project.",
        rationale: "Anchor's IDL+macros pay off when agent tooling is reading our programs.",
        alternatives: ["native Rust + manual IDL"],
        date: new Date().toISOString(),
      },
    },
  });
  console.log("write Decision:", JSON.stringify(writeRes.content, null, 2));

  // Try to write an invalid Program (missing required cluster)
  const badRes = await client.callTool({
    name: "gmem.write",
    arguments: {
      kind: "Program",
      entity: { id: "11111111111111111111111111111111", name: "broken" },
    },
  });
  const badText = (badRes.content as { type: string; text: string }[])[0]?.text ?? "";
  if (!badText.includes("ok\": false")) throw new Error(`expected schema rejection, got: ${badText}`);
  console.log("schema rejection works ✓");

  // Recall
  const recallRes = await client.callTool({
    name: "gmem.recall",
    arguments: { query: "anchor", kinds: ["Decision"] },
  });
  console.log("recall 'anchor':", JSON.stringify(recallRes.content, null, 2));

  // list_decisions
  const listRes = await client.callTool({ name: "gmem.list_decisions", arguments: {} });
  console.log("list_decisions:", JSON.stringify(listRes.content, null, 2));

  // diff stub
  const diffRes = await client.callTool({ name: "gmem.diff", arguments: { from: "HEAD~1", to: "HEAD" } });
  console.log("diff stub:", JSON.stringify(diffRes.content, null, 2));

  await client.close();
  console.log("\n✓ all 4 tools wired");
}

main().catch((e) => {
  console.error("wire test failed:", e);
  process.exit(1);
});
