import type { JournalEntry } from '../types'
import { API_URL } from './api'

export async function generateWeeklyReflection(
  entries: JournalEntry[]
): Promise<string> {
  if (entries.length < 3) return ''

  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

  const weekEntries = entries.filter(
    e => new Date(e.created_at) >= weekAgo
  )

  if (weekEntries.length < 2) return ''

  const summaryData = weekEntries.map(e => ({
    mood: e.mood_score,
    text: e.content.slice(0, 80)
  }))

  const response = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        {
          role: 'user',
          content: JSON.stringify(summaryData)
        }
      ],
      systemPrompt: `
You are generating a weekly emotional reflection for a journaling app.

Goal:
Help the user understand their past week emotionally.

Tone:
- Warm, human, slightly personal
- Like a thoughtful friend noticing patterns

Rules:
- Max 3 sentences
- No bullet points
- No advice
- No therapy language
- Focus on patterns + emotional shifts

Examples:
- "this week felt a bit heavier than usual, especially around moments of stress."
- "there's a quiet pattern of feeling better after expressing things."
- "you seemed more drained mid-week, but things softened later."

Keep it simple, real, and slightly reflective.
      `
    })
  })

  const data = await response.json()
  if (!response.ok) return ''

  return data.content
}