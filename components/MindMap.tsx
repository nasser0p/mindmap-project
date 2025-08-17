// In MindMap.tsx

import React, { useState, useEffect, useMemo, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { select, Selection, pointer } from 'd3-selection';
import { zoom, zoomIdentity, ZoomTransform, ZoomBehavior, zoomTransform } from 'd3-zoom';
import { drag, D3DragEvent } from 'd3-drag';
import { hierarchy, tree, HierarchyNode, HierarchyPointNode, HierarchyPointLink } from 'd3-hierarchy';
import { easeCubicOut } from 'd3-ease';
import 'd3-transition';
import { motion, AnimatePresence } from 'framer-motion';
import { MindMapNode as MindMapNodeData, MindMapLink } from '../types';
import Node from './Node';
import Link from './Link';
import EditableLink from './EditableLink';
import NodeToolbar from './NodeToolbar';
import FocusBar from './FocusBar';

export interface MindMapActions {
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;
}

interface MindMapProps {
  root: MindMapNodeData;
  links: MindMapLink[];
  selectedNodeIds: Set<string>;
  focusedNodeId: string | null;
  nodeToEditOnRender: string | null;
  generatingIdeasForNodeId: string | null;
  rephrasingNodeId: string | null;
  extractingConceptsNodeId: string | null;
  generatingAnalogyNodeId: string | null;
  glowingNodeIds: string[];
  onNodeSelect: (ids: Set<string>) => void;
  onFocusNode: (id: string | null) => void;
  onNodeUpdate: (id:string, text: string) => void;
  onNodeDelete: (id: string) => void;
  onDeleteNodes: (ids: Set<string>) => void;
  onNodeMove: (sourceId: string, targetId: string) => void;
  onNodePositionUpdate: (id: string, x: number, y: number) => void;
  onMultipleNodePositionsUpdate: (positions: Map<string, { x: number; y: number }>) => void;
  onAddChild: (parentId: string) => void;
  onInsertParentNode: (childId: string) => void;
  onToggleCollapse: (nodeId: string) => void;
  onGenerateIdeas: (nodeId: string) => void;
  onRephraseNode: (nodeId: string) => void;
  onExtractConcepts: (nodeId: string) => void;
  onGenerateAnalogy: (nodeId: string) => void;
  onSetNodeColor: (nodeId: string, color: string) => void;
  onEditComplete: () => void;
  onAddLink: (sourceId: string, targetId: string) => void;
  onUpdateLinkLabel: (linkId: string, label: string) => void;
  onDeleteLink: (linkId: string) => void;
  onShowAttachments: (nodeId: string) => void;
  onSetNodeImage: (nodeId: string, file: File) => void;
  onRemoveNodeImage: (nodeId: string) => void;
  onViewImage: (dataUrl: string) => void;
  onNodeDragStart: () => void;
  getAllDescendantIds: (node: MindMapNodeData) => string[];
  onTransformChange: (transform: ZoomTransform) => void;
  onLayoutUpdate: (positions: Map<string, { x: number; y: number }>) => void;
}

const minNodeHeight = 52;
const nodeWidthForHitbox = 220;
const nodeHeightForHitbox = 150;
const CLICK_DRAG_THRESHOLD = 5; // pixels
const TOOLBAR_WIDTH = 320;
const TOOLBAR_HEIGHT = 40;
const TOOLBAR_Y_OFFSET = 15;

// Helper functions for tree traversal
const findNodeById = (root: MindMapNodeData, nodeId: string): MindMapNodeData | null => {
  if (root.id === nodeId) return root;
  if (root.children) {
    for (const child of root.children) {
      const found = findNodeById(child, nodeId);
      if (found) return found;
    }
  }
  return null;
}
const findNodePathObjects = (root: MindMapNodeData, nodeId: string): MindMapNodeData[] => {
    function find(currentPath: MindMapNodeData[], node: MindMapNodeData): MindMapNodeData[] | null {
        const newPath = [...currentPath, node];
        if (node.id === nodeId) {
            return newPath;
        }
        if (node.children) {
            for (const child of node.children) {
                const result = find(newPath, child);
                if (result) return result;
            }
        }
        return null;
    }
    return find([], root) || [];
};

const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number,
): ((...args: Parameters<T>) => ReturnType<T> | void) => {
  let inThrottle: boolean;
  let lastResult: ReturnType<T>;

  return function(this: ThisParameterType<T>, ...args: Parameters<T>) {
    if (!inThrottle) {
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
      lastResult = func.apply(this, args);
    }
    return lastResult;
  };
};

