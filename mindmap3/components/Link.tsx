import React from 'react';
import { linkHorizontal } from 'd3-shape';
import { motion } from 'framer-motion';
import { MindMapNode } from '../types';

interface LinkNode {
    x: number;
    y: number;
    data: MindMapNode;
}

interface LinkProps {
  link: {
      source: LinkNode;
      target: LinkNode;
  };
}

const linkGenerator = linkHorizontal<any, LinkNode>()
  .x(d => d.x)
  .y(d => d.y);

const Link: React.FC<LinkProps> = ({ link }) => {
  const pathData = linkGenerator(link);
  if (!pathData) return null;

  return (
    <g>
      <motion.path
        className="mindmap-link"
        initial={{ d: pathData, opacity: 0 }}
        animate={{ d: pathData, opacity: 1 }}
        transition={{
          d: {
            ease: [0.22, 1, 0.36, 1], // easeOutQuint
            duration: 0.4
          },
          opacity: {
            duration: 0.4
          }
        }}
        fill="none"
        stroke={link.target.data.color}
        strokeWidth="3"
        style={{ pointerEvents: 'none' }}
      />
    </g>
  );
};

const areEqual = (prevProps: LinkProps, nextProps: LinkProps) => {
    // This custom comparison function prevents re-rendering if the link's
    // visual properties (positions and color) have not changed. This is a
    // major performance boost, especially during panning operations where the
    // parent component re-renders, creating new objects for props.
    return (
        prevProps.link.source.x === nextProps.link.source.x &&
        prevProps.link.source.y === nextProps.link.source.y &&
        prevProps.link.target.x === nextProps.link.target.x &&
        prevProps.link.target.y === nextProps.link.target.y &&
        prevProps.link.target.data.color === nextProps.link.target.data.color
    );
};


export default React.memo(Link, areEqual);