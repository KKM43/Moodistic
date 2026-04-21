import { extractPatterns } from './patterns'
import type { JournalEntry, ChatMessage } from '../types'
import { LANGUAGE_INSTRUCTIONS } from './languages'
import type { AppLanguage } from '../types'
import { detectUserStyle } from './personality'
import type { UserMemory } from './memory'
import { analyzeSentiment } from './retrieval'

import { API_URL } from "./api";

const userMessageCounts = new Map<string, { count: number, date: string }>()


export function checkRateLimit(userId: string): boolean {
  const today = new Date().toDateString()
  const current = userMessageCounts.get(userId)

  if (!current || current.date !== today) {
    userMessageCounts.set(userId, { count: 1, date: today })
    return true
  }

  if (current.count >= 20) return false

  current.count++
  return true
}



function formatPastEntries(entries: JournalEntry[]): string {
  if (entries.length === 0) return ''

  const formatted = entries.map((entry) => {
    const date = new Date(entry.created_at).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short'
    })

    return `- ${date}: you felt ${entry.mood_score}/5 and shared something like: "${entry.content.slice(0, 80)}"`
  }).join('\n')

  return `
PAST MOMENTS (for internal use):
${formatted}

Use only if it feels natural:
- Gently connect emotionally, not factually
- Never list or repeat directly
---`
}



export async function getChatResponse(
  messages: ChatMessage[],
  pastEntries: JournalEntry[] = [],
  language: AppLanguage = 'en',
  userMemory?: UserMemory

): Promise<string> {
  const contextBlock = formatPastEntries(pastEntries)
  const patterns = extractPatterns(pastEntries) || undefined


  const recentMessages = messages.slice(-6)

  const userStyle = detectUserStyle(messages)

  const groqMessages = recentMessages.map((m) => ({
    role: m.role,
    content: m.content.slice(0, 200)
  }))

  const lastUserMessage =
  [...messages].reverse().find(m => m.role === 'user')?.content || ''

  const sentiment = await analyzeSentiment(lastUserMessage)

  const strategy = decideStrategy(lastUserMessage, sentiment)

  // return callBackend(groqMessages, contextBlock, language, userStyle, userMemory)
  return callBackend(
    groqMessages,
    contextBlock,
    language,
    userStyle,
    userMemory,
    strategy,
    patterns,
  )
}



const REACTION_STYLES = ['soft', 'empathetic', 'casual', 'quiet']

const styleInstructionMap = {
  short: `
User writes briefly.
- Keep replies short (1-2 lines)
- Be casual and direct
- Don’t ask deep questions every time
`,
  medium: `
User writes normally.
- Keep balanced responses
`,
  deep: `
User writes in detail.
- Respond with more depth and reflection
- It's okay to be slightly longer (3-4 lines)
- Ask thoughtful questions
`
}

type ResponseStrategy =
  | 'grounding'
  | 'reframing'
  | 'reflective'
  | 'clarifying'
  | 'supportive'

function decideStrategy(
  text: string,
  sentiment: { tone: string; confidence: number }
): ResponseStrategy {
  const lower = text.toLowerCase()

  if (
    sentiment.tone === 'negative' &&
  text.length < 25 &&
    (lower.includes('cant') ||
      lower.includes("can't") ||
      lower.includes('nothing') ||
      lower.includes('void') ||
      lower.includes('lost'))
  ) {
    return 'grounding'
  }

  if (
    sentiment.tone === 'negative' &&
    (lower.includes('fail') ||
      lower.includes('not capable') ||
      lower.includes('not good enough') ||
      lower.includes('useless') ||
      lower.includes('cant do') ||
      lower.includes("can't do") ||
      lower.includes('never succeed') ||
      lower.includes('always fail')
    )
  ) {
    return 'reframing'
  }

  if (sentiment.tone === 'negative') {
    return 'supportive'
  }

  if (text.length < 40) {
    return 'clarifying'
  }

  return 'reflective'
}

function getStrategyInstruction(strategy: ResponseStrategy): string {
  switch (strategy) {
    case 'grounding':
      return `
The user feels overwhelmed or stuck.
- Slow things down
- Normalize the feeling
- Give ONE very small, optional action (like breathing or stepping away)
- Do NOT overwhelm with questions
`

    case 'reframing':
      return `
The user is thinking in extreme or negative beliefs.
- Gently challenge their thinking
- Offer a more balanced perspective
- Do NOT invalidate their feeling
`

    case 'clarifying':
      return `
The user is vague or short.
- Ask a simple, specific follow-up
- Keep it light
`

    case 'supportive':
      return `
The user is emotionally low.
- Be warm and validating
- Stay with their feeling
- Avoid solutions unless necessary
`

    case 'reflective':
    default:
      return `
- Reflect their thoughts with slight depth
- Ask a thoughtful question if natural
`
  }
}

