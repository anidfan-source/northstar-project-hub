import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Bell, CalendarDays, Check, ChevronDown, CircleHelp, Clock3, Cloud, Flag, LayoutDashboard,
  ListTodo, LoaderCircle, LogIn, LogOut, MessageSquare, MoreHorizontal, Plus,
  Search, Settings, SlidersHorizontal, Sparkles, Target, Users, X,
} from 'lucide-react'
import { supabase } from './supabase'

type Status = 'backlog' | 'progress' | 'review' | 'done'
type Priority = 'Low' | 'Medium' | 'High'
type ProjectId = number | string
type Project = { id: ProjectId; name: string; color: string; description: string; notes: string }
type Task = { id: number; project_id?: ProjectId | null; title: string; description: string; status: Status; priority: Priority; due: string; assignee: string; tag: string }
type TaskInsert = Omit<Task, 'id'>
type View = 'overview' | 'plan'

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
const defaultProject: Project = { id: 'local-website', name: 'Website launch', color: 'coral', description: 'Primary delivery project', notes: '## Project brief\n\nUse this space for goals, decisions, links, and meeting notes.\n\n- [ ] Confirm launch scope\n- [ ] Approve final design' }

function App() {
  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem('northstar-projects')
    return saved ? JSON.parse(saved) : [defaultProject]
  })
  const [selectedProjectId, setSelectedProjectId] = useState<ProjectId>(() => localStorage.getItem('northstar-selected-project') || defaultProject.id)
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem('northstar-tasks')
    const stored = saved ? JSON.parse(saved) as Task[] : seed
    return stored.map(task => ({ ...task, project_id: task.project_id || defaultProject.id }))
  })
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'All' | Priority>('All')
  const [showNew, setShowNew] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)
  const [projectError, setProjectError] = useState('')
  const [dragged, setDragged] = useState<number | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [syncing, setSyncing] = useState(true)
  const [notice, setNotice] = useState('')
  const [view, setView] = useState<View>(() => window.location.hash === '#plan' ? 'plan' : 'overview')

  useEffect(() => {
    const syncView = () => setView(window.location.hash === '#plan' ? 'plan' : 'overview')
    window.addEventListener('hashchange', syncView)
    return () => window.removeEventListener('hashchange', syncView)
  }, [])

  useEffect(() => {
    if (!user) {
      localStorage.setItem('northstar-tasks', JSON.stringify(tasks))
      localStorage.setItem('northstar-projects', JSON.stringify(projects))
      localStorage.setItem('northstar-selected-project', String(selectedProjectId))
    }
  }, [tasks, projects, selectedProjectId, user])

  const loadCloudTasks = useCallback(async (activeUser: User) => {
    setSyncing(true)
    let { data: cloudProjects, error: projectError } = await supabase.from('projects').select('*').order('created_at')
    if (projectError) { setNotice(projectError.message); setSyncing(false); return }
    if (!cloudProjects?.length) {
      const created = await supabase.from('projects').insert({ user_id: activeUser.id, name: defaultProject.name, color: defaultProject.color, description: defaultProject.description, notes: defaultProject.notes }).select().single()
      if (created.error) { setNotice(created.error.message); setSyncing(false); return }
      cloudProjects = [created.data]
    }
    const loadedProjects = cloudProjects as Project[]
    const primaryProject = loadedProjects[0]
    setProjects(loadedProjects)
    setSelectedProjectId(current => loadedProjects.some(project => String(project.id) === String(current)) ? current : primaryProject.id)
    const { data, error } = await supabase.from('tasks').select('*').order('sort_order').order('created_at')
    if (error) {
      setNotice(error.message)
      setSyncing(false)
      return
    }
    if (data.length === 0) {
      const starterRows = seed.map(({ id: _id, ...task }, index) => ({ ...task, project_id: primaryProject.id, user_id: activeUser.id, sort_order: index }))
      const { data: created, error: seedError } = await supabase.from('tasks').insert(starterRows).select()
      if (seedError) setNotice(seedError.message)
      else setTasks((created || []) as Task[])
    } else {
      const missingProject = data.filter(task => !task.project_id)
      if (missingProject.length) await supabase.from('tasks').update({ project_id: primaryProject.id }).is('project_id', null)
      setTasks(data.map(task => ({ ...task, project_id: task.project_id || primaryProject.id })) as Task[])
    }
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
        const localProjects = JSON.parse(localStorage.getItem('northstar-projects') || JSON.stringify([defaultProject])) as Project[]
        setProjects(localProjects)
        setSelectedProjectId(localStorage.getItem('northstar-selected-project') || localProjects[0].id)
        const stored = saved ? JSON.parse(saved) as Task[] : seed
        setTasks(stored.map(task => ({ ...task, project_id: task.project_id || localProjects[0].id })))
        setSyncing(false)
      }
    })
    return () => listener.subscription.unsubscribe()
  }, [loadCloudTasks])

  useEffect(() => {
    if (!user) return
    const channel = supabase.channel(`tasks:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${user.id}` }, () => loadCloudTasks(user))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects', filter: `user_id=eq.${user.id}` }, () => loadCloudTasks(user))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, loadCloudTasks])

  const projectTasks = useMemo(() => tasks.filter(task => String(task.project_id) === String(selectedProjectId)), [tasks, selectedProjectId])
  const selectedProject = projects.find(project => String(project.id) === String(selectedProjectId)) || projects[0] || defaultProject
  const visibleTasks = useMemo(() => projectTasks.filter(task => {
    const textMatch = `${task.title} ${task.description} ${task.tag}`.toLowerCase().includes(query.toLowerCase())
    return textMatch && (filter === 'All' || task.priority === filter)
  }), [projectTasks, query, filter])

  const completed = projectTasks.filter(t => t.status === 'done').length
  const progress = Math.round((completed / Math.max(projectTasks.length, 1)) * 100)

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
      project_id: selectedProject.id,
      title: String(form.get('title')),
      description: String(form.get('description') || 'No description yet.'),
      status: 'backlog',
      priority: form.get('priority') as Priority,
      due: String(form.get('due') || 'No date'),
      assignee: String(form.get('assignee')),
      tag: String(form.get('tag') || 'General'),
    }
    if (user) {
      const { data, error } = await supabase.from('tasks').insert({ ...task, user_id: user.id, sort_order: projectTasks.length }).select().single()
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

  async function addProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setProjectError('')
    const form = new FormData(event.currentTarget)
    const project = { name: String(form.get('name')), description: String(form.get('description') || ''), color: String(form.get('color') || 'violet'), notes: '' }
    if (user) {
      const { data, error } = await supabase.from('projects').insert({ ...project, user_id: user.id }).select().single()
      if (error) { setProjectError(error.message); return }
      setProjects(current => [...current, data as Project])
      setSelectedProjectId(data.id)
    } else {
      const localProject = { ...project, id: `local-${Date.now()}` }
      setProjects(current => [...current, localProject])
      setSelectedProjectId(localProject.id)
    }
    setShowNewProject(false)
    setNotice(`Project “${project.name}” created.`)
    window.location.hash = '#plan'
  }

  async function removeProject(project: Project) {
    if (projects.length === 1) { setNotice('Create another project before removing this one.'); return }
    if (!window.confirm(`Remove “${project.name}” and all of its tasks?`)) return
    if (user) {
      const { error } = await supabase.from('projects').delete().eq('id', project.id)
      if (error) { setNotice(error.message); return }
    }
    setProjects(current => current.filter(item => item.id !== project.id))
    setTasks(current => current.filter(task => String(task.project_id) !== String(project.id)))
    const nextProject = projects.find(item => item.id !== project.id)!
    setSelectedProjectId(nextProject.id)
    setNotice('Project removed.')
  }

  async function updateProjectNotes(notes: string) {
    setProjects(current => current.map(project => project.id === selectedProject.id ? { ...project, notes } : project))
    if (user) {
      const { error } = await supabase.from('projects').update({ notes }).eq('id', selectedProject.id)
      if (error) setNotice(error.message)
    }
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
        <a className={`nav-item ${view === 'overview' ? 'active' : ''}`} href="#"><LayoutDashboard size={17} />Overview</a>
        <a className={`nav-item ${view === 'plan' ? 'active' : ''}`} href="#plan"><Target size={17} />Plan</a>
        <a className="nav-item" href="#board"><ListTodo size={17} />My work <span className="nav-count">{tasks.length}</span></a>
        <a className="nav-item" href="#"><Bell size={17} />Inbox <span className="dot" /></a>
        <a className="nav-item" href="#"><MessageSquare size={17} />Messages</a>
      </nav>
      <div className="nav-heading"><span>Projects</span><button className="new-project-trigger" type="button" onClick={() => { setProjectError(''); setShowNewProject(true) }} aria-label="Create a new project"><Plus size={14} />New</button></div>
      <nav className="nav-group projects">
        {projects.map(project => <div className={`project-nav-row ${String(project.id) === String(selectedProjectId) ? 'selected' : ''}`} key={project.id}><button className="project-select" onClick={() => { setSelectedProjectId(project.id); window.location.hash = '#plan' }}><span className={`project-dot ${project.color}`} />{project.name}</button><button className="project-remove" onClick={() => removeProject(project)} aria-label={`Remove ${project.name}`}><X size={13} /></button></div>)}
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
        <div className="eyebrow"><span className={`project-dot ${selectedProject.color}`} />{selectedProject.name.toUpperCase()}</div>
        <div className="title-row"><div><h1>{view === 'plan' ? 'Plan on a page' : 'Good afternoon, Jordan'}</h1><p>{view === 'plan' ? 'The whole project—from discovery to launch—in one visual view.' : 'Here’s what’s moving across your project today.'}</p></div><button className="primary" onClick={() => setShowNew(true)}><Plus size={17} />New task</button></div>

        {view === 'plan' ? <PlanView key={selectedProject.id} project={selectedProject} tasks={projectTasks} progress={progress} onOpenTask={setSelectedTask} onUpdateNotes={updateProjectNotes} /> : <>
        <section className="summary-grid">
          <article className="summary-card"><div className="summary-label"><span>Project progress</span><span className="trend">On track</span></div><strong>{progress}%</strong><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><small>{completed} of {projectTasks.length} tasks completed</small></article>
          <article className="summary-card"><div className="summary-label"><span>Open tasks</span><ListTodo size={18} /></div><strong>{projectTasks.length - completed}</strong><small><b>{projectTasks.filter(t => t.priority === 'High' && t.status !== 'done').length} high priority</b> need attention</small></article>
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
        </>}
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
    {showNewProject && <div className="modal-backdrop" onMouseDown={() => setShowNewProject(false)}><div className="modal auth-modal" onMouseDown={event => event.stopPropagation()}>
      <div className="modal-head"><div><span>NEW PROJECT</span><h2>Create a project</h2></div><button onClick={() => setShowNewProject(false)}><X size={20} /></button></div>
      <form onSubmit={addProject}>
        <label>Project name<input name="name" required autoFocus maxLength={80} placeholder="e.g. Customer portal" /></label>
        <label>Description<textarea name="description" rows={3} placeholder="What outcome will this project deliver?" /></label>
        <label>Colour<select name="color"><option value="violet">Violet</option><option value="coral">Coral</option><option value="mint">Mint</option></select></label>
        {projectError && <div className="form-error" role="alert">{projectError}</div>}
        <div className="modal-actions"><button type="button" className="cancel" onClick={() => setShowNewProject(false)}>Cancel</button><button type="submit" className="primary"><Plus size={17} />Create project</button></div>
      </form>
    </div></div>}
    {showAuth && <AuthModal onClose={() => setShowAuth(false)} onNotice={setNotice} />}
  </div>
}

