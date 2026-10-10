import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  Bell, CalendarDays, Check, ChevronDown, CircleHelp, Clock3, Cloud, LayoutDashboard,
  ListTodo, LoaderCircle, LogIn, LogOut, MessageSquare, MoreHorizontal, Plus,
  Search, Settings, Sparkles, Users, X,
} from 'lucide-react'
import { supabase } from './supabase'

type Status = 'backlog' | 'progress' | 'review' | 'done'
type Priority = 'Low' | 'Medium' | 'High'
type Task = { id: number; title: string; description: string; status: Status; priority: Priority; due: string; assignee: string; tag: string }
type TaskInsert = Omit<Task, 'id'>

const columns: { id: Status; label: string; tone: string }[] = [
  { id: 'backlog', label: 'Backlog', tone: 'slate' },
  { id: 'progress', label: 'In progress', tone: 'blue' },
  { id: 'review', label: 'In review', tone: 'amber' },
  { id: 'done', label: 'Done', tone: 'green' },
]

const seed: Task[] = [
  { id: 1, title: 'Map the customer journey', description: 'Document the core paths from first visit to a completed plan.', status: 'backlog', priority: 'High', due: 'Oct 14', assignee: 'AM', tag: 'Research' },
  { id: 2, title: 'Draft onboarding checklist', description: 'Define the first-run experience for a new workspace.', status: 'backlog', priority: 'Medium', due: 'Oct 16', assignee: 'SK', tag: 'Content' },
  { id: 3, title: 'Build project overview', description: 'Create the project health and milestone summary.', status: 'progress', priority: 'High', due: 'Today', assignee: 'JD', tag: 'Product' },
  { id: 4, title: 'Design task details', description: 'Polish task properties, comments, and activity.', status: 'progress', priority: 'Medium', due: 'Oct 13', assignee: 'AM', tag: 'Design' },
  { id: 5, title: 'Review navigation model', description: 'Validate the workspace and project hierarchy.', status: 'review', priority: 'Low', due: 'Tomorrow', assignee: 'SK', tag: 'UX' },
  { id: 6, title: 'Set up project repository', description: 'Configure the initial frontend and deployment workflow.', status: 'done', priority: 'High', due: 'Oct 10', assignee: 'JD', tag: 'Engineering' },
]

const initials = ['JD', 'AM', 'SK']

