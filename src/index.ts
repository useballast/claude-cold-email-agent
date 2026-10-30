import { Command } from "commander";
import pc from "picocolors";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadConfig } from "./config.js";
import { ClaudeSDRAgent } from "./agent.js";
import { BallastMCPClient } from "./ballast-mcp.js";
import type { Lead } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const program = new Command();

program
  .name("claude-cold-email-agent")
  .description("AI SDR Starter Kit: Autonomous B2B cold outreach & inbox handling with Anthropic Claude and Ballast MCP")
  .version("1.0.0");

// Command: test connectivity
program
  .command("test")
  .description("Verify connection to Anthropic Claude API and Ballast Remote MCP")
  .action(async () => {
    console.log(pc.cyan("🔍 Testing credentials and connectivity..."));
    try {
      const config = loadConfig();
      console.log(pc.green("✔ Config loaded successfully (.env)."));

      const mcp = new BallastMCPClient(config);
      console.log(pc.gray(`Connecting to Ballast MCP at: ${config.BALLAST_MCP_URL}`));
      const tools = await mcp.getAnthropicTools();
      console.log(pc.green(`✔ Connected to Ballast MCP! Found ${tools.length} available tools.`));

      console.log(pc.gray(`Checking Claude model access: ${config.ANTHROPIC_MODEL}`));
      const agent = new ClaudeSDRAgent(config);
      console.log(pc.green("✔ Anthropic Claude client initialized successfully."));

      console.log(pc.bold(pc.green("\nAll systems operational! You are ready to run:")));
      console.log(pc.white("  npm run outbound    # Launch an AI outbound campaign"));
      console.log(pc.white("  npm run inbox       # Triage replies & follow-ups\n"));
    } catch (err: any) {
      console.error(pc.red(`\n✖ Test failed: ${err.message}`));
      process.exit(1);
    }
  });

// Command: outbound
program
  .command("outbound")
  .description("Run Claude to research prospects, personalize copy, and schedule campaigns in Ballast")
  .option("-c, --campaign <name>", "Name of the campaign", `AI SDR Sequence - ${new Date().toISOString().slice(0, 10)}`)
  .option("-f, --file <path>", "Path to leads JSON file", join(__dirname, "../data/sample-leads.json"))
  .action(async (opts) => {
    try {
      const config = loadConfig();
      const agent = new ClaudeSDRAgent(config);

      const filePath = opts.file;
      console.log(pc.cyan(`📂 Loading leads from: ${filePath}`));
      const fileData = readFileSync(filePath, "utf-8");
      const leads = JSON.parse(fileData) as Lead[];

      if (!Array.isArray(leads) || leads.length === 0) {
        throw new Error("Leads file must contain a non-empty JSON array.");
      }

      await agent.runOutboundCampaign(opts.campaign, leads);
    } catch (err: any) {
      console.error(pc.red(`\n✖ Outbound failed: ${err.message}`));
      process.exit(1);
    }
  });

// Command: inbox
program
  .command("inbox")
  .description("Triage incoming replies in Ballast Unified Inbox, classify intent, and draft/send responses")
  .option("-s, --send", "Automatically send the drafted replies (default: false / dry-run)", false)
  .action(async (opts) => {
    try {
      const config = loadConfig();
      const agent = new ClaudeSDRAgent(config);

      const autoReply = Boolean(opts.send);
      console.log(pc.cyan(`📬 Running Inbox Triage (Auto-send: ${autoReply ? pc.red("ENABLED") : pc.green("DRY-RUN")})...`));
      await agent.triageInbox(autoReply);
    } catch (err: any) {
      console.error(pc.red(`\n✖ Inbox triage failed: ${err.message}`));
      process.exit(1);
    }
  });

program.parse(process.argv);

