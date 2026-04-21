import type { JournalEntry } from "../types";

import { API_URL } from "./api";

export async function getInsights(entries: JournalEntry[]): Promise<string> {
  if (!entries.length) return "";


  const trimmed = entries.slice(0, 5).map((e) => ({
    mood: e.mood_score,
    summary: (e.ai_response || "").slice(0, 80),
  }));

  const response = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        {
          role: "user",
          content: JSON.stringify(trimmed),
        },
      ],
      systemPrompt: `
You are observing someone's emotional patterns.

Goal:
Help them notice something about themselves.


Tone:
- Gentle
- Human
- Slightly insightful
- Never analytical or robotic

Rules:
- Max 3 sentences
- No bullet points
- No advice
- No “you should”
- Focus on patterns, not single events

Make it feel like:
"someone who has been quietly paying attention"

Examples:
- "I'm noticing stress shows up more when things feel uncertain."
- "you tend to feel lighter after letting things out."
- "there’s a pattern of overthinking before important moments."

Keep it subtle and real.
      `,
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Insights error");

  return data.content;
}