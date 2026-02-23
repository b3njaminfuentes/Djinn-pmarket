'use client';

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { motion, useMotionValue, useSpring, useTransform, useAnimationFrame, animate } from 'framer-motion';
import confetti from 'canvas-confetti';

interface PhysicsCardProps {
    username?: string;
    memberNumber?: number;
    pfp?: string | null;
    twitterHandle?: string | null;
}

export default function PhysicsCardBubblegum({ username, memberNumber, pfp, twitterHandle }: PhysicsCardProps) {
    const cardRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [isDragging, setIsDragging] = useState(false);

    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const autoRotate = useMotionValue(0);
    const floatY = useMotionValue(0);

    const springConfig = useMemo(() => ({
        stiffness: 80,
        damping: 15,
        mass: 0.8
    }), []);

    const mouseX = useSpring(x, springConfig);
    const mouseY = useSpring(y, springConfig);

    const rotateX = useTransform(mouseY, [-300, 300], [10, -10]);
    const rotateY = useTransform([mouseX, autoRotate], ([latestMouseX, latestAuto]: any) => {
        // Significantly reduced manual rotation influence (from 180 to 20 deg max)
        const manualTilt = (latestMouseX / 300) * 20;
        return manualTilt + latestAuto;
    });

    const glareX = useTransform(mouseX, [-200, 200], [100, 0]);
    const glareY = useTransform(mouseY, [-200, 200], [100, 0]);

    const textParallaxX = useTransform(mouseX, (v: number) => v * 0.05);
    const textParallaxY = useTransform(mouseY, (v: number) => v * 0.05);

    // 3D Parallax layers
    const parallaxDeepX = useTransform(mouseX, (v: number) => v * -0.03);
    const parallaxDeepY = useTransform(mouseY, (v: number) => v * -0.03);
    const parallaxMidX = useTransform(mouseX, (v: number) => v * 0.08);
    const parallaxMidY = useTransform(mouseY, (v: number) => v * 0.08);
    const parallaxFrontX = useTransform(mouseX, (v: number) => v * 0.15);
    const parallaxFrontY = useTransform(mouseY, (v: number) => v * 0.15);

    const shimmerX = useTransform(mouseX, (v: number) => v * 0.4);
    const shimmerY = useTransform(mouseY, (v: number) => v * 0.4);

    const autoRotateOffset = useRef(0);

    const handleMouseMove = useCallback((_e: React.MouseEvent) => {
        // Disabled mouse tilt to prevent "distortion" as requested
    }, []);

    const handleMouseLeaveContainer = useCallback(() => {
        // Logic removed to prevent mouse-driven resets
    }, []);

    const handleCardClick = useCallback(() => {
        // Flipping logic handled by rotateY/autoRotate
    }, []);

    const onDragStart = useCallback(() => {
        setIsDragging(true);
        autoRotateOffset.current = autoRotate.get();
    }, [autoRotate]);

    const onDrag = useCallback((_event: any, info: any) => {
        x.set(info.offset.x * 2.5);
        y.set(info.offset.y);
    }, [x, y]);

    const onDragEnd = useCallback(() => {
        setIsDragging(false);
        animate(x, 0, { stiffness: 50, damping: 12, mass: 1 });
        animate(y, 0, { stiffness: 60, damping: 14, mass: 0.8 });
    }, [x, y]);

    const cardY = useTransform([mouseY, floatY], ([my, fy]) => (my as number) + (fy as number));

    const specularX = useTransform(mouseX, [-200, 200], [-150, 150]);
    const specularY = useTransform(mouseY, [-200, 200], [-150, 150]);

    const auroraGradient = `linear-gradient(90deg, #00FF87, #00FFAB, #00E5FF, #00FF87, #7B61FF, #00FFAB, #00E5FF, #00FF87, #7B61FF, #FF61DC, #00FF87)`;

    const holoIntensity = useTransform(rotateY, (v: number) => {
        const norm = ((v % 360) + 360) % 360;
        const dist90 = Math.abs(norm - 90);
        const dist270 = Math.abs(norm - 270);
        const minDist = Math.min(dist90, dist270);
        return Math.max(0, 1 - minDist / 120);
    });

    const holoOpacity = useTransform(holoIntensity, [0, 1], [0, 0.7]);
    const holoFlashOpacity = useTransform(holoIntensity, [0, 0.5, 1], [0, 0, 0.5]);

    const lastTimeRef = useRef(0);

    useAnimationFrame((t) => {
        if (!isDragging) {
            floatY.set(Math.sin(t / 1500) * 6);
            if (lastTimeRef.current === 0) lastTimeRef.current = t;
            const elapsed = (t - lastTimeRef.current) / 1000;
            // Increased rotation speed to 45 deg/sec for better "spinning solo" effect
            autoRotate.set(autoRotateOffset.current + elapsed * 45);
        } else {
            lastTimeRef.current = t;
        }
    });

    const [isClient, setIsClient] = useState(false);
    useEffect(() => { setIsClient(true); }, []);

    // Celebration on Mount
    useEffect(() => {
        if (!isClient || !cardRef.current) return;
        const rect = cardRef.current.getBoundingClientRect();
        const cardCenterX = (rect.left + rect.width / 2) / window.innerWidth;
        const cardCenterY = (rect.top + rect.height / 2) / window.innerHeight;
        const defaults = { startVelocity: 55, ticks: 80, zIndex: 1000, origin: { x: cardCenterX, y: cardCenterY } };
        confetti({ ...defaults, particleCount: 60, spread: 360, startVelocity: 40 });
        const timer = setTimeout(() => {
            if (!cardRef.current) return;
            const r = cardRef.current.getBoundingClientRect();
            const cx = (r.left + r.width / 2) / window.innerWidth;
            const cy = (r.top + r.height / 2) / window.innerHeight;
            confetti({ ...defaults, origin: { x: cx, y: cy }, particleCount: 35, spread: 360, startVelocity: 30 });
        }, 250);
        return () => clearTimeout(timer);
    }, [isClient]);

    const displayNumber = memberNumber ? String(memberNumber).padStart(3, '0') : '001';

    const dynamicGlare = useTransform([glareX, glareY], ([gx, gy]) =>
        `radial-gradient(circle at ${gx}% ${gy}%, rgba(255, 255, 255, 0.25) 0%, transparent 60%)`
    );

    const watermarkX = useTransform(mouseX, [-200, 200], [-50, 50]);
    const watermarkY = useTransform(mouseY, [-200, 200], [-50, 50]);
    const watermarkOpacity = useTransform(holoIntensity, [0.3, 0.7, 1], [0.05, 0.25, 0.05]);
    const watermarkHue = useTransform(rotateY, [0, 180, 360], [0, 360, 720]);

    const backOpacity = useTransform(rotateY, (v: number) => {
        const norm = ((v % 360) + 360) % 360;
        return (norm >= 90 && norm <= 270) ? 1 : 0;
    });

    const frontOpacity = useTransform(rotateY, (v: number) => {
        const norm = ((v % 360) + 360) % 360;
        return (norm < 90 || norm > 270) ? 1 : 0;
    });

    return (
        <div
            ref={containerRef}
            className="relative w-full h-full flex items-center justify-center overflow-visible"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeaveContainer}
            style={{ perspective: '1500px' }}
        >
            <svg className="absolute w-0 h-0">
                <defs>
                    <filter id="noiseFilter">
                        <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="3" stitchTiles="stitch" />
                        <feColorMatrix type="saturate" values="0" />
                        <feComponentTransfer>
                            <feFuncA type="linear" slope="0.05" />
                        </feComponentTransfer>
                    </filter>
                </defs>
            </svg>

            {/* THE CARD */}
            <motion.div
                ref={cardRef}
                drag
                dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                dragElastic={0}
                onClick={handleCardClick}
                onDragStart={onDragStart}
                onDrag={onDrag}
                onDragEnd={onDragEnd}
                style={{
                    rotateX,
                    rotateY,
                    y: cardY,
                    transformStyle: 'preserve-3d'
                }}
                whileTap={{ scale: 0.98 }}
                whileHover={{ scale: 1.02 }}
                className="relative w-[480px] h-[650px] cursor-grab active:cursor-grabbing z-20 will-change-transform"
            >
                {/* Card edge */}
                <div className="absolute -inset-[3px] rounded-[2.7rem] z-0"
                    style={{
                        background: 'linear-gradient(180deg, #d0d0d8 0%, #909098 30%, #b8b8c0 50%, #808088 70%, #c0c0c8 100%)',
                    }}
                />

                {/* ============ FRONT FACE ============ */}
                <motion.div
                    style={{
                        opacity: frontOpacity,
                        backfaceVisibility: 'hidden',
                        transformStyle: 'preserve-3d',
                        isolation: 'isolate',
                    }}
                    className="absolute inset-0 rounded-[2.5rem] overflow-hidden"
                >
                    {/* BASE: Chrome metallic */}
                    <div className="absolute inset-0 rounded-[2.5rem]" style={{
                        background: 'linear-gradient(165deg, #e8e8ec 0%, #ffffff 8%, #8a8a96 18%, #d8d8e0 26%, #3a3a42 35%, #f0f0f4 42%, #6e6e7a 50%, #ffffff 58%, #4a4a54 65%, #e0e0e8 72%, #2e2e36 80%, #f8f8fc 88%, #a0a0ac 95%)'
                    }} />
                    <div className="absolute inset-0 backdrop-blur-md rounded-[2.5rem]" />

                    {/* Prismatic Watermarks Background Front */}
                    <motion.div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                            backgroundImage: 'url(/star-sniper-new.png)',
                            backgroundSize: '100px',
                            backgroundRepeat: 'repeat',
                            mixBlendMode: 'color-dodge',
                            opacity: watermarkOpacity,
                            backgroundPositionX: watermarkX,
                            backgroundPositionY: watermarkY,
                            filter: useTransform(watermarkHue, (v) => `hue-rotate(${v}deg) brightness(2.5) saturate(3)`),
                        }}
                    />

                    {/* LIQUID METAL REFLECTIONS */}
                    <div className="absolute inset-0 pointer-events-none rounded-[2.5rem]" style={{
                        background: 'linear-gradient(130deg, rgba(255,255,255,0.5) 0%, transparent 15%, rgba(255,255,255,0.3) 25%, transparent 35%, rgba(0,0,0,0.15) 45%, rgba(255,255,255,0.6) 55%, transparent 65%, rgba(0,0,0,0.1) 75%, rgba(255,255,255,0.4) 85%, transparent 100%)'
                    }} />

                    {/* FLUID IRIDESCENT BLOB */}
                    <motion.div
                        className="absolute inset-0 pointer-events-none opacity-[0.08]"
                        style={{
                            background: 'radial-gradient(ellipse at 30% 40%, #FF69B4, transparent 60%), radial-gradient(ellipse at 70% 60%, #A855F7, transparent 60%), radial-gradient(ellipse at 50% 80%, #FF6B35, transparent 50%)',
                            filter: 'blur(60px)',
                            x: shimmerX,
                            y: shimmerY,
                            scale: 1.3,
                        }}
                    />

                    {/* HOLOGRAPHIC OVERLAY */}
                    <motion.div
                        className="absolute inset-0 pointer-events-none mix-blend-screen z-25 rounded-[2.5rem]"
                        style={{
                            opacity: holoOpacity,
                            background: 'conic-gradient(from 0deg at 50% 50%, #ff0080, #ff8c00, #ffff00, #00ff88, #00ffff, #0088ff, #8800ff, #ff00ff, #ff0080)',
                        }}
                    />

                    {/* HOLOGRAPHIC WHITE FLASH */}
                    <motion.div
                        className="absolute inset-0 pointer-events-none z-26 rounded-[2.5rem]"
                        style={{
                            opacity: holoFlashOpacity,
                            background: 'radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.2) 40%, transparent 70%)',
                        }}
                    />

                    {/* SPECULAR HIGHLIGHT */}
                    <motion.div
                        className="absolute inset-[-50%] pointer-events-none opacity-35 mix-blend-color-dodge z-30"
                        style={{
                            background: 'radial-gradient(circle at center, rgba(255,255,255,0.7) 0%, transparent 50%)',
                            x: specularX,
                            y: specularY,
                            filter: 'blur(50px)'
                        }}
                    />

                    {/* NOISE TEXTURE */}
                    <div className="absolute inset-0 pointer-events-none opacity-25 mix-blend-soft-light" style={{ filter: 'url(#noiseFilter)' }} />


                    {/* CONTENT ---- */}
                    <div className="relative z-10 flex flex-col items-center h-full p-8" style={{ transformStyle: 'preserve-3d' }}>

                        {/* 1. TOP TITLE GROUP (NEW) */}
                        <div className="relative flex-1 flex flex-col items-center justify-end w-full pb-4" style={{ transformStyle: 'preserve-3d' }}>
                            <motion.h2
                                className="text-[3.5rem] font-black tracking-[-0.04em] relative"
                                style={{
                                    fontFamily: 'var(--font-adriane), serif',
                                    fontWeight: 700,
                                    color: 'black',
                                    x: parallaxFrontX,
                                    y: parallaxFrontY,
                                    transform: 'translateZ(100px)',
                                    lineHeight: '1.2',
                                    paddingBottom: '0.2em',
                                    overflow: 'visible'
                                }}
                            >
                                Djinn
                            </motion.h2>
                        </div>

                        {/* 2. CENTER X PROFILE PICTURE (Liquid Chrome Crystal Frame) */}
                        <div className="relative flex-[3] flex items-center justify-center w-full mt-[-2.5rem]" style={{ transformStyle: 'preserve-3d' }}>
                            <motion.div
                                className="relative w-80 h-80 rounded-[2.5rem] p-[2px] bg-gradient-to-br from-white/80 via-white/20 to-white/80"
                                style={{
                                    x: parallaxMidX,
                                    y: parallaxMidY,
                                    transform: 'translateZ(80px)'
                                }}
                            >
                                {/* Outer Glow/Aura */}
                                <div className="absolute inset-[-15px] rounded-[2.5rem] bg-white/5 blur-[20px] pointer-events-none" />

                                {/* Architectural Frame Accents */}
                                <div className="absolute inset-[-10px] rounded-[2.2rem] border border-white/20 pointer-events-none" />

                                <div className="w-full h-full rounded-[1.9rem] overflow-hidden border-[1px] border-white/40 relative bg-black shadow-[0_40px_80px_rgba(0,0,0,0.5)]">
                                    <img
                                        src={pfp || "/pink-pfp.png"}
                                        alt="Profile"
                                        className="w-full h-full object-cover grayscale-[5%] hover:grayscale-0 transition-all duration-500 scale-105"
                                    />

                                    {/* Premium Scanline / Texture Overlay */}
                                    <div className="absolute inset-0 pointer-events-none opacity-[0.25] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_2px,3px_100%]" />

                                    {/* Iridescent Glass Shine */}
                                    <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-white/20 pointer-events-none" />

                                    {/* Technical High-Res Corners */}
                                    <div className="absolute top-4 left-4 w-2 h-2 border-t border-l border-white/50" />
                                    <div className="absolute top-4 right-4 w-2 h-2 border-t border-r border-white/50" />
                                    <div className="absolute bottom-4 left-4 w-2 h-2 border-b border-l border-white/50" />
                                    <div className="absolute bottom-4 right-4 w-2 h-2 border-b border-r border-white/50" />
                                </div>

                            </motion.div>
                        </div>

                        {/* 3. BOTTOM INFO GROUPED */}
                        <div className="w-full mt-auto flex flex-col items-center gap-4" style={{ transformStyle: 'preserve-3d' }}>

                            {/* Djinn Identity */}
                            <motion.div
                                className="w-full bg-black/5 backdrop-blur-sm rounded-[1.5rem] p-5 border border-black/5 flex items-center justify-between"
                                style={{
                                    transform: 'translateZ(20px)'
                                }}
                            >
                                <div className="flex flex-col items-start">
                                    <span
                                        className="text-2xl font-black lowercase tracking-tighter"
                                        style={{
                                            fontFamily: 'var(--font-unbounded), sans-serif',
                                            background: auroraGradient,
                                            backgroundSize: '200% auto',
                                            WebkitBackgroundClip: 'text',
                                            WebkitTextFillColor: 'transparent'
                                        }}
                                    >
                                        {username || 'unidentified'}
                                    </span>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-xl font-black tracking-wider font-mono text-black/80">
                                        #{displayNumber}
                                    </span>
                                </div>
                            </motion.div>
                        </div>
                    </div >

                    <motion.div
                        style={{ background: dynamicGlare }}
                        className="absolute inset-0 pointer-events-none mix-blend-overlay z-30 rounded-[2.5rem]"
                    />
                </motion.div >

                {/* ============ BACK FACE ============ */}
                < motion.div
                    style={{
                        opacity: backOpacity,
                        rotateY: 180,
                        backfaceVisibility: 'hidden',
                        transformStyle: 'preserve-3d',
                        isolation: 'isolate',
                    }
                    }
                    className="absolute inset-0 rounded-[2.5rem] overflow-hidden"
                >
                    {/* BASE: Chrome metallic */}
                    < div className="absolute inset-0 rounded-[2.5rem]" style={{
                        background: 'linear-gradient(165deg, #e8e8ec 0%, #ffffff 8%, #8a8a96 18%, #d8d8e0 26%, #3a3a42 35%, #f0f0f4 42%, #6e6e7a 50%, #ffffff 58%, #4a4a54 65%, #e0e0e8 72%, #2e2e36 80%, #f8f8fc 88%, #a0a0ac 95%)'
                    }} />
                    < div className="absolute inset-0 backdrop-blur-md rounded-[2.5rem]" />

                    {/* Prismatic Watermarks Background Back */}
                    < motion.div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                            backgroundImage: 'url(/star-sniper-new.png)',
                            backgroundSize: '100px',
                            backgroundRepeat: 'repeat',
                            mixBlendMode: 'color-dodge',
                            opacity: watermarkOpacity,
                            backgroundPositionX: useTransform(watermarkX, (v) => -v),
                            backgroundPositionY: watermarkY,
                            filter: useTransform(watermarkHue, (v: any) => `hue-rotate(${v + 180}deg) brightness(2.5) saturate(3)`),
                        }}
                    />

                    {/* LIQUID METAL REFLECTIONS BACK */}
                    <div className="absolute inset-0 pointer-events-none rounded-[2.5rem]" style={{
                        background: 'linear-gradient(130deg, rgba(255,255,255,0.5) 0%, transparent 15%, rgba(255,255,255,0.3) 25%, transparent 35%, rgba(0,0,0,0.15) 45%, rgba(255,255,255,0.6) 55%, transparent 65%, rgba(0,0,0,0.1) 75%, rgba(255,255,255,0.4) 85%, transparent 100%)'
                    }} />

                    {/* FLUID IRIDESCENT BLOB BACK */}
                    <motion.div
                        className="absolute inset-0 pointer-events-none opacity-[0.08]"
                        style={{
                            background: 'radial-gradient(ellipse at 30% 40%, #FF69B4, transparent 60%), radial-gradient(ellipse at 70% 60%, #A855F7, transparent 60%), radial-gradient(ellipse at 50% 80%, #FF6B35, transparent 50%)',
                            filter: 'blur(60px)',
                            x: shimmerX,
                            y: shimmerY,
                            scale: 1.3,
                        }}
                    />

                    {/* HOLOGRAPHIC OVERLAY BACK */}
                    <motion.div
                        className="absolute inset-0 pointer-events-none mix-blend-screen z-25 rounded-[2.5rem]"
                        style={{
                            opacity: holoOpacity,
                            background: 'conic-gradient(from 0deg at 50% 50%, #ff0080, #ff8c00, #ffff00, #00ff88, #00ffff, #0088ff, #8800ff, #ff00ff, #ff0080)',
                        }}
                    />

                    {/* HOLOGRAPHIC WHITE FLASH BACK */}
                    <motion.div
                        className="absolute inset-0 pointer-events-none z-26 rounded-[2.5rem]"
                        style={{
                            opacity: holoFlashOpacity,
                            background: 'radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.2) 40%, transparent 70%)',
                        }}
                    />

                    {/* SPECULAR HIGHLIGHT BACK */}
                    <motion.div
                        className="absolute inset-[-50%] pointer-events-none opacity-35 mix-blend-color-dodge z-30"
                        style={{
                            background: 'radial-gradient(circle at center, rgba(255,255,255,0.7) 0%, transparent 50%)',
                            x: specularX,
                            y: specularY,
                            filter: 'blur(50px)'
                        }}
                    />

                    {/* NOISE TEXTURE BACK */}
                    <div className="absolute inset-0 pointer-events-none opacity-25 mix-blend-soft-light" style={{ filter: 'url(#noiseFilter)' }} />


                    <div className="relative z-40 flex flex-col items-center h-full p-10 pt-6 text-center" style={{ transformStyle: 'preserve-3d' }}>
                        <motion.div
                            className="relative w-56 h-56 mt-4 mb-0 mx-auto flex-shrink-0 opacity-[0.8]"
                            style={{
                                x: parallaxDeepX,
                                y: parallaxDeepY,
                                transform: 'translateZ(-20px)',
                            }}
                        >
                            <Image
                                src="/star-sniper-new.png"
                                alt=""
                                width={500}
                                height={366}
                                className="w-full h-full object-contain filter saturate-[1.5]"
                                unoptimized
                            />
                        </motion.div>

                        <motion.div
                            className="flex flex-col gap-0 w-full max-w-[320px] flex-1 mt-[-10px]"
                            style={{
                                x: parallaxMidX,
                                y: parallaxMidY,
                                transform: 'translateZ(10px)',
                            }}
                        >
                            <div className="flex flex-col items-center mb-6">
                                <span className="text-[0.8rem] font-black uppercase tracking-[0.15em] text-black/80">Born to Trench</span>
                            </div>

                            <div className="flex flex-col items-center mb-6">
                                <span className="text-[0.8rem] font-black lowercase tracking-[0.15em] text-black/50">world is a casino</span>
                            </div>

                            <div className="flex flex-col items-center mb-8 mx-auto text-black/90">
                                <span
                                    className="text-[1.05rem] tracking-wide leading-relaxed text-black"
                                    style={{
                                        fontFamily: 'var(--font-unbounded), sans-serif',
                                    }}
                                >
                                    <span style={{ fontWeight: 900 }}>i am</span> a <span style={{
                                        fontFamily: 'var(--font-adriane), serif',
                                        fontWeight: 700,
                                        background: auroraGradient,
                                        backgroundSize: '200% auto',
                                        WebkitBackgroundClip: 'text',
                                        WebkitTextFillColor: 'transparent',
                                        display: 'inline-block',
                                        paddingBottom: '0.15em'
                                    }}>Djinn</span>
                                </span>
                            </div>

                            <div className="flex flex-col items-center mb-10">
                                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-black/40">I PREDICT THE FUTURE</span>
                            </div>

                            <div className="w-full h-[1px] bg-black/10 mb-8" />

                            <div className="flex flex-col items-center mb-0">
                                <span className="text-[0.925rem] font-black tracking-tighter text-black/90 lowercase">480.543.294.432 NEW PAIRS</span>
                            </div>

                            <div className="h-4" />

                            <div className="flex flex-col items-center pb-2">
                                <motion.span
                                    className="text-[11px] font-black tracking-[0.25em] uppercase"
                                    style={{
                                        fontFamily: 'var(--font-unbounded), sans-serif',
                                        background: auroraGradient,
                                        backgroundSize: '200% auto',
                                        WebkitBackgroundClip: 'text',
                                        WebkitTextFillColor: 'transparent',
                                        filter: 'drop-shadow(0 0 10px rgba(0,255,135,0.3))'
                                    }}
                                    animate={{ backgroundPosition: ['0% center', '200% center'] }}
                                    transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                                >
                                    Ape em all 2026 未来はあなたのもの
                                </motion.span>
                            </div>
                        </motion.div>
                    </div>

                    <motion.div
                        style={{ background: dynamicGlare }}
                        className="absolute inset-0 pointer-events-none mix-blend-overlay z-30 rounded-[2.5rem]"
                    />
                </motion.div >

                {/* Edge depth */}
                < div
                    className="absolute inset-0 rounded-[2.5rem] border border-white/15 pointer-events-none"
                    style={{ transform: 'translateZ(-2px)' }
                    }
                />
            </motion.div >
        </div >
    );
}
