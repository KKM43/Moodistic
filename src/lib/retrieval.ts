import type { JournalEntry } from '../types'

import { API_URL } from "./api";


const EMOTION_MAP: Record<string, string[]> = {
  stress: ['stress', 'stressed', 'pressure', 'overwhelmed', 'tension', 'ताण'],
  anxiety: ['anxious', 'anxiety', 'worry', 'worried', 'overthinking', 'चिंता'],
  sadness: ['sad', 'down', 'depressed', 'low', 'unhappy', 'दुखी'],
  anger: ['angry', 'frustrated', 'irritated', 'annoyed', 'राग'],
  fatigue: ['tired', 'exhausted', 'drained', 'burnout', 'थकलो'],
  loneliness: ['alone', 'lonely', 'isolated', 'एकटा', 'अकेला'],
  motivation: ['motivated', 'productive', 'focused', 'driven']
}

// Better multilingual stop words
const STOP_WORDS = new Set([
  'i', 'me', 'my', 'am', 'is', 'are', 'was', 'the', 'a', 'an',
  'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'it', 'this', 'that', 'so', 'do', 'did', 'have', 'had', 'be',
  'been', 'not', 'no', 'just', 'about', 'like', 'get', 'got', 'feel',
  // Hindi common stop words
  'मैं', 'मेरा', 'है', 'हूं', 'था', 'थी', 'और', 'या', 'लेकिन', 'में',
  'पर', 'से', 'को', 'के', 'की', 'का', 'इस', 'उस', 'बहुत', 'एक',
  // Marathi common stop words
  'मी', 'माझा', 'आहे', 'होता', 'आणि', 'किंवा', 'पण', 'मध्ये', 'वर',
  'साठी', 'कडे', 'चा', 'ची', 'चे'
])


function detectEmotion(keywords: Set<string>): string | null {
  for (const [emotion, words] of Object.entries(EMOTION_MAP)) {
    for (const word of words) {
      if (keywords.has(word)) return emotion
    }
  }
  return null
}

function keywordSimilarity(a: Set<string>, b: Set<string>): number {
  let match = 0

  for (const word of a) {
    if (b.has(word)) match++
  }

  return match / Math.max(a.size, 1) // normalize
}


function moodSimilarity(currentMood: number, entryMood?: number): number {
  if (!entryMood) return 0.5
  const diff = Math.abs(currentMood - entryMood)
  return 1 - diff / 4
}

function extractKeywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\s]/gu, '')
      .split(/\s+/)
      .filter(word =>
        word.length > 2 &&
        !STOP_WORDS.has(word)
      )
  )
}

function scoreEntry(
  currentKeywords: Set<string>,
  currentEmotion: string | null,
  currentMood: number,
  entry: JournalEntry
): number {
  const entryKeywords = extractKeywords(entry.content)

  const keywordScore = keywordSimilarity(currentKeywords, entryKeywords)

  const entryEmotion = detectEmotion(entryKeywords)
  const emotionScore =
    currentEmotion && entryEmotion && currentEmotion === entryEmotion ? 1 : 0

  const daysSince =
    (Date.now() - new Date(entry.created_at).getTime()) / 86400000
  const recencyScore = Math.exp(-daysSince / 20)

  const moodScore = moodSimilarity(currentMood, entry.mood_score)

  // 🔥 NEW — semantic hint from AI response
  const meaningScore = entry.ai_response
    ?.toLowerCase()
    .includes(currentEmotion || '')
    ? 0.6
    : 0

  return (
    0.25 * keywordScore +
    0.25 * emotionScore +
    0.2 * recencyScore +
    0.15 * moodScore +
    0.15 * meaningScore
  )
}