function App() {
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem('northstar-tasks')
    return saved ? JSON.parse(saved) : seed
  })
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'All' | Priority>('All')
  const [showNew, setShowNew] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [dragged, setDragged] = useState<number | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [syncing, setSyncing] = useState(true)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!user) localStorage.setItem('northstar-tasks', JSON.stringify(tasks))
  }, [tasks, user])

  const loadCloudTasks = useCallback(async (activeUser: User) => {
    setSyncing(true)
    const { data, error } = await supabase.from('tasks').select('*').order('sort_order').order('created_at')
    if (error) {
      setNotice(error.message)
      setSyncing(false)
      return
    }
    if (data.length === 0) {
      const starterRows = seed.map(({ id: _id, ...task }, index) => ({ ...task, user_id: activeUser.id, sort_order: index }))
      const { data: created, error: seedError } = await supabase.from('tasks').insert(starterRows).select()
      if (seedError) setNotice(seedError.message)
      else setTasks((created || []) as Task[])
    } else setTasks(data as Task[])
    setSyncing(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const currentUser = data.session?.user ?? null
      setUser(currentUser)
      if (currentUser) loadCloudTasks(currentUser)
      else setSyncing(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      if (currentUser) loadCloudTasks(currentUser)
      else {
        const saved = localStorage.getItem('northstar-tasks')
        setTasks(saved ? JSON.parse(saved) : seed)
        setSyncing(false)
      }
    })
    return () => listener.subscription.unsubscribe()
  }, [loadCloudTasks])

  useEffect(() => {
    if (!user) return
    const channel = supabase.channel(`tasks:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${user.id}` }, () => loadCloudTasks(user))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, loadCloudTasks])

  const visibleTasks = useMemo(() => tasks.filter(task => {
    const textMatch = `${task.title} ${task.description} ${task.tag}`.toLowerCase().includes(query.toLowerCase())
    return textMatch && (filter === 'All' || task.priority === filter)
  }), [tasks, query, filter])

  const completed = tasks.filter(t => t.status === 'done').length
  const progress = Math.round((completed / Math.max(tasks.length, 1)) * 100)

  async function moveTask(id: number, status: Status) {
    setTasks(current => current.map(task => task.id === id ? { ...task, status } : task))
    if (user) {
      const { error } = await supabase.from('tasks').update({ status }).eq('id', id)
      if (error) { setNotice(error.message); loadCloudTasks(user) }
    }
  }

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const task: TaskInsert = {
      title: String(form.get('title')),
      description: String(form.get('description') || 'No description yet.'),
      status: 'backlog',
      priority: form.get('priority') as Priority,
      due: String(form.get('due') || 'No date'),
      assignee: String(form.get('assignee')),
      tag: String(form.get('tag') || 'General'),
    }
    if (user) {
      const { data, error } = await supabase.from('tasks').insert({ ...task, user_id: user.id, sort_order: tasks.length }).select().single()
      if (error) setNotice(error.message)
      else setTasks(current => [...current, data as Task])
    } else setTasks(current => [...current, { id: Date.now(), ...task }])
    setShowNew(false)
  }

  async function removeTask(id: number) {
    setTasks(current => current.filter(task => task.id !== id))
    if (user) {
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) { setNotice(error.message); loadCloudTasks(user) }
    }
  }

  async function updateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedTask) return
    const form = new FormData(event.currentTarget)
    const changes: TaskInsert = {
      title: String(form.get('title')),
      description: String(form.get('description') || 'No description yet.'),
      status: form.get('status') as Status,
      priority: form.get('priority') as Priority,
      due: String(form.get('due') || 'No date'),
      assignee: String(form.get('assignee')),
      tag: String(form.get('tag') || 'General'),
    }
    setTasks(current => current.map(task => task.id === selectedTask.id ? { ...task, ...changes } : task))
    if (user) {
      const { error } = await supabase.from('tasks').update(changes).eq('id', selectedTask.id)
      if (error) { setNotice(error.message); loadCloudTasks(user) }
      else setNotice('Task updated.')
    }
    setSelectedTask(null)
  }

  async function duplicateTask(task: Task) {
    const copy: TaskInsert = { ...task, title: `${task.title} (copy)`, status: 'backlog' }
    const { id: _id, ...insert } = copy as Task
    if (user) {
      const { data, error } = await supabase.from('tasks').insert({ ...insert, user_id: user.id, sort_order: tasks.length }).select().single()
      if (error) setNotice(error.message)
      else setTasks(current => [...current, data as Task])
    } else setTasks(current => [...current, { ...insert, id: Date.now() }])
    setSelectedTask(null)
    setNotice('Task duplicated in Backlog.')
  }

  async function signOut() {
    await supabase.auth.signOut()
    setNotice('Signed out. Local mode is active.')
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Sparkles size={16} /></div><span>Northstar</span></div>
      <button className="workspace-switcher"><span className="workspace-avatar">A</span><span><b>Acme Studio</b><small>Team workspace</small></span><ChevronDown size={15} /></button>
      <nav className="nav-group" aria-label="Main navigation">
        <a className="nav-item active" href="#"><LayoutDashboard size={17} />Overview</a>
        <a className="nav-item" href="#board"><ListTodo size={17} />My work <span className="nav-count">4</span></a>
        <a className="nav-item" href="#"><Bell size={17} />Inbox <span className="dot" /></a>
        <a className="nav-item" href="#"><MessageSquare size={17} />Messages</a>
      </nav>
      <div className="nav-heading"><span>Projects</span><Plus size={15} /></div>
      <nav className="nav-group projects">
        <a className="nav-item selected" href="#board"><span className="project-dot coral" />Website launch</a>
        <a className="nav-item" href="#"><span className="project-dot violet" />Mobile app</a>
        <a className="nav-item" href="#"><span className="project-dot mint" />Brand refresh</a>
      </nav>
      <div className="sidebar-bottom">
        <a className="nav-item" href="#"><CircleHelp size={17} />Help & resources</a>
        <a className="nav-item" href="#"><Settings size={17} />Settings</a>
        <div className="profile"><span className="avatar dark">JD</span><span><b>Jordan Davis</b><small>jordan@acme.co</small></span><MoreHorizontal size={17} /></div>
      </div>
    </aside>

    <main>
      <header className="topbar">
        <div className="search"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search tasks, projects, or people…" /><kbd>⌘ K</kbd></div>
        <div className="top-actions"><span className={`sync-state ${user ? 'cloud' : ''}`}>{syncing ? <LoaderCircle size={14} className="spin" /> : <Cloud size={14} />}{syncing ? 'Syncing' : user ? 'Cloud synced' : 'Local mode'}</span><button className="icon-button"><Bell size={18} /><span className="notification" /></button><div className="avatar-stack">{initials.map(i => <span className="avatar" key={i}>{i}</span>)}</div>{user ? <button className="share-button" onClick={signOut}><LogOut size={16} />Sign out</button> : <button className="share-button" onClick={() => setShowAuth(true)}><LogIn size={16} />Sign in</button>}</div>
      </header>

      <div className="content">
        {!user && <div className="cloud-banner"><div><Cloud size={17} /><span><b>Your work is saved on this device.</b> Sign in to sync tasks securely across devices.</span></div><button onClick={() => setShowAuth(true)}>Enable cloud sync</button></div>}
        {notice && <div className="notice"><span>{notice}</span><button onClick={() => setNotice('')}><X size={15} /></button></div>}
        <div className="eyebrow"><span className="project-dot coral" />WEBSITE LAUNCH</div>
        <div className="title-row"><div><h1>Good afternoon, Jordan</h1><p>Here’s what’s moving across your project today.</p></div><button className="primary" onClick={() => setShowNew(true)}><Plus size={17} />New task</button></div>

        <section className="summary-grid">
          <article className="summary-card"><div className="summary-label"><span>Project progress</span><span className="trend">On track</span></div><strong>{progress}%</strong><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><small>{completed} of {tasks.length} tasks completed</small></article>
          <article className="summary-card"><div className="summary-label"><span>Open tasks</span><ListTodo size={18} /></div><strong>{tasks.length - completed}</strong><small><b>{tasks.filter(t => t.priority === 'High' && t.status !== 'done').length} high priority</b> need attention</small></article>
          <article className="summary-card"><div className="summary-label"><span>Team</span><Users size={18} /></div><div className="large-avatars">{initials.map(i => <span className="avatar" key={i}>{i}</span>)}<span className="avatar more">+2</span></div><small>5 people contributing this week</small></article>
          <article className="summary-card"><div className="summary-label"><span>Next milestone</span><CalendarDays size={18} /></div><strong className="milestone">Design sign-off</strong><small><Clock3 size={13} /> Friday, 16 October</small></article>
        </section>

        <section className="board-section" id="board">
          <div className="board-toolbar"><div><h2>Project board</h2><p>Drag tasks between columns as work progresses.</p></div><div className="filters"><button className={filter === 'All' ? 'active' : ''} onClick={() => setFilter('All')}>All tasks</button>{(['High','Medium','Low'] as Priority[]).map(p => <button key={p} className={filter === p ? 'active' : ''} onClick={() => setFilter(p)}>{p}</button>)}</div></div>
          <div className="board">
            {columns.map(column => {
              const items = visibleTasks.filter(t => t.status === column.id)
              return <div className="column" key={column.id} onDragOver={e => e.preventDefault()} onDrop={() => { if (dragged) moveTask(dragged, column.id); setDragged(null) }}>
                <div className="column-head"><div><span className={`status-dot ${column.tone}`} />{column.label}<span className="column-count">{items.length}</span></div><button onClick={() => setShowNew(true)} aria-label={`Add task to ${column.label}`}><Plus size={16} /></button></div>
                <div className="cards">
                  {items.map(task => <article className="task-card" draggable key={task.id} onDragStart={() => setDragged(task.id)} onClick={() => setSelectedTask(task)}>
                    <div className="task-top"><span className="tag">{task.tag}</span><button aria-label="Task options"><MoreHorizontal size={17} /></button></div>
                    <h3>{task.title}</h3><p>{task.description}</p>
                    <div className="task-meta"><span className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</span><span className={task.due === 'Today' ? 'due urgent' : 'due'}><CalendarDays size={13} />{task.due}</span></div>
                    <div className="task-footer"><span className="avatar">{task.assignee}</span>{task.status === 'done' && <span className="complete"><Check size={13} /> Complete</span>}<button onClick={e => { e.stopPropagation(); removeTask(task.id) }}>Remove</button></div>
                  </article>)}
                  <button className="add-card" onClick={() => setShowNew(true)}><Plus size={16} />Add task</button>
                </div>
              </div>
            })}
          </div>
        </section>
      </div>
    </main>

    {showNew && <div className="modal-backdrop" onMouseDown={() => setShowNew(false)}><div className="modal" onMouseDown={e => e.stopPropagation()}>
      <div className="modal-head"><div><span>NEW TASK</span><h2>What needs to be done?</h2></div><button onClick={() => setShowNew(false)}><X size={20} /></button></div>
      <form onSubmit={addTask}>
        <label>Task name<input name="title" required autoFocus placeholder="e.g. Prepare launch announcement" /></label>
        <label>Description<textarea name="description" rows={3} placeholder="Add context or a clear outcome…" /></label>
        <div className="form-grid"><label>Priority<select name="priority" defaultValue="Medium"><option>Low</option><option>Medium</option><option>High</option></select></label><label>Assignee<select name="assignee"><option>JD</option><option>AM</option><option>SK</option></select></label></div>
        <div className="form-grid"><label>Due date<input name="due" placeholder="e.g. Friday" /></label><label>Category<input name="tag" placeholder="e.g. Design" /></label></div>
        <div className="modal-actions"><button type="button" className="cancel" onClick={() => setShowNew(false)}>Cancel</button><button type="submit" className="primary"><Plus size={17} />Create task</button></div>
      </form>
    </div></div>}
    {selectedTask && <div className="modal-backdrop" onMouseDown={() => setSelectedTask(null)}><div className="modal task-detail-modal" onMouseDown={e => e.stopPropagation()}>
      <div className="modal-head"><div><span>TASK DETAILS</span><h2>Edit task</h2></div><button onClick={() => setSelectedTask(null)}><X size={20} /></button></div>
      <form onSubmit={updateTask}>
        <label>Task name<input name="title" required autoFocus defaultValue={selectedTask.title} /></label>
        <label>Description<textarea name="description" rows={4} defaultValue={selectedTask.description} /></label>
        <div className="form-grid"><label>Status<select name="status" defaultValue={selectedTask.status}>{columns.map(column => <option key={column.id} value={column.id}>{column.label}</option>)}</select></label><label>Priority<select name="priority" defaultValue={selectedTask.priority}><option>Low</option><option>Medium</option><option>High</option></select></label></div>
        <div className="form-grid"><label>Assignee<select name="assignee" defaultValue={selectedTask.assignee}><option>JD</option><option>AM</option><option>SK</option></select></label><label>Due date<input name="due" defaultValue={selectedTask.due} /></label></div>
        <label>Category<input name="tag" defaultValue={selectedTask.tag} /></label>
        <div className="modal-actions split-actions"><button type="button" className="text-button" onClick={() => duplicateTask(selectedTask)}>Duplicate</button><span /><button type="button" className="cancel" onClick={() => setSelectedTask(null)}>Cancel</button><button type="submit" className="primary"><Check size={17} />Save changes</button></div>
      </form>
    </div></div>}
    {showAuth && <AuthModal onClose={() => setShowAuth(false)} onNotice={setNotice} />}
  </div>
}