function buildSystemPrompt(
  contextBlock: string,
  language: AppLanguage = 'en',
  userStyle: 'short' | 'medium' | 'deep' = 'medium',
  userMemory?: UserMemory,
  strategy: ResponseStrategy = 'reflective',
  patterns?: {
    dominantEmotion: string | null
    frequency: number
    recentTrend: string
  }
): string {
  const languageInstruction = LANGUAGE_INSTRUCTIONS[language]
  const strategyInstruction = getStrategyInstruction(strategy)
  const randomStyle =
    REACTION_STYLES[Math.floor(Math.random() * REACTION_STYLES.length)]

  const memoryBlock = userMemory
    ? `
USER MEMORY:
- Communication style: ${userMemory.tone}
- Common themes: ${userMemory.commonThemes.join(", ") || "none yet"}
- Emotional pattern: ${userMemory.emotionalPattern || "still learning"}

Use this subtly:
- Don't repeat it directly
- Let it influence tone and understanding
`
    : ""

const patternBlock =
  patterns && patterns.frequency >= 2 && patterns.dominantEmotion
    ? `
PATTERN INSIGHT:
- The user has been frequently feeling: ${patterns.dominantEmotion}
- This has appeared ${patterns.frequency} times recently
- Overall trend: ${patterns.recentTrend}

Use this carefully:
- Only mention if it feels natural
- Never sound analytical
- Say it like a soft observation
`
    : ''

  return `
IDENTITY:
You are Moodistic — a journaling companion inside the app the user is currently using.

You are not an external person.
You are not a therapist or coach.
You are the app itself, present with the user in their private space.

If the user refers to "this app":
- Respond naturally like: "yeah, that's me 🙂"
- Never act confused about what the app is

Your role:
- Be calm, emotionally present
- Help users process thoughts, not fix everything
- Feel like a quiet, understanding presence

${languageInstruction ? languageInstruction + '\n' : ''}
${memoryBlock}
${patternBlock}

RESPONSE MODE:
${strategyInstruction}

STYLE:
Tone: ${randomStyle}
${styleInstructionMap[userStyle]}

- Talk like real texting. Natural and slightly imperfect
- Usually 2–4 sentences (vary it)
- Sometimes ask a question, sometimes don’t
- Keep tone natural and human
- Avoid overusing filler words like "hmm" or "..."

BEHAVIOR:
- React emotionally first
- Validate without sounding clinical
- Stay with their feeling, but don’t get stuck there
- If the user feels stuck, gently help them move forward
- Advice should be small, optional, and human

RESPONSE STRUCTURE:
- Start with a short emotional reflection
- Then validate the feeling naturally
- If needed, gently guide (based on response mode)
- Keep it flowing like a real message, not bullet points

FIRST MESSAGE RULE:
If this is the first user message:
- Be a bit warmer than usual
- Acknowledge that they opened up
- Don’t ask too many questions immediately

QUESTIONS:
- Ask something specific to what they said
- Avoid generic questions

AVOID:
- "I understand", "It sounds like", "You should"
- Over-explaining or analyzing
- Robotic phrasing

MEMORY:
- If relevant, gently connect current feelings with past moments
- Never force it
- Do it like a human would:
  "this feels similar to something you mentioned before..."
- Do NOT repeat exact past entries
- Focus on emotional continuity, not details

FLOW:
- Sometimes just respond without asking a question
- Vary how you start replies
- Sometimes sit with the feeling instead of moving forward

${contextBlock}
`
}



async function callBackend(
  messages: { role: string; content: string }[],
  contextBlock: string = '',
  language: AppLanguage = 'en',
  userStyle: 'short' | 'medium' | 'deep' = 'medium',
  userMemory?: UserMemory,
  strategy: ResponseStrategy = 'reflective',
  patterns?: {
  dominantEmotion: string | null
  frequency: number
  recentTrend: string
},
  retries: number = 2
): Promise<string> {
  const response = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      systemPrompt: buildSystemPrompt(contextBlock, language, userStyle, userMemory, strategy, patterns)
    })
  })

  if (response.status === 429 && retries > 0) {
    await new Promise(resolve => setTimeout(resolve, 3000))
    return callBackend(messages, contextBlock, language, userStyle, userMemory, strategy,  patterns, retries - 1)
  }

  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Server error')

  return data.content
}



export async function getSessionSummary(
  messages: ChatMessage[]
): Promise<string> {
  const conversation = messages
    .map(m => `${m.role === 'user' ? 'User' : 'Moodistic'}: ${m.content}`)
    .join('\n')

  const response = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: conversation }],
      systemPrompt: `Summarize this journaling conversation in 2 sentences.
Capture what the person was feeling and any shift or insight that emerged.
Write it in second person ("You were feeling...").
No markdown. Just plain text.`
    })
  })

  const data = await response.json()

  if (!response.ok) return ''
  return data.content
}