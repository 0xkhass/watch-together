/**
 * AI helpers — powered by OpenRouter (API key from VITE_OPENROUTER_API_KEY).
 */

// ─── OpenRouter ────────────────────────────────────────────────────────────────

function getOpenRouterKey(): string {
  const key =
    import.meta.env.VITE_OPENROUTER_API_KEY ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('wt_openrouter_key') : null);
  if (!key) throw new Error('No OpenRouter API key configured. Set VITE_OPENROUTER_API_KEY in .env');
  return key;
}

async function askAi(prompt: string, maxChars = 800): Promise<string> {
  const key = getOpenRouterKey();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Watch Together',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [{ role: 'user', content: prompt.slice(0, 8000) }],
        max_tokens: 512,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[AI] OpenRouter error:', res.status, body);
      throw new Error(`OpenRouter API error (${res.status})`);
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new Error('Empty AI response');
    return text.trim().slice(0, maxChars);
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function summarizeChat(messages: { username: string; content: string }[]): Promise<string> {
  const transcript = messages
    .slice(-40)
    .map((m) => `${m.username}: ${m.content}`)
    .join('\n');
  if (!transcript) return 'No messages to summarize yet.';
  return askAi(
    `Summarize this watch-party chat in 2-3 short bullet points. Be friendly and concise.\n\n${transcript}`,
    500,
  );
}

export async function suggestWatchPartyIdeas(topic?: string): Promise<string> {
  const q = topic?.trim()
    ? `Suggest 5 fun videos to watch together about: ${topic}. List title + platform (YouTube/Vimeo) + why.`
    : 'Suggest 5 fun free videos for a friends watch party (mix of comedy, music, nature). List title + YouTube search phrase.';
  return askAi(q, 700);
}

export async function aiChatReply(
  userMessage: string,
  roomContext: { roomName?: string; videoName?: string; memberCount: number },
): Promise<string> {
  const ctx = [
    roomContext.roomName && `Room: ${roomContext.roomName}`,
    roomContext.videoName && `Watching: ${roomContext.videoName}`,
    `Members: ${roomContext.memberCount}`,
  ]
    .filter(Boolean)
    .join('. ');

  return askAi(
    `You are a helpful watch-party assistant. ${ctx}\nUser: ${userMessage}\nReply in 1-3 short sentences.`,
    400,
  );
}
