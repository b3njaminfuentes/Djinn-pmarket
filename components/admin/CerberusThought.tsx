'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Cpu, Zap, Activity, ShieldAlert, CheckCircle2, RefreshCw } from 'lucide-react';

// --- TYPES ---
type NodeStatus = 'pending' | 'active' | 'success' | 'error';

interface NodeData {
    id: string;
    label: string;
    x: number;
    y: number;
    status: NodeStatus;
    parentId?: string;
    phase: number;
}

// --- CONFIG ---
const COLORS = {
    VOID: '#050505',
    SUCCESS: '#00FF41',
    ERROR: '#FF003C',
    TEXT: '#FFFFFF',
};

// --- HELPERS ---
const generateBezier = (x1: number, y1: number, x2: number, y2: number) => {
    const cx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
};

// --- COMPONENT: NODE CELL ---
const NodeCell = ({ node }: { node: NodeData }) => {
    const isError = node.status === 'error';
    const isSuccess = node.status === 'success';

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{
                opacity: 1,
                scale: 1,
                y: 0,
                borderColor: isError ? COLORS.ERROR : isSuccess ? COLORS.SUCCESS : 'rgba(255,255,255,0.1)',
                boxShadow: isError
                    ? `0 0 20px ${COLORS.ERROR}44`
                    : isSuccess
                        ? `0 0 20px ${COLORS.SUCCESS}44`
                        : '0 0 0px transparent'
            }}
            className={`
                absolute w-44 bg-black/80 backdrop-blur-md border rounded-md overflow-hidden z-20
                ${isError ? 'animate-pulse' : ''}
            `}
            style={{ left: node.x - 88, top: node.y - 25 }}
        >
            <div className={`px-2 py-1 text-[8px] font-black uppercase flex items-center justify-between ${isError ? 'bg-red-950 text-red-500' : isSuccess ? 'bg-green-950 text-green-500' : 'bg-white/5 text-white/40'}`}>
                <span>{node.id}</span>
                {isError && <ShieldAlert size={8} />}
                {isSuccess && <CheckCircle2 size={8} />}
            </div>
            <div className="p-3 font-mono text-[10px] text-white leading-tight">
                {node.label}
            </div>
        </motion.div>
    );
};

