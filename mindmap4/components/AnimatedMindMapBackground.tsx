import React, { useRef, useMemo } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';

const NUM_NODES = 25;
const NODE_SIZE_RANGE = [8, 20];
const LINK_OPACITY = 0.2;

const AnimatedMindMapBackground: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const mouseX = useMotionValue(0.5);
    const mouseY = useMotionValue(0.5);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (containerRef.current) {
            const { left, top, width, height } = containerRef.current.getBoundingClientRect();
            mouseX.set((e.clientX - left) / width);
            mouseY.set((e.clientY - top) / height);
        }
    };

    const nodes = useMemo(() => {
        return Array.from({ length: NUM_NODES }).map((_, i) => {
            const size = Math.random() * (NODE_SIZE_RANGE[1] - NODE_SIZE_RANGE[0]) + NODE_SIZE_RANGE[0];
            const isCenter = i === 0;
            return {
                id: i,
                x: isCenter ? 50 : Math.random() * 100,
                y: isCenter ? 50 : Math.random() * 100,
                size: isCenter ? NODE_SIZE_RANGE[1] * 1.5 : size,
                color: isCenter ? '#38bdf8' : '#a855f7', // sky-400, purple-500
                depth: Math.random() * 0.8 + 0.2, // Random depth for parallax effect
            };
        });
    }, []);

    const links = useMemo(() => {
        return nodes.slice(1).map(node => ({
            source: nodes[0],
            target: node,
        }));
    }, [nodes]);

    const parallaxX = useTransform(mouseX, [0, 1], [-20, 20]);
    const parallaxY = useTransform(mouseY, [0, 1], [-20, 20]);

    return (
        <motion.div
            ref={containerRef}
            className="absolute inset-0 z-0"
            onMouseMove={handleMouseMove}
            style={{ x: parallaxX, y: parallaxY }}
            transition={{ type: 'spring', stiffness: 100, damping: 20 }}
        >
            <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
                <defs>
                    <filter id="glow">
                        <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>
                <g opacity={LINK_OPACITY}>
                    {links.map((link, i) => (
                        <motion.line
                            key={i}
                            x1={`${link.source.x}%`}
                            y1={`${link.source.y}%`}
                            x2={`${link.target.x}%`}
                            y2={`${link.target.y}%`}
                            stroke="white"
                            strokeWidth="1"
                            animate={{
                                x1: `${link.source.x}%`,
                                y1: `${link.source.y}%`,
                                x2: `${link.target.x}%`,
                                y2: `${link.target.y}%`,
                            }}
                        />
                    ))}
                </g>
                <g>
                    {nodes.map(node => (
                        <motion.circle
                            key={node.id}
                            r={node.size / 2}
                            fill={node.color}
                            opacity={node.depth * 0.6 + 0.3}
                            style={{ filter: 'url(#glow)' }}
                            animate={{
                                cx: `${node.x}%`,
                                cy: `${node.y}%`,
                            }}
                            transition={{
                                duration: Math.random() * 10 + 10,
                                repeat: Infinity,
                                repeatType: 'mirror',
                                ease: 'easeInOut'
                            }}
                        />
                    ))}
                </g>
            </svg>
        </motion.div>
    );
};

export default AnimatedMindMapBackground;