const getStructuralId = (node: MindMapNodeData, count: { value: number }): string => {
  count.value++;
  // A recursive function to create a string that represents the tree structure.
  // It now includes node positions and color to ensure layout updates after a drag or style change.
  let id = `${node.id}@${node.x?.toFixed(0)},${node.y?.toFixed(0)}:${node.color || 'default'}`;
  if (node.isCollapsed) {
    id += '[c]'; // 'c' for collapsed
  } else if (node.children && node.children.length > 0) {
    id += `[${node.children.map(child => getStructuralId(child, count)).join(',')}]`;
  }
  return id;
};


const MindMap = forwardRef<MindMapActions, MindMapProps>((props, ref) => {
  const { 
    root, 
    links: typedLinks,
    selectedNodeIds, 
    focusedNodeId,
    nodeToEditOnRender,
    generatingIdeasForNodeId,
    rephrasingNodeId,
    extractingConceptsNodeId,
    generatingAnalogyNodeId,
    glowingNodeIds,
    onNodeSelect, 
    onFocusNode,
    onNodeUpdate, 
    onNodeDelete, 
    onDeleteNodes,
    onNodeMove,
    onNodePositionUpdate: persistNodePosition,
    onMultipleNodePositionsUpdate,
    onAddChild,
    onInsertParentNode,
    onToggleCollapse,
    onGenerateIdeas,
    onRephraseNode,
    onExtractConcepts,
    onGenerateAnalogy,
    onSetNodeColor,
    onEditComplete,
    onAddLink,
    onUpdateLinkLabel,
    onDeleteLink,
    onShowAttachments,
    onSetNodeImage,
    onRemoveNodeImage,
    onViewImage,
    onNodeDragStart,
    getAllDescendantIds,
    onTransformChange,
    onLayoutUpdate,
  } = props;

  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown>>();
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [nodeSizes, setNodeSizes] = useState<Record<string, {width: number, height: number}>>({});
  const [isInitialTransformSet, setIsInitialTransformSet] = useState(false);
  const [drawingLinkState, setDrawingLinkState] = useState<{ sourceId: string; endPos: { x: number; y: number; } } | null>(null);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [nodePositions, setNodePositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; width: number; height: number; } | null>(null);
  const [isBoxSelecting, setIsBoxSelecting] = useState(false);
  const selectionBoxRef = useRef<{ x: number; y: number; width: number; height: number; } | null>(null);

  const selectedNodeIdsRef = useRef(selectedNodeIds);
  useEffect(() => { selectedNodeIdsRef.current = selectedNodeIds; }, [selectedNodeIds]);

  const dropTargetIdRef = useRef(dropTargetId);
  dropTargetIdRef.current = dropTargetId;

  const lastSelectedNodeId = useMemo(() => {
    if (selectedNodeIds.size === 0) return null;
    return Array.from(selectedNodeIds).pop()!;
  }, [selectedNodeIds]);

  const handleNodeSizeChange = useCallback((id: string, size: {width: number, height: number}) => {
    setNodeSizes(prev => {
        if (prev[id]?.width === size.width && prev[id]?.height === size.height) {
            return prev;
        }
        return {...prev, [id]: size};
    });
  }, []);

  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      if (zoomBehaviorRef.current && svgRef.current) {
        zoomBehaviorRef.current.scaleBy(select(svgRef.current).transition().duration(250), 1.2);
      }
    },
    zoomOut: () => {
      if (zoomBehaviorRef.current && svgRef.current) {
        zoomBehaviorRef.current.scaleBy(select(svgRef.current).transition().duration(250), 0.8);
      }
    },
    zoomToFit: () => {
      const svgElement = svgRef.current;
      const gElement = gRef.current;
      const zoomBehavior = zoomBehaviorRef.current;
      if (!svgElement || !gElement || !zoomBehavior || !dimensions.width) return;
      
      const gBounds = gElement.getBBox();
      if (!gBounds.width || !gBounds.height) return;
      
      const { width, height } = dimensions;
      const fullWidth = gBounds.width;
      const fullHeight = gBounds.height;
      
      const scale = 0.9 * Math.min(width / fullWidth, height / fullHeight);
      const newX = width / 2 - (gBounds.x + fullWidth / 2) * scale;
      const newY = height / 2 - (gBounds.y + fullHeight / 2) * scale;
      
      const newTransform = zoomIdentity.translate(newX, newY).scale(scale);
      
      const transition = select(svgElement).transition().duration(400);
      zoomBehavior.transform(transition, newTransform);
    }
  }));

  // --- Determine the root for display (full tree or focused subtree) ---
  const displayRoot = useMemo(() => {
    if (!focusedNodeId) {
        return root;
    }
    // Deep clone is important here to not mutate the original data
    const focusedNode = findNodeById(JSON.parse(JSON.stringify(root)), focusedNodeId);
    return focusedNode || root;
  }, [root, focusedNodeId]);

  // --- Manual memoization for expensive D3 layout calculation ---
  const d3RootRef = useRef<HierarchyNode<MindMapNodeData>>();
  const structuralIdRef = useRef<string>();
  
  // Memoize the expensive structural ID calculation to prevent re-running it on every pan/zoom.
  const structuralId = useMemo(() => {
    const count = { value: 0 };
    const structure = getStructuralId(displayRoot, count);
    return `${structure}|count:${count.value}`;
  }, [displayRoot]);
  
  const originalNodesMap = useMemo(() => {
    const map = new Map<string, MindMapNodeData>();
    if (!root) return map;
    hierarchy<MindMapNodeData>(root).each(d => map.set(d.data.id, d.data));
    return map;
  }, [root]);
  
  // This block replaces the previous useMemo for d3Root.
  // It only recalculates the layout if the tree's structure has actually changed,
  // preventing expensive re-calculations during simple pans or zooms.
  if (structuralId !== structuralIdRef.current) {
    structuralIdRef.current = structuralId;
    
    // This deep clone is necessary to handle collapsed nodes for layout purposes
    // without modifying the original data structure.
    const deepCloneAndFilter = (node: MindMapNodeData): MindMapNodeData => {
      const newNode = { ...node };
      if (node.isCollapsed) {
        newNode.children = []; // Prune children for layout if collapsed
      } else if (node.children) {
        newNode.children = node.children.map((child) => deepCloneAndFilter(child));
      }
      return newNode;
    };
    const layoutReadyRoot = deepCloneAndFilter(displayRoot);
    
    const hierarchyData = hierarchy<MindMapNodeData>(layoutReadyRoot);

    // 1. ALWAYS run the tree layout to get baseline positions for all nodes.
    const treeLayout = tree<MindMapNodeData>().nodeSize([200, 320]);
    treeLayout(hierarchyData);

    // Before overriding positions, determine the common 'x' for groups of siblings that have been moved.
    const siblingGroupX = new Map<string, number>(); // Key: parentId, Value: common x-coordinate
    hierarchyData.each(node => {
        // We only care about nodes that have children
        if (!node.children || node.children.length === 0) return;

        // Find the first child that has a user-defined position
        const firstMovedChild = node.children.find(child => originalNodesMap.get(child.data.id)?.x !== undefined);

        if (firstMovedChild) {
            // If we found one, get its x position and store it for this parent
            const commonX = originalNodesMap.get(firstMovedChild.data.id)!.x!;
            siblingGroupX.set(node.data.id, commonX);
        }
    });

    // 2. Iterate and apply overrides.
    hierarchyData.each(d => {
        // Swap x/y for a horizontal layout
        const tempX = d.x;
        d.x = d.y;
        d.y = tempX;
        
        const originalNode = originalNodesMap.get(d.data.id);
        if (originalNode) {
            if (originalNode.x !== undefined) {
                // Keep existing horizontal position for dragged nodes
                d.x = originalNode.x;
            } else if (d.parent && siblingGroupX.has(d.parent.data.id)) {
                // This is a new node, align it with its moved siblings
                d.x = siblingGroupX.get(d.parent.data.id)!;
            }
            
            if (originalNode.y !== undefined) {
                // Keep existing vertical position (for fully dragged nodes),
                // otherwise use the new D3-calculated y position for reorganization.
                d.y = originalNode.y;
            }
        }
    });

    d3RootRef.current = hierarchyData;
  }
  
  const d3Root = d3RootRef.current!;

  // This effect runs after the layout is calculated to persist new node positions.
  // It is the fix for the infinite render loop.
  useEffect(() => {
    if (!d3Root) return;

    const positionsToPersist = new Map<string, { x: number; y: number }>();
    let needsUpdate = false;
    
    d3Root.each(d => {
      // If an original node didn't have a position, it's new.
      const originalNode = originalNodesMap.get(d.data.id);
      if (originalNode && originalNode.x === undefined && d.x !== undefined) {
        positionsToPersist.set(d.data.id, { x: d.x, y: d.y });
        needsUpdate = true;
      }
    });

    if (needsUpdate) {
      onLayoutUpdate(positionsToPersist);
    }
  }, [d3Root, originalNodesMap, onLayoutUpdate]);

  const nodes = useMemo(() => (d3Root ? d3Root.descendants() : []) as HierarchyPointNode<MindMapNodeData>[], [d3Root]);
  const hierarchicalLinks = useMemo(() => (d3Root ? d3Root.links() : []) as HierarchyPointLink<MindMapNodeData>[], [d3Root]);
  
  useEffect(() => {
    if (d3Root) {
        const newPositions = new Map<string, { x: number; y: number }>();
        const allNodesInData = hierarchy<MindMapNodeData>(root).descendants();

        // Iterate over the D3 layout to get positions
        d3Root.descendants().forEach(layoutNode => {
            const fullNodeData = allNodesInData.find(n => n.data.id === layoutNode.data.id);
            
            // Prioritize existing, user-defined positions from the main data prop
            if (fullNodeData && fullNodeData.data.x !== undefined && fullNodeData.data.y !== undefined) {
                newPositions.set(layoutNode.data.id, { x: fullNodeData.data.x, y: fullNodeData.data.y });
            } 
            // Otherwise, use the D3-calculated position (for new nodes)
            else if (layoutNode.x !== undefined && layoutNode.y !== undefined) {
                newPositions.set(layoutNode.data.id, { x: layoutNode.x, y: layoutNode.y });
            }
        });
        setNodePositions(newPositions);
    }
  }, [d3Root, root]); // Add `root` to the dependency array

  // Create refs to hold the latest values of nodes and their positions.
  // This allows the camera-panning effect to access up-to-date data without
  // creating a dependency that would cause it to re-run on every drag/pan.
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const nodePositionsRef = useRef(nodePositions);
  nodePositionsRef.current = nodePositions;

  const selectedNodeData = useMemo(() => originalNodesMap.get(lastSelectedNodeId || '') || null, [originalNodesMap, lastSelectedNodeId]);
  
  // Effect for handling component resizing and setting initial transform state
  useEffect(() => {
    const resizeObserver = new ResizeObserver(entries => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        setDimensions({ width, height });
        if (!isInitialTransformSet && d3Root) {
            const initialTransform = zoomIdentity.translate(width / 2, height / 2);
            setTransform(initialTransform);
            setIsInitialTransformSet(true);
        }
      }
    });
    const parent = svgRef.current?.parentElement;
    if (parent) resizeObserver.observe(parent);
    return () => { if (parent) resizeObserver.unobserve(parent); };
  }, [isInitialTransformSet, d3Root]);
  
  const throttledSetTransform = useMemo(() => throttle((newTransform: ZoomTransform) => {
      setTransform(newTransform);
  }, 50), []);

  // Effect to handle D3 zoom behavior. This now runs only once.
  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    const svg = select(svgRef.current);

    const zoomBehavior = zoom<SVGSVGElement, unknown>();
    
    zoomBehavior
      .scaleExtent([0.2, 3])
      .filter((evt) => {
        const target = evt.target as Element;
        // Allow wheel zoom
        if (evt.type === 'wheel') return evt.ctrlKey === false;
        // Allow panning if Ctrl/Cmd is NOT pressed and not on an interactive element
        return evt.ctrlKey === false && evt.metaKey === false && target.closest('.node-group, .editable-link-group, .node-toolbar-wrapper, .focus-bar') === null;
      })
      .on('zoom', ({ transform }) => {
        // D3 imperatively updates the DOM for smooth visuals
        select(gRef.current!).attr('transform', transform);
        // Throttled React state update for culling logic, does not cause a feedback loop.
        throttledSetTransform(transform);
        onTransformChange(transform);
      });

    zoomBehavior(svg);
    svg.on("dblclick.zoom", null);
    zoomBehaviorRef.current = zoomBehavior;

    // Apply the initial transform when the component is ready
    if (isInitialTransformSet) {
        zoomBehavior.transform(svg, transform);
    }
    
    return () => { svg.on('.zoom', null); };
  }, [isInitialTransformSet, throttledSetTransform, onTransformChange]);

  // Effect for the box selection drag behavior
  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    const svg = select(svgRef.current);

    // This variable will be captured by the closure of the drag handlers
    // to store the initial drag position.
    let startPos: { x: number; y: number } | null = null;

    const selectionDrag = drag<SVGSVGElement, unknown>()
        .filter((event, d) => (event.ctrlKey || event.metaKey) && event.target === svgRef.current)
        .on('start', (event, d) => {
            setIsBoxSelecting(true);
            const currentTransform = zoomTransform(svgRef.current!);
            const [x, y] = currentTransform.invert([event.x, event.y]);
            startPos = { x, y };
            const newBox = { x: startPos.x, y: startPos.y, width: 0, height: 0 };
            setSelectionBox(newBox);
            selectionBoxRef.current = newBox;
        })
        .on('drag', (event, d) => {
            if (!startPos) return;
            const currentTransform = zoomTransform(svgRef.current!);
            const [cursorX, cursorY] = currentTransform.invert([event.x, event.y]);
            
            const newWidth = cursorX - startPos.x;
            const newHeight = cursorY - startPos.y;

            const newBox = {
                x: newWidth > 0 ? startPos.x : cursorX,
                y: newHeight > 0 ? startPos.y : cursorY,
                width: Math.abs(newWidth),
                height: Math.abs(newHeight),
            };
            
            setSelectionBox(newBox);
            selectionBoxRef.current = newBox;
        })
        .on('end', (event, d) => {
            setIsBoxSelecting(false);
            const finalSelectionBox = selectionBoxRef.current;

            if (finalSelectionBox && (finalSelectionBox.width > 5 || finalSelectionBox.height > 5)) {
                const { x, y, width, height } = finalSelectionBox;
                const selectedIds = new Set<string>();

                const currentNodes = nodesRef.current;
                const currentPositions = nodePositionsRef.current;
                const currentSelection = selectedNodeIdsRef.current;

                currentNodes.forEach(node => {
                    const pos = currentPositions.get(node.data.id);
                    if (pos && pos.x >= x && pos.x <= x + width && pos.y >= y && pos.y <= y + height) {
                        selectedIds.add(node.data.id);
                    }
                });

                if ('shiftKey' in event.sourceEvent && event.sourceEvent.shiftKey) {
                    const newSelection = new Set(currentSelection);
                    selectedIds.forEach(id => newSelection.add(id));
                    onNodeSelect(newSelection);
                } else {
                    onNodeSelect(selectedIds);
                }
            }
            
            setSelectionBox(null);
            selectionBoxRef.current = null;
            startPos = null; // Clean up
        });

    svg.call(selectionDrag);

    return () => { svg.on('.drag', null); };
  }, [onNodeSelect]);

  const initialCenteringDoneRef = useRef(false);

  // When the document changes, reset the centering flag.
  useEffect(() => {
    initialCenteringDoneRef.current = false;
  }, [root.id]);

  // Effect to pan/zoom camera for focus or initial load.
  useEffect(() => {
    if (!dimensions.width || !svgRef.current || !zoomBehaviorRef.current || !isInitialTransformSet) return;

    const svg = select(svgRef.current);
    const svgNode = svg.node();
    if (!svgNode) return;
    const currentTransform = zoomTransform(svgNode);
    let k = currentTransform.k;
    
    let targetNodeId: string | null = null;
    
    // Case 1: A node is focused. This is the highest priority.
    if (focusedNodeId) {
        targetNodeId = focusedNodeId;
    } 
    // Case 2: It's the initial load for this document. Center the root.
    else if (!initialCenteringDoneRef.current) {
        targetNodeId = root.id;
        k = 1; // Reset zoom on initial load for a predictable view.
        initialCenteringDoneRef.current = true;
    }

    // If there's no target, don't do anything. This prevents re-centering on resize.
    if (!targetNodeId) return;
    
    const currentNodes = nodesRef.current;
    const currentPositions = nodePositionsRef.current;
    
    const targetNode = currentNodes.find(n => n.data.id === targetNodeId);
    if (!targetNode) return;

    const nodePos = currentPositions.get(targetNode.data.id);
    if (!nodePos) return; 
    
    const { x: targetX, y: targetY } = nodePos;
    
    const newTransform = zoomIdentity
        .translate(dimensions.width / 2 - targetX * k, dimensions.height / 2 - targetY * k)
        .scale(k);

    const transition = svg.transition().duration(400).ease(easeCubicOut);
    zoomBehaviorRef.current.transform(transition, newTransform);
       
  }, [focusedNodeId, isInitialTransformSet, dimensions, root.id]);


  const isDescendant = useCallback((node: HierarchyNode<MindMapNodeData>, id: string): boolean => node.descendants().some(d => d.data.id === id), []);

  // Effect to handle drag behavior on nodes
  useEffect(() => {
    if (!gRef.current || !d3Root) return;

    const gNodes = select(gRef.current).selectAll<SVGGElement, HierarchyPointNode<MindMapNodeData>>('g.node-group');

    // This ref will store the initial offsets of all selected nodes from the mouse position
    const dragStartOffsets = new Map<string, { dx: number; dy: number }>();
    
    type DragEvent = D3DragEvent<SVGGElement, HierarchyPointNode<MindMapNodeData>, HierarchyPointNode<MindMapNodeData>>;

    const dragBehavior = drag<SVGGElement, HierarchyPointNode<MindMapNodeData>>()
      .filter((event, d) => {
        const target = event.target as Element;
        if (focusedNodeId && d.data.id === focusedNodeId) return false;
        return !!target.closest('.mind-map-node-draggable-part');
      })
      .on('start', function (this: SVGGElement, event: DragEvent, d: HierarchyPointNode<MindMapNodeData>) {
        onNodeDragStart();
        event.sourceEvent.stopPropagation();
        select(this).raise();
        
        let currentSelection = selectedNodeIds;
        // If the dragged node is not already selected, select ONLY it.
        if (!selectedNodeIds.has(d.data.id)) {
            currentSelection = new Set([d.data.id]);
            onNodeSelect(currentSelection);
        }
        setDraggedNodeId(d.data.id);
        
        // Calculate offsets for ALL selected nodes from the initial drag point
        dragStartOffsets.clear();
        currentSelection.forEach(id => {
            const nodePos = nodePositions.get(id);
            if (nodePos) {
                dragStartOffsets.set(id, { dx: nodePos.x - event.x, dy: nodePos.y - event.y });
            }
        });
      })
      .on('drag', function (this: SVGGElement, event: DragEvent, d: HierarchyPointNode<MindMapNodeData>) {
        // This is the key fix: Update the nodePositions state on every drag event.
        // This forces React to re-render the map, including the links.
        setNodePositions(currentPositions => {
            const newPositions = new Map(currentPositions);
            dragStartOffsets.forEach((offset, id) => {
                newPositions.set(id, { x: event.x + offset.dx, y: event.y + offset.dy });
            });
            return newPositions;
        });

        // Drop target logic (remains the same)
        let currentTargetId: string | null = null;
        if (dragStartOffsets.size === 1) { // Reparenting only for single node drags
            const hitTarget = nodes.find(targetNode => {
              if (targetNode.data.id === d.data.id) return false;
              const targetPos = nodePositions.get(targetNode.data.id);
              if (!targetPos) return false;
              return event.x > targetPos.x - nodeWidthForHitbox / 2 && event.x < targetPos.x + nodeWidthForHitbox / 2 && event.y > targetPos.y - nodeHeightForHitbox / 2 && event.y < targetPos.y + nodeHeightForHitbox / 2;
            });
            const draggedNodeHierarchy = nodes.find(n => n.data.id === d.data.id);
            if (hitTarget && draggedNodeHierarchy && !isDescendant(draggedNodeHierarchy, hitTarget.data.id)) {
                currentTargetId = hitTarget.data.id;
            }
        }
        setDropTargetId(currentTargetId);
      })
      .on('end', function (this: SVGGElement, event: DragEvent, d: HierarchyPointNode<MindMapNodeData>) {
        const finalDropTargetId = dropTargetIdRef.current;

        if (finalDropTargetId && dragStartOffsets.size === 1) {
            onNodeMove(d.data.id, finalDropTargetId);
        } else {
            // Persist the final positions of all dragged nodes
            const positionsToUpdate = new Map<string, { x: number; y: number }>();
            dragStartOffsets.forEach((offset, id) => {
                positionsToUpdate.set(id, { x: event.x + offset.dx, y: event.y + offset.dy });
            });
            onMultipleNodePositionsUpdate(positionsToUpdate);
        }

        setDraggedNodeId(null);
        setDropTargetId(null);
        dragStartOffsets.clear();
      });

    gNodes.call(dragBehavior);

    return () => { gNodes.on('.drag', null); };
  }, [nodes, d3Root, selectedNodeIds, nodePositions, onNodeSelect, onNodeDragStart, onMultipleNodePositionsUpdate, onNodeMove, isDescendant, focusedNodeId, root.id]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if(selectedNodeIds.size > 0 && Array.from(selectedNodeIds).every(id => id !== root.id)) {
        onDeleteNodes(selectedNodeIds);
      } else if (selectedLinkId) {
        onDeleteLink(selectedLinkId);
        setSelectedLinkId(null);
      }
    }
  }, [selectedNodeIds, root.id, selectedLinkId, onDeleteNodes, onDeleteLink]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (drawingLinkState && gRef.current) {
      const CTM = gRef.current.getScreenCTM();
      if (CTM) {
        const transformedPoint = {
          x: (e.clientX - CTM.e) / CTM.a,
          y: (e.clientY - CTM.f) / CTM.d
        };
        setDrawingLinkState(prev => prev ? { ...prev, endPos: transformedPoint } : null);
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (drawingLinkState) {
      const targetElement = e.target as Element;
      const nodeGroup = targetElement.closest('.node-group');
      if (nodeGroup) {
        const targetNodeData = (select(nodeGroup).datum() as HierarchyPointNode<MindMapNodeData>).data;
        if(targetNodeData) {
            onAddLink(drawingLinkState.sourceId, targetNodeData.id);
        }
      }
      setDrawingLinkState(null);
    }
  };

  const focusPath = useMemo(() => {
    if (!focusedNodeId) return [];
    return findNodePathObjects(root, focusedNodeId);
  }, [root, focusedNodeId]);
  
  const handleSelectLink = useCallback((linkId: string | null) => {
    setSelectedLinkId(linkId);
    if(linkId) {
        onNodeSelect(new Set());
    }
  }, [onNodeSelect]);

  const handleNodeSelect = useCallback((id: string, event: React.MouseEvent) => {
      event.stopPropagation();
      setSelectedLinkId(null);

      const isCtrlOrMeta = event.ctrlKey || event.metaKey;
      const isShift = event.shiftKey;

      if (isShift) {
          // Shift+Click: Replace current selection with the clicked node's entire branch.
          const clickedNode = findNodeById(root, id);
          if (clickedNode) {
              const branchIds = [id, ...getAllDescendantIds(clickedNode)];
              onNodeSelect(new Set(branchIds));
          }
      } else if (isCtrlOrMeta) {
          // Ctrl/Cmd+Click: Add or remove a single node from the current selection.
          const newSelection = new Set(selectedNodeIds);
          if (newSelection.has(id)) {
              newSelection.delete(id);
          } else {
              newSelection.add(id);
          }
          onNodeSelect(newSelection);
      } else {
          // Simple Click: Select only the clicked node.
          onNodeSelect(new Set([id]));
      }
  }, [selectedNodeIds, onNodeSelect, root, getAllDescendantIds]);


  // ---- Culling Logic ----
  const [visibleNodes, setVisibleNodes] = useState<Set<string>>(new Set());

  useEffect(() => {
    const { width, height } = dimensions;
    if (!width || !height) return;

    const cullNodes = () => {
        const { x, y, k } = transform;
        const visible = new Set<string>();

        nodes.forEach(node => {
            const transformedX = node.x * k + x;
            const transformedY = node.y * k + y;
            const nodeSize = nodeSizes[node.data.id] || { width: 220, height: minNodeHeight };
            const nodeWidth = nodeSize.width * k;
            const nodeHeight = nodeSize.height * k;

            if (transformedX + nodeWidth > 0 && transformedX < width &&
                transformedY + nodeHeight > 0 && transformedY < height) {
                visible.add(node.data.id);
            }
        });
        setVisibleNodes(visible);
    };

    // Run once on initial render and then rely on throttled updates
    cullNodes();
  }, [nodes, dimensions, transform, nodeSizes]);

  if (!d3Root) {
    return <div>Loading...</div>; // Or some loading shell
  }
  
  return (
    <>
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        onClick={(e) => { if (e.target === svgRef.current) { onNodeSelect(new Set()); setSelectedLinkId(null); } }}
        onKeyDown={handleKeyDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        tabIndex={0}
        className={`focus:outline-none ${isBoxSelecting || drawingLinkState ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
      >
        <defs>
          <marker id="arrowhead" viewBox="-0 -5 10 10" refX="5" refY="0" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,-5L10,0L0,5" fill="#9ca3af"></path>
          </marker>
          <marker id="arrowhead-selected" viewBox="-0 -5 10 10" refX="5" refY="0" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,-5L10,0L0,5" fill="#3b82f6"></path>
          </marker>
        </defs>
        <g ref={gRef} className="zoom-container">
          <g key="links">
            {hierarchicalLinks.map(link => {
              const sourcePos = nodePositions.get(link.source.data.id);
              const targetPos = nodePositions.get(link.target.data.id);
              if (!sourcePos || !targetPos) return null;

              // Create a new link object with live positions from state
              const linkWithLivePositions = {
                  ...link,
                  source: { ...link.source, x: sourcePos.x, y: sourcePos.y },
                  target: { ...link.target, x: targetPos.x, y: targetPos.y }
              };

              return (
                <Link
                  key={`${link.source.data.id}-${link.target.data.id}`}
                  link={linkWithLivePositions}
                />
              );
            })}
            
            {typedLinks.map(link => {
              const sourcePos = nodePositions.get(link.source);
              const targetPos = nodePositions.get(link.target);
              if (!sourcePos || !targetPos) return null;
              return (
                <EditableLink
                  key={link.id}
                  link={link}
                  sourcePos={sourcePos}
                  targetPos={targetPos}
                  onUpdate={onUpdateLinkLabel}
                  onDelete={onDeleteLink}
                  isSelected={selectedLinkId === link.id}
                  onSelect={handleSelectLink}
                />
              )
            })}
          </g>

          <g key="nodes">
            {nodes.map(d => {
              const originalNode = originalNodesMap.get(d.data.id);
              if (!originalNode) return null;

              return visibleNodes.has(d.data.id) &&
              <Node
                key={d.data.id}
                d3Node={d}
                nodeData={originalNode}
                depth={d.depth}
                x={nodePositions.get(d.data.id)?.x || d.x}
                y={nodePositions.get(d.data.id)?.y || d.y}
                isSelected={selectedNodeIds.has(d.data.id)}
                isBeingDragged={draggedNodeId === d.data.id}
                isDropTarget={dropTargetId === d.data.id}
                isGlowing={glowingNodeIds.includes(d.data.id)}
                startInEditMode={nodeToEditOnRender === d.data.id}
                originalChildrenCount={originalNode.children?.length || 0}
                onSelect={handleNodeSelect}
                onUpdate={onNodeUpdate}
                onDelete={onNodeDelete}
                onToggleCollapse={onToggleCollapse}
                onEditComplete={onEditComplete}
                onSizeChange={handleNodeSizeChange}
                onStartLinkDraw={(id) => setDrawingLinkState({ sourceId: id, endPos: {x: d.x, y: d.y} })}
                onShowAttachments={onShowAttachments}
                onRemoveImage={onRemoveNodeImage}
                onViewImage={onViewImage}
              />
            })}
          </g>
          
          <AnimatePresence>
            {selectedNodeIds.size === 1 && lastSelectedNodeId && selectedNodeData && nodePositions.get(lastSelectedNodeId) && (
              <foreignObject
                x={(nodePositions.get(lastSelectedNodeId)!.x) - (TOOLBAR_WIDTH / 2)}
                y={(nodePositions.get(lastSelectedNodeId)!.y) - (nodeSizes[lastSelectedNodeId]?.height || minNodeHeight) / 2 - TOOLBAR_HEIGHT - TOOLBAR_Y_OFFSET}
                width={TOOLBAR_WIDTH}
                height={TOOLBAR_HEIGHT + 20} // Add buffer for animations
                style={{ pointerEvents: 'auto', overflow: 'visible' }}
                // These prevent zoom/drag behaviors from firing when interacting with the toolbar
                onMouseDown={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
              >
                <motion.div
                  className="node-toolbar-wrapper"
                  style={{
                      width: `${TOOLBAR_WIDTH}px`,
                      height: `${TOOLBAR_HEIGHT}px`,
                      transformOrigin: 'bottom center',
                  }}
                  initial={{ opacity: 0, y: 10, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.9 }}
                  transition={{ type: 'spring', damping: 15, stiffness: 250 }}
                >
                  <NodeToolbar
                    onAdd={() => onAddChild(lastSelectedNodeId!)}
                    onInsertParent={() => onInsertParentNode(lastSelectedNodeId!)}
                    onDelete={() => onNodeDelete(lastSelectedNodeId!)}
                    onGenerateIdeas={() => onGenerateIdeas(lastSelectedNodeId!)}
                    onRephraseNode={() => onRephraseNode(lastSelectedNodeId!)}
                    onExtractConcepts={() => onExtractConcepts(lastSelectedNodeId!)}
                    onGenerateAnalogy={() => onGenerateAnalogy(lastSelectedNodeId!)}
                    onSetColor={(color) => onSetNodeColor(lastSelectedNodeId!, color)}
                    onFocusNode={() => onFocusNode(lastSelectedNodeId!)}
                    isGeneratingIdeas={generatingIdeasForNodeId === lastSelectedNodeId}
                    isRephrasing={rephrasingNodeId === lastSelectedNodeId}
                    isExtractingConcepts={extractingConceptsNodeId === lastSelectedNodeId}
                    isGeneratingAnalogy={generatingAnalogyNodeId === lastSelectedNodeId}
                    hasChildren={!!(selectedNodeData.children && selectedNodeData.children.length > 0)}
                    isRoot={selectedNodeData.id === root.id}
                  />
                </motion.div>
              </foreignObject>
            )}
          </AnimatePresence>

          {drawingLinkState && (
            <path
              d={`M${nodePositions.get(drawingLinkState.sourceId)?.x},${nodePositions.get(drawingLinkState.sourceId)?.y}L${drawingLinkState.endPos.x},${drawingLinkState.endPos.y}`}
              stroke="#3b82f6"
              strokeWidth="2.5"
              strokeDasharray="5,5"
              fill="none"
              markerEnd="url(#arrowhead-selected)"
              style={{ pointerEvents: 'none' }}
            />
          )}

          {selectionBox && (
            <rect
              x={selectionBox.x}
              y={selectionBox.y}
              width={selectionBox.width}
              height={selectionBox.height}
              className="selection-box"
              fill="rgba(59, 130, 246, 0.1)"
              stroke="rgba(59, 130, 246, 0.8)"
              strokeWidth="1.5"
              strokeDasharray="3,3"
            />
          )}
        </g>
      </svg>
      
      <AnimatePresence>
        {focusedNodeId && focusPath.length > 0 && (
          <FocusBar path={focusPath} onNavigate={onFocusNode} />
        )}
      </AnimatePresence>
    </>
  );
});

export default MindMap;