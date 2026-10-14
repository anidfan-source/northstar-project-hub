import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = request.headers.get('Authorization') || ''
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await anon.auth.getUser()
    if (!user) return json({ error: 'Sign in required.' }, 401)
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: profile } = await admin.from('profiles').select('is_admin').eq('user_id', user.id).single()
    if (!profile?.is_admin) return json({ error: 'Administrator access required.' }, 403)

    const body = await request.json().catch(() => ({}))
    if (body.action === 'list') {
      const [{ data: teams, error: teamsError }, { data: profiles, error: profilesError }] = await Promise.all([
        admin.from('teams').select('id,name,created_at').order('name'),
        admin.from('profiles').select('user_id,username,team_id,must_change_password,is_admin,created_at').order('username'),
      ])
      if (teamsError || profilesError) throw teamsError || profilesError
      return json({ teams, profiles })
    }
    if (body.action === 'create_team') {
      const name = String(body.name || '').trim()
      if (name.length < 2 || name.length > 80) return json({ error: 'Team name must be 2–80 characters.' }, 400)
      const { data: existingTeam, error: lookupError } = await admin
        .from('teams')
        .select('id,name,created_at')
        .ilike('name', name)
        .maybeSingle()
      if (lookupError) throw lookupError
      if (existingTeam) return json({ error: `A team named "${existingTeam.name}" already exists.` }, 409)
      const { data, error } = await admin.from('teams').insert({ name }).select('id,name,created_at').single()
      if (error) throw error
      return json({ team: data })
    }
    if (body.action === 'create_user') {
      const username = String(body.username || '').trim()
      const password = String(body.password || '')
      const teamId = String(body.team_id || '')
      if (!/^[a-z0-9._-]{3,32}$/i.test(username)) return json({ error: 'Username must be 3–32 letters, numbers, dots, dashes or underscores.' }, 400)
      if (password.length < 8) return json({ error: 'Temporary password must be at least 8 characters.' }, 400)
      const { data: team } = await admin.from('teams').select('id').eq('id', teamId).single()
      if (!team) return json({ error: 'Choose a valid team.' }, 400)
      const email = `${username.toLowerCase()}@northstar.local`
      const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username } })
      if (createError || !created.user) throw createError || new Error('Unable to create user.')
      const { data: newProfile, error: profileError } = await admin.from('profiles').insert({ user_id: created.user.id, username, team_id: teamId, must_change_password: true, is_admin: false }).select('user_id,username,team_id,must_change_password,is_admin,created_at').single()
      if (profileError) { await admin.auth.admin.deleteUser(created.user.id); throw profileError }
      return json({ profile: newProfile })
    }
    return json({ error: 'Unknown admin action.' }, 400)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Admin request failed.' }, 400)
  }
})
