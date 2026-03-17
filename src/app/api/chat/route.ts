/**
 * POST /api/chat
 *
 * Conversational AI advisor endpoint.
 *
 * The chat is stateless from the server's perspective — the full conversation
 * history is sent by the client on every request. This avoids any server-side
 * session management while keeping the architecture simple.
 *
 * Tool use — save_investment_thesis:
 *   When the user states investment preferences, risk tolerance, sector focus,
 *   or strategic rules, Claude calls this tool with a synthesised thesis.
 *   The route saves it to UserSettings and returns { thesisUpdated, newThesis }
 *   alongside the reply so the UI can refresh the thesis card immediately.
 *
 * Language:
 *   The advisor responds in the same language the user writes in.
 *   Portfolio numbers are always shown in both ILS and USD.
 *
 * Rate limiting:
 *   No per-request limit (it's a conversation), but each call is gated by the
 *   Anthropic API key. If the key is missing, returns 503.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatRequest {
  messages: ChatMessage[]
}

// ── Tool definition ───────────────────────────────────────────────────────────

const SAVE_THESIS_TOOL = {
  name: 'save_investment_thesis',
  description:
    'Save or update the user\'s investment thesis and strategy preferences. ' +
    'Call this tool when the user clearly articulates their investment philosophy, ' +
    'risk tolerance, preferred asset classes, sectors they favour or avoid, ' +
    'time horizon, or any specific investment rules they want applied consistently. ' +
    'Do NOT call this for one-off questions or portfolio queries — only when the user ' +
    'is defining a durable investment strategy.',
  input_schema: {
    type: 'object' as const,
    properties: {
      thesis: {
        type: 'string',
        description:
          'A clear, concise paragraph (3-6 sentences) summarising the user\'s full ' +
          'investment strategy as they have described it. Write in the third person ' +
          '("The investor..."). Include: risk tolerance, preferred sectors/assets, ' +
          'assets to avoid, time horizon, and any hard rules stated.',
      },
    },
    required: ['thesis'],
  },
}

// ── System prompt builder ─────────────────────────────────────────────────────

async function buildSystemPrompt(): Promise<string> {
  const lines: string[] = [
    'You are a personal financial advisor with full access to the user\'s live portfolio.',
    'You have deep expertise in Israeli capital markets, global equities, crypto, and personal finance.',
    '',
    'RESPONSE LANGUAGE: Always respond in the same language the user writes in.',
    'If they write in Hebrew, respond in Hebrew. If English, respond in English.',
    'You may mix languages naturally when referencing asset names (BTC, SPY, etc.).',
    '',
    'YOUR CAPABILITIES:',
    '• Analyse specific holdings or sectors in the portfolio',
    '• Explain investment thesis, allocation strategy, risk/return trade-offs',
    '• Compare portfolio performance to benchmarks',
    '• Suggest rebalancing ideas based on the user\'s stated strategy',
    '• Answer questions about markets, assets, or financial concepts',
    '',
    'CRITICAL RULES:',
    '• Never fabricate data — only reference numbers from the portfolio context below',
    '• Never add generic disclaimers or suggest consulting another advisor',
    '• Be direct, specific, and data-driven in every response',
    '• When the user\'s strategy conflicts with the data, flag it explicitly',
    '',
    'THESIS TOOL: You have access to a save_investment_thesis tool.',
    'Use it ONLY when the user explicitly states strategic preferences, risk tolerance,',
    'sector biases, or investment rules they want remembered for future analysis.',
    'After saving, confirm clearly: "I\'ve saved your investment strategy."',
    'Do not use it for ordinary questions or portfolio queries.',
  ]

  // Inject live portfolio context
  try {
    const { prisma } = await import('@/lib/prisma')
    const { getIlsToUsd } = await import('@/lib/fx-rate')
    const { getInvestmentThesis } = await import('@/lib/user-settings')

    const [accounts, ILS_USD, currentThesis] = await Promise.all([
      prisma.account.findMany({
        where: { isActive: true },
        include: { holdings: { where: { quantity: { gt: 0 } } } },
      }),
      getIlsToUsd(),
      getInvestmentThesis(),
    ])

    const ILS_PER_USD = ILS_USD > 0 ? 1 / ILS_USD : 3.7

    let totalUsd = 0
    const buckets: Record<string, number> = { cash: 0, crypto: 0, capitalMarket: 0, pension: 0 }
    const holdingLines: string[] = []

    for (const acc of accounts) {
      for (const h of acc.holdings) {
        const usdVal = h.currency === 'ILS' ? h.currentValue * ILS_USD : h.currentValue
        totalUsd += usdVal
        if (acc.type === 'BANK') buckets.cash += usdVal
        else if (acc.type === 'CRYPTO') buckets.crypto += usdVal
        else if (acc.type === 'BROKERAGE') {
          buckets[h.assetClass === 'CASH' ? 'cash' : 'capitalMarket'] += usdVal
        } else if (acc.type === 'PENSION') buckets.pension += usdVal

        holdingLines.push(
          `  ${h.symbol} (${acc.type}) — $${Math.round(usdVal).toLocaleString()} ` +
          `(₪${Math.round(usdVal * ILS_PER_USD).toLocaleString()}) | day ${h.dailyChangePercent.toFixed(1)}%`
        )
      }
    }

    function pct(v: number) { return totalUsd > 0 ? ` (${((v / totalUsd) * 100).toFixed(1)}%)` : '' }

    lines.push(
      '',
      '=== LIVE PORTFOLIO SNAPSHOT ===',
      `Total net worth: $${Math.round(totalUsd).toLocaleString()} | ₪${Math.round(totalUsd * ILS_PER_USD).toLocaleString()} | Rate: 1 USD = ₪${ILS_PER_USD.toFixed(2)}`,
      '',
      'Allocation:',
      `  Cash/Bank:      $${Math.round(buckets.cash).toLocaleString()}${pct(buckets.cash)}`,
      `  Capital Markets: $${Math.round(buckets.capitalMarket).toLocaleString()}${pct(buckets.capitalMarket)}`,
      `  Pension (SPY):  $${Math.round(buckets.pension).toLocaleString()}${pct(buckets.pension)}`,
      `  Crypto:         $${Math.round(buckets.crypto).toLocaleString()}${pct(buckets.crypto)}`,
    )

    if (holdingLines.length > 0) {
      lines.push('', 'Top holdings:', ...holdingLines.slice(0, 15))
    }

    if (currentThesis) {
      lines.push(
        '',
        '=== USER\'S INVESTMENT THESIS (MUST ALIGN ALL ADVICE) ===',
        currentThesis,
      )
    }
  } catch {
    lines.push('', '(Portfolio data temporarily unavailable — answer based on conversation context only.)')
  }

  return lines.join('\n')
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI advisor requires ANTHROPIC_API_KEY to be set.' },
      { status: 503 }
    )
  }

  let body: ChatRequest
  try {
    body = await request.json() as ChatRequest
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { messages } = body
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages array is required' }, { status: 400 })
  }

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const { saveInvestmentThesis } = await import('@/lib/user-settings')
    const client = new Anthropic({ apiKey })

    const systemPrompt = await buildSystemPrompt()

    // Convert our simple messages to Anthropic SDK format
    const claudeMessages = messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    // ── First call ────────────────────────────────────────────────────────────
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: claudeMessages,
      tools: [SAVE_THESIS_TOOL],
    })

    // ── Handle tool use — save thesis then continue ───────────────────────────
    if (response.stop_reason === 'tool_use') {
      const toolUseBlock = response.content.find((b) => b.type === 'tool_use')
      if (toolUseBlock && toolUseBlock.type === 'tool_use') {
        const input = toolUseBlock.input as { thesis: string }
        const newThesis = String(input.thesis ?? '').trim()

        if (newThesis) {
          await saveInvestmentThesis(newThesis)
        }

        // Continue conversation with the tool result
        const continueResponse = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 512,
          system: systemPrompt,
          messages: [
            ...claudeMessages,
            { role: 'assistant' as const, content: response.content },
            {
              role: 'user' as const,
              content: [
                {
                  type: 'tool_result' as const,
                  tool_use_id: toolUseBlock.id,
                  content: 'Investment thesis saved successfully.',
                },
              ],
            },
          ],
          tools: [SAVE_THESIS_TOOL],
        })

        const reply =
          continueResponse.content[0]?.type === 'text'
            ? continueResponse.content[0].text
            : 'Investment thesis saved.'

        return NextResponse.json({
          reply,
          thesisUpdated: true,
          newThesis,
        })
      }
    }

    // ── Normal text response ──────────────────────────────────────────────────
    const reply =
      response.content[0]?.type === 'text'
        ? response.content[0].text
        : 'Sorry, I could not generate a response.'

    return NextResponse.json({ reply })
  } catch (error) {
    console.error('[POST /api/chat]', error)
    return NextResponse.json(
      { error: 'Failed to generate response. Please try again.' },
      { status: 500 }
    )
  }
}