// --- MAIN COMPONENT ---
export default function CerberusThought() {
    const [phase, setPhase] = useState(0);
    const [timelineNodes, setTimelineNodes] = useState<NodeData[]>([]);

    // Define the full timeline dataset
    const nodesDatabase: NodeData[] = [
        // Phase 1: Initiation
        { id: 'ROOT', label: 'AGENT TRACE: CERBERUS', x: 100, y: 200, status: 'success', phase: 1 },
        { id: 'GET_TRACE', label: 'GET SPECIFIC TRACE', x: 300, y: 100, status: 'success', parentId: 'ROOT', phase: 1 },

        // Phase 2: Error
        { id: 'DRAW_TRACE', label: 'DRAW TRACE [CRITICAL_FAIL]', x: 300, y: 200, status: 'error', parentId: 'ROOT', phase: 2 },

        // Phase 3: Computation
        { id: 'COMPUTE_TRACE', label: 'COMPUTE TRACE: DATA_STACK', x: 300, y: 300, status: 'active', parentId: 'ROOT', phase: 3 },
        { id: 'ACT_TRACE', label: 'ACT TRACE [DISCARDED]', x: 500, y: 350, status: 'error', parentId: 'COMPUTE_TRACE', phase: 3 },

        // Phase 4: Reflection
        { id: 'OBSERVE_TRACE', label: 'OBSERVE TRACE: FEEDBACK', x: 100, y: 400, status: 'success', parentId: 'COMPUTE_TRACE', phase: 4 },
        { id: 'PLAN_TRACE_ERR', label: 'PLAN TRACE [OVERRIDE]', x: 300, y: 500, status: 'error', parentId: 'OBSERVE_TRACE', phase: 4 },
        { id: 'REFLECT_TRACE', label: 'REFLECT TRACE: SELF_OPTIMIZE', x: 500, y: 250, status: 'success', parentId: 'GET_TRACE', phase: 4 },

        // Phase 5: Expansion
        { id: 'VERIFY_V4', label: 'VERIFY V4: COMPLIANT', x: 700, y: 200, status: 'success', parentId: 'REFLECT_TRACE', phase: 5 },
        { id: 'ORACLE_OUT', label: 'ORACLE OUTPUT: FINAL', x: 900, y: 200, status: 'success', parentId: 'VERIFY_V4', phase: 5 },
    ];

    useEffect(() => {
        // Animation sequence
        const timers = [
            setTimeout(() => setPhase(1), 0),
            setTimeout(() => setPhase(2), 2000),
            setTimeout(() => setPhase(3), 4000),
            setTimeout(() => setPhase(4), 6000),
            setTimeout(() => setPhase(5), 10000),
            setTimeout(() => setPhase(6), 14000),
        ];
        return () => timers.forEach(t => clearTimeout(t));
    }, []);

    const activeNodes = useMemo(() => {
        let list = nodesDatabase.filter(n => n.phase <= phase);

        // Phase 5/6: Success Override (The Flip)
        if (phase >= 6) {
            list = list.map(n => ({ ...n, status: 'success' }));
        }

        return list;
    }, [phase]);

    return (
        <div className="w-full h-[600px] bg-[#050505] relative rounded-3xl border-2 border-white/5 overflow-hidden font-mono select-none flex items-center justify-center">
            {/* Background Grid */}
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, #00FF41 1px, transparent 1px)', backgroundSize: '30px 30px' }} />

            <div className="relative w-full h-full max-w-5xl">
                {/* SVG Layer for Connections */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
                    <defs>
                        <filter id="glow">
                            <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                            <feMerge>
                                <feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>

                    {activeNodes.map(node => {
                        if (!node.parentId) return null;
                        const parent = nodesDatabase.find( (p: any) => p.id === node.parentId);
                        if (!parent) return null;

                        const isError = node.status === 'error' && phase < 6;
                        const color = isError ? COLORS.ERROR : COLORS.SUCCESS;

                        return (
                            <motion.path
                                key={`${parent.id}-${node.id}`}
                                d={generateBezier(parent.x, parent.y, node.x, node.y)}
                                stroke={color}
                                strokeWidth="2"
                                fill="none"
                                initial={{ pathLength: 0, opacity: 0 }}
                                animate={{
                                    pathLength: 1,
                                    opacity: 1,
                                    stroke: color
                                }}
                                transition={{ duration: 1, ease: "easeInOut" }}
                                filter="url(#glow)"
                            />
                        );
                    })}
                </svg>

                {/* Nodes Layer */}
                <div className="absolute inset-0">
                    {activeNodes.map(node => (
                        <NodeCell key={node.id} node={node} />
                    ))}
                </div>

                {/* Status Bar */}
                <div className="absolute bottom-6 left-6 right-6 flex justify-between items-center text-[10px] text-white/40">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Activity size={12} className="text-green-500 animate-pulse" />
                            <span>PHASE: {phase >= 6 ? 'SUCCESS' : phase}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Cpu size={12} />
                            <span>CORES: 12/12</span>
                        </div>
                    </div>
                    <AnimatePresence>
                        {phase >= 5 && (
                            <motion.div
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="flex items-center gap-2 text-green-500 font-black tracking-widest uppercase italic"
                            >
                                <RefreshCw size={12} className="animate-spin" />
                                <span>Cerberus: Self-correcting Agent</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Header Overlay */}
            <div className="absolute top-6 left-6 z-30">
                <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-green-500 flex items-center justify-center">
                        <Zap size={16} className="text-black fill-black" />
                    </div>
                    CERBERUS <span className="text-green-900">//</span> BRAIN_CORE
                </h2>
            </div>

            {/* Phase 6 Finale: Scale Container */}
            <motion.div
                animate={phase >= 6 ? { scale: 0.95 } : { scale: 1 }}
                transition={{ duration: 5 }}
                className="absolute inset-0 pointer-events-none"
            />
        </div>
    );
}