type Horizon = '4w' | '8w' | '6m' | '1y' | 'custom'
type PlanPhase = { name: string; start: string; end: string }
type PlanConfig = { horizon: Horizon; start: string; end: string; phases: PlanPhase[] }

const initialPlan: PlanConfig = {
  horizon: '4w', start: '2026-10-05', end: '2026-11-01', phases: [
    { name: 'Discover', start: '2026-10-05', end: '2026-10-09' },
    { name: 'Design', start: '2026-10-10', end: '2026-10-18' },
    { name: 'Validate', start: '2026-10-19', end: '2026-10-25' },
    { name: 'Launch', start: '2026-10-26', end: '2026-11-01' },
  ],
}

function PlanView({ project, tasks, progress, onOpenTask, onUpdateNotes }: { project: Project; tasks: Task[]; progress: number; onOpenTask: (task: Task) => void; onUpdateNotes: (notes: string) => void }) {
  const [plan, setPlan] = useState<PlanConfig>(() => {
    const saved = localStorage.getItem(`northstar-plan-${project.id}`)
    return saved ? JSON.parse(saved) : initialPlan
  })
  const [draft, setDraft] = useState<PlanConfig>(plan)
  const [editing, setEditing] = useState(false)
  const [notes, setNotes] = useState(project.notes || '')
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const statusCounts = columns.map(column => ({ ...column, count: tasks.filter(task => task.status === column.id).length }))
  const highPriority = tasks.filter(task => task.priority === 'High' && task.status !== 'done')
  const nextTask = tasks.find(task => task.status !== 'done')
  const day = 86400000
  const startMs = new Date(`${plan.start}T00:00:00Z`).getTime()
  const endMs = new Date(`${plan.end}T00:00:00Z`).getTime()
  const totalMs = Math.max(endMs - startMs, day)
  const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: plan.horizon === '1y' ? '2-digit' : undefined, timeZone: 'UTC' })
  const formatDate = (value: string | number) => dateFormatter.format(typeof value === 'number' ? new Date(value) : new Date(`${value}T00:00:00Z`))
  const axisLabels = Array.from({ length: 5 }, (_, index) => formatDate(startMs + (totalMs * index / 4)))

  function setHorizon(horizon: Horizon) {
    if (horizon === 'custom') { setDraft({ ...plan, horizon }); setEditing(true); return }
    const days = horizon === '4w' ? 27 : horizon === '8w' ? 55 : horizon === '6m' ? 182 : 364
    const newEnd = new Date(startMs + days * day).toISOString().slice(0, 10)
    const next = { ...plan, horizon, end: newEnd }
    setPlan(next)
    localStorage.setItem(`northstar-plan-${project.id}`, JSON.stringify(next))
  }

  function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (new Date(draft.end) <= new Date(draft.start)) return
    setPlan(draft)
    localStorage.setItem(`northstar-plan-${project.id}`, JSON.stringify(draft))
    setEditing(false)
  }

  function editPlan() { setDraft(plan); setEditing(true) }

  function formatNotes(prefix: string, suffix = prefix, placeholder = 'text') {
    const input = notesRef.current
    if (!input) return
    const start = input.selectionStart
    const end = input.selectionEnd
    const selected = notes.slice(start, end) || placeholder
    const next = `${notes.slice(0, start)}${prefix}${selected}${suffix}${notes.slice(end)}`
    setNotes(next)
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(start + prefix.length, start + prefix.length + selected.length) })
  }

  return <section className="plan-page" aria-label="Project plan overview">
    <div className="plan-kpis">
      <article className="plan-progress-card"><div className="progress-ring" style={{ '--progress': `${progress * 3.6}deg` } as CSSProperties}><span>{progress}%</span></div><div><small>OVERALL PROGRESS</small><h2>Project is on track</h2><p>{tasks.filter(task => task.status === 'done').length} of {tasks.length} deliverables complete</p></div></article>
      <article className="plan-stat"><Flag size={18} /><div><small>NEXT MILESTONE</small><strong>Design sign-off</strong><span>Friday, 16 October</span></div></article>
      <article className="plan-stat"><Target size={18} /><div><small>FOCUS</small><strong>{highPriority.length} high-priority tasks</strong><span>{nextTask ? `Next: ${nextTask.title}` : 'Everything is complete'}</span></div></article>
    </div>

    <article className="roadmap-panel">
      <div className="panel-heading roadmap-heading"><div><span>ROADMAP</span><h2>Delivery timeline</h2></div><div className="roadmap-actions"><div className="horizon-picker" aria-label="Timeline range">{([['4w','4 weeks'],['8w','8 weeks'],['6m','6 months'],['1y','1 year']] as [Horizon,string][]).map(([value,label]) => <button key={value} className={plan.horizon === value ? 'active' : ''} onClick={() => setHorizon(value)}>{label}</button>)}<button className={plan.horizon === 'custom' ? 'active' : ''} onClick={() => setHorizon('custom')}>Custom</button></div><button className="edit-plan" onClick={editPlan}><SlidersHorizontal size={14} />Edit plan</button></div></div>
      <div className="timeline-summary"><span>{formatDate(plan.start)} — {formatDate(plan.end)}</span><small>{Math.ceil(totalMs / day)} days</small></div>
      <div className="timeline-head"><span />{axisLabels.map(label => <span key={label}>{label}</span>)}</div>
      <div className="timeline-grid">
        {plan.phases.map((phase, index) => <div className="timeline-row" key={`${phase.name}-${index}`}>
          <div className="phase-label"><span className={`status-dot ${columns[index % columns.length].tone}`} /><div><strong>{phase.name}</strong><small>{formatDate(phase.start)}–{formatDate(phase.end)}</small></div></div>
          <div className="timeline-track"><span className={`phase-bar phase-${index % 4 + 1}`} style={{ left: `${Math.max(0, Math.min(100, ((new Date(`${phase.start}T00:00:00Z`).getTime() - startMs) / totalMs) * 100))}%`, width: `${Math.max(2, Math.min(100, ((new Date(`${phase.end}T00:00:00Z`).getTime() - new Date(`${phase.start}T00:00:00Z`).getTime()) / totalMs) * 100))}%` }}>{phase.name}</span></div>
        </div>)}
      </div>
      <div className="milestone-line"><span><Flag size={14} />Design sign-off</span><span><Flag size={14} />Go live</span></div>
    </article>

    <div className="plan-bottom-grid">
      <article className="workload-panel"><div className="panel-heading"><div><span>WORK BREAKDOWN</span><h2>Tasks by stage</h2></div><b>{tasks.length} total</b></div>
        <div className="stacked-progress" aria-label="Task distribution">{statusCounts.map(item => <span key={item.id} className={item.tone} style={{ width: `${(item.count / Math.max(tasks.length, 1)) * 100}%` }} />)}</div>
        <div className="stage-list">{statusCounts.map(item => <div key={item.id}><span className={`status-dot ${item.tone}`} /><span>{item.label}</span><strong>{item.count}</strong></div>)}</div>
      </article>
      <article className="focus-panel"><div className="panel-heading"><div><span>PRIORITY QUEUE</span><h2>Needs attention</h2></div></div>
        <div className="focus-list">{highPriority.length ? highPriority.slice(0, 3).map(task => <button key={task.id} onClick={() => onOpenTask(task)}><span className="avatar">{task.assignee}</span><span><strong>{task.title}</strong><small>{task.tag} · {task.due}</small></span><ChevronDown size={15} /></button>) : <p className="empty-state">No high-priority work is waiting.</p>}</div>
      </article>
    </div>
    <article className="notes-panel">
      <div className="panel-heading"><div><span>PROJECT CANVAS</span><h2>Plan notes</h2></div><span className="markdown-status">Markdown enabled</span></div>
      <div className="markdown-toolbar" aria-label="Text formatting"><button onClick={() => formatNotes('## ', '', 'Heading')}>H2</button><button onClick={() => formatNotes('**', '**', 'bold text')}><b>B</b></button><button onClick={() => formatNotes('*', '*', 'italic text')}><i>I</i></button><button onClick={() => formatNotes('- ', '', 'List item')}>• List</button><button onClick={() => formatNotes('- [ ] ', '', 'Task')}>☐ Task</button><button onClick={() => formatNotes('[', '](https://)', 'link text')}>Link</button><button onClick={() => formatNotes('> ', '', 'Quote')}>❝ Quote</button></div>
      <div className="markdown-workspace"><label><span>WRITE</span><textarea ref={notesRef} value={notes} onChange={event => setNotes(event.target.value)} onBlur={() => onUpdateNotes(notes)} placeholder="Write a project brief, decisions, meeting notes, or links…" /></label><div className="markdown-preview"><span>PREVIEW</span><div className="markdown-body">{notes.trim() ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{notes}</ReactMarkdown> : <p className="empty-state">Formatted notes will appear here.</p>}</div></div></div>
    </article>
    {editing && <div className="modal-backdrop" onMouseDown={() => setEditing(false)}><div className="modal plan-editor" onMouseDown={event => event.stopPropagation()}>
      <div className="modal-head"><div><span>PLAN SETTINGS</span><h2>Edit timeline</h2></div><button onClick={() => setEditing(false)}><X size={20} /></button></div>
      <form onSubmit={savePlan}>
        <div className="form-grid"><label>Plan starts<input type="date" value={draft.start} onChange={event => setDraft(current => ({ ...current, start: event.target.value, horizon: 'custom' }))} /></label><label>Plan ends<input type="date" value={draft.end} min={draft.start} onChange={event => setDraft(current => ({ ...current, end: event.target.value, horizon: 'custom' }))} /></label></div>
        <div className="phase-editor"><div className="phase-editor-head"><strong>Project phases</strong><span>Name and schedule</span></div>{draft.phases.map((phase, index) => <div className="phase-editor-row" key={index}><span className={`status-dot ${columns[index % columns.length].tone}`} /><input aria-label={`Phase ${index + 1} name`} value={phase.name} onChange={event => setDraft(current => ({ ...current, phases: current.phases.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) }))} /><input aria-label={`${phase.name} start`} type="date" value={phase.start} onChange={event => setDraft(current => ({ ...current, phases: current.phases.map((item, itemIndex) => itemIndex === index ? { ...item, start: event.target.value } : item) }))} /><input aria-label={`${phase.name} end`} type="date" value={phase.end} onChange={event => setDraft(current => ({ ...current, phases: current.phases.map((item, itemIndex) => itemIndex === index ? { ...item, end: event.target.value } : item) }))} /></div>)}</div>
        <div className="modal-actions"><button type="button" className="cancel" onClick={() => setEditing(false)}>Cancel</button><button type="submit" className="primary"><Check size={17} />Apply timeline</button></div>
      </form>
    </div></div>}
  </section>
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
