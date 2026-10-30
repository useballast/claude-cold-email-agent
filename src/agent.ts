import Anthropic from "@anthropic-ai/sdk";
import pc from "picocolors";
import type { AppConfig } from "./config.js";
import { BallastMCPClient } from "./ballast-mcp.js";
import { getSDRSystemPrompt, getLeadPersonalizationPrompt, getInboxTriagePrompt } from "./prompts.js";
import type { Lead, TriageResult } from "./types.js";

export class ClaudeSDRAgent {
  private anthropic: Anthropic;
  private mcp: BallastMCPClient;
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
    this.anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
    this.mcp = new BallastMCPClient(config);
  }

  /**
   * Generates tailored copy for each lead and orchestrates campaign creation in Ballast
   */
  async runOutboundCampaign(campaignName: string, leads: Lead[]): Promise<void> {
    console.log(pc.cyan(`\n🤖 Starting AI SDR Outbound Campaign: "${campaignName}"`));
    console.log(pc.gray(`Processing ${leads.length} leads with Claude (${this.config.ANTHROPIC_MODEL})...\n`));

    // 1. Fetch available tools from Ballast MCP
    const tools = await this.mcp.getAnthropicTools();

    // 2. Claude personalizes sequence structure and creates the campaign in Ballast
    const prompt = `You need to orchestrate a high-performing outbound cold email campaign for these ${leads.length} prospects:
${JSON.stringify(leads, null, 2)}

Instructions:
1. Use the 'create_campaign' tool to initialize campaign "${campaignName}".
2. Use the 'set_sequence' tool to register a 3-step high-converting sequence matching our offer (${this.config.OFFER_SUMMARY}).
3. Use the 'add_leads_to_campaign' tool to enroll all ${leads.length} prospects with personalized variables.

Provide a clear executive summary of the copy angle and reasoning once the tool calls succeed.`;

    const response = await this.anthropic.messages.create({
      model: this.config.ANTHROPIC_MODEL,
      max_tokens: 3000,
      system: getSDRSystemPrompt(this.config),
      tools: tools as any,
      messages: [{ role: "user", content: prompt }],
    });

    // 3. Process tool calls from Claude
    let toolCallsCount = 0;
    for (const content of response.content) {
      if (content.type === "tool_use") {
        toolCallsCount++;
        console.log(pc.green(`⚡ Claude executing tool: `) + pc.bold(content.name));
        console.log(pc.gray(JSON.stringify(content.input, null, 2)));

        try {
          const result = await this.mcp.callTool(content.name, content.input as Record<string, any>);
          console.log(pc.green(`✔ ${content.name} completed successfully:`));
          console.log(pc.gray(JSON.stringify(result, null, 2)));
        } catch (err: any) {
          console.error(pc.red(`✖ Failed to execute ${content.name}: ${err.message}`));
        }
      } else if (content.type === "text") {
        console.log(pc.white(`\n📝 Claude SDR Analysis:\n${content.text}\n`));
      }
    }

    if (toolCallsCount === 0) {
      console.log(pc.yellow("Note: Claude did not trigger MCP tools. Check tool definitions or permissions."));
    } else {
      console.log(pc.green(`\n🚀 Campaign "${campaignName}" fully orchestrated with ${toolCallsCount} MCP operations!`));
    }
  }

  /**
   * Inspects Ballast Unified Inbox for incoming prospect replies and drafts/sends replies
   */
  async triageInbox(autoReply: boolean = false): Promise<TriageResult[]> {
    console.log(pc.cyan(`\n📬 Inspecting Ballast Unified Inbox for prospect replies...`));

    let threads: any[] = [];
    try {
      const result = await this.mcp.callTool("list_threads", { status: "open", limit: 10 });
      threads = Array.isArray(result) ? result : result?.threads || [];
    } catch (err: any) {
      console.log(pc.yellow(`Could not fetch live inbox threads (${err.message}). Running with simulated demo thread.`));
      threads = [
        {
          id: "thread_mock_01",
          leadEmail: "sarah.chen@growthscale.example.com",
          subject: "Re: Question on scaling outbound",
          snippet: "Hey Alex, thanks for reaching out. Yes, we are currently spending too much on Instantly. Can you send over that 2-minute video on how the migration works?",
        },
      ];
    }

    if (threads.length === 0) {
      console.log(pc.green("All caught up! Zero unread prospect threads in Unibox."));
      return [];
    }

    console.log(pc.gray(`Found ${threads.length} thread(s) to triage.\n`));
    const results: TriageResult[] = [];

    for (const thread of threads) {
      console.log(pc.bold(`--- Thread: ${thread.subject} (${thread.leadEmail}) ---`));
      console.log(pc.gray(`Last message: "${thread.snippet || ""}"`));

      const triagePrompt = getInboxTriagePrompt(thread.snippet || thread.subject);
      const res = await this.anthropic.messages.create({
        model: this.config.ANTHROPIC_MODEL,
        max_tokens: 800,
        system: getSDRSystemPrompt(this.config),
        messages: [{ role: "user", content: triagePrompt }],
      });

      const responseText = res.content.map((c: any) => c.text || "").join("\n");
      const isInterested = /interested/i.test(responseText);
      const isObjection = /objection/i.test(responseText);
      const sentiment = isInterested ? "interested" : isObjection ? "objection" : "not_interested";

      console.log(pc.cyan(`Sentiment Detected: `) + pc.bold(sentiment.toUpperCase()));
      console.log(pc.white(`Drafted Follow-up:\n${responseText}\n`));

      let sent = false;
      if (autoReply && thread.id && !thread.id.startsWith("thread_mock")) {
        console.log(pc.yellow(`Sending live reply to ${thread.leadEmail}...`));
        try {
          await this.mcp.callTool("send_reply", {
            threadId: thread.id,
            body: responseText,
          });
          sent = true;
          console.log(pc.green(`✔ Reply dispatched via Ballast Unibox.`));
        } catch (e: any) {
          console.error(pc.red(`Failed to send reply: ${e.message}`));
        }
      }

      results.push({
        threadId: thread.id,
        leadEmail: thread.leadEmail,
        sentiment,
        analysis: responseText,
        draftedReply: responseText,
        sent,
      });
    }

    return results;
  }
}
