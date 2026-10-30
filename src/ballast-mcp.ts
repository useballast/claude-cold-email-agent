import type { BallastTool, UniboxThread } from "./types.js";
import type { AppConfig } from "./config.js";

export class BallastMCPClient {
  private endpoint: string;
  private apiKey: string;

  constructor(config: AppConfig) {
    this.endpoint = config.BALLAST_MCP_URL;
    this.apiKey = config.BALLAST_API_KEY;
  }

  /**
   * Execute a tool call against the Ballast Remote MCP endpoint
   */
  async callTool<T = any>(name: string, args: Record<string, any> = {}): Promise<T> {
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "x-api-key": this.apiKey,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name,
          arguments: args,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Ballast MCP Error (${res.status}): ${errText}`);
    }

    const json = (await res.json()) as any;
    if (json.error) {
      throw new Error(`Ballast Tool Error [${name}]: ${json.error.message || JSON.stringify(json.error)}`);
    }

    return json.result as T;
  }

  /**
   * Fetch tools from Ballast MCP formatted for Anthropic Claude SDK
   */
  async getAnthropicTools(): Promise<BallastTool[]> {
    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        if (data.result?.tools && Array.isArray(data.result.tools)) {
          return data.result.tools.map((t: any) => ({
            name: t.name,
            description: t.description || "",
            input_schema: {
              type: "object",
              properties: t.inputSchema?.properties || {},
              required: t.inputSchema?.required || [],
            },
          }));
        }
      }
    } catch {
      // Fallback to core AI SDR tools below
    }

    // Default core outbound & triage tools exposed to Claude
    return this.getCoreSDRTools();
  }

  /**
   * Core tools catalog optimized for the AI SDR Agent
   */
  getCoreSDRTools(): BallastTool[] {
    return [
      {
        name: "create_campaign",
        description: "Create a new cold email campaign in Ballast.",
        input_schema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Name of the campaign" },
            sendWindowStart: { type: "string", description: "Start time for sending (e.g. '09:00')" },
            sendWindowEnd: { type: "string", description: "End time for sending (e.g. '17:00')" },
            timezone: { type: "string", description: "Timezone, e.g. 'America/New_York'" },
          },
          required: ["name"],
        },
      },
      {
        name: "set_sequence",
        description: "Set the multi-step sequence steps and email copy for a campaign in Ballast.",
        input_schema: {
          type: "object",
          properties: {
            campaignId: { type: "string", description: "ID of the target campaign" },
            steps: {
              type: "array",
              description: "Sequence email steps with delays and copy",
              items: {
                type: "object",
                properties: {
                  stepNumber: { type: "number", description: "1-indexed step number" },
                  delayDays: { type: "number", description: "Days to wait before sending this step" },
                  subject: { type: "string", description: "Email subject line" },
                  body: { type: "string", description: "Email body in clean text/markdown" },
                },
                required: ["stepNumber", "delayDays", "subject", "body"],
              },
            },
          },
          required: ["campaignId", "steps"],
        },
      },
      {
        name: "add_leads_to_campaign",
        description: "Enroll a list of researched leads into an existing Ballast campaign.",
        input_schema: {
          type: "object",
          properties: {
            campaignId: { type: "string", description: "ID of the campaign" },
            leads: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  email: { type: "string" },
                  firstName: { type: "string" },
                  lastName: { type: "string" },
                  company: { type: "string" },
                  title: { type: "string" },
                  website: { type: "string" },
                  customFields: { type: "object", description: "Custom tags or personalized hook notes" },
                },
                required: ["email"],
              },
            },
          },
          required: ["campaignId", "leads"],
        },
      },
      {
        name: "list_threads",
        description: "Fetch replies and active conversation threads from the Ballast Unified Inbox.",
        input_schema: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["open", "replied", "closed"], description: "Filter by status" },
            limit: { type: "number", description: "Max threads to fetch (default: 20)" },
          },
        },
      },
      {
        name: "send_reply",
        description: "Send a follow-up response to an active prospect thread in Ballast Unibox.",
        input_schema: {
          type: "object",
          properties: {
            threadId: { type: "string", description: "ID of the thread to reply to" },
            body: { type: "string", description: "The message response body" },
          },
          required: ["threadId", "body"],
        },
      },
      {
        name: "get_overview",
        description: "Fetch high-level workspace health: connected mailboxes, active sequences, and deliverability stats.",
        input_schema: {
          type: "object",
          properties: {},
        },
      },
    ];
  }
}

