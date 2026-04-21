import type { JournalEntry } from '../types'

type PatternResult = {
  dominantEmotion: string | null
  frequency: number
  recentTrend: 'improving' | 'declining' | 'stable'
}

function detectEmotionFromText(text: string): string | null {
  const lower = text.toLowerCase()

  if (lower.match(/stress|overwhelm|pressure/)) return 'stress'
  if (lower.match(/anxious|worry|overthinking/)) return 'anxiety'
  if (lower.match(/sad|low|down|empty/)) return 'sadness'
  if (lower.match(/angry|frustrated|irritated/)) return 'anger'
  if (lower.match(/tired|exhausted|drained/)) return 'fatigue'

  return null
}

export function extractPatterns(entries: JournalEntry[]): PatternResult | null {
  if (entries.length < 3) return null

  const recent = entries.slice(0, 7)

  const emotionCount: Record<string, number> = {}

  for (const entry of recent) {
    const emotion = detectEmotionFromText(entry.content)
    if (!emotion) continue

    emotionCount[emotion] = (emotionCount[emotion] || 0) + 1
  }

  const dominantEmotion = Object.entries(emotionCount)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null

  const avgRecent =
    recent.reduce((sum, e) => sum + e.mood_score, 0) / recent.length

  const older = entries.slice(7, 14)
  const avgOlder =
    older.length > 0
      ? older.reduce((sum, e) => sum + e.mood_score, 0) / older.length
      : avgRecent

  let trend: PatternResult['recentTrend'] = 'stable'

  if (avgRecent > avgOlder + 0.3) trend = 'improving'
  else if (avgRecent < avgOlder - 0.3) trend = 'declining'

  return {
    dominantEmotion,
    frequency: emotionCount[dominantEmotion || ''] || 0,
    recentTrend: trend
  }
}