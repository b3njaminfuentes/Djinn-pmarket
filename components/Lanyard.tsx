/* eslint-disable react/no-unknown-property */
'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import Image from 'next/image';
import confetti from 'canvas-confetti';
import { Canvas, extend, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { BallCollider, CuboidCollider, Physics, RigidBody, useRopeJoint, useSphericalJoint } from '@react-three/rapier';
import { MeshLineGeometry, MeshLineMaterial } from 'meshline';
import * as THREE from 'three';
import PhysicsCardBubblegum from './PhysicsCardBubblegum';

extend({ MeshLineGeometry, MeshLineMaterial });

interface LanyardProps {
    position?: [number, number, number];
    gravity?: [number, number, number];
    fov?: number;
    username?: string;
    memberNumber?: number;
    pfp?: string | null;
    twitterHandle?: string | null;
}

export default function Lanyard({
    position = [0, 0, 40],
    gravity = [0, -40, 0],
    fov = 20,
    username = 'agent',
    memberNumber = 1,
    pfp = null,
    twitterHandle = null
}: LanyardProps) {
    const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return (
        <div style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
        }}>
            <Canvas
                camera={{ position: position, fov: fov }}
                dpr={[1, isMobile ? 1.5 : 2]}
                gl={{ alpha: true, antialias: true }}
                style={{ background: 'transparent', position: 'absolute', inset: 0 }}
                onCreated={({ gl }) => {
                    gl.setClearColor(0x000000, 0);
                }}
            >
                <ambientLight intensity={0.5} />
                <Physics gravity={gravity} timeStep={isMobile ? 1 / 30 : 1 / 60}>
                    <Band
                        isMobile={isMobile}
                        username={username}
                        memberNumber={memberNumber}
                        pfp={pfp}
                        twitterHandle={twitterHandle}
                    />
                </Physics>
            </Canvas>
        </div>
    );
}

interface BandProps {
    maxSpeed?: number;
    minSpeed?: number;
    isMobile?: boolean;
    username?: string;
    memberNumber?: number;
    pfp?: string | null;
    twitterHandle?: string | null;
}

function Band({
    maxSpeed = 50,
    minSpeed = 0,
    isMobile = false,
    username = 'agent',
    memberNumber = 1,
    pfp = null,
    twitterHandle = null
}: BandProps) {
    const band = useRef<any>(null);
    const fixed = useRef<any>(null);
    const j1 = useRef<any>(null);
    const j2 = useRef<any>(null);
    const j3 = useRef<any>(null);
    const card = useRef<any>(null);

    const vec = new THREE.Vector3();
    const ang = new THREE.Vector3();
    const rot = new THREE.Vector3();
    const dir = new THREE.Vector3();

    const segmentProps = {
        type: 'dynamic' as const,
        canSleep: true,
        angularDamping: 4,
        linearDamping: 4
    };

    const [curve] = useState(
        () => new THREE.CatmullRomCurve3([
            new THREE.Vector3(),
            new THREE.Vector3(),
            new THREE.Vector3(),
            new THREE.Vector3()
        ])
    );

    const [dragged, drag] = useState<THREE.Vector3 | false>(false);
    const [hovered, hover] = useState(false);

    useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], 1]);
    useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], 1]);
    useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], 1]);
    useSphericalJoint(j3, card, [[0, 0, 0], [0, 1.5, 0]]);

    useEffect(() => {
        if (hovered) {
            document.body.style.cursor = dragged ? 'grabbing' : 'grab';
            return () => { document.body.style.cursor = 'auto'; };
        }
    }, [hovered, dragged]);

    useFrame((state, delta) => {
        if (dragged && card.current) {
            vec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera);
            dir.copy(vec).sub(state.camera.position).normalize();
            vec.add(dir.multiplyScalar(state.camera.position.length()));
            [card, j1, j2, j3, fixed].forEach(ref => ref.current?.wakeUp());
            card.current?.setNextKinematicTranslation({
                x: vec.x - dragged.x,
                y: vec.y - dragged.y,
                z: vec.z - dragged.z
            });
        }

        if (fixed.current && j1.current && j2.current && j3.current && band.current) {
            [j1, j2].forEach(ref => {
                if (!ref.current.lerped) {
                    ref.current.lerped = new THREE.Vector3().copy(ref.current.translation());
                }
                const clampedDistance = Math.max(0.1, Math.min(1, ref.current.lerped.distanceTo(ref.current.translation())));
                ref.current.lerped.lerp(
                    ref.current.translation(),
                    delta * (minSpeed + clampedDistance * (maxSpeed - minSpeed))
                );
            });

            curve.points[0].copy(j3.current.translation());
            curve.points[1].copy(j2.current.lerped);
            curve.points[2].copy(j1.current.lerped);
            curve.points[3].copy(fixed.current.translation());
            band.current.geometry.setPoints(curve.getPoints(isMobile ? 16 : 32));

            if (card.current) {
                ang.copy(card.current.angvel());
                rot.copy(card.current.rotation());
                card.current.setAngvel({ x: ang.x, y: ang.y - rot.y * 0.25, z: ang.z });
            }
        }
    });

    curve.curveType = 'chordal';

    return (
        <>
            <group position={[0, 4, 0]}>
                <RigidBody ref={fixed} {...segmentProps} type="fixed" />
                <RigidBody position={[0.5, 0, 0]} ref={j1} {...segmentProps}>
                    <BallCollider args={[0.1]} />
                </RigidBody>
                <RigidBody position={[1, 0, 0]} ref={j2} {...segmentProps}>
                    <BallCollider args={[0.1]} />
                </RigidBody>
                <RigidBody position={[1.5, 0, 0]} ref={j3} {...segmentProps}>
                    <BallCollider args={[0.1]} />
                </RigidBody>
                <RigidBody
                    position={[2, 0, 0]}
                    ref={card}
                    {...segmentProps}
                    type={dragged ? 'kinematicPosition' : 'dynamic'}
                >
                    <CuboidCollider args={[0.8, 1.125, 0.01]} />
                    <group
                        scale={2.5}
                        position={[0, -1.2, 0]}
                        onPointerOver={() => hover(true)}
                        onPointerOut={() => hover(false)}
                        onPointerUp={(e: any) => {
                            e.target.releasePointerCapture(e.pointerId);
                            drag(false);
                        }}
                        onPointerDown={(e: any) => {
                            e.target.setPointerCapture(e.pointerId);
                            if (card.current) {
                                drag(new THREE.Vector3().copy(e.point).sub(vec.copy(card.current.translation())));
                            }
                        }}
                    >
                        <Html
                            transform
                            scale={0.05}
                            position={[0, 0, 0]}
                            center
                            style={{
                                pointerEvents: 'auto',
                            }}
                        >
                            <div style={{ width: '480px', height: '650px' }}>
                                <PhysicsCardContent
                                    username={username}
                                    memberNumber={memberNumber}
                                />
                            </div>
                        </Html>
                    </group>
                </RigidBody>
            </group>

            {/* Lanyard Band */}
            <mesh ref={band}>
                <meshLineGeometry />
                <meshLineMaterial
                    color="#FF69B4"
                    depthTest={false}
                    resolution={isMobile ? [1000, 2000] : [1000, 1000]}
                    lineWidth={1}
                />
            </mesh>
        </>
    );
}

