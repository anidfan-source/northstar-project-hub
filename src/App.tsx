import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties } from "react";
import type { User } from "@supabase/supabase-js";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Cloud,
  Download,
  Flag,
  GitBranch,
  History,
  Image,
  LayoutDashboard,
  ListTodo,
  LoaderCircle,
  LogIn,
  LogOut,
  MessageCircle,
  MessageSquare,
  Plus,
  ShieldAlert,
  Presentation,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  Users,
  WandSparkles,
  X,
} from "lucide-react";
import { supabase } from "./supabase";

type Status = "backlog" | "progress" | "review" | "done";
type Priority = "Low" | "Medium" | "High";
type ProjectId = number | string;
type Project = {
  id: ProjectId;
  name: string;
  color: string;
  description: string;
  notes: string;
};
type GeneratedProject = {
  name: string;
  description: string;
  color: string;
  notes: string;
  phases: { name: string; startOffset: number; durationDays: number }[];
  tasks: {
    title: string;
    description: string;
    phaseIndex: number;
    priority: Priority;
    assignee: string;
    tag: string;
  }[];
};
type Task = {
  id: number;
  project_id?: ProjectId | null;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  due: string;
  assignee: string;
  tag: string;
};
type TaskInsert = Omit<Task, "id">;
type Profile = {
  user_id: string;
  username: string;
  team_id: string;
  must_change_password: boolean;
};
type TeamMessage = {
  id: number;
  team_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

function initials(value: string) {
  const clean = value.trim();
  if (!clean) return "—";
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  return (parts.length > 1
    ? `${parts[0][0]}${parts[1][0]}`
    : clean.slice(0, 2)
  ).toUpperCase();
}
type RaidItem = {
  id: number;
  project_id: ProjectId;
  kind: "Risk" | "Assumption" | "Issue" | "Dependency";
  title: string;
  owner: string;
  impact: Priority;
  status: "Open" | "Monitoring" | "Closed";
  due_date: string | null;
  mitigation: string;
  created_at: string;
};
type Decision = {
  id: number;
  project_id: ProjectId;
  title: string;
  outcome: string;
  decided_by: string;
  decided_at: string;
  created_at: string;
};
type TaskComment = {
  id: number;
  task_id: number;
  author_id: string;
  body: string;
  created_at: string;
};
type TaskDependency = { task_id: number; depends_on_task_id: number };
type ActivityEvent = {
  id: number;
  actor_id: string | null;
  project_id: ProjectId | null;
  action: string;
  entity_type: string;
  entity_title: string;
  created_at: string;
};
type View =
  | "overview"
  | "plan"
  | "report"
  | "messages"
  | "portfolio"
  | "governance"
  | "activity";

const columns: { id: Status; label: string; tone: string }[] = [
  { id: "backlog", label: "Backlog", tone: "slate" },
  { id: "progress", label: "In progress", tone: "blue" },
  { id: "review", label: "In review", tone: "amber" },
  { id: "done", label: "Done", tone: "green" },
];

const legacyProjectId = "local-website";
const legacyTaskTitles = new Set([
  "Map the customer journey",
  "Draft onboarding checklist",
  "Build project overview",
  "Design task details",
  "Review navigation model",
  "Set up project repository",
]);
const emptyProject: Project = {
  id: "",
  name: "No project selected",
  color: "slate",
  description: "",
  notes: "",
};

function readLocalProjects() {
  const stored = JSON.parse(
    localStorage.getItem("northstar-projects") || "[]",
  ) as Project[];
  return stored.filter((project) => String(project.id) !== legacyProjectId);
}

function readLocalTasks(projects: Project[]) {
  const stored = JSON.parse(
    localStorage.getItem("northstar-tasks") || "[]",
  ) as Task[];
  const firstProject = projects[0]?.id;
  return stored
    .filter((task) => !legacyTaskTitles.has(task.title))
    .map((task) => ({
      ...task,
      project_id:
        String(task.project_id) === legacyProjectId
          ? firstProject
          : task.project_id,
    }))
    .filter((task) => task.project_id);
}

function App() {
  const [projects, setProjects] = useState<Project[]>(() => {
    return readLocalProjects();
  });
  const [selectedProjectId, setSelectedProjectId] = useState<ProjectId>(
    () => localStorage.getItem("northstar-selected-project") || "",
  );
  const [tasks, setTasks] = useState<Task[]>(() => {
    const localProjects = readLocalProjects();
    return readLocalTasks(localProjects);
  });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"All" | Priority>("All");
  const [showNew, setShowNew] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [projectError, setProjectError] = useState("");
  const [showAiBuilder, setShowAiBuilder] = useState(false);
  const [aiDraft, setAiDraft] = useState<GeneratedProject | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const [dragged, setDragged] = useState<number | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [syncing, setSyncing] = useState(true);
  const [notice, setNotice] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [raidItems, setRaidItems] = useState<RaidItem[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const routeView = (): View =>
    window.location.hash === "#plan"
      ? "plan"
      : window.location.hash === "#report"
        ? "report"
        : window.location.hash === "#messages"
          ? "messages"
          : window.location.hash === "#portfolio"
            ? "portfolio"
            : window.location.hash === "#governance"
              ? "governance"
              : window.location.hash === "#activity"
                ? "activity"
                : "overview";
  const [view, setView] = useState<View>(routeView);

  useEffect(() => {
    const syncView = () => setView(routeView());
    window.addEventListener("hashchange", syncView);
    return () => window.removeEventListener("hashchange", syncView);
  }, []);

  useEffect(() => {
    if (!user) {
      localStorage.setItem("northstar-tasks", JSON.stringify(tasks));
      localStorage.setItem("northstar-projects", JSON.stringify(projects));
      localStorage.setItem(
        "northstar-selected-project",
        String(selectedProjectId),
      );
    }
  }, [tasks, projects, selectedProjectId, user]);

  const loadCloudTasks = useCallback(async (activeUser: User) => {
    setSyncing(true);
    let { data: cloudProjects, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .order("created_at");
    if (projectError) {
      setNotice(projectError.message);
      setSyncing(false);
      return;
    }
    const { data: cloudTasks, error: taskError } = await supabase
      .from("tasks")
      .select("*")
      .order("sort_order")
      .order("created_at");
    if (taskError) {
      setNotice(taskError.message);
      setSyncing(false);
      return;
    }
    const legacyTaskIds = (cloudTasks || [])
      .filter((task) => legacyTaskTitles.has(task.title))
      .map((task) => task.id);
    if (legacyTaskIds.length)
      await supabase.from("tasks").delete().in("id", legacyTaskIds);
    const retainedTasks = (cloudTasks || []).filter(
      (task) => !legacyTaskTitles.has(task.title),
    );
    const legacyCloudProjects = (cloudProjects || []).filter(
      (project) =>
        project.name === "Website launch" &&
        project.description === "Primary delivery project",
    );
    for (const project of legacyCloudProjects) {
      if (
        !retainedTasks.some(
          (task) => String(task.project_id) === String(project.id),
        )
      )
        await supabase.from("projects").delete().eq("id", project.id);
    }
    cloudProjects = (cloudProjects || []).filter(
      (project) =>
        !legacyCloudProjects.some(
          (legacy) =>
            String(legacy.id) === String(project.id) &&
            !retainedTasks.some(
              (task) => String(task.project_id) === String(project.id),
            ),
        ),
    );
    const loadedProjects = cloudProjects as Project[];
    const primaryProject = loadedProjects[0];
    setProjects(loadedProjects);
    setSelectedProjectId((current) =>
      loadedProjects.some((project) => String(project.id) === String(current))
        ? current
        : primaryProject?.id || "",
    );
    const missingProject = primaryProject
      ? retainedTasks.filter((task) => !task.project_id)
      : [];
    if (missingProject.length)
      await supabase
        .from("tasks")
        .update({ project_id: primaryProject.id })
        .is("project_id", null);
    setTasks(
      retainedTasks.map((task) => ({
        ...task,
        project_id: task.project_id || primaryProject?.id,
      })) as Task[],
    );
    setSyncing(false);
  }, []);

  const loadCollaboration = useCallback(async (activeUser: User) => {
    const { data: currentProfile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", activeUser.id)
      .single();
    if (error) {
      setNotice(error.message);
      return;
    }
    setProfile(currentProfile as Profile);
    const [{ data: teamMembers }, { data: teamMessages }] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("team_id", currentProfile.team_id)
        .order("username"),
      supabase
        .from("messages")
        .select("*")
        .eq("team_id", currentProfile.team_id)
        .order("created_at"),
    ]);
    setMembers((teamMembers || []) as Profile[]);
    setMessages((teamMessages || []) as TeamMessage[]);
    const [
      { data: raid },
      { data: decisionRows },
      { data: commentRows },
      { data: dependencyRows },
      { data: activityRows },
    ] = await Promise.all([
      supabase
        .from("raid_items")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("decisions")
        .select("*")
        .order("decided_at", { ascending: false }),
      supabase.from("task_comments").select("*").order("created_at"),
      supabase.from("task_dependencies").select("task_id,depends_on_task_id"),
      supabase
        .from("activity_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    setRaidItems((raid || []) as RaidItem[]);
    setDecisions((decisionRows || []) as Decision[]);
    setComments((commentRows || []) as TaskComment[]);
    setDependencies((dependencyRows || []) as TaskDependency[]);
    setActivities((activityRows || []) as ActivityEvent[]);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const currentUser = data.session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        loadCloudTasks(currentUser);
        loadCollaboration(currentUser);
      } else setSyncing(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          loadCloudTasks(currentUser);
          loadCollaboration(currentUser);
        } else {
          setProfile(null);
          setMembers([]);
          setMessages([]);
          const localProjects = readLocalProjects();
          setProjects(localProjects);
          setSelectedProjectId(
            localProjects.some(
              (project) =>
                String(project.id) ===
                localStorage.getItem("northstar-selected-project"),
            )
              ? localStorage.getItem("northstar-selected-project") || ""
              : localProjects[0]?.id || "",
          );
          setTasks(readLocalTasks(localProjects));
          setSyncing(false);
        }
      },
    );
    return () => listener.subscription.unsubscribe();
  }, [loadCloudTasks, loadCollaboration]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`tasks:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `user_id=eq.${user.id}`,
        },
        () => loadCloudTasks(user),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "projects",
          filter: `user_id=eq.${user.id}`,
        },
        () => loadCloudTasks(user),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loadCloudTasks]);

  useEffect(() => {
    if (!user || !profile) return;
    const channel = supabase
      .channel(`messages:${profile.team_id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `team_id=eq.${profile.team_id}`,
        },
        (payload) =>
          setMessages((current) => [...current, payload.new as TeamMessage]),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, profile]);

  const projectTasks = useMemo(
    () =>
      tasks.filter(
        (task) => String(task.project_id) === String(selectedProjectId),
      ),
    [tasks, selectedProjectId],
  );
  const selectedProject =
    projects.find(
      (project) => String(project.id) === String(selectedProjectId),
    ) ||
    projects[0] ||
    emptyProject;
  const visibleTasks = useMemo(
    () =>
      projectTasks.filter((task) => {
        const textMatch = `${task.title} ${task.description} ${task.tag}`
          .toLowerCase()
          .includes(query.toLowerCase());
        return textMatch && (filter === "All" || task.priority === filter);
      }),
    [projectTasks, query, filter],
  );

  const completed = projectTasks.filter((t) => t.status === "done").length;
  const progress = Math.round(
    (completed / Math.max(projectTasks.length, 1)) * 100,
  );
  const teamInitials = members.length
    ? members.map((member) => initials(member.username))
    : Array.from(
        new Set(projectTasks.map((task) => task.assignee).filter(Boolean)),
      ).slice(0, 4);
  const nextTask = projectTasks.find((task) => task.status !== "done");
  const accountName =
    profile?.username || user?.email?.split("@")[0] || "Guest";
  const accountInitial = accountName.slice(0, 1).toUpperCase() || "G";

  async function moveTask(id: number, status: Status) {
    setTasks((current) =>
      current.map((task) => (task.id === id ? { ...task, status } : task)),
    );
    if (user) {
      const { error } = await supabase
        .from("tasks")
        .update({ status })
        .eq("id", id);
      if (error) {
        setNotice(error.message);
        loadCloudTasks(user);
      } else
        recordActivity(
          "moved",
          "task",
          tasks.find((task) => task.id === id)?.title || "Task",
          tasks.find((task) => task.id === id)?.project_id || null,
        );
    }
  }

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const task: TaskInsert = {
      project_id: selectedProject.id,
      title: String(form.get("title")),
      description: String(form.get("description") || "No description yet."),
      status: "backlog",
      priority: form.get("priority") as Priority,
      due: String(form.get("due") || "No date"),
      assignee: String(form.get("assignee")),
      tag: String(form.get("tag") || "General"),
    };
    if (user) {
      const { data, error } = await supabase
        .from("tasks")
        .insert({ ...task, user_id: user.id, sort_order: projectTasks.length })
        .select()
        .single();
      if (error) setNotice(error.message);
      else {
        setTasks((current) => [...current, data as Task]);
        recordActivity("created", "task", task.title, selectedProject.id);
      }
    } else setTasks((current) => [...current, { id: Date.now(), ...task }]);
    setShowNew(false);
  }

  async function removeTask(id: number) {
    setTasks((current) => current.filter((task) => task.id !== id));
    if (user) {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) {
        setNotice(error.message);
        loadCloudTasks(user);
      }
    }
  }

  async function updateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTask) return;
    const form = new FormData(event.currentTarget);
    const changes: TaskInsert = {
      title: String(form.get("title")),
      description: String(form.get("description") || "No description yet."),
      status: form.get("status") as Status,
      priority: form.get("priority") as Priority,
      due: String(form.get("due") || "No date"),
      assignee: String(form.get("assignee")),
      tag: String(form.get("tag") || "General"),
    };
    setTasks((current) =>
      current.map((task) =>
        task.id === selectedTask.id ? { ...task, ...changes } : task,
      ),
    );
    if (user) {
      const { error } = await supabase
        .from("tasks")
        .update(changes)
        .eq("id", selectedTask.id);
      if (error) {
        setNotice(error.message);
        loadCloudTasks(user);
      } else {
        setNotice("Task updated.");
        recordActivity(
          "updated",
          "task",
          changes.title,
          selectedTask.project_id || null,
        );
      }
    }
    setSelectedTask(null);
  }

  async function duplicateTask(task: Task) {
    const copy: TaskInsert = {
      ...task,
      title: `${task.title} (copy)`,
      status: "backlog",
    };
    const { id: _id, ...insert } = copy as Task;
    if (user) {
      const { data, error } = await supabase
        .from("tasks")
        .insert({ ...insert, user_id: user.id, sort_order: tasks.length })
        .select()
        .single();
      if (error) setNotice(error.message);
      else setTasks((current) => [...current, data as Task]);
    } else setTasks((current) => [...current, { ...insert, id: Date.now() }]);
    setSelectedTask(null);
    setNotice("Task duplicated in Backlog.");
  }

  async function addProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProjectError("");
    const form = new FormData(event.currentTarget);
    const project = {
      name: String(form.get("name")),
      description: String(form.get("description") || ""),
      color: String(form.get("color") || "violet"),
      notes: "",
    };
    if (user) {
      const { data, error } = await supabase
        .from("projects")
        .insert({ ...project, user_id: user.id })
        .select()
        .single();
      if (error) {
        setProjectError(error.message);
        return;
      }
      setProjects((current) => [...current, data as Project]);
      recordActivity("created", "project", project.name, data.id);
      setSelectedProjectId(data.id);
    } else {
      const localProject = { ...project, id: `local-${Date.now()}` };
      setProjects((current) => [...current, localProject]);
      setSelectedProjectId(localProject.id);
    }
    setShowNewProject(false);
    setNotice(`Project “${project.name}” created.`);
    window.location.hash = "#plan";
  }

  async function generateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      setAiError(
        "Sign in first so your generated project can be saved securely.",
      );
      return;
    }
    setAiBusy(true);
    setAiError("");
    setAiDraft(null);
    const form = new FormData(event.currentTarget);
    const { data, error } = await supabase.functions.invoke(
      "generate-project",
      {
        body: {
          prompt: String(form.get("prompt")),
          horizon: String(form.get("horizon")),
        },
      },
    );
    setAiBusy(false);
    if (error) {
      setAiError(error.message);
      return;
    }
    if (data?.error) {
      setAiError(data.error);
      return;
    }
    setAiDraft(data as GeneratedProject);
  }

  async function createAiProject() {
    if (!user || !aiDraft) return;
    setAiBusy(true);
    setAiError("");
    const { data: created, error } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        name: aiDraft.name,
        description: aiDraft.description,
        color: aiDraft.color || "violet",
        notes: aiDraft.notes,
      })
      .select()
      .single();
    if (error) {
      setAiBusy(false);
      setAiError(error.message);
      return;
    }
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const dateAt = (offset: number) => {
      const date = new Date(today);
      date.setDate(date.getDate() + offset);
      return date;
    };
    const dueLabel = (date: Date) =>
      new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
      }).format(date);
    const generatedTasks = aiDraft.tasks.map((task, index) => ({
      project_id: created.id,
      user_id: user.id,
      sort_order: index,
      title: task.title,
      description: task.description,
      status: "backlog" as Status,
      priority: task.priority,
      due: dueLabel(dateAt(aiDraft.phases[task.phaseIndex]?.startOffset || 0)),
      assignee:
        members[index % Math.max(members.length, 1)]?.username ||
        task.assignee ||
        "",
      tag: task.tag || "General",
    }));
    const inserted = await supabase
      .from("tasks")
      .insert(generatedTasks)
      .select();
    if (inserted.error) {
      await supabase.from("projects").delete().eq("id", created.id);
      setAiBusy(false);
      setAiError(inserted.error.message);
      return;
    }
    const lastPhase = aiDraft.phases[aiDraft.phases.length - 1];
    const planConfig: PlanConfig = {
      horizon: "custom",
      start: dateAt(0).toISOString().slice(0, 10),
      end: dateAt(
        (lastPhase?.startOffset || 0) + (lastPhase?.durationDays || 28),
      )
        .toISOString()
        .slice(0, 10),
      phases: aiDraft.phases.map((phase) => ({
        name: phase.name,
        start: dateAt(phase.startOffset).toISOString().slice(0, 10),
        end: dateAt(phase.startOffset + phase.durationDays)
          .toISOString()
          .slice(0, 10),
      })),
    };
    localStorage.setItem(
      `northstar-plan-${created.id}`,
      JSON.stringify(planConfig),
    );
    setProjects((current) => [...current, created as Project]);
    setTasks((current) => [...current, ...((inserted.data || []) as Task[])]);
    setSelectedProjectId(created.id);
    setAiBusy(false);
    setShowAiBuilder(false);
    setAiDraft(null);
    setNotice(
      `AI project “${created.name}” created with ${generatedTasks.length} tasks.`,
    );
    window.location.hash = "#plan";
  }

  async function removeProject(project: Project) {
    if (projects.length === 1) {
      setNotice("Create another project before removing this one.");
      return;
    }
    if (!window.confirm(`Remove “${project.name}” and all of its tasks?`))
      return;
    if (user) {
      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("id", project.id);
      if (error) {
        setNotice(error.message);
        return;
      }
    }
    setProjects((current) => current.filter((item) => item.id !== project.id));
    setTasks((current) =>
      current.filter((task) => String(task.project_id) !== String(project.id)),
    );
    const nextProject = projects.find((item) => item.id !== project.id)!;
    setSelectedProjectId(nextProject.id);
    setNotice("Project removed.");
  }

  async function updateProjectNotes(notes: string) {
    setProjects((current) =>
      current.map((project) =>
        project.id === selectedProject.id ? { ...project, notes } : project,
      ),
    );
    if (user) {
      const { error } = await supabase
        .from("projects")
        .update({ notes })
        .eq("id", selectedProject.id);
      if (error) setNotice(error.message);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setNotice("Signed out. Local mode is active.");
  }

  async function sendMessage(body: string) {
    if (!user || !profile || !body.trim()) return;
    const { error } = await supabase
      .from("messages")
      .insert({
        body: body.trim(),
        sender_id: user.id,
        team_id: profile.team_id,
      });
    if (error) setNotice(error.message);
  }

  async function recordActivity(
    action: string,
    entityType: string,
    entityTitle: string,
    projectId: ProjectId | null,
  ) {
    if (!user || !profile) return;
    const { data } = await supabase
      .from("activity_events")
      .insert({
        team_id: profile.team_id,
        actor_id: user.id,
        project_id: projectId || null,
        action,
        entity_type: entityType,
        entity_title: entityTitle,
      })
      .select()
      .single();
    if (data)
      setActivities((current) =>
        [data as ActivityEvent, ...current].slice(0, 100),
      );
  }

  async function addRaid(input: Omit<RaidItem, "id" | "created_at">) {
    if (!user || !profile) return;
    const { data, error } = await supabase
      .from("raid_items")
      .insert({ ...input, team_id: profile.team_id, created_by: user.id })
      .select()
      .single();
    if (error) setNotice(error.message);
    else {
      setRaidItems((current) => [data as RaidItem, ...current]);
      recordActivity(
        "added",
        input.kind.toLowerCase(),
        input.title,
        input.project_id,
      );
    }
  }

  async function addDecision(input: Omit<Decision, "id" | "created_at">) {
    if (!user || !profile) return;
    const { data, error } = await supabase
      .from("decisions")
      .insert({ ...input, team_id: profile.team_id, created_by: user.id })
      .select()
      .single();
    if (error) setNotice(error.message);
    else {
      setDecisions((current) => [data as Decision, ...current]);
      recordActivity("recorded", "decision", input.title, input.project_id);
    }
  }

  async function addComment(taskId: number, body: string) {
    if (!user || !profile || !body.trim()) return;
    const { data, error } = await supabase
      .from("task_comments")
      .insert({
        task_id: taskId,
        body: body.trim(),
        author_id: user.id,
        team_id: profile.team_id,
      })
      .select()
      .single();
    if (error) setNotice(error.message);
    else {
      setComments((current) => [...current, data as TaskComment]);
      recordActivity(
        "commented on",
        "task",
        tasks.find((task) => task.id === taskId)?.title || "Task",
        tasks.find((task) => task.id === taskId)?.project_id || null,
      );
    }
  }

  async function setDependency(taskId: number, dependsOnTaskId: number | null) {
    if (!user || !profile) return;
    await supabase.from("task_dependencies").delete().eq("task_id", taskId);
    setDependencies((current) =>
      current.filter((item) => item.task_id !== taskId),
    );
    if (dependsOnTaskId) {
      const { data, error } = await supabase
        .from("task_dependencies")
        .insert({
          task_id: taskId,
          depends_on_task_id: dependsOnTaskId,
          team_id: profile.team_id,
          created_by: user.id,
        })
        .select("task_id,depends_on_task_id")
        .single();
      if (error) setNotice(error.message);
      else setDependencies((current) => [...current, data as TaskDependency]);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="workspace-identity">
          <span>Transformation &amp; Readiness</span>
          <small>Project workspace</small>
        </div>
        <nav className="nav-group" aria-label="Main navigation">
          <a
            className={`nav-item ${view === "overview" ? "active" : ""}`}
            href="#"
          >
            <LayoutDashboard size={17} />
            Overview
          </a>
          <a
            className={`nav-item ${view === "portfolio" ? "active" : ""}`}
            href="#portfolio"
          >
            <BriefcaseBusiness size={17} />
            Portfolio
          </a>
          <a
            className={`nav-item ${view === "plan" ? "active" : ""}`}
            href="#plan"
          >
            <Target size={17} />
            Plan
          </a>
          <a
            className={`nav-item ${view === "governance" ? "active" : ""}`}
            href="#governance"
          >
            <ShieldAlert size={17} />
            RAID & decisions
          </a>
          <a
            className={`nav-item ${view === "report" ? "active" : ""}`}
            href="#report"
          >
            <Presentation size={17} />
            Slides
          </a>
          <a className="nav-item" href="#board">
            <ListTodo size={17} />
            My work <span className="nav-count">{tasks.length}</span>
          </a>
          <a
            className={`nav-item ${view === "messages" ? "active" : ""}`}
            href="#messages"
          >
            <MessageSquare size={17} />
            Messages
          </a>
          <a
            className={`nav-item ${view === "activity" ? "active" : ""}`}
            href="#activity"
          >
            <History size={17} />
            Activity
          </a>
        </nav>
        <div className="nav-heading">
          <span>Projects</span>
          <button
            className="new-project-trigger"
            type="button"
            onClick={() => {
              setProjectError("");
              setShowNewProject(true);
            }}
            aria-label="Create a new project"
          >
            <Plus size={14} />
            New
          </button>
        </div>
        <nav className="nav-group projects">
          {projects.map((project) => (
            <div
              className={`project-nav-row ${String(project.id) === String(selectedProjectId) ? "selected" : ""}`}
              key={project.id}
            >
              <button
                className="project-select"
                onClick={() => {
                  setSelectedProjectId(project.id);
                  window.location.hash = "#plan";
                }}
              >
                <span className={`project-dot ${project.color}`} />
                {project.name}
              </button>
              <button
                className="project-remove"
                onClick={() => removeProject(project)}
                aria-label={`Remove ${project.name}`}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile">
            <span className="avatar dark">{accountInitial}</span>
            <span>
              <b>{accountName}</b>
              <small>{user?.email || "Local workspace"}</small>
            </span>
          </div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div className="search">
            <Search size={17} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tasks, projects, or people…"
            />
            <kbd>⌘ K</kbd>
          </div>
          <div className="top-actions">
            <span className={`sync-state ${user ? "cloud" : ""}`}>
              {syncing ? (
                <LoaderCircle size={14} className="spin" />
              ) : (
                <Cloud size={14} />
              )}
              {syncing ? "Syncing" : user ? "Cloud synced" : "Local mode"}
            </span>
            {teamInitials.length > 0 && (
              <div className="avatar-stack">
                {teamInitials.map((i, index) => (
                  <span className="avatar" key={`${i}-${index}`}>
                    {i}
                  </span>
                ))}
              </div>
            )}
            {user ? (
              <button className="share-button" onClick={signOut}>
                <LogOut size={16} />
                Sign out
              </button>
            ) : (
              <button
                className="share-button"
                onClick={() => setShowAuth(true)}
              >
                <LogIn size={16} />
                Sign in
              </button>
            )}
          </div>
        </header>

        <div className="content">
          {!user && (
            <div className="cloud-banner">
              <div>
                <Cloud size={17} />
                <span>
                  <b>Your work is saved on this device.</b> Sign in to sync
                  tasks securely across devices.
                </span>
              </div>
              <button onClick={() => setShowAuth(true)}>
                Enable cloud sync
              </button>
            </div>
          )}
          {notice && (
            <div className="notice">
              <span>{notice}</span>
              <button onClick={() => setNotice("")}>
                <X size={15} />
              </button>
            </div>
          )}
          {view === "messages" ? (
            <MessagesView
              user={user}
              members={members}
              messages={messages}
              onSend={sendMessage}
              onSignIn={() => setShowAuth(true)}
            />
          ) : view === "portfolio" ? (
            <PortfolioView
              projects={projects}
              tasks={tasks}
              raidItems={raidItems}
              onSelect={(id) => {
                setSelectedProjectId(id);
                window.location.hash = "#";
              }}
            />
          ) : view === "governance" ? (
            <GovernanceView
              project={selectedProject}
              raidItems={raidItems.filter(
                (item) =>
                  String(item.project_id) === String(selectedProject.id),
              )}
              decisions={decisions.filter(
                (item) =>
                  String(item.project_id) === String(selectedProject.id),
              )}
              onAddRaid={addRaid}
              onAddDecision={addDecision}
              signedIn={!!user}
            />
          ) : view === "activity" ? (
            <ActivityView activities={activities} members={members} />
          ) : projects.length === 0 ? (
            <section className="empty-workspace">
              <div className="empty-workspace-icon">
                <Sparkles size={24} />
              </div>
              <span>START FRESH</span>
              <h1>Create your first project</h1>
              <p>
                Start with a blank project or ask Gemini to build the plan,
                tasks, and timeline from a short description.
              </p>
              <div>
                <button
                  className="primary"
                  onClick={() => {
                    setProjectError("");
                    setShowNewProject(true);
                  }}
                >
                  <Plus size={17} />
                  Create project
                </button>
                <button
                  className="ai-button"
                  onClick={() => {
                    setAiDraft(null);
                    setAiError("");
                    setShowAiBuilder(true);
                  }}
                >
                  <WandSparkles size={17} />
                  Build with AI
                </button>
              </div>
            </section>
          ) : (
            <>
              <div className="eyebrow">
                <span className={`project-dot ${selectedProject.color}`} />
                {selectedProject.name.toUpperCase()}
              </div>
              <div className="title-row">
                <div>
                  <h1>
                    {view === "plan"
                      ? "Plan on a page"
                      : view === "report"
                        ? "Project slides"
                        : "Project overview"}
                  </h1>
                  <p>
                    {view === "plan"
                      ? "The whole project—from discovery to launch—in one visual view."
                      : view === "report"
                        ? "Choose the visuals that tell the clearest project story."
                        : "Track progress, priorities, and delivery in one place."}
                  </p>
                </div>
                {view !== "report" && (
                  <div className="title-actions">
                    <button
                      className="ai-button"
                      onClick={() => {
                        setAiDraft(null);
                        setAiError("");
                        setShowAiBuilder(true);
                      }}
                    >
                      <WandSparkles size={17} />
                      Build with AI
                    </button>
                    <button
                      className="primary"
                      onClick={() => setShowNew(true)}
                    >
                      <Plus size={17} />
                      New task
                    </button>
                  </div>
                )}
              </div>

              {view === "report" ? (
                <ReportStudio project={selectedProject} tasks={projectTasks} />
              ) : view === "plan" ? (
                <PlanView
                  key={selectedProject.id}
                  project={selectedProject}
                  tasks={projectTasks}
                  progress={progress}
                  onOpenTask={setSelectedTask}
                  onUpdateNotes={updateProjectNotes}
                />
              ) : (
                <>
                  <section className="health-strip">
                    <div>
                      <span>OVERALL HEALTH</span>
                      <b
                        className={
                          raidItems.filter(
                            (item) =>
                              String(item.project_id) ===
                                String(selectedProject.id) &&
                              item.status !== "Closed" &&
                              item.impact === "High",
                          ).length
                            ? "health-amber"
                            : "health-green"
                        }
                      >
                        {raidItems.filter(
                          (item) =>
                            String(item.project_id) ===
                              String(selectedProject.id) &&
                            item.status !== "Closed" &&
                            item.impact === "High",
                        ).length
                          ? "Needs attention"
                          : "On track"}
                      </b>
                    </div>
                    <div>
                      <span>DELIVERY</span>
                      <strong>{progress}%</strong>
                      <small>complete</small>
                    </div>
                    <div>
                      <span>OPEN RISKS & ISSUES</span>
                      <strong>
                        {
                          raidItems.filter(
                            (item) =>
                              String(item.project_id) ===
                                String(selectedProject.id) &&
                              item.status !== "Closed" &&
                              ["Risk", "Issue"].includes(item.kind),
                          ).length
                        }
                      </strong>
                      <small>active</small>
                    </div>
                    <div>
                      <span>BLOCKED TASKS</span>
                      <strong>
                        {
                          dependencies.filter(
                            (dependency) =>
                              projectTasks.some(
                                (task) => task.id === dependency.task_id,
                              ) &&
                              tasks.find(
                                (task) =>
                                  task.id === dependency.depends_on_task_id,
                              )?.status !== "done",
                          ).length
                        }
                      </strong>
                      <small>waiting</small>
                    </div>
                  </section>
                  <section className="summary-grid">
                    <article className="summary-card">
                      <div className="summary-label">
                        <span>Project progress</span>
                        <span className="trend">On track</span>
                      </div>
                      <strong>{progress}%</strong>
                      <div className="progress-track">
                        <span style={{ width: `${progress}%` }} />
                      </div>
                      <small>
                        {completed} of {projectTasks.length} tasks completed
                      </small>
                    </article>
                    <article className="summary-card">
                      <div className="summary-label">
                        <span>Open tasks</span>
                        <ListTodo size={18} />
                      </div>
                      <strong>{projectTasks.length - completed}</strong>
                      <small>
                        <b>
                          {
                            projectTasks.filter(
                              (t) =>
                                t.priority === "High" && t.status !== "done",
                            ).length
                          }{" "}
                          high priority
                        </b>{" "}
                        need attention
                      </small>
                    </article>
                    <article className="summary-card">
                      <div className="summary-label">
                        <span>Team</span>
                        <Users size={18} />
                      </div>
                      <div className="large-avatars">
                        {teamInitials.length ? (
                          teamInitials.map((i, index) => (
                            <span className="avatar" key={`${i}-${index}`}>
                              {i}
                            </span>
                          ))
                        ) : (
                          <span className="empty-metric">—</span>
                        )}
                      </div>
                      <small>
                        {teamInitials.length
                          ? `${teamInitials.length} contributor${teamInitials.length === 1 ? "" : "s"} assigned`
                          : "No contributors assigned"}
                      </small>
                    </article>
                    <article className="summary-card">
                      <div className="summary-label">
                        <span>Next task</span>
                        <CalendarDays size={18} />
                      </div>
                      <strong className="milestone">
                        {nextTask?.title || "Nothing scheduled"}
                      </strong>
                      <small>
                        <Clock3 size={13} />{" "}
                        {nextTask?.due || "Add a task to begin"}
                      </small>
                    </article>
                  </section>

                  <section className="board-section" id="board">
                    <div className="board-toolbar">
                      <div>
                        <h2>Project board</h2>
                        <p>Drag tasks between columns as work progresses.</p>
                      </div>
                      <div className="filters">
                        <button
                          className={filter === "All" ? "active" : ""}
                          onClick={() => setFilter("All")}
                        >
                          All tasks
                        </button>
                        {(["High", "Medium", "Low"] as Priority[]).map((p) => (
                          <button
                            key={p}
                            className={filter === p ? "active" : ""}
                            onClick={() => setFilter(p)}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="board">
                      {columns.map((column) => {
                        const items = visibleTasks.filter(
                          (t) => t.status === column.id,
                        );
                        return (
                          <div
                            className="column"
                            key={column.id}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => {
                              if (dragged) moveTask(dragged, column.id);
                              setDragged(null);
                            }}
                          >
                            <div className="column-head">
                              <div>
                                <span className={`status-dot ${column.tone}`} />
                                {column.label}
                                <span className="column-count">
                                  {items.length}
                                </span>
                              </div>
                              <button
                                onClick={() => setShowNew(true)}
                                aria-label={`Add task to ${column.label}`}
                              >
                                <Plus size={16} />
                              </button>
                            </div>
                            <div className="cards">
                              {items.map((task) => (
                                <article
                                  className="task-card"
                                  draggable
                                  key={task.id}
                                  onDragStart={() => setDragged(task.id)}
                                  onClick={() => setSelectedTask(task)}
                                >
                                  <div className="task-top">
                                    <span className="tag">{task.tag}</span>
                                  </div>
                                  <h3>{task.title}</h3>
                                  <p>{task.description}</p>
                                  <div className="task-meta">
                                    <span
                                      className={`priority ${task.priority.toLowerCase()}`}
                                    >
                                      {task.priority}
                                    </span>
                                    <span
                                      className={
                                        task.due === "Today"
                                          ? "due urgent"
                                          : "due"
                                      }
                                    >
                                      <CalendarDays size={13} />
                                      {task.due}
                                    </span>
                                  </div>
                                  <div className="task-footer">
                                    <span className="assignee-chip">
                                      <span className="avatar">
                                        {initials(task.assignee)}
                                      </span>
                                      {task.assignee || "Unassigned"}
                                    </span>
                                    {task.status === "done" && (
                                      <span className="complete">
                                        <Check size={13} /> Complete
                                      </span>
                                    )}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        removeTask(task.id);
                                      }}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </article>
                              ))}
                              <button
                                className="add-card"
                                onClick={() => setShowNew(true)}
                              >
                                <Plus size={16} />
                                Add task
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </>
              )}
            </>
          )}
        </div>
      </main>

      {showNew && (
        <div className="modal-backdrop" onMouseDown={() => setShowNew(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span>NEW TASK</span>
                <h2>What needs to be done?</h2>
              </div>
              <button onClick={() => setShowNew(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={addTask}>
              <label>
                Task name
                <input
                  name="title"
                  required
                  autoFocus
                  placeholder="e.g. Prepare launch announcement"
                />
              </label>
              <label>
                Description
                <textarea
                  name="description"
                  rows={3}
                  placeholder="Add context or a clear outcome…"
                />
              </label>
              <div className="form-grid">
                <label>
                  Priority
                  <select name="priority" defaultValue="Medium">
                    <option>Low</option>
                    <option>Medium</option>
                    <option>High</option>
                  </select>
                </label>
                <label>
                  Assignee
                  <select name="assignee" defaultValue={profile?.username || ""}>
                    <option value="">Unassigned</option>
                    {members.map((member) => (
                      <option key={member.user_id} value={member.username}>
                        {member.username}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Due date
                  <input name="due" placeholder="e.g. Friday" />
                </label>
                <label>
                  Category
                  <input name="tag" placeholder="e.g. Design" />
                </label>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="cancel"
                  onClick={() => setShowNew(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary">
                  <Plus size={17} />
                  Create task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {selectedTask && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setSelectedTask(null)}
        >
          <div
            className="modal task-detail-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <span>TASK DETAILS</span>
                <h2>Edit task</h2>
              </div>
              <button onClick={() => setSelectedTask(null)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={updateTask}>
              <label>
                Task name
                <input
                  name="title"
                  required
                  autoFocus
                  defaultValue={selectedTask.title}
                />
              </label>
              <label>
                Description
                <textarea
                  name="description"
                  rows={4}
                  defaultValue={selectedTask.description}
                />
              </label>
              <div className="form-grid">
                <label>
                  Status
                  <select name="status" defaultValue={selectedTask.status}>
                    {columns.map((column) => (
                      <option key={column.id} value={column.id}>
                        {column.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Priority
                  <select name="priority" defaultValue={selectedTask.priority}>
                    <option>Low</option>
                    <option>Medium</option>
                    <option>High</option>
                  </select>
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Assignee
                  <select
                    name="assignee"
                    defaultValue={selectedTask.assignee}
                  >
                    <option value="">Unassigned</option>
                    {selectedTask.assignee &&
                      !members.some(
                        (member) =>
                          member.username.toLowerCase() ===
                          selectedTask.assignee.toLowerCase(),
                      ) && (
                        <option value={selectedTask.assignee}>
                          {selectedTask.assignee} (legacy)
                        </option>
                      )}
                    {members.map((member) => (
                      <option key={member.user_id} value={member.username}>
                        {member.username}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Due date
                  <input name="due" defaultValue={selectedTask.due} />
                </label>
              </div>
              <label>
                Category
                <input name="tag" defaultValue={selectedTask.tag} />
              </label>
              <label>
                <span className="label-with-icon">
                  <GitBranch size={13} />
                  Depends on
                </span>
                <select
                  value={
                    dependencies.find(
                      (item) => item.task_id === selectedTask.id,
                    )?.depends_on_task_id || ""
                  }
                  onChange={(event) =>
                    setDependency(
                      selectedTask.id,
                      event.target.value ? Number(event.target.value) : null,
                    )
                  }
                >
                  <option value="">No dependency</option>
                  {projectTasks
                    .filter((task) => task.id !== selectedTask.id)
                    .map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.title}
                        {task.status === "done" ? " — complete" : ""}
                      </option>
                    ))}
                </select>
              </label>
              <div className="modal-actions split-actions">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => duplicateTask(selectedTask)}
                >
                  Duplicate
                </button>
                <span />
                <button
                  type="button"
                  className="cancel"
                  onClick={() => setSelectedTask(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary">
                  <Check size={17} />
                  Save changes
                </button>
              </div>
            </form>
            <TaskComments
              task={selectedTask}
              comments={comments.filter(
                (comment) => comment.task_id === selectedTask.id,
              )}
              members={members}
              onAdd={addComment}
              signedIn={!!user}
            />
          </div>
        </div>
      )}
      {showNewProject && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setShowNewProject(false)}
        >
          <div
            className="modal auth-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <span>NEW PROJECT</span>
                <h2>Create a project</h2>
              </div>
              <button onClick={() => setShowNewProject(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={addProject}>
              <label>
                Project name
                <input
                  name="name"
                  required
                  autoFocus
                  maxLength={80}
                  placeholder="e.g. Customer portal"
                />
              </label>
              <label>
                Description
                <textarea
                  name="description"
                  rows={3}
                  placeholder="What outcome will this project deliver?"
                />
              </label>
              <label>
                Colour
                <select name="color">
                  <option value="violet">Violet</option>
                  <option value="coral">Coral</option>
                  <option value="mint">Mint</option>
                </select>
              </label>
              {projectError && (
                <div className="form-error" role="alert">
                  {projectError}
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="cancel"
                  onClick={() => setShowNewProject(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary">
                  <Plus size={17} />
                  Create project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showAiBuilder && (
        <div
          className="modal-backdrop"
          onMouseDown={() => !aiBusy && setShowAiBuilder(false)}
        >
          <div
            className="modal ai-builder"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <span>AI PROJECT BUILDER</span>
                <h2>Turn an idea into a project</h2>
              </div>
              <button disabled={aiBusy} onClick={() => setShowAiBuilder(false)}>
                <X size={20} />
              </button>
            </div>
            {!aiDraft ? (
              <form onSubmit={generateProject}>
                <p className="auth-copy">
                  Describe the outcome, audience, constraints, and anything that
                  must be included. Gemini will draft the project plan for your
                  review.
                </p>
                <label>
                  What are you planning?
                  <textarea
                    name="prompt"
                    required
                    minLength={15}
                    rows={6}
                    autoFocus
                    placeholder="Example: Build a national outage viewer showing disruptive works and severe weather. Include data discovery, interactive mapping, alerting, accessibility testing, and launch."
                  />
                </label>
                <label>
                  Planning horizon
                  <select name="horizon" defaultValue="8 weeks">
                    <option>4 weeks</option>
                    <option>8 weeks</option>
                    <option>6 months</option>
                    <option>1 year</option>
                  </select>
                </label>
                {aiError && (
                  <div className="form-error" role="alert">
                    {aiError}
                  </div>
                )}
                {!user && (
                  <button
                    type="button"
                    className="auth-switch ai-signin"
                    onClick={() => {
                      setShowAiBuilder(false);
                      setShowAuth(true);
                    }}
                  >
                    Sign in to enable AI generation
                  </button>
                )}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="cancel"
                    disabled={aiBusy}
                    onClick={() => setShowAiBuilder(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="primary"
                    disabled={aiBusy || !user}
                  >
                    {aiBusy ? (
                      <LoaderCircle size={17} className="spin" />
                    ) : (
                      <WandSparkles size={17} />
                    )}
                    {aiBusy ? "Building your plan…" : "Generate project"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="ai-preview">
                <div className="ai-preview-hero">
                  <span className={`project-dot ${aiDraft.color}`} />
                  <div>
                    <small>GENERATED DRAFT</small>
                    <h3>{aiDraft.name}</h3>
                    <p>{aiDraft.description}</p>
                  </div>
                </div>
                <div className="ai-preview-stats">
                  <span>
                    <b>{aiDraft.phases.length}</b> phases
                  </span>
                  <span>
                    <b>{aiDraft.tasks.length}</b> tasks
                  </span>
                  <span>
                    <b>
                      {
                        aiDraft.tasks.filter((task) => task.priority === "High")
                          .length
                      }
                    </b>{" "}
                    high priority
                  </span>
                </div>
                <div className="ai-phase-preview">
                  {aiDraft.phases.map((phase, index) => (
                    <div key={phase.name}>
                      <span>{index + 1}</span>
                      <b>{phase.name}</b>
                      <small>{phase.durationDays} days</small>
                    </div>
                  ))}
                </div>
                {aiError && (
                  <div className="form-error" role="alert">
                    {aiError}
                  </div>
                )}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="cancel"
                    onClick={() => setAiDraft(null)}
                  >
                    Start again
                  </button>
                  <button
                    type="button"
                    className="primary"
                    disabled={aiBusy}
                    onClick={createAiProject}
                  >
                    {aiBusy ? (
                      <LoaderCircle size={17} className="spin" />
                    ) : (
                      <Check size={17} />
                    )}
                    {aiBusy ? "Creating…" : "Create this project"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {showAuth && (
        <AuthModal onClose={() => setShowAuth(false)} onNotice={setNotice} />
      )}
      {user && profile?.must_change_password && (
        <PasswordChangeModal
          onChanged={() => {
            setProfile((current) =>
              current ? { ...current, must_change_password: false } : current,
            );
            setNotice("Password updated. Welcome to Northstar.");
          }}
        />
      )}
    </div>
  );
}

type Horizon = "4w" | "8w" | "6m" | "1y" | "custom";
type PlanPhase = { name: string; start: string; end: string };
type PlanConfig = {
  horizon: Horizon;
  start: string;
  end: string;
  phases: PlanPhase[];
};

const initialPlan: PlanConfig = {
  horizon: "4w",
  start: "2026-10-05",
  end: "2026-11-01",
  phases: [
    { name: "Discover", start: "2026-10-05", end: "2026-10-09" },
    { name: "Design", start: "2026-10-10", end: "2026-10-18" },
    { name: "Validate", start: "2026-10-19", end: "2026-10-25" },
    { name: "Launch", start: "2026-10-26", end: "2026-11-01" },
  ],
};

type ReportVisual = "progress" | "status" | "priority" | "timeline" | "tasks";
const reportOptions: {
  id: ReportVisual;
  label: string;
  description: string;
}[] = [
  {
    id: "progress",
    label: "Progress",
    description: "Completion and open work",
  },
  {
    id: "status",
    label: "Task status",
    description: "Work across board stages",
  },
  {
    id: "priority",
    label: "Priorities",
    description: "High, medium, and low tasks",
  },
  {
    id: "timeline",
    label: "Timeline",
    description: "Delivery phases and dates",
  },
  { id: "tasks", label: "Task list", description: "Detailed active work" },
];

function ReportStudio({ project, tasks }: { project: Project; tasks: Task[] }) {
  const [selected, setSelected] = useState<ReportVisual[]>([
    "progress",
    "status",
    "priority",
    "timeline",
  ]);
  const [exporting, setExporting] = useState<"pptx" | "png" | null>(null);
  const slideRef = useRef<HTMLDivElement>(null);
  const done = tasks.filter((task) => task.status === "done").length;
  const progress = Math.round((done / Math.max(tasks.length, 1)) * 100);
  const statuses = columns.map((column) => ({
    ...column,
    count: tasks.filter((task) => task.status === column.id).length,
  }));
  const priorities = (["High", "Medium", "Low"] as Priority[]).map(
    (priority) => ({
      priority,
      count: tasks.filter((task) => task.priority === priority).length,
    }),
  );
  const plan = JSON.parse(
    localStorage.getItem(`northstar-plan-${project.id}`) ||
      JSON.stringify(initialPlan),
  ) as PlanConfig;

  function toggleVisual(id: ReportVisual) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }
  function safeName() {
    return (
      project.name
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase() || "project"
    );
  }

  async function exportPptx() {
    setExporting("pptx");
    try {
      const { default: PptxGenJS } = await import("pptxgenjs");
      const pptx: any = new PptxGenJS();
      pptx.layout = "LAYOUT_WIDE";
      pptx.author = "Northstar";
      pptx.subject = `${project.name} project report`;
      pptx.title = project.name;
      pptx.theme = {
        headFontFace: "Aptos Display",
        bodyFontFace: "Aptos",
        lang: "en-GB",
      };
      const ink = "172421",
        muted = "687570",
        coral = "E76F51",
        green = "58A184",
        blue = "5E8FC5",
        amber = "D79B45",
        bg = "F7F8F5";
      const addTitle = (slide: any, title: string, subtitle: string) => {
        slide.background = { color: bg };
        slide.addText(title, {
          x: 0.7,
          y: 0.45,
          w: 8.8,
          h: 0.45,
          fontFace: "Aptos Display",
          fontSize: 26,
          bold: true,
          color: ink,
          margin: 0,
        });
        slide.addText(subtitle, {
          x: 0.7,
          y: 0.98,
          w: 9,
          h: 0.28,
          fontSize: 11,
          color: muted,
          margin: 0,
        });
        slide.addText(project.name.toUpperCase(), {
          x: 10.7,
          y: 0.55,
          w: 1.9,
          h: 0.2,
          fontSize: 8,
          color: coral,
          bold: true,
          align: "right",
          charSpacing: 1.5,
          margin: 0,
        });
      };
      const cover = pptx.addSlide();
      cover.background = { color: ink };
      cover.addText(project.name, {
        x: 0.8,
        y: 2.3,
        w: 8.8,
        h: 0.8,
        fontFace: "Aptos Display",
        fontSize: 34,
        bold: true,
        color: "FFFFFF",
        margin: 0,
      });
      cover.addText(project.description || "Project status report", {
        x: 0.82,
        y: 3.2,
        w: 7.5,
        h: 0.55,
        fontSize: 17,
        color: "CAD2CF",
        margin: 0,
      });
      cover.addText("NORTHSTAR PROJECT REPORT", {
        x: 0.82,
        y: 1.72,
        w: 4,
        h: 0.25,
        fontSize: 10,
        bold: true,
        color: "F08A70",
        charSpacing: 1.8,
        margin: 0,
      });
      cover.addText(
        new Intl.DateTimeFormat("en-GB", { dateStyle: "long" }).format(
          new Date(),
        ),
        {
          x: 0.82,
          y: 6.75,
          w: 3.5,
          h: 0.25,
          fontSize: 10,
          color: "93A09C",
          margin: 0,
        },
      );
      if (selected.includes("progress")) {
        const slide = pptx.addSlide();
        addTitle(
          slide,
          `${progress}% of tasks complete`,
          `${done} complete and ${tasks.length - done} still open`,
        );
        slide.addChart(
          pptx.ChartType.doughnut,
          [
            {
              name: "Tasks",
              labels: ["Complete", "Open"],
              values: [done, Math.max(tasks.length - done, 0)],
            },
          ],
          {
            x: 0.8,
            y: 1.55,
            w: 5.2,
            h: 4.8,
            holeSize: 72,
            showLegend: false,
            showTitle: false,
            chartColors: [green, "E5E9E4"],
            showValue: false,
            showPercent: false,
            border: { color: bg },
          },
        );
        slide.addText(`${progress}%`, {
          x: 2.25,
          y: 3.35,
          w: 2.3,
          h: 0.7,
          fontSize: 32,
          bold: true,
          color: ink,
          align: "center",
          margin: 0,
        });
        slide.addText("Current focus", {
          x: 7.1,
          y: 2.1,
          w: 4.5,
          h: 0.35,
          fontSize: 13,
          bold: true,
          color: coral,
          margin: 0,
        });
        slide.addText(
          tasks
            .filter((task) => task.status !== "done")
            .slice(0, 4)
            .map((task) => ({
              text: task.title,
              options: { bullet: { indent: 16 }, breakLine: true },
            })),
          {
            x: 7.1,
            y: 2.65,
            w: 4.8,
            h: 2.7,
            fontSize: 18,
            color: ink,
            breakLine: true,
            paraSpaceAfterPt: 13,
            margin: 0,
          },
        );
      }
      if (selected.includes("status")) {
        const slide = pptx.addSlide();
        addTitle(
          slide,
          "Tasks by delivery stage",
          `${tasks.length} tasks across the project board`,
        );
        slide.addChart(
          pptx.ChartType.bar,
          [
            {
              name: "Tasks",
              labels: statuses.map((item) => item.label),
              values: statuses.map((item) => item.count),
            },
          ],
          {
            x: 1,
            y: 1.55,
            w: 11.2,
            h: 4.9,
            barDir: "bar",
            catAxisLabelFontSize: 15,
            valAxisLabelFontSize: 12,
            showLegend: false,
            showTitle: false,
            showValue: true,
            chartColors: [blue],
            showCatName: false,
            showValAxisTitle: false,
            showCatAxisTitle: false,
            valGridLine: { color: "DDE2DC", width: 1 },
            showBorder: false,
          },
        );
      }
      if (selected.includes("priority")) {
        const slide = pptx.addSlide();
        addTitle(slide, "Task priority", "Current workload by urgency");
        slide.addChart(
          pptx.ChartType.bar,
          [
            {
              name: "Tasks",
              labels: priorities.map((item) => item.priority),
              values: priorities.map((item) => item.count),
            },
          ],
          {
            x: 1.15,
            y: 1.5,
            w: 10.9,
            h: 4.95,
            barDir: "col",
            catAxisLabelFontSize: 16,
            valAxisLabelFontSize: 12,
            showLegend: false,
            showTitle: false,
            showValue: true,
            chartColors: [coral],
            valGridLine: { color: "DDE2DC", width: 1 },
            showBorder: false,
          },
        );
      }
      if (selected.includes("timeline")) {
        const slide = pptx.addSlide();
        addTitle(slide, "Delivery timeline", `${plan.start} to ${plan.end}`);
        const colors = ["DCE2DD", "DCE9F5", "F8EAD7", "DCEEE7"];
        plan.phases.slice(0, 6).forEach((phase, index) => {
          const y = 1.7 + index * 0.78;
          const x = 3.25 + index * 1.45;
          slide.addText(phase.name, {
            x: 0.85,
            y,
            w: 2.2,
            h: 0.3,
            fontSize: 15,
            bold: true,
            color: ink,
            margin: 0,
          });
          slide.addText(`${phase.start} to ${phase.end}`, {
            x: 0.85,
            y: y + 0.32,
            w: 2.2,
            h: 0.22,
            fontSize: 9,
            color: muted,
            margin: 0,
          });
          slide.addShape(pptx.ShapeType.roundRect, {
            x,
            y: y + 0.08,
            w: 2.1,
            h: 0.42,
            rectRadius: 0.06,
            fill: { color: colors[index % colors.length] },
            line: { color: colors[index % colors.length] },
          });
          slide.addText(phase.name, {
            x: x + 0.15,
            y: y + 0.16,
            w: 1.8,
            h: 0.18,
            fontSize: 10,
            bold: true,
            color: ink,
            margin: 0,
          });
        });
      }
      if (selected.includes("tasks")) {
        const slide = pptx.addSlide();
        addTitle(slide, "Active task list", "Priority, owner, and due date");
        const rows = [
          ["Task", "Status", "Priority", "Owner", "Due"],
          ...tasks
            .slice(0, 12)
            .map((task) => [
              task.title,
              columns.find((column) => column.id === task.status)?.label ||
                task.status,
              task.priority,
              task.assignee,
              task.due,
            ]),
        ];
        slide.addTable(rows, {
          x: 0.7,
          y: 1.45,
          w: 11.9,
          h: 5.4,
          border: { type: "solid", color: "DDE2DC", pt: 1 },
          fill: "FFFFFF",
          color: ink,
          fontSize: 12,
          margin: 0.08,
          rowH: 0.36,
          colW: [5.5, 1.8, 1.5, 1.1, 1.6],
          bold: false,
          autoFit: false,
          valign: "mid",
        });
      }
      await pptx.writeFile({ fileName: `${safeName()}-report.pptx` });
    } finally {
      setExporting(null);
    }
  }

  async function exportPng() {
    if (!slideRef.current) return;
    setExporting("png");
    try {
      const { toPng } = await import("html-to-image");
      const url = await toPng(slideRef.current, {
        pixelRatio: 2.5,
        backgroundColor: "#f7f8f5",
      });
      const link = document.createElement("a");
      link.download = `${safeName()}-snapshot.png`;
      link.href = url;
      link.click();
    } finally {
      setExporting(null);
    }
  }

  return (
    <section className="report-studio">
      <aside className="visual-picker">
        <div>
          <span>REPORT CONTENT</span>
          <h2>Select visuals</h2>
          <p>Choose what appears in the snapshot and PowerPoint.</p>
        </div>
        {reportOptions.map((option) => (
          <label
            key={option.id}
            className={selected.includes(option.id) ? "selected" : ""}
          >
            <input
              type="checkbox"
              checked={selected.includes(option.id)}
              onChange={() => toggleVisual(option.id)}
            />
            <span>
              <b>{option.label}</b>
              <small>{option.description}</small>
            </span>
          </label>
        ))}
        <small className="selection-count">
          {selected.length} visual{selected.length === 1 ? "" : "s"} selected
        </small>
      </aside>
      <div className="report-canvas-wrap">
        <div className="report-actions">
          <span>16:9 presentation preview</span>
          <div>
            <button
              onClick={exportPng}
              disabled={!selected.length || !!exporting}
            >
              <Image size={15} />
              {exporting === "png" ? "Exporting…" : "Export PNG"}
            </button>
            <button
              className="primary"
              onClick={exportPptx}
              disabled={!selected.length || !!exporting}
            >
              <Download size={15} />
              {exporting === "pptx" ? "Building deck…" : "Export PowerPoint"}
            </button>
          </div>
        </div>
        <div className="slide-preview" ref={slideRef}>
          <header>
            <div>
              <span>NORTHSTAR PROJECT REPORT</span>
              <h2>{project.name}</h2>
              <p>{project.description || "Project status overview"}</p>
            </div>
            <b>
              {new Intl.DateTimeFormat("en-GB", {
                month: "short",
                year: "numeric",
              }).format(new Date())}
            </b>
          </header>
          <div
            className={`slide-visuals count-${Math.min(selected.length, 5)}`}
          >
            {selected.includes("progress") && (
              <article className="slide-progress">
                <div
                  className="mini-ring"
                  style={
                    { "--progress": `${progress * 3.6}deg` } as CSSProperties
                  }
                >
                  <span>{progress}%</span>
                </div>
                <div>
                  <small>PROGRESS</small>
                  <strong>
                    {done} of {tasks.length} complete
                  </strong>
                  <p>{tasks.length - done} tasks remain open</p>
                </div>
              </article>
            )}
            {selected.includes("status") && (
              <article>
                <small>TASK STATUS</small>
                <div className="mini-bars">
                  {statuses.map((item) => (
                    <div key={item.id}>
                      <span>{item.label}</span>
                      <i>
                        <b
                          className={item.tone}
                          style={{
                            width: `${(item.count / Math.max(tasks.length, 1)) * 100}%`,
                          }}
                        />
                      </i>
                      <em>{item.count}</em>
                    </div>
                  ))}
                </div>
              </article>
            )}
            {selected.includes("priority") && (
              <article>
                <small>PRIORITIES</small>
                <div className="priority-columns">
                  {priorities.map((item) => (
                    <div key={item.priority}>
                      <b
                        style={{
                          height: `${Math.max(12, (item.count / Math.max(...priorities.map((p) => p.count), 1)) * 76)}%`,
                        }}
                      />
                      <span>{item.priority}</span>
                      <em>{item.count}</em>
                    </div>
                  ))}
                </div>
              </article>
            )}
            {selected.includes("timeline") && (
              <article className="slide-timeline">
                <small>TIMELINE</small>
                {plan.phases.slice(0, 4).map((phase, index) => (
                  <div key={phase.name}>
                    <span>{phase.name}</span>
                    <i className={`phase-${index + 1}`} />
                    <em>{phase.end}</em>
                  </div>
                ))}
              </article>
            )}
            {selected.includes("tasks") && (
              <article className="slide-tasks">
                <small>ACTIVE TASKS</small>
                {tasks
                  .filter((task) => task.status !== "done")
                  .slice(0, 5)
                  .map((task) => (
                    <div key={task.id}>
                      <b>{task.title}</b>
                      <span>
                        {task.priority} · {task.assignee} · {task.due}
                      </span>
                    </div>
                  ))}
              </article>
            )}
          </div>
          <footer>
            <span>{tasks.length} tasks</span>
            <span>
              {
                tasks.filter(
                  (task) => task.priority === "High" && task.status !== "done",
                ).length
              }{" "}
              high priority
            </span>
            <span>{plan.phases.length} phases</span>
          </footer>
        </div>
      </div>
    </section>
  );
}

function PlanView({
  project,
  tasks,
  progress,
  onOpenTask,
  onUpdateNotes,
}: {
  project: Project;
  tasks: Task[];
  progress: number;
  onOpenTask: (task: Task) => void;
  onUpdateNotes: (notes: string) => void;
}) {
  const [plan, setPlan] = useState<PlanConfig>(() => {
    const saved = localStorage.getItem(`northstar-plan-${project.id}`);
    return saved ? JSON.parse(saved) : initialPlan;
  });
  const [draft, setDraft] = useState<PlanConfig>(plan);
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(project.notes || "");
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const statusCounts = columns.map((column) => ({
    ...column,
    count: tasks.filter((task) => task.status === column.id).length,
  }));
  const highPriority = tasks.filter(
    (task) => task.priority === "High" && task.status !== "done",
  );
  const nextTask = tasks.find((task) => task.status !== "done");
  const day = 86400000;
  const startMs = new Date(`${plan.start}T00:00:00Z`).getTime();
  const endMs = new Date(`${plan.end}T00:00:00Z`).getTime();
  const totalMs = Math.max(endMs - startMs, day);
  const dateFormatter = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: plan.horizon === "1y" ? "2-digit" : undefined,
    timeZone: "UTC",
  });
  const formatDate = (value: string | number) =>
    dateFormatter.format(
      typeof value === "number"
        ? new Date(value)
        : new Date(`${value}T00:00:00Z`),
    );
  const axisLabels = Array.from({ length: 5 }, (_, index) =>
    formatDate(startMs + (totalMs * index) / 4),
  );

  function setHorizon(horizon: Horizon) {
    if (horizon === "custom") {
      setDraft({ ...plan, horizon });
      setEditing(true);
      return;
    }
    const days =
      horizon === "4w"
        ? 27
        : horizon === "8w"
          ? 55
          : horizon === "6m"
            ? 182
            : 364;
    const newEnd = new Date(startMs + days * day).toISOString().slice(0, 10);
    const next = { ...plan, horizon, end: newEnd };
    setPlan(next);
    localStorage.setItem(`northstar-plan-${project.id}`, JSON.stringify(next));
  }

  function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (new Date(draft.end) <= new Date(draft.start)) return;
    setPlan(draft);
    localStorage.setItem(`northstar-plan-${project.id}`, JSON.stringify(draft));
    setEditing(false);
  }

  function editPlan() {
    setDraft(plan);
    setEditing(true);
  }

  function formatNotes(prefix: string, suffix = prefix, placeholder = "text") {
    const input = notesRef.current;
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const selected = notes.slice(start, end) || placeholder;
    const next = `${notes.slice(0, start)}${prefix}${selected}${suffix}${notes.slice(end)}`;
    setNotes(next);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(
        start + prefix.length,
        start + prefix.length + selected.length,
      );
    });
  }

  return (
    <section className="plan-page" aria-label="Project plan overview">
      <div className="plan-kpis">
        <article className="plan-progress-card">
          <div
            className="progress-ring"
            style={{ "--progress": `${progress * 3.6}deg` } as CSSProperties}
          >
            <span>{progress}%</span>
          </div>
          <div>
            <small>OVERALL PROGRESS</small>
            <h2>Project is on track</h2>
            <p>
              {tasks.filter((task) => task.status === "done").length} of{" "}
              {tasks.length} deliverables complete
            </p>
          </div>
        </article>
        <article className="plan-stat">
          <Flag size={18} />
          <div>
            <small>NEXT MILESTONE</small>
            <strong>Design sign-off</strong>
            <span>Friday, 16 October</span>
          </div>
        </article>
        <article className="plan-stat">
          <Target size={18} />
          <div>
            <small>FOCUS</small>
            <strong>{highPriority.length} high-priority tasks</strong>
            <span>
              {nextTask ? `Next: ${nextTask.title}` : "Everything is complete"}
            </span>
          </div>
        </article>
      </div>

      <article className="roadmap-panel">
        <div className="panel-heading roadmap-heading">
          <div>
            <span>ROADMAP</span>
            <h2>Delivery timeline</h2>
          </div>
          <div className="roadmap-actions">
            <div className="horizon-picker" aria-label="Timeline range">
              {(
                [
                  ["4w", "4 weeks"],
                  ["8w", "8 weeks"],
                  ["6m", "6 months"],
                  ["1y", "1 year"],
                ] as [Horizon, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  className={plan.horizon === value ? "active" : ""}
                  onClick={() => setHorizon(value)}
                >
                  {label}
                </button>
              ))}
              <button
                className={plan.horizon === "custom" ? "active" : ""}
                onClick={() => setHorizon("custom")}
              >
                Custom
              </button>
            </div>
            <button className="edit-plan" onClick={editPlan}>
              <SlidersHorizontal size={14} />
              Edit plan
            </button>
          </div>
        </div>
        <div className="timeline-summary">
          <span>
            {formatDate(plan.start)} — {formatDate(plan.end)}
          </span>
          <small>{Math.ceil(totalMs / day)} days</small>
        </div>
        <div className="timeline-head">
          <span />
          {axisLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="timeline-grid">
          {plan.phases.map((phase, index) => (
            <div className="timeline-row" key={`${phase.name}-${index}`}>
              <div className="phase-label">
                <span
                  className={`status-dot ${columns[index % columns.length].tone}`}
                />
                <div>
                  <strong>{phase.name}</strong>
                  <small>
                    {formatDate(phase.start)}–{formatDate(phase.end)}
                  </small>
                </div>
              </div>
              <div className="timeline-track">
                <span
                  className={`phase-bar phase-${(index % 4) + 1}`}
                  style={{
                    left: `${Math.max(0, Math.min(100, ((new Date(`${phase.start}T00:00:00Z`).getTime() - startMs) / totalMs) * 100))}%`,
                    width: `${Math.max(2, Math.min(100, ((new Date(`${phase.end}T00:00:00Z`).getTime() - new Date(`${phase.start}T00:00:00Z`).getTime()) / totalMs) * 100))}%`,
                  }}
                >
                  {phase.name}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="milestone-line">
          <span>
            <Flag size={14} />
            Design sign-off
          </span>
          <span>
            <Flag size={14} />
            Go live
          </span>
        </div>
      </article>

      <div className="plan-bottom-grid">
        <article className="workload-panel">
          <div className="panel-heading">
            <div>
              <span>WORK BREAKDOWN</span>
              <h2>Tasks by stage</h2>
            </div>
            <b>{tasks.length} total</b>
          </div>
          <div className="stacked-progress" aria-label="Task distribution">
            {statusCounts.map((item) => (
              <span
                key={item.id}
                className={item.tone}
                style={{
                  width: `${(item.count / Math.max(tasks.length, 1)) * 100}%`,
                }}
              />
            ))}
          </div>
          <div className="stage-list">
            {statusCounts.map((item) => (
              <div key={item.id}>
                <span className={`status-dot ${item.tone}`} />
                <span>{item.label}</span>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
        </article>
        <article className="focus-panel">
          <div className="panel-heading">
            <div>
              <span>PRIORITY QUEUE</span>
              <h2>Needs attention</h2>
            </div>
          </div>
          <div className="focus-list">
            {highPriority.length ? (
              highPriority.slice(0, 3).map((task) => (
                <button key={task.id} onClick={() => onOpenTask(task)}>
                  <span className="avatar">{initials(task.assignee)}</span>
                  <span>
                    <strong>{task.title}</strong>
                    <small>
                      {task.assignee || "Unassigned"} · {task.tag} · {task.due}
                    </small>
                  </span>
                  <ChevronDown size={15} />
                </button>
              ))
            ) : (
              <p className="empty-state">No high-priority work is waiting.</p>
            )}
          </div>
        </article>
      </div>
      <article className="notes-panel">
        <div className="panel-heading">
          <div>
            <span>PROJECT CANVAS</span>
            <h2>Plan notes</h2>
          </div>
          <span className="markdown-status">Markdown enabled</span>
        </div>
        <div className="markdown-toolbar" aria-label="Text formatting">
          <button onClick={() => formatNotes("## ", "", "Heading")}>H2</button>
          <button onClick={() => formatNotes("**", "**", "bold text")}>
            <b>B</b>
          </button>
          <button onClick={() => formatNotes("*", "*", "italic text")}>
            <i>I</i>
          </button>
          <button onClick={() => formatNotes("- ", "", "List item")}>
            • List
          </button>
          <button onClick={() => formatNotes("- [ ] ", "", "Task")}>
            ☐ Task
          </button>
          <button onClick={() => formatNotes("[", "](https://)", "link text")}>
            Link
          </button>
          <button onClick={() => formatNotes("> ", "", "Quote")}>
            ❝ Quote
          </button>
        </div>
        <div className="markdown-workspace">
          <label>
            <span>WRITE</span>
            <textarea
              ref={notesRef}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              onBlur={() => onUpdateNotes(notes)}
              placeholder="Write a project brief, decisions, meeting notes, or links…"
            />
          </label>
          <div className="markdown-preview">
            <span>PREVIEW</span>
            <div className="markdown-body">
              {notes.trim() ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {notes}
                </ReactMarkdown>
              ) : (
                <p className="empty-state">Formatted notes will appear here.</p>
              )}
            </div>
          </div>
        </div>
      </article>
      {editing && (
        <div className="modal-backdrop" onMouseDown={() => setEditing(false)}>
          <div
            className="modal plan-editor"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <span>PLAN SETTINGS</span>
                <h2>Edit timeline</h2>
              </div>
              <button onClick={() => setEditing(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={savePlan}>
              <div className="form-grid">
                <label>
                  Plan starts
                  <input
                    type="date"
                    value={draft.start}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        start: event.target.value,
                        horizon: "custom",
                      }))
                    }
                  />
                </label>
                <label>
                  Plan ends
                  <input
                    type="date"
                    value={draft.end}
                    min={draft.start}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        end: event.target.value,
                        horizon: "custom",
                      }))
                    }
                  />
                </label>
              </div>
              <div className="phase-editor">
                <div className="phase-editor-head">
                  <strong>Project phases</strong>
                  <span>Name and schedule</span>
                </div>
                {draft.phases.map((phase, index) => (
                  <div className="phase-editor-row" key={index}>
                    <span
                      className={`status-dot ${columns[index % columns.length].tone}`}
                    />
                    <input
                      aria-label={`Phase ${index + 1} name`}
                      value={phase.name}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          phases: current.phases.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        }))
                      }
                    />
                    <input
                      aria-label={`${phase.name} start`}
                      type="date"
                      value={phase.start}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          phases: current.phases.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, start: event.target.value }
                              : item,
                          ),
                        }))
                      }
                    />
                    <input
                      aria-label={`${phase.name} end`}
                      type="date"
                      value={phase.end}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          phases: current.phases.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, end: event.target.value }
                              : item,
                          ),
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="cancel"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary">
                  <Check size={17} />
                  Apply timeline
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

function PortfolioView({
  projects,
  tasks,
  raidItems,
  onSelect,
}: {
  projects: Project[];
  tasks: Task[];
  raidItems: RaidItem[];
  onSelect: (id: ProjectId) => void;
}) {
  const totals = {
    tasks: tasks.length,
    done: tasks.filter((task) => task.status === "done").length,
    risks: raidItems.filter(
      (item) =>
        item.status !== "Closed" && ["Risk", "Issue"].includes(item.kind),
    ).length,
  };
  return (
    <section className="portfolio-page">
      <header>
        <span>TRANSFORMATION AND READINESS</span>
        <h1>Portfolio overview</h1>
        <p>Health and delivery across every team project.</p>
      </header>
      <div className="portfolio-summary">
        <div>
          <small>PROJECTS</small>
          <b>{projects.length}</b>
        </div>
        <div>
          <small>TASKS COMPLETE</small>
          <b>
            {totals.done}/{totals.tasks}
          </b>
        </div>
        <div>
          <small>OPEN RISKS & ISSUES</small>
          <b>{totals.risks}</b>
        </div>
      </div>
      <div className="portfolio-grid">
        {projects.map((project) => {
          const projectTasks = tasks.filter(
            (task) => String(task.project_id) === String(project.id),
          );
          const done = projectTasks.filter(
            (task) => task.status === "done",
          ).length;
          const progress = Math.round(
            (done / Math.max(projectTasks.length, 1)) * 100,
          );
          const risks = raidItems.filter(
            (item) =>
              String(item.project_id) === String(project.id) &&
              item.status !== "Closed" &&
              ["Risk", "Issue"].includes(item.kind),
          );
          return (
            <button key={project.id} onClick={() => onSelect(project.id)}>
              <div className="portfolio-card-head">
                <span className={`project-dot ${project.color}`} />
                <b>{project.name}</b>
                <em
                  className={
                    risks.some((item) => item.impact === "High")
                      ? "amber"
                      : "green"
                  }
                >
                  {risks.some((item) => item.impact === "High")
                    ? "Attention"
                    : "On track"}
                </em>
              </div>
              <p>{project.description || "No description yet."}</p>
              <div className="portfolio-progress">
                <i>
                  <b style={{ width: `${progress}%` }} />
                </i>
                <span>{progress}%</span>
              </div>
              <footer>
                <span>{projectTasks.length} tasks</span>
                <span>{risks.length} risks/issues</span>
              </footer>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function GovernanceView({
  project,
  raidItems,
  decisions,
  onAddRaid,
  onAddDecision,
  signedIn,
}: {
  project: Project;
  raidItems: RaidItem[];
  decisions: Decision[];
  onAddRaid: (item: Omit<RaidItem, "id" | "created_at">) => Promise<void>;
  onAddDecision: (item: Omit<Decision, "id" | "created_at">) => Promise<void>;
  signedIn: boolean;
}) {
  const [mode, setMode] = useState<"raid" | "decision">("raid");
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (mode === "raid")
      await onAddRaid({
        project_id: project.id,
        kind: form.get("kind") as RaidItem["kind"],
        title: String(form.get("title")),
        owner: String(form.get("owner") || ""),
        impact: form.get("impact") as Priority,
        status: "Open",
        due_date: String(form.get("due_date") || "") || null,
        mitigation: String(form.get("detail") || ""),
      });
    else
      await onAddDecision({
        project_id: project.id,
        title: String(form.get("title")),
        outcome: String(form.get("detail") || ""),
        decided_by: String(form.get("owner") || ""),
        decided_at: String(
          form.get("due_date") || new Date().toISOString().slice(0, 10),
        ),
      });
    event.currentTarget.reset();
  }
  return (
    <section className="governance-page">
      <header>
        <div>
          <span>PROJECT CONTROLS</span>
          <h1>RAID & decision log</h1>
          <p>
            {project.name} · risks, assumptions, issues, dependencies, and key
            decisions.
          </p>
        </div>
        <div className="segmented">
          <button
            className={mode === "raid" ? "active" : ""}
            onClick={() => setMode("raid")}
          >
            RAID
          </button>
          <button
            className={mode === "decision" ? "active" : ""}
            onClick={() => setMode("decision")}
          >
            Decisions
          </button>
        </div>
      </header>
      {signedIn && (
        <form className="quick-log" onSubmit={add}>
          {mode === "raid" && (
            <select name="kind">
              <option>Risk</option>
              <option>Assumption</option>
              <option>Issue</option>
              <option>Dependency</option>
            </select>
          )}
          <input
            name="title"
            required
            placeholder={
              mode === "raid" ? "Describe the item…" : "Decision title…"
            }
          />
          <input
            name="owner"
            placeholder={mode === "raid" ? "Owner" : "Decided by"}
          />
          {mode === "raid" && (
            <select name="impact" defaultValue="Medium">
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
            </select>
          )}
          <input name="due_date" type="date" />
          <input
            name="detail"
            placeholder={
              mode === "raid" ? "Mitigation or response…" : "Decision outcome…"
            }
          />
          <button className="primary">
            <Plus size={15} />
            Add
          </button>
        </form>
      )}
      <div className="log-table">
        {mode === "raid" ? (
          <>
            <div className="log-row log-head">
              <span>Type</span>
              <span>Item</span>
              <span>Owner</span>
              <span>Impact</span>
              <span>Status</span>
            </div>
            {raidItems.length ? (
              raidItems.map((item) => (
                <div className="log-row" key={item.id}>
                  <span className={`raid-kind ${item.kind.toLowerCase()}`}>
                    {item.kind}
                  </span>
                  <span>
                    <b>{item.title}</b>
                    <small>{item.mitigation}</small>
                  </span>
                  <span>{item.owner || "Unassigned"}</span>
                  <span className={`impact ${item.impact.toLowerCase()}`}>
                    {item.impact}
                  </span>
                  <span>{item.status}</span>
                </div>
              ))
            ) : (
              <div className="log-empty">No RAID items recorded.</div>
            )}
          </>
        ) : (
          <>
            <div className="log-row decision-row log-head">
              <span>Date</span>
              <span>Decision</span>
              <span>Decided by</span>
            </div>
            {decisions.length ? (
              decisions.map((item) => (
                <div className="log-row decision-row" key={item.id}>
                  <span>{item.decided_at}</span>
                  <span>
                    <b>{item.title}</b>
                    <small>{item.outcome}</small>
                  </span>
                  <span>{item.decided_by || "Team"}</span>
                </div>
              ))
            ) : (
              <div className="log-empty">No decisions recorded.</div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function ActivityView({
  activities,
  members,
}: {
  activities: ActivityEvent[];
  members: Profile[];
}) {
  const name = (id: string | null) =>
    members.find((member) => member.user_id === id)?.username || "Team member";
  return (
    <section className="activity-page">
      <header>
        <span>AUDIT TRAIL</span>
        <h1>Activity history</h1>
        <p>A chronological record of important project changes.</p>
      </header>
      <div className="activity-list">
        {activities.length ? (
          activities.map((item) => (
            <article key={item.id}>
              <div className="activity-icon">
                <History size={15} />
              </div>
              <div>
                <p>
                  <b>{name(item.actor_id)}</b> {item.action} the{" "}
                  {item.entity_type} <strong>{item.entity_title}</strong>
                </p>
                <time>
                  {new Intl.DateTimeFormat("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(item.created_at))}
                </time>
              </div>
            </article>
          ))
        ) : (
          <div className="log-empty">
            Activity will appear as the team works.
          </div>
        )}
      </div>
    </section>
  );
}

function TaskComments({
  task,
  comments,
  members,
  onAdd,
  signedIn,
}: {
  task: Task;
  comments: TaskComment[];
  members: Profile[];
  onAdd: (taskId: number, body: string) => Promise<void>;
  signedIn: boolean;
}) {
  const [draft, setDraft] = useState("");
  const name = (id: string) =>
    members.find((member) => member.user_id === id)?.username || "Team member";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onAdd(task.id, draft);
    setDraft("");
  }
  return (
    <section className="task-comments">
      <h3>
        <MessageCircle size={15} />
        Comments <span>{comments.length}</span>
      </h3>
      <div>
        {comments.map((comment) => (
          <article key={comment.id}>
            <b>{name(comment.author_id)}</b>
            <p>{comment.body}</p>
            <time>
              {new Intl.DateTimeFormat("en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(comment.created_at))}
            </time>
          </article>
        ))}
      </div>
      {signedIn && (
        <form onSubmit={submit}>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add a comment… Use @USERNAME to mention someone"
            rows={2}
          />
          <button className="primary" disabled={!draft.trim()}>
            Comment
          </button>
        </form>
      )}
    </section>
  );
}

function MessagesView({
  user,
  members,
  messages,
  onSend,
  onSignIn,
}: {
  user: User | null;
  members: Profile[];
  messages: TeamMessage[];
  onSend: (body: string) => Promise<void>;
  onSignIn: () => void;
}) {
  const [draft, setDraft] = useState("");
  const memberName = (id: string) =>
    members.find((member) => member.user_id === id)?.username || "Team member";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSend(draft);
    setDraft("");
  }
  if (!user)
    return (
      <section className="empty-workspace">
        <div className="empty-workspace-icon">
          <MessageSquare size={24} />
        </div>
        <span>TEAM CHAT</span>
        <h1>Sign in to message your team</h1>
        <p>Messages are private to members of your project team.</p>
        <div>
          <button className="primary" onClick={onSignIn}>
            <LogIn size={17} />
            Sign in
          </button>
        </div>
      </section>
    );
  return (
    <section className="messages-page">
      <header>
        <div>
          <span>TRANSFORMATION AND READINESS</span>
          <h1>Team messages</h1>
          <p>{members.length} members · shared team channel</p>
        </div>
        <div className="message-members">
          {members.map((member) => (
            <span title={member.username} key={member.user_id}>
              {member.username.slice(0, 2).toUpperCase()}
            </span>
          ))}
        </div>
      </header>
      <div className="message-feed">
        {messages.length ? (
          messages.map((message) => (
            <article
              className={message.sender_id === user.id ? "mine" : ""}
              key={message.id}
            >
              <div>
                <b>{memberName(message.sender_id)}</b>
                <time>
                  {new Intl.DateTimeFormat("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(message.created_at))}
                </time>
              </div>
              <p>{message.body}</p>
            </article>
          ))
        ) : (
          <div className="messages-empty">
            <MessageSquare size={24} />
            <b>No messages yet</b>
            <span>Start the conversation with your team.</span>
          </div>
        )}
      </div>
      <form className="message-composer" onSubmit={submit}>
        <input
          aria-label="Message"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={2000}
          placeholder="Write a message to the team…"
        />
        <button className="primary" disabled={!draft.trim()}>
          <MessageSquare size={16} />
          Send
        </button>
      </form>
    </section>
  );
}

function PasswordChangeModal({ onChanged }: { onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    const confirmation = String(form.get("confirmation"));
    if (password !== confirmation) {
      setError("Passwords do not match.");
      setBusy(false);
      return;
    }
    if (password.toLowerCase() === "rubberducky") {
      setError("Choose a password different from the temporary password.");
      setBusy(false);
      return;
    }
    const result = await supabase.auth.updateUser({ password });
    if (result.error) {
      setError(result.error.message);
      setBusy(false);
      return;
    }
    const { error: profileError } = await supabase.rpc("complete_first_login");
    setBusy(false);
    if (profileError) setError(profileError.message);
    else onChanged();
  }
  return (
    <div className="modal-backdrop force-password">
      <div className="modal auth-modal">
        <div className="modal-head">
          <div>
            <span>FIRST LOGIN</span>
            <h2>Create a new password</h2>
          </div>
        </div>
        <p className="auth-copy">
          For security, replace the temporary password before continuing.
        </p>
        <form onSubmit={submit}>
          <label>
            New password
            <input
              name="password"
              type="password"
              minLength={10}
              required
              autoComplete="new-password"
            />
          </label>
          <label>
            Confirm password
            <input
              name="confirmation"
              type="password"
              minLength={10}
              required
              autoComplete="new-password"
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button type="submit" className="primary auth-submit" disabled={busy}>
            {busy ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <Check size={17} />
            )}
            {busy ? "Updating…" : "Set new password"}
          </button>
        </form>
      </div>
    </div>
  );
}

function AuthModal({
  onClose,
  onNotice,
}: {
  onClose: () => void;
  onNotice: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const username = String(form.get("username")).trim().toLowerCase();
    const password = String(form.get("password"));
    const result = await supabase.auth.signInWithPassword({
      email: `${username}@northstar.local`,
      password,
    });
    setBusy(false);
    if (result.error) setError(result.error.message);
    else {
      onNotice("Signed in successfully.");
      onClose();
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal auth-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span>TRANSFORMATION AND READINESS</span>
            <h2>Welcome back</h2>
          </div>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <p className="auth-copy">
          Sign in with your Northstar username. Usernames are not
          case-sensitive.
        </p>
        <form onSubmit={submit}>
          <label>
            Username
            <input
              name="username"
              required
              autoComplete="username"
              placeholder="Enter your username"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              minLength={6}
              required
              autoComplete="current-password"
              placeholder="Your password"
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button type="submit" className="primary auth-submit" disabled={busy}>
            {busy ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <LogIn size={17} />
            )}
            {busy ? "Please wait…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;
