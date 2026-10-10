import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = request.headers.get('Authorization') || ''
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new Response(JSON.stringify({ error: 'Sign in to use the AI project builder.' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const { prompt, horizon = '8 weeks' } = await request.json()
    if (!prompt || String(prompt).trim().length < 15) throw new Error('Describe the project in at least 15 characters.')
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) throw new Error('Gemini is not configured yet.')

    const systemPrompt = `You are an expert project manager. Create a practical project plan from the user's description. The requested horizon is ${horizon}. Return JSON only with this shape:
{"name":"short project name","description":"one sentence outcome","color":"coral|violet|mint","notes":"useful Markdown brief with Goals, Scope, Success criteria, Risks, and assumptions","phases":[{"name":"phase","startOffset":0,"durationDays":7}],"tasks":[{"title":"action-oriented task","description":"clear outcome","phaseIndex":0,"priority":"Low|Medium|High","assignee":"JD|AM|SK","tag":"short category"}]}
Create 4-6 phases and 8-14 useful tasks. startOffset and durationDays are integers relative to today. Keep all work inside the requested horizon. Do not include markdown fences around JSON.`

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nUser request: ${String(prompt).trim()}` }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.35 } }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result?.error?.message || 'Gemini could not generate the project.')
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error('Gemini returned an empty response.')
    return new Response(text, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unable to generate project.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