// Full card design from PhysicsCardBubblegum
function PhysicsCardContent({ username, memberNumber }: { username: string; memberNumber: number }) {
    const [isFlipped, setIsFlipped] = useState(false);
    const [hasFiredConfetti, setHasFiredConfetti] = useState(false);

    // Aurora gradient
    const auroraGradient = 'linear-gradient(90deg, #00FF87, #00FFAB, #00E5FF, #00FF87, #7B61FF, #00FFAB)';

    const displayNumber = memberNumber ? String(memberNumber).padStart(3, '0') : '001';

    // Fire confetti on mount
    useEffect(() => {
        if (!hasFiredConfetti) {
            setHasFiredConfetti(true);
            const end = Date.now() + 1500;
            const colors = ['#FF69B4', '#00FFAB', '#7B61FF', '#00E5FF', '#FFD700'];
            const frame = () => {
                confetti({
                    particleCount: 3,
                    angle: 60,
                    spread: 55,
                    origin: { x: 0 },
                    colors,
                });
                confetti({
                    particleCount: 3,
                    angle: 120,
                    spread: 55,
                    origin: { x: 1 },
                    colors,
                });
                if (Date.now() < end) requestAnimationFrame(frame);
            };
            frame();
        }
    }, [hasFiredConfetti]);

    return (
        <div
            onClick={() => setIsFlipped(!isFlipped)}
            style={{
                width: '480px',
                height: '650px',
                perspective: '1500px',
                cursor: 'pointer',
                transformStyle: 'preserve-3d',
            }}
        >
            {/* SVG Filters */}
            <svg style={{ position: 'absolute', width: 0, height: 0 }}>
                <defs>
                    <filter id="noiseFilterLanyard">
                        <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="3" stitchTiles="stitch" />
                        <feColorMatrix type="saturate" values="0" />
                        <feComponentTransfer>
                            <feFuncA type="linear" slope="0.05" />
                        </feComponentTransfer>
                    </filter>
                </defs>
            </svg>

            {/* Card container with flip */}
            <div style={{
                width: '100%',
                height: '100%',
                transformStyle: 'preserve-3d',
                transition: 'transform 0.6s ease',
                transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            }}>
                {/* Card edge / thickness */}
                <div style={{
                    position: 'absolute',
                    inset: '-3px',
                    borderRadius: '2.7rem',
                    background: 'linear-gradient(180deg, #d0d0d8 0%, #909098 30%, #b8b8c0 50%, #808088 70%, #c0c0c8 100%)',
                    zIndex: 0,
                }} />

                {/* FRONT FACE */}
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '2.5rem',
                    overflow: 'hidden',
                    backfaceVisibility: 'hidden',
                    transformStyle: 'preserve-3d',
                }}>
                    {/* Chrome metallic base */}
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '2.5rem',
                        background: 'linear-gradient(165deg, #e8e8ec 0%, #ffffff 8%, #8a8a96 18%, #d8d8e0 26%, #3a3a42 35%, #f0f0f4 42%, #6e6e7a 50%, #ffffff 58%, #4a4a54 65%, #e0e0e8 72%, #2e2e36 80%, #f8f8fc 88%, #a0a0ac 95%)',
                    }} />

                    {/* Liquid metal reflections */}
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '2.5rem',
                        background: 'linear-gradient(130deg, rgba(255,255,255,0.5) 0%, transparent 15%, rgba(255,255,255,0.3) 25%, transparent 35%, rgba(0,0,0,0.15) 45%, rgba(255,255,255,0.6) 55%, transparent 65%, rgba(0,0,0,0.1) 75%, rgba(255,255,255,0.4) 85%, transparent 100%)',
                        pointerEvents: 'none',
                    }} />

                    {/* Curved highlight */}
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '2.5rem',
                        background: 'radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.6) 0%, transparent 40%), radial-gradient(ellipse at 70% 80%, rgba(255,255,255,0.3) 0%, transparent 35%)',
                        pointerEvents: 'none',
                    }} />

                    {/* Noise texture */}
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '2.5rem',
                        opacity: 0.25,
                        mixBlendMode: 'soft-light',
                        filter: 'url(#noiseFilterLanyard)',
                        pointerEvents: 'none',
                    }} />

                    {/* Djinn logo watermark */}
                    <div style={{
                        position: 'absolute',
                        top: '16px',
                        right: '16px',
                        width: '144px',
                        height: '144px',
                        opacity: 0.15,
                        zIndex: 8,
                    }}>
                        <Image
                            src="/djinn-logo.png"
                            alt=""
                            width={200}
                            height={200}
                            style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'grayscale(1) brightness(2)' }}
                            unoptimized
                        />
                    </div>

                    {/* Content */}
                    <div style={{
                        position: 'relative',
                        zIndex: 10,
                        display: 'flex',
                        flexDirection: 'column',
                        height: '100%',
                        padding: '40px',
                        transformStyle: 'preserve-3d',
                    }}>
                        {/* Bottom chrome line */}
                        <div style={{
                            position: 'absolute',
                            bottom: '40px',
                            left: '40px',
                            right: '40px',
                            height: '1px',
                            background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.2), transparent)',
                        }} />

                        <div style={{ flex: 0.55 }} />

                        {/* Djinn title */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', paddingLeft: '16px', paddingBottom: '16px', transformStyle: 'preserve-3d' }}>
                            <h1 style={{
                                fontSize: '62px',
                                fontWeight: 700,
                                letterSpacing: '-0.02em',
                                lineHeight: 1.2,
                                margin: 0,
                                paddingBottom: '8px',
                                fontFamily: 'var(--font-adriane), serif',
                                background: auroraGradient,
                                backgroundSize: '200% auto',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                filter: 'drop-shadow(0 0 30px rgba(0,255,171,0.4)) drop-shadow(0 0 60px rgba(123,97,255,0.25))',
                                animation: 'aurora 4s linear infinite',
                            }}>
                                Djinn
                            </h1>
                        </div>

                        <div style={{ flex: 0.45 }} />

                        {/* Username and ID */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'flex-end',
                            justifyContent: 'space-between',
                            paddingLeft: '20px',
                            paddingRight: '20px',
                            paddingBottom: '12px',
                            transformStyle: 'preserve-3d',
                        }}>
                            <span style={{
                                fontSize: '18px',
                                fontWeight: 700,
                                letterSpacing: '0.05em',
                                textTransform: 'lowercase',
                                color: 'rgba(0,0,0,0.5)',
                                fontFamily: 'var(--font-unbounded), sans-serif',
                            }}>
                                @{username || 'agent'}
                            </span>
                            <span style={{
                                fontSize: '14px',
                                fontWeight: 900,
                                letterSpacing: '0.1em',
                                color: 'rgba(0,0,0,0.3)',
                                fontFamily: 'var(--font-unbounded), sans-serif',
                            }}>
                                #{displayNumber}
                            </span>
                        </div>
                    </div>

                    {/* Chrome shine sweep */}
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        insetInline: '-150%',
                        opacity: 0.35,
                        mixBlendMode: 'screen',
                        zIndex: 30,
                        background: 'linear-gradient(90deg, transparent 0%, transparent 35%, rgba(255,255,255,0.8) 50%, transparent 65%, transparent 100%)',
                        transform: 'skewX(-15deg)',
                        animation: 'chromeSweep 9s ease-in-out infinite',
                        pointerEvents: 'none',
                    }} />
                </div>

                {/* BACK FACE */}
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '2.5rem',
                    overflow: 'hidden',
                    backfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                    transformStyle: 'preserve-3d',
                }}>
                    {/* Chrome metallic base */}
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '2.5rem',
                        background: 'linear-gradient(165deg, #e8e8ec 0%, #ffffff 8%, #8a8a96 18%, #d8d8e0 26%, #3a3a42 35%, #f0f0f4 42%, #6e6e7a 50%, #ffffff 58%, #4a4a54 65%, #e0e0e8 72%, #2e2e36 80%, #f8f8fc 88%, #a0a0ac 95%)',
                    }} />

                    {/* Liquid metal reflections */}
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '2.5rem',
                        background: 'linear-gradient(150deg, rgba(255,255,255,0.4) 0%, transparent 12%, rgba(0,0,0,0.15) 22%, rgba(255,255,255,0.5) 35%, transparent 45%, rgba(255,255,255,0.3) 55%, rgba(0,0,0,0.1) 65%, rgba(255,255,255,0.5) 78%, transparent 90%)',
                        pointerEvents: 'none',
                    }} />

                    {/* Noise */}
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '2.5rem',
                        opacity: 0.25,
                        mixBlendMode: 'soft-light',
                        filter: 'url(#noiseFilterLanyard)',
                        pointerEvents: 'none',
                    }} />

                    {/* Back content */}
                    <div style={{
                        position: 'relative',
                        zIndex: 10,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        height: '100%',
                        padding: '40px',
                        paddingTop: '48px',
                        textAlign: 'center',
                        transformStyle: 'preserve-3d',
                    }}>
                        {/* Star watermark */}
                        <div style={{
                            position: 'relative',
                            width: '192px',
                            height: '192px',
                            marginBottom: '24px',
                            opacity: 0.1,
                        }}>
                            <Image
                                src="/star-sniper-new.png"
                                alt=""
                                width={400}
                                height={293}
                                style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'grayscale(1) brightness(2)' }}
                                unoptimized
                            />
                        </div>

                        {/* Djinn branding */}
                        <h2 style={{
                            fontSize: '48px',
                            fontWeight: 700,
                            letterSpacing: '-0.04em',
                            lineHeight: 0.85,
                            color: 'rgba(0,0,0,0.7)',
                            fontFamily: 'var(--font-adriane), serif',
                            marginBottom: '16px',
                            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
                        }}>
                            Djinn
                        </h2>

                        {/* Manifesto */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, width: '100%', maxWidth: '300px', flex: 1 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '12px' }}>
                                <span style={{ fontSize: '14px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.02em', color: 'rgba(0,0,0,0.7)' }}>Born to Trench</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(0,0,0,0.35)', fontFamily: 'var(--font-unbounded), sans-serif' }}>WRLD IS A CASINO</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '12px' }}>
                                <span style={{ fontSize: '16px', fontWeight: 900, letterSpacing: '0.05em', color: 'rgba(0,0,0,0.6)', fontFamily: 'var(--font-unbounded), sans-serif' }}>
                                    i am a <span style={{ fontFamily: 'var(--font-adriane), serif', fontWeight: 700 }}>Djinn</span>
                                </span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px' }}>
                                <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.15em', color: 'rgba(0,0,0,0.3)', fontFamily: 'var(--font-unbounded), sans-serif' }}>I PREDICT THE FUTURE</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px' }}>
                                <span style={{ fontSize: '10px', fontWeight: 900, letterSpacing: '0.08em', color: 'rgba(0,0,0,0.4)', fontFamily: 'var(--font-unbounded), sans-serif' }}>
                                    410,756,435,823 NEW PAIRS
                                </span>
                            </div>
                            <div style={{ flex: 1 }} />
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: '8px' }}>
                                <span style={{
                                    fontSize: '10px',
                                    fontWeight: 900,
                                    letterSpacing: '0.25em',
                                    textTransform: 'uppercase',
                                    fontFamily: 'var(--font-unbounded), sans-serif',
                                    background: auroraGradient,
                                    backgroundSize: '200% auto',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                    filter: 'drop-shadow(0 0 15px rgba(0,229,255,0.4))',
                                    animation: 'aurora 4s linear infinite',
                                }}>
                                    Ape em all 2026 未来はあなたのもの
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Chrome shine sweep back */}
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        insetInline: '-150%',
                        opacity: 0.18,
                        mixBlendMode: 'screen',
                        zIndex: 30,
                        background: 'linear-gradient(90deg, transparent 0%, transparent 35%, rgba(255,255,255,0.7) 50%, transparent 65%, transparent 100%)',
                        transform: 'skewX(-15deg)',
                        animation: 'chromeSweepBack 9s ease-in-out infinite',
                        pointerEvents: 'none',
                    }} />
                </div>
            </div>

            <style>{`
                @keyframes aurora {
                    0% { background-position: 0% center; }
                    100% { background-position: 200% center; }
                }
                @keyframes chromeSweep {
                    0%, 44% { transform: translateX(-100%) skewX(-15deg); }
                    56%, 100% { transform: translateX(250%) skewX(-15deg); }
                }
                @keyframes chromeSweepBack {
                    0%, 33% { transform: translateX(-100%) skewX(-15deg); }
                    67%, 100% { transform: translateX(250%) skewX(-15deg); }
                }
            `}</style>
        </div>
    );
}
