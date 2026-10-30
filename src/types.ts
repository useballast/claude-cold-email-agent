export interface Lead {
  firstName: string;
  lastName?: string;
  email: string;
  company: string;
  title?: string;
  website?: string;
  notes?: string;
}

export interface PersonalizedPitch {
  leadEmail: string;
  subject: string;
  body: string;
  followUpSubject?: string;
  followUpBody?: string;
  frameworkUsed: string;
  reasoning: string;
}

export interface BallastTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface UniboxThread {
  id: string;
  campaignId?: string;
  leadEmail: string;
  leadName?: string;
  subject: string;
  snippet?: string;
  status: "open" | "replied" | "closed";
  unread: boolean;
  lastMessageAt?: string;
  messages?: Array<{
    id: string;
    from: string;
    to: string;
    body: string;
    sentAt: string;
  }>;
}

export interface TriageResult {
  threadId: string;
  leadEmail: string;
  sentiment: "interested" | "objection" | "not_interested" | "out_of_office" | "other";
  analysis: string;
  draftedReply?: string;
  sent: boolean;
}