function AuthModal({ onClose, onNotice }: { onClose: () => void; onNotice: (message: string) => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email'))
    const password = String(form.get('password'))
    const result = mode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.href.split('#')[0] } })
    setBusy(false)
    if (result.error) setError(result.error.message)
    else {
      onNotice(mode === 'signup' && !result.data.session ? 'Check your email to confirm your account.' : 'Cloud sync is now active.')
      onClose()
    }
  }

  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal auth-modal" onMouseDown={e => e.stopPropagation()}>
    <div className="modal-head"><div><span>SECURE CLOUD SYNC</span><h2>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h2></div><button onClick={onClose}><X size={20} /></button></div>
    <p className="auth-copy">Your tasks are protected by Supabase authentication and row-level security.</p>
    <form onSubmit={submit}>
      <label>Email address<input name="email" type="email" required autoComplete="email" placeholder="you@example.com" /></label>
      <label>Password<input name="password" type="password" minLength={6} required autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} placeholder="At least 6 characters" /></label>
      {error && <div className="form-error">{error}</div>}
      <button type="submit" className="primary auth-submit" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin" /> : <Cloud size={17} />}{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in and sync' : 'Create account'}</button>
    </form>
    <button className="auth-switch" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError('') }}>{mode === 'signin' ? 'New to Northstar? Create an account' : 'Already have an account? Sign in'}</button>
  </div></div>
}

export default App
