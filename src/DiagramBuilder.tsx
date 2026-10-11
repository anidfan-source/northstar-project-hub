import { useCallback, useEffect, useRef, useState } from "react";
import { ReactFlow, Background, Controls, MiniMap, Handle, Position, addEdge, useEdgesState, useNodesState, type Connection, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Cloud, Database, Diamond, Network, Plus, Square, UserRound, WandSparkles } from "lucide-react";
import { supabase } from "./supabase";

const shapes = [
  ["process", "Process", Square], ["decision", "Decision", Diamond], ["system", "System", Network],
  ["database", "Database", Database], ["cloud", "Cloud", Cloud], ["person", "Person / team", UserRound],
] as const;

function ShapeNode({ data, isConnectable }: NodeProps) {
  const shape = String(data.shape || "process");
  return <div className={`shape-body ${shape}`}>
    <Handle id="top" type="target" position={Position.Top} isConnectable={isConnectable}/>
    <Handle id="left" type="target" position={Position.Left} isConnectable={isConnectable}/>
    <span>{String(data.label || "Shape")}</span>
    <Handle id="right" type="source" position={Position.Right} isConnectable={isConnectable}/>
    <Handle id="bottom" type="source" position={Position.Bottom} isConnectable={isConnectable}/>
  </div>;
}
const nodeTypes = { shape: ShapeNode };
const normalizeNodes = (items: Node[] = []) => items.map((node) => ({ ...node, type: "shape", data: { ...node.data, shape: node.data.shape || String(node.className || "process").split(" ").pop() }, className: undefined }));

export function DiagramBuilder({ projectId, projectName }: { projectId: string | number; projectName: string }) {
  const storageKey = `northstar-diagram-${projectId}`;
  const saved = JSON.parse(localStorage.getItem(storageKey) || "{}") as { nodes?: Node[]; edges?: any[] };
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(normalizeNodes(saved.nodes));
  const [edges, setEdges, onEdgesChange] = useEdgesState(saved.edges || []);
  const [prompt, setPrompt] = useState(""); const [busy, setBusy] = useState(false); const [showAi, setShowAi] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  useEffect(() => { const next = JSON.parse(localStorage.getItem(storageKey) || "{}"); setNodes(normalizeNodes(next.nodes)); setEdges(next.edges || []); }, [storageKey, setNodes, setEdges]);
  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify({ nodes, edges })); }, [storageKey, nodes, edges]);
  const onConnect = useCallback((connection: Connection) => setEdges((eds) => addEdge({ ...connection, animated: true, style: { stroke: "#b5152b" } }, eds)), [setEdges]);
  const addNode = (shape: string, label?: string, position?: { x: number; y: number }) => setNodes((current) => [...current, { id: crypto.randomUUID(), type: "shape", position: position || { x: 80 + current.length * 35, y: 80 + current.length * 25 }, data: { label: label || `New ${shape}`, shape } }]);
  const drop = (event: React.DragEvent) => { event.preventDefault(); const shape = event.dataTransfer.getData("shape"); if (!shape || !wrapper.current) return; const box = wrapper.current.getBoundingClientRect(); addNode(shape, undefined, { x: event.clientX - box.left - 70, y: event.clientY - box.top - 30 }); };
  const editNode = (_: unknown, node: Node) => { const label = window.prompt("Edit shape label", String(node.data.label || "")); if (label) setNodes((all) => all.map((n) => n.id === node.id ? { ...n, data: { ...n.data, label } } : n)); };
  const generate = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("generate-project", { body: { horizon: "8 weeks", prompt: `Design a concise process flow or network architecture for ${projectName}. ${prompt}. Return phases as the main connected components and tasks as supporting components.` } });
    setBusy(false); if (error || data?.error) return alert(error?.message || data.error);
    const phases = data.phases || []; const tasks = (data.tasks || []).slice(0, 8); const next: Node[] = [];
    phases.forEach((p: any, i: number) => next.push({ id: `phase-${i}`, type: "shape", position: { x: 80 + i * 210, y: 90 }, data: { label: p.name, shape: "process" } }));
    tasks.forEach((t: any, i: number) => next.push({ id: `task-${i}`, type: "shape", position: { x: 80 + (i % 4) * 210, y: 240 + Math.floor(i / 4) * 130 }, data: { label: t.title, shape: i % 3 === 0 ? "system" : "decision" } }));
    setNodes(next); setEdges(phases.slice(1).map((_: any, i: number) => ({ id: `e-${i}`, source: `phase-${i}`, target: `phase-${i + 1}`, animated: true, style: { stroke: "#b5152b" } })));
    setShowAi(false);
  };
  return <section className="diagram-page"><header><div><span>VISUAL DESIGN</span><h1>Process & network builder</h1><p>{projectName} · drag shapes, connect them, and double-click to edit.</p></div><button className="ai-button" onClick={() => setShowAi(true)}><WandSparkles size={16}/> Build with AI</button></header>
    <div className="diagram-workspace"><aside><b>SHAPES</b>{shapes.map(([id, label, Icon]) => <button key={id} draggable onDragStart={e => e.dataTransfer.setData("shape", id)} onClick={() => addNode(id)}><span className={`shape-legend ${id}`}><Icon size={14}/></span>{label}<Plus size={12}/></button>)}</aside><div className="diagram-canvas" ref={wrapper} onDrop={drop} onDragOver={e => e.preventDefault()}><ReactFlow nodeTypes={nodeTypes} nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeDoubleClick={editNode} fitView snapToGrid snapGrid={[10,10]}><Background gap={20}/><MiniMap/><Controls/></ReactFlow></div></div>
    {showAi && <div className="diagram-ai"><textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Describe the readiness process, operating model flow, system landscape or network architecture…"/><button className="primary" onClick={generate} disabled={busy || prompt.length < 10}><WandSparkles size={15}/>{busy ? "Creating…" : "Generate editable diagram"}</button><button className="cancel" onClick={() => setShowAi(false)}>Cancel</button></div>}
  </section>;
}