export function retrieveRelevantEntries(
  currentText: string,
  allEntries: JournalEntry[],
  currentMood: number,
  topK: number = 3
): JournalEntry[] {
  if (allEntries.length === 0) return []

  const currentKeywords = extractKeywords(currentText)
  const currentEmotion = detectEmotion(currentKeywords)

  const scored = allEntries
    .map(entry => ({
      entry,
      score: scoreEntry(
        currentKeywords,
        currentEmotion,
        currentMood,
        entry
      )
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)

  return scored.map(({ entry }) => entry)
}



const sentimentCache = new Map<
  string,
  { tone: 'positive' | 'negative' | 'neutral'; confidence: number }
>()

const hashCode = (str: string): number => {
  let hash = 0
  const len = Math.min(str.length, 100)
  for (let i = 0; i < len; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash = hash & hash
  }
  return Math.abs(hash)
}

export async function analyzeSentiment(
  text: string
): Promise<{ tone: 'positive' | 'negative' | 'neutral'; confidence: number }> {

  if (!text || text.trim().length === 0) {
    return { tone: 'neutral', confidence: 0 }
  }


  const memKey = text.slice(0, 80)
  if (sentimentCache.has(memKey)) {
    return sentimentCache.get(memKey)!
  }


  const storageKey = `sentiment_${hashCode(text)}`
  try {
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      const parsed = JSON.parse(stored)
      sentimentCache.set(memKey, parsed)
      return parsed
    }
  } catch (e) {
    console.warn('Sentiment cache read error:', e)
  }

  try {
    const response = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: text }],
        systemPrompt: `You are an emotional tone analyzer.
Return ONLY valid JSON: {"tone": "positive"|"negative"|"neutral", "confidence": 0.85}
Analyze the emotional tone of the text. Support English, Hindi and Marathi.
No explanation. Just JSON.`
      })
    })

    const data = await response.json()
    let result: any

    try {
      result = JSON.parse(data.content.trim())
    } catch {
      result = { tone: 'neutral', confidence: 0.5 }
    }


    sentimentCache.set(memKey, result)
    try {
      localStorage.setItem(storageKey, JSON.stringify(result))
    } catch (e) {
      console.warn('localStorage quota exceeded')
    }

    return result

  } catch (err) {
    console.error('Sentiment analysis failed:', err)
    return { tone: 'neutral', confidence: 0 }
  }
}

export async function checkMoodMismatch(
  text: string,
  moodScore: number
): Promise<'masked' | 'reverse_masked' | 'honest'> {
  const { tone, confidence } = await analyzeSentiment(text)

  if (confidence < 0.6) return 'honest'

  if (tone === 'negative' && moodScore >= 4) return 'masked'
  if (tone === 'positive' && moodScore <= 2) return 'reverse_masked'
  return 'honest'
}


export async function batchCheckMoodMismatch(
  entries: Array<{ content: string; mood_score: number }>
): Promise<Array<'masked' | 'reverse_masked' | 'honest'>> {
  if (entries.length === 0) return [];

  try {
    const response = await fetch(`${API_URL}/api/analyze-mood-honesty`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries })
    });

    if (!response.ok) {
      throw new Error('Batch analysis failed');
    }

    const { analysis } = await response.json();

    return analysis.map((item: any) => {
      const result = item.result?.toLowerCase();
      if (result === 'masked' || result === 'reverse_masked') {
        return result;
      }
      return 'honest';
    });

  } catch (err) {
    console.warn('Batch mood analysis failed, falling back to individual:', err);
    
    
    const results: Array<'masked' | 'reverse_masked' | 'honest'> = [];
    for (const entry of entries) {
      try {
        const res = await checkMoodMismatch(entry.content, entry.mood_score);
        results.push(res);
      } catch {
        results.push('honest');
      }
    }
    return results;
  }
}

const CRISIS_SIGNALS = [
  'kill myself', 'end my life', 'suicide', 'suicidal', 'want to die',
  'take my life', 'no point living', 'better off dead', 'cant go on',
  'self harm', 'hurt myself', 'kill myself', 'मार डालूंगा', 'मर जाना चाहता हूँ',
  'आत्महत्या', 'जीना नहीं चाहता', 'मर जाऊं', 'खुद को नुकसान'

]

export function isCrisisEntry(text: string): boolean {
  const lower = text.toLowerCase()
  return CRISIS_SIGNALS.some(signal => lower.includes(signal))
}