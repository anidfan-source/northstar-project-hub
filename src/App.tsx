import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  Bell, CalendarDays, Check, ChevronDown, CircleHelp, Clock3, LayoutDashboard,
  ListTodo, MessageSquare, MoreHorizontal, Plus, Search, Settings, Sparkles,
  Users, X,
} from 'lucide-react'

type Status = 'backlog' | 'progress' | 'review' | 'done'
type Priority = 'Low' | 'Medium' | 'High'
type Task = { id: number; title: string; description: string; status: Status; priority: Priority; due: string; assignee: string; tag: string }

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
  const [dragged, setDragged] = useState<number | null>(null)

  useEffect(() => localStorage.setItem('northstar-tasks', JSON.stringify(tasks)), [tasks])

  const visibleTasks = useMemo(() => tasks.filter(task => {
    const textMatch = `${task.title} ${task.description} ${task.tag}`.toLowerCase().includes(query.toLowerCase())
    return textMatch && (filter === 'All' || task.priority === filter)
  }), [tasks, query, filter])

  const completed = tasks.filter(t => t.status === 'done').length
  const progress = Math.round((completed / Math.max(tasks.length, 1)) * 100)

  function moveTask(id: number, status: Status) {
    setTasks(current => current.map(task => task.id === id ? { ...task, status } : task))
  }

  function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setTasks(current => [...current, {
      id: Date.now(),
      title: String(form.get('title')),
      description: String(form.get('description') || 'No description yet.'),
      status: 'backlog',
      priority: form.get('priority') as Priority,
      due: String(form.get('due') || 'No date'),
      assignee: String(form.get('assignee')),
      tag: String(form.get('tag') || 'General'),
    }])
    setShowNew(false)
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
        <div className="top-actions"><button className="icon-button"><Bell size={18} /><span className="notification" /></button><div className="avatar-stack">{initials.map(i => <span className="avatar" key={i}>{i}</span>)}</div><button className="share-button"><Users size={16} />Share</button></div>
      </header>

      <div className="content">
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
                  {items.map(task => <article className="task-card" draggable key={task.id} onDragStart={() => setDragged(task.id)}>
                    <div className="task-top"><span className="tag">{task.tag}</span><button aria-label="Task options"><MoreHorizontal size={17} /></button></div>
                    <h3>{task.title}</h3><p>{task.description}</p>
                    <div className="task-meta"><span className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</span><span className={task.due === 'Today' ? 'due urgent' : 'due'}><CalendarDays size={13} />{task.due}</span></div>
                    <div className="task-footer"><span className="avatar">{task.assignee}</span>{task.status === 'done' && <span className="complete"><Check size={13} /> Complete</span>}<button onClick={() => setTasks(current => current.filter(t => t.id !== task.id))}>Remove</button></div>
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
  </div>
}

export default App
