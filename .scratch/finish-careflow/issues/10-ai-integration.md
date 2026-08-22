# 10: AI integration

**What to build:** Replace canned AI responses with real LLM calls via a free-tier provider (Google Gemini or Groq). The `/ai` console becomes a real conversational interface with CRM context. Command Center AI insights generate real analysis of KPI trends and anomalies. Graceful degradation when quota is exhausted.

**Blocked by:** 09

**Status:** ready-for-agent

- [ ] LLM provider abstraction at `lib/server/ai/` with free-tier provider (Gemini or Groq)
- [ ] Provider selection via env var (`AI_PROVIDER=gemini|groq`)
- [ ] `/ai` console sends real prompts with CRM context (recent KPIs, patient counts, trends) as system prompt
- [ ] Streaming responses render in the chat UI
- [ ] Command Center AI insights section calls LLM with dashboard data context
- [ ] Responses cached (short TTL) to minimize API calls within free-tier limits
- [ ] Graceful fallback: if LLM quota exhausted, show last cached response with staleness indicator
- [ ] No imports from `lib/data/` in `/ai` route
