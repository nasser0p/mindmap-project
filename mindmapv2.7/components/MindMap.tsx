// In MindMap.tsx

import React, { useState, useEffect, useMemo, useRef, useCallback, forwardRef, useImperativeHandle, lazy, Suspense } from 'react';
import { select, Selection, pointer } from 'd3-selection';
import { zoom, zoomIdentity, ZoomTransform, ZoomBehavior, zoomTransform } from 'd3-zoom';
import { drag, D3DragEvent } from 'd3-drag';
import { hierarchy, tree, HierarchyNode, HierarchyPointNode, HierarchyPointLink } from 'd3-hierarchy';
import { easeCubicOut } from 'd3-ease';
import 'd3-transition';
import { motion, AnimatePresence } from 'framer-motion';
import { MindMapNode as MindMapNodeData, MindMapLink, GlowNode, GradedAnswer, Chapter } from '../types';
import { HotspotData, HotspotContent, ContextMenuData } from '../App';
import Node from './Node';
import Link from './Link';
import EditableLink from './EditableLink';
import NodeToolbar from './NodeToolbar';
import NodeContextMenu from './NodeContextMenu';
import { ToolMode } from './Toolbar';

const TopicHotspot = lazy(() => import('./TopicHotspot'));

export interface MindMapActions {
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;
}

interface MindMapProps {
  chapterRoot: MindMapNodeData;
  links: MindMapLink[];
  toolMode: ToolMode;
  isReviewModeActive: boolean;
  selectedNodeIds: Set<string>;
  focusedNodeId: string | null;
  focusedNodeIdSet: Set<string> | null;
  nodeToEditOnRender: string | null;
  generatingIdeasForNodeId: string | null;
  rephrasingNodeId: string | null;
  extractingConceptsNodeId: string | null;
  generatingAnalogyNodeId: string | null;
  glowingNodes: GlowNode[];
  searchResultIds: string[];
  currentSearchResultId: string | null;
  nodeToCenterOn: string | null;
  activeHotspotNodeId: string | null;
  hotspotData: HotspotData;
  isInGuidedReview: boolean;
  contextMenu: ContextMenuData;
  theme: 'light' | 'dark';
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
  onTestBranch: (nodeId: string) => void;
  onSelectBranch: (nodeId: string) => void;
  onSelectChildren: (nodeId: string) => void;
  onSelectSiblings: (nodeId: string) => void;
  onSetNodeColor: (nodeId: string, color: string) => void;
  onEditComplete: () => void;
  onNodeDoubleClickEdit: (nodeId: string) => void;
  onAddLink: (sourceId: string, targetId: string) => void;
  onUpdateLinkLabel: (linkId: string, label: string) => void;
  onDeleteLink: (linkId: string) => void;
  onSetNodeImage: (nodeId: string, file: File) => void;
  onRemoveNodeImage: (nodeId: string) => void;
  onViewImage: (dataUrl: string) => void;
  onNodeDragStart: () => void;
  getAllDescendantIds: (node: MindMapNodeData) => string[];
  onTransformChange: (transform: ZoomTransform) => void;
  onLayoutUpdate: (positions: Map<string, { x: number; y: number }>) => void;
  onSelectionEnd: (event: any) => void;
  onCloseHotspot: () => void;
  onMarkAsReviewed: (nodeId: string) => void;
  onHotspotExplain: (nodeText: string) => void;
  onHotspotQuiz: (nodeText: string) => void;
  onAdvanceGuidedReview: () => void;
  onHotspotBackToMain: () => void;
  onContextMenuChange: (menu: ContextMenuData) => void;
}

const minNodeHeight = 52;
const nodeWidth = 220;
const nodeWidthForHitbox = 220;
const nodeHeightForHitbox = 150;
const CLICK_DRAG_THRESHOLD = 5; // pixels
const TOOLBAR_WIDTH = 392; // Increased width for the new selection button
const TOOLBAR_HEIGHT = 40;
const TOOLBAR_Y_OFFSET = 15;
const HOTSPOT_WIDTH = 360;
const HOTSPOT_HEIGHT = 420;
const HOTSPOT_X_OFFSET = 16;
const LONG_PRESS_DURATION = 400; // ms
const TOUCH_MOVE_THRESHOLD = 10; // pixels


// Helper function for tree traversal
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
    chapterRoot,
    links: typedLinks,
    toolMode,
    isReviewModeActive,
    selectedNodeIds, 
    focusedNodeId,
    focusedNodeIdSet,
    nodeToEditOnRender,
    generatingIdeasForNodeId,
    rephrasingNodeId,
    extractingConceptsNodeId,
    generatingAnalogyNodeId,
    glowingNodes,
    searchResultIds,
    currentSearchResultId,
    nodeToCenterOn,
    activeHotspotNodeId,
    hotspotData,
    isInGuidedReview,
    contextMenu,
    theme,
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
    onTestBranch,
    onSelectBranch,
    onSelectChildren,
    onSelectSiblings,
    onSetNodeColor,
    onEditComplete,
    onNodeDoubleClickEdit,
    onAddLink,
    onUpdateLinkLabel,
    onDeleteLink,
    onSetNodeImage,
    onRemoveNodeImage,
    onViewImage,
    onNodeDragStart,
    getAllDescendantIds,
    onTransformChange,
    onLayoutUpdate,
    onSelectionEnd,
    onCloseHotspot,
    onMarkAsReviewed,
    onHotspotExplain,
    onHotspotQuiz,
    onAdvanceGuidedReview,
    onHotspotBackToMain,
    onContextMenuChange,
  } = props;

  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const nodesContainerRef = useRef<HTMLDivElement>(null);
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown>>();
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [nodeSizes, setNodeSizes] = useState<Record<string, {width: number, height: number}>>({});
  const [isInitialTransformSet, setIsInitialTransformSet] = useState(false);
  const [drawingLinkState, setDrawingLinkState] = useState<{ sourceId: string; endPos: { x: number; y: number; } } | null>(null);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [nodePositions, setNodePositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; width: number; height: number; } | null>(null);
  const [isBoxSelecting, setIsBoxSelecting] = useState(false);
  const selectionBoxRef = useRef<{ x: number; y: number; width: number; height: number; } | null>(null);
  
  const [longPressFeedback, setLongPressFeedback] = useState<{ x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPosRef = useRef<{ x: number, y: number } | null>(null);
  const isAwaitingLongPressRef = useRef(false);

  // Fix: Move type definition to component scope for useRef typing.
  type DragEvent = D3DragEvent<HTMLDivElement, HierarchyPointNode<MindMapNodeData>, HierarchyPointNode<MindMapNodeData>>;

  // Refs for smooth dragging
  const dragAnimationRef = useRef<number | null>(null);
  // Fix: Correctly type the ref to avoid type errors on event properties.
  const latestDragEventRef = useRef<DragEvent | null>(null);
  const dragStartOffsetsRef = useRef(new Map<string, { dx: number; dy: number }>());
  const userDragSelectionRef = useRef<Set<string>>(new Set());
  const nodePositionsRef = useRef(nodePositions);
  nodePositionsRef.current = nodePositions;

  const selectedNodeIdsRef = useRef(selectedNodeIds);
  useEffect(() => { selectedNodeIdsRef.current = selectedNodeIds; }, [selectedNodeIds]);
  
  const transformRef = useRef(transform);
  transformRef.current = transform;

  // Refs to manage click vs. drag distinction and double-click detection
  const dragInfoRef = useRef({ isDragging: false, startX: 0, startY: 0 });
  const clickInfoRef = useRef({ lastClickTime: 0, lastNodeId: '' });

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
            const svg = select(svgRef.current);
            // Fix: Cast to 'any' to handle D3 transition type augmentation issues.
            (svg as any).transition().duration(250).call(zoomBehaviorRef.current.scaleBy, 1.2);
        }
    },
    zoomOut: () => {
        if (zoomBehaviorRef.current && svgRef.current) {
            const svg = select(svgRef.current);
            // Fix: Cast to 'any' to handle D3 transition type augmentation issues.
            (svg as any).transition().duration(250).call(zoomBehaviorRef.current.scaleBy, 0.8);
        }
    },
    zoomToFit: () => {
        const svgElement = svgRef.current;
        const gElement = gRef.current;
        const zoomBehavior = zoomBehaviorRef.current;
        if (!svgElement || !gElement || !zoomBehavior || !dimensions.width) return;
        
        // FIX: The getBBox method on some SVG element implementations requires an argument.
        // FIX: Pass an empty object to getBBox() as it can require an argument.
        // FIX: Pass an empty object to getBBox to fix "Expected 1 arguments, but got 0" error.
        // FIX: Pass an empty options object to getBBox() as it can require an argument.
        // @FIX: Pass an empty object to getBBox() as it can require an argument.
        const gBounds = gElement.getBBox({});
        if (!gBounds.width || !gBounds.height) return;
        
        const { width, height } = dimensions;
        const fullWidth = gBounds.width;
        const fullHeight = gBounds.height;
        
        const scale = 0.9 * Math.min(width / fullWidth, height / fullHeight);
        const newX = width / 2 - (gBounds.x + fullWidth / 2) * scale;
        const newY = height / 2 - (gBounds.y + fullHeight / 2) * scale;
        
        const newTransform = zoomIdentity.translate(newX, newY).scale(scale);
        
        const svg = select(svgElement);
        // Fix: Cast to 'any' to handle D3 transition type augmentation issues.
        (svg as any).transition().duration(400).call(zoomBehavior.transform, newTransform);
    }
  }));

  // --- Manual memoization for expensive D3 layout calculation ---
  const d3RootRef = useRef<HierarchyNode<MindMapNodeData>>();
  const structuralIdRef = useRef<string>();
  
  // Memoize the expensive structural ID calculation to prevent re-running it on every pan/zoom.
  const structuralId = useMemo(() => {
    const count = { value: 0 };
    const structure = getStructuralId(chapterRoot, count);
    return `${structure}|count:${count.value}`;
  }, [chapterRoot]);
  
  const originalNodesMap = useMemo(() => {
    const map = new Map<string, MindMapNodeData>();
    if (!chapterRoot) return map;
    hierarchy<MindMapNodeData>(chapterRoot).each(d => map.set(d.data.id, d.data));
    return map;
  }, [chapterRoot]);
  
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
    const layoutReadyRoot = deepCloneAndFilter(chapterRoot);
    
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
    
    for (const d of d3Root.descendants()) {
      // If an original node didn't have a position, it's new.
      const originalNode = originalNodesMap.get(d.data.id);
      if (originalNode && originalNode.x === undefined && d.x !== undefined) {
        positionsToPersist.set(d.data.id, { x: d.x, y: d.y });
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      onLayoutUpdate(positionsToPersist);
    }
  }, [d3Root, originalNodesMap, onLayoutUpdate]);

  const nodes = useMemo(() => (d3Root ? d3Root.descendants() : []) as HierarchyPointNode<MindMapNodeData>[], [d3Root]);
  const hierarchicalLinks = useMemo(() => (d3Root ? d3Root.links() : []) as HierarchyPointLink<MindMapNodeData>[], [d3Root]);
  
  useEffect(() => {
    if (d3Root) {
        const layoutPositions = new Map<string, { x: number; y: number }>();
        
        // 1. Get positions from the current D3 layout (for visible nodes)
        d3Root.descendants().forEach(layoutNode => {
            const originalNode = originalNodesMap.get(layoutNode.data.id);
            if (originalNode && originalNode.x !== undefined && originalNode.y !== undefined) {
                layoutPositions.set(layoutNode.data.id, { x: originalNode.x, y: originalNode.y });
            } 
            else if (layoutNode.x !== undefined && layoutNode.y !== undefined) {
                layoutPositions.set(layoutNode.data.id, { x: layoutNode.x, y: layoutNode.y });
            }
        });

        setNodePositions(prevPositions => {
            const newPositions = new Map<string, { x: number; y: number }>();
            const allNodeIds = new Set<string>(hierarchy<MindMapNodeData>(chapterRoot).descendants().map(d => d.data.id));

            // 2. Iterate over ALL nodes in the full data tree
            allNodeIds.forEach(id => {
                // If the new layout has a position for this node (i.e., it's visible), use it.
                if (layoutPositions.has(id)) {
                    newPositions.set(id, layoutPositions.get(id)!);
                } 
                // Otherwise, if it was in the previous position map (i.e., it's a collapsed child), keep its old position.
                else if (prevPositions.has(id)) {
                    newPositions.set(id, prevPositions.get(id)!);
                }
            });

            return newPositions;
        });
    }
  }, [d3Root, chapterRoot, originalNodesMap]);

  // Create refs to hold the latest values of nodes.
  // This allows the camera-panning effect to access up-to-date data without
  // creating a dependency that would cause it to re-run on every drag/pan.
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

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
  
  // Effect to handle D3 zoom behavior. This now runs only once.
  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    const svg = select(svgRef.current);

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 3])
      .filter((evt) => {
        // Always allow wheel events for touchpad pinch-zoom and pan.
        if (evt.type === 'wheel') {
            return true;
        }
        // Allow panning only when in 'pan' mode and not on an interactive element.
        return toolMode === 'pan' && (evt.target as Element).closest('.node-group, .editable-link-group, .node-toolbar-wrapper, .topic-hotspot-wrapper, .focus-bar, .node-context-menu') === null;
      })
      .on('zoom', (event) => {
        const { transform } = event;
        // The D3 zoom handler now ONLY updates React state.
        // This ensures the SVG and HTML layers are updated in the same render cycle.
        setTransform(transform);
        onTransformChange(transform);
      });

    svg.call(zoomBehavior);
    svg.on("dblclick.zoom", null);
    zoomBehaviorRef.current = zoomBehavior;
    
    return () => { svg.on('.zoom', null); };
  }, [isInitialTransformSet, onTransformChange, toolMode]);

  // Effect for the box selection drag behavior
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = select(svgRef.current);
    let startPos: { x: number; y: number } | null = null;

    const selectionDrag = drag<SVGSVGElement, unknown>()
      .filter((event) => toolMode === 'select' && event.target === svgRef.current)
      .on('start', (event) => {
        const isTouchEvent = event.sourceEvent instanceof TouchEvent;
        if (isTouchEvent) {
          isAwaitingLongPressRef.current = true;
          // FIX: (line 286) The d3.pointer function requires the target element as the second argument.
          // FIX: Pass svgRef.current as the second argument to d3.pointer.
          // @FIX: Pass svgRef.current as the second argument to d3.pointer.
          const touchPoint = pointer(event.sourceEvent, svgRef.current!);
          if (!touchPoint) return;
          const [touchX, touchY] = touchPoint;
          touchStartPosRef.current = { x: touchX, y: touchY };

          longPressTimerRef.current = setTimeout(() => {
            if (isAwaitingLongPressRef.current) { // Check if not cancelled by movement
              if (!svgRef.current || !touchStartPosRef.current) {
                return;
              }
              setIsBoxSelecting(true);
              if (typeof navigator.vibrate === 'function') {
                navigator.vibrate(50);
              }
              const currentTransform = zoomTransform(svgRef.current!);
              // FIX: (line 287) Use cached touch start position instead of stale event data.
              // Fix: Explicitly type the point to aid TypeScript's inference with d3-zoom transform.
              const pointToInvert: [number, number] = [touchStartPosRef.current.x, touchStartPosRef.current.y];
              // FIX: The invert() method on a d3-zoom transform requires a point [x, y] to transform from screen to world coordinates.
              // FIX: Pass the point to invert to the invert() method.
              // FIX: Pass point to invert() to fix "Expected 1 arguments, but got 0" error.
              // FIX: Pass the point to invert to the invert() method.
              // @FIX: Pass point to invert() to fix "Expected 1 arguments, but got 0" error.
              const [startX, startY] = currentTransform.invert(pointToInvert);
              startPos = { x: startX, y: startY };
              const newBox = { x: startPos.x, y: startPos.y, width: 0, height: 0 };
              setSelectionBox(newBox);
              setLongPressFeedback({x: startX, y: startY});
              selectionBoxRef.current = newBox;
            }
          }, LONG_PRESS_DURATION);

        } else { // Mouse event
          setIsBoxSelecting(true);
          const currentTransform = zoomTransform(svgRef.current!);
          // FIX: The d3.pointer function requires the target element as the second argument.
          // FIX: Pass svgRef.current as the second argument to d3.pointer.
          // @FIX: Pass svgRef.current as the second argument to d3.pointer.
          const screenPoint = pointer(event.sourceEvent, svgRef.current!);
          if (!screenPoint) return;
          // FIX: The invert() method on a d3-zoom transform requires a point [x, y] to transform from screen to world coordinates.
          // FIX: Pass the screenPoint to the invert() method.
          // FIX: Pass screenPoint to invert() to fix "Expected 1 arguments, but got 0" error.
          // FIX: Pass screenPoint to invert() to fix "Expected 1 arguments, but got 0" error.
          // @FIX: Pass screenPoint to invert() to fix "Expected 1 arguments, but got 0" error.
          const [x, y] = currentTransform.invert(screenPoint);
          startPos = { x, y };
          const newBox = { x: startPos.x, y: startPos.y, width: 0, height: 0 };
          setSelectionBox(newBox);
          selectionBoxRef.current = newBox;
        }
      })
      .on('drag', (event) => {
        if (!svgRef.current) return;
        const isTouchEvent = event.sourceEvent instanceof TouchEvent;

        if (isTouchEvent) {
          if (isAwaitingLongPressRef.current) {
            // FIX: The d3.pointer function requires the target element as the second argument.
            // FIX: Pass svgRef.current as the second argument to d3.pointer.
            // @FIX: Pass svgRef.current as the second argument to d3.pointer.
            const currentPoint = pointer(event.sourceEvent, svgRef.current!);
            if (!currentPoint || !touchStartPosRef.current) return;
            const [currentX, currentY] = currentPoint;
            const dist = Math.sqrt(Math.pow(currentX - touchStartPosRef.current.x, 2) + Math.pow(currentY - touchStartPosRef.current.y, 2));
            if (dist > TOUCH_MOVE_THRESHOLD) {
              if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
              isAwaitingLongPressRef.current = false;
            }
          }
        }

        if (!isBoxSelecting || !startPos) return;

        const currentTransform = zoomTransform(svgRef.current!);
        // FIX: The d3.pointer function requires the target element as the second argument.
        // FIX: Pass svgRef.current as the second argument to d3.pointer.
        // @FIX: Pass svgRef.current as the second argument to d3.pointer.
        const cursorPoint = pointer(event.sourceEvent, svgRef.current!);
        if (!cursorPoint) return;
        // FIX: The invert() method on a d3-zoom transform requires a point [x, y] to transform from screen to world coordinates.
        // FIX: Pass the cursorPoint to the invert() method.
        // FIX: Pass cursorPoint to invert() to fix "Expected 1 arguments, but got 0" error.
        // FIX: Pass cursorPoint to invert() to fix "Expected 1 arguments, but got 0" error.
        // @FIX: Pass cursorPoint to invert() to fix "Expected 1 arguments, but got 0" error.
        const [cursorX, cursorY] = currentTransform.invert(cursorPoint);
        
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
      .on('end', (event) => {
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        isAwaitingLongPressRef.current = false;
        
        if (!isBoxSelecting) {
            setLongPressFeedback(null);
            return;
        }

        setIsBoxSelecting(false);
        setLongPressFeedback(null);
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

            const sourceEvent = event.sourceEvent as MouseEvent | TouchEvent;
            if ('shiftKey' in sourceEvent && sourceEvent.shiftKey) {
                const newSelection = new Set(currentSelection);
                selectedIds.forEach(id => newSelection.add(id));
                onNodeSelect(newSelection);
            } else {
                onNodeSelect(selectedIds);
            }
        }
        
        setSelectionBox(null);
        selectionBoxRef.current = null;
        startPos = null;
        onSelectionEnd(event);
      });

    svg.call(selectionDrag);

    return () => {
      svg.on('.drag', null);
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, [toolMode, onNodeSelect, onSelectionEnd, isBoxSelecting]);

  const initialCenteringDoneRef = useRef(false);

  // When the document changes, reset the centering flag.
  useEffect(() => {
    initialCenteringDoneRef.current = false;
  }, [chapterRoot.id]);

  // Effect to pan/zoom camera for focus or initial load.
  useEffect(() => {
    if (!dimensions.width || !svgRef.current || !zoomBehaviorRef.current || !isInitialTransformSet) return;

    const svg = select(svgRef.current);
    const zoomBehavior = zoomBehaviorRef.current;
    
    let targetNodeId: string | null = null;
    
    // Case 1: A node is focused by the user. Highest priority.
    if (focusedNodeId) {
        targetNodeId = focusedNodeId;
    }
    // Case 2: A search result needs to be centered.
    else if (nodeToCenterOn) {
        targetNodeId = nodeToCenterOn;
    }
    // Case 3: Initial load for this document. Center the root.
    else if (!initialCenteringDoneRef.current) {
        targetNodeId = chapterRoot.id;
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
    
    const svgNode = svg.node();
    if (!svgNode) return;
    const currentTransform = zoomTransform(svgNode);
    let k = currentTransform.k;
    
    // Zoom in a bit if we're focused on a search result and currently zoomed out.
    if (nodeToCenterOn) {
        k = Math.max(k, 1.2);
    } else if (targetNodeId === chapterRoot.id && initialCenteringDoneRef.current) {
         // Reset zoom for initial load, but keep it for subsequent refocus on root
    }

    const newTransform = zoomIdentity
        .translate(dimensions.width / 2 - targetX * k, dimensions.height / 2 - targetY * k)
        .scale(k);
    
    // Fix: Cast to 'any' to handle D3 transition type augmentation issues.
    (svg as any).transition('zoom').duration(400).ease(easeCubicOut).call(zoomBehavior.transform, newTransform);
       
  }, [focusedNodeId, nodeToCenterOn, isInitialTransformSet, dimensions, chapterRoot.id]);


  const isDescendant = useCallback((node: HierarchyNode<MindMapNodeData>, id: string): boolean => node.descendants().some(d => d.data.id === id), []);
  
  const handleNodeSelect = useCallback((id: string, event: React.MouseEvent | MouseEvent) => {
      event.stopPropagation();
      setSelectedLinkId(null);

      const isCtrlOrMeta = event.ctrlKey || event.metaKey;
      const isShift = event.shiftKey;

      if (isShift) {
          // Shift+Click: Replace current selection with the clicked node's entire branch.
          const clickedNode = originalNodesMap.get(id);
          if (clickedNode) {
              const descendantIds = getAllDescendantIds(clickedNode);
              const branchIds = [id, ...descendantIds];
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
  }, [selectedNodeIds, onNodeSelect, originalNodesMap, getAllDescendantIds]);

  // Effect to handle drag behavior on nodes
  useEffect(() => {
    if (!nodesContainerRef.current || !d3Root) return;

    const htmlNodes = select(nodesContainerRef.current).selectAll<HTMLDivElement, HierarchyPointNode<MindMapNodeData>>('div.node-group');

    const dragBehavior = drag<HTMLDivElement, HierarchyPointNode<MindMapNodeData>>()
      .filter((event) => {
        // If we are in any kind of review mode, disable dragging completely.
        if (isReviewModeActive) return false;
        
        const target = event.target as Element;

        // PREVENT DRAG on textareas (edit mode) or specific buttons.
        if (target.tagName === 'TEXTAREA' || target.closest('.node-toggle-button') || target.closest('.connector-handle')) {
            return false;
        }
        
        // ALLOW DRAG only if the target is part of the draggable area.
        return !!target.closest('.mind-map-node-draggable-part');
      })
      .on('start', function (this: HTMLDivElement, event: DragEvent, d: HierarchyPointNode<MindMapNodeData>) {
        dragInfoRef.current = { isDragging: false, startX: event.x, startY: event.y };
        
        onNodeDragStart();
        event.sourceEvent.stopPropagation();
        select(this).raise();

        // 1. Determine the user's intended selection for this drag operation.
        let userSelection = selectedNodeIdsRef.current;
        if (!userSelection.has(d.data.id)) {
            userSelection = new Set([d.data.id]);
            onNodeSelect(userSelection); // Update the main selection state
        }
        userDragSelectionRef.current = userSelection;

        // 2. Build the set of all nodes that must physically move.
        // This includes descendants of any collapsed nodes in the user's selection.
        const physicalDragSet = new Set(userSelection);
        userSelection.forEach(id => {
            const nodeData = originalNodesMap.get(id);
            if (nodeData?.isCollapsed) {
                getAllDescendantIds(nodeData).forEach(descId => physicalDragSet.add(descId));
            }
        });
        
        // 3. Calculate offsets for every node in the physical set relative to the cursor.
        const [worldX, worldY] = transformRef.current.invert([event.x, event.y]);
        dragStartOffsetsRef.current.clear();
        physicalDragSet.forEach(id => {
            const nodePos = nodePositionsRef.current.get(id);
            if (nodePos) {
                dragStartOffsetsRef.current.set(id, { dx: nodePos.x - worldX, dy: nodePos.y - worldY });
            }
        });
        
        setDraggedNodeId(d.data.id);
      })
      .on('drag', function (this: HTMLDivElement, event: DragEvent, d: HierarchyPointNode<MindMapNodeData>) {
        // Prevent dragging the root node of a focused branch, but allow start/end events for clicks.
        if (focusedNodeId && d.data.id === focusedNodeId) {
            return;
        }
        
        const { isDragging, startX, startY } = dragInfoRef.current;
        if (!isDragging) {
            const dx = event.x - startX;
            const dy = event.y - startY;
            if (Math.sqrt(dx * dx + dy * dy) > CLICK_DRAG_THRESHOLD) {
                dragInfoRef.current.isDragging = true;
            }
        }

        if (!dragInfoRef.current.isDragging) {
          return; // It's not a drag yet, don't move anything
        }
        
        latestDragEventRef.current = event;

        if (!dragAnimationRef.current) {
            dragAnimationRef.current = requestAnimationFrame(() => {
                const currentEvent = latestDragEventRef.current;
                if (!currentEvent) return;

                // Convert current screen coordinates to world coordinates
                // FIX: Create an explicitly typed variable for the point to aid TypeScript's type inference.
                const pointToInvert: [number, number] = [currentEvent.x, currentEvent.y];
                // FIX: The invert() method on a d3-zoom transform requires a point [x, y] to transform from screen to world coordinates.
                // FIX: Pass the point to invert to the invert() method.
                // FIX: Pass point to invert() to fix "Expected 1 arguments, but got 0" error.
                // FIX: Pass point to invert() to fix "Expected 1 arguments, but got 0" error.
                // @FIX: Pass point to invert() to fix "Expected 1 arguments, but got 0" error.
                const [worldX, worldY] = transformRef.current.invert(pointToInvert);
    
                setNodePositions(currentPositions => {
                    const newPositions = new Map(currentPositions);
                    dragStartOffsetsRef.current.forEach((offset, id) => {
                        // Calculate new position in world space
                        newPositions.set(id, { x: worldX + offset.dx, y: worldY + offset.dy });
                    });
                    return newPositions;
                });
    
                dragAnimationRef.current = null;
            });
        }
      })
      .on('end', function (this: HTMLDivElement, event: DragEvent, d: HierarchyPointNode<MindMapNodeData>) {
        if (dragInfoRef.current.isDragging) {
            // It was a drag. Finalize the move.
            if (dragAnimationRef.current) {
                cancelAnimationFrame(dragAnimationRef.current);
                dragAnimationRef.current = null;
            }

            // FIX: Explicitly type point passed to invert to help TypeScript.
            const pointToInvert: [number, number] = [event.x, event.y];
            // FIX: The invert() method on a d3-zoom transform requires a point [x, y] to transform from screen to world coordinates.
            // FIX: Pass the point to invert to the invert() method.
            // FIX: Pass point to invert() to fix "Expected 1 arguments, but got 0" error.
            // FIX: Pass point to invert() to fix "Expected 1 arguments, but got 0" error.
            // @FIX: Pass point to invert() to fix "Expected 1 arguments, but got 0" error.
            const [worldX, worldY] = transformRef.current.invert(pointToInvert);
            const positionsToUpdate = new Map<string, { x: number; y: number }>();
            dragStartOffsetsRef.current.forEach((offset, id) => {
                positionsToUpdate.set(id, { x: worldX + offset.dx, y: worldY + offset.dy });
            });
            onMultipleNodePositionsUpdate(positionsToUpdate);
        } else {
            // It was a click. Check for double click.
            const now = Date.now();
            const { lastClickTime, lastNodeId } = clickInfoRef.current;
            
            if (now - lastClickTime < 300 && lastNodeId === d.data.id) {
                // Double click
                onNodeDoubleClickEdit(d.data.id);
                clickInfoRef.current = { lastClickTime: 0, lastNodeId: '' }; // Reset
            } else {
                // Single click
                handleNodeSelect(d.data.id, event.sourceEvent as any);
                clickInfoRef.current = { lastClickTime: now, lastNodeId: d.data.id };
            }
        }
        
        // General cleanup for both click and drag
        setDraggedNodeId(null);
        dragStartOffsetsRef.current.clear();
        userDragSelectionRef.current.clear();
      });

    htmlNodes.call(dragBehavior);

    return () => {
      htmlNodes.on('.drag', null);
      if (dragAnimationRef.current) {
        cancelAnimationFrame(dragAnimationRef.current);
      }
    };
  }, [nodes, d3Root, onNodeSelect, onNodeDragStart, onMultipleNodePositionsUpdate, onNodeMove, isDescendant, focusedNodeId, chapterRoot, isReviewModeActive, getAllDescendantIds, handleNodeSelect, onNodeDoubleClickEdit, originalNodesMap]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if(selectedNodeIds.size > 0 && Array.from(selectedNodeIds).every(id => id !== chapterRoot.id)) {
        onDeleteNodes(selectedNodeIds);
      } else if (selectedLinkId) {
        onDeleteLink(selectedLinkId);
        setSelectedLinkId(null);
      }
    }
  }, [selectedNodeIds, chapterRoot.id, selectedLinkId, onDeleteNodes, onDeleteLink]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (drawingLinkState && gRef.current) {
      // FIX: The d3.pointer function requires the target element as the second argument.
      // @FIX: The d3.pointer function requires the target element as the second argument.
      const point = pointer(e, svgRef.current!);
      if (!point) return;
      const [x, y] = point;
      // FIX: Pass point to invert() to fix "Expected 1 arguments, but got 0" error.
      // FIX: Pass the point to invert() to fix "Expected 1 arguments, but got 0" error.
      // @FIX: Pass point to invert() to fix "Expected 1 arguments, but got 0" error.
      const inverted = transformRef.current.invert([x,y]);
      setDrawingLinkState(prev => prev ? { ...prev, endPos: { x: inverted[0], y: inverted[1] } } : null);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (drawingLinkState) {
      const targetElement = e.target as Element;
      const nodeGroup = targetElement.closest('.node-group');
      if (nodeGroup) {
        const targetNodeId = nodeGroup.getAttribute('data-node-id');
        if (targetNodeId) {
            onAddLink(drawingLinkState.sourceId, targetNodeId);
        }
      }
      setDrawingLinkState(null);
    }
  };

  const handleSelectLink = useCallback((linkId: string | null) => {
    setSelectedLinkId(linkId);
    if(linkId) {
        onNodeSelect(new Set<string>());
    }
  }, [onNodeSelect]);

  const handleShowContextMenu = useCallback((nodeId: string, x: number, y: number) => {
    onContextMenuChange({ nodeId, x, y });
    // Also select the node if it's not already part of the selection
    if (!selectedNodeIds.has(nodeId)) {
        onNodeSelect(new Set([nodeId]));
    }
  }, [selectedNodeIds, onNodeSelect, onContextMenuChange]);

  const handleCloseContextMenu = useCallback(() => {
      onContextMenuChange(null);
  }, [onContextMenuChange]);
  
  if (!d3Root) {
    return <div>Loading...</div>; // Or some loading shell
  }
  
  return (
    <div className="w-full h-full relative overflow-hidden dotted-background">
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        onClick={(e) => { if (e.target === svgRef.current) { onNodeSelect(new Set<string>()); setSelectedLinkId(null); handleCloseContextMenu(); } }}
        onKeyDown={handleKeyDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={(e) => { if(e.target === svgRef.current) { e.preventDefault(); handleCloseContextMenu(); } }} // Prevent browser context menu on background
        tabIndex={0}
        className={`absolute top-0 left-0 focus:outline-none ${
            toolMode === 'select' || isBoxSelecting || drawingLinkState
                ? 'cursor-crosshair' 
                : 'cursor-grab active:cursor-grabbing'
        }`}
      >
        <defs>
          <marker id="arrowhead" viewBox="-0 -5 10 10" refX="5" refY="0" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,-5L10,0L0,5" fill="#9ca3af"></path>
          </marker>
          <marker id="arrowhead-selected" viewBox="-0 -5 10 10" refX="5" refY="0" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,-5L10,0L0,5" fill="#3b82f6"></path>
          </marker>
        </defs>
        <g ref={gRef} className="zoom-container" transform={transform.toString()}>
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
              
              const isSourceInFocus = focusedNodeIdSet && focusedNodeIdSet.has(link.source.data.id);
              const isTargetInFocus = focusedNodeIdSet && focusedNodeIdSet.has(link.target.data.id);
              const isLinkDeemphasized = focusedNodeIdSet ? !(isSourceInFocus && isTargetInFocus) : false;

              return (
                <g key={`${link.source.data.id}-${link.target.data.id}`} className={isLinkDeemphasized ? 'de-emphasized-link' : ''}>
                    <Link link={linkWithLivePositions} />
                </g>
              );
            })}
            
            {typedLinks.map(link => {
              const sourcePos = nodePositions.get(link.source);
              const targetPos = nodePositions.get(link.target);
              if (!sourcePos || !targetPos) return null;

              const isSourceInFocus = focusedNodeIdSet && focusedNodeIdSet.has(link.source);
              const isTargetInFocus = focusedNodeIdSet && focusedNodeIdSet.has(link.target);
              const isLinkDeemphasized = focusedNodeIdSet ? !(isSourceInFocus && isTargetInFocus) : false;
              
              return (
                <g key={link.id} className={isLinkDeemphasized ? 'de-emphasized-link' : ''}>
                    <EditableLink
                        link={link}
                        sourcePos={sourcePos}
                        targetPos={targetPos}
                        onUpdate={onUpdateLinkLabel}
                        onDelete={onDeleteLink}
                        isSelected={selectedLinkId === link.id}
                        onSelect={handleSelectLink}
                    />
                </g>
              )
            })}
          </g>
          
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

          <AnimatePresence>
            {longPressFeedback && (
              <motion.circle
                cx={longPressFeedback.x}
                cy={longPressFeedback.y}
                r={0}
                fill="none"
                stroke="rgba(59, 130, 246, 0.8)"
                strokeWidth={2}
                initial={{ r: 0, opacity: 1 }}
                animate={{ r: 30, opacity: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            )}
          </AnimatePresence>

        </g>
      </svg>
      <div
          ref={nodesContainerRef}
          className="absolute top-0 left-0"
          style={{
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
          }}
      >
          {nodes.map(d => {
            const originalNode = originalNodesMap.get(d.data.id);
            if (!originalNode) return null;
            const glowInfo = glowingNodes.find(n => n.nodeId === d.data.id);
            const pos = nodePositions.get(d.data.id);
            if (!pos) return null;
            
            const isDeemphasized = !!(focusedNodeIdSet && !focusedNodeIdSet.has(d.data.id));

            return (
              <Node
                  key={d.data.id}
                  d3Node={d}
                  nodeData={originalNode}
                  depth={d.depth}
                  x={pos.x}
                  y={pos.y}
                  transform={transform}
                  isSelected={selectedNodeIds.has(d.data.id)}
                  isBeingDragged={draggedNodeId === d.data.id}
                  isDeemphasized={isDeemphasized}
                  glowSeverity={glowInfo?.severity || null}
                  isSearchResult={searchResultIds.includes(d.data.id)}
                  isCurrentSearchResult={currentSearchResultId === d.data.id}
                  startInEditMode={nodeToEditOnRender === d.data.id}
                  originalChildrenCount={originalNode.children?.length || 0}
                  theme={theme}
                  onUpdate={onNodeUpdate}
                  onDelete={onNodeDelete}
                  onToggleCollapse={onToggleCollapse}
                  onEditComplete={onEditComplete}
                  onSizeChange={handleNodeSizeChange}
                  onStartLinkDraw={(id) => setDrawingLinkState({ sourceId: id, endPos: {x: pos.x, y: pos.y} })}
                  onRemoveImage={onRemoveNodeImage}
                  onViewImage={onViewImage}
                  onShowContextMenu={handleShowContextMenu}
              />
            )
          })}

          <AnimatePresence>
            {selectedNodeIds.size === 1 && lastSelectedNodeId && selectedNodeData && nodePositions.get(lastSelectedNodeId) && (
              (() => {
                const nodePos = nodePositions.get(lastSelectedNodeId)!;
                const nodeSize = nodeSizes[lastSelectedNodeId] || { height: minNodeHeight };
                
                // Toolbar's top-left position in the "world" coordinate space (before pan/zoom)
                const toolbarWorldX = nodePos.x - (TOOLBAR_WIDTH / 2);
                const toolbarWorldY = nodePos.y - (nodeSize.height / 2) - TOOLBAR_HEIGHT - TOOLBAR_Y_OFFSET;

                // Apply the pan/zoom transform to get the final screen position and scale
                const toolbarScreenX = toolbarWorldX * transform.k + transform.x;
                const toolbarScreenY = toolbarWorldY * transform.k + transform.y;
                const toolbarScale = transform.k;

                return (
                  <motion.div
                    // This outer div handles the pan/zoom transformation
                    className="absolute top-0 left-0"
                    style={{
                      width: TOOLBAR_WIDTH,
                      height: TOOLBAR_HEIGHT,
                      pointerEvents: 'none', // Allow clicks on the toolbar inside
                      transformOrigin: 'top left',
                    }}
                    animate={{
                      x: toolbarScreenX,
                      y: toolbarScreenY,
                      scale: toolbarScale,
                    }}
                    transition={{
                      // Ensure pan/zoom updates are instant
                      x: { duration: 0 },
                      y: { duration: 0 },
                      scale: { duration: 0 },
                    }}
                  >
                    <motion.div
                      // This inner div handles the enter/exit animation relative to its parent
                      className="node-toolbar-wrapper"
                      style={{
                          width: TOOLBAR_WIDTH,
                          height: TOOLBAR_HEIGHT,
                          transformOrigin: 'bottom center',
                          pointerEvents: 'auto',
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
                        onTestBranch={() => onTestBranch(lastSelectedNodeId!)}
                        onSelectBranch={() => onSelectBranch(lastSelectedNodeId!)}
                        onSelectChildren={() => onSelectChildren(lastSelectedNodeId!)}
                        onSelectSiblings={() => onSelectSiblings(lastSelectedNodeId!)}
                        onSetColor={(color) => onSetNodeColor(lastSelectedNodeId!, color)}
                        onFocusNode={() => onFocusNode(lastSelectedNodeId!)}
                        isGeneratingIdeas={generatingIdeasForNodeId === lastSelectedNodeId}
                        isRephrasing={rephrasingNodeId === lastSelectedNodeId}
                        isExtractingConcepts={extractingConceptsNodeId === lastSelectedNodeId}
                        isGeneratingAnalogy={generatingAnalogyNodeId === lastSelectedNodeId}
                        hasChildren={!!(selectedNodeData.children && selectedNodeData.children.length > 0)}
                        isRoot={selectedNodeData.id === chapterRoot.id}
                      />
                    </motion.div>
                  </motion.div>
                )
              })()
            )}
          </AnimatePresence>

          <AnimatePresence>
            {hotspotData && nodePositions.get(hotspotData.node.id) && (
              (() => {
                const nodePos = nodePositions.get(hotspotData.node.id)!;
                const nodeSize = nodeSizes[hotspotData.node.id] || { width: nodeWidth, height: minNodeHeight };

                // Hotspot's top-left position in the "world" coordinate space
                const hotspotWorldX = nodePos.x + (nodeSize.width / 2) + HOTSPOT_X_OFFSET;
                const hotspotWorldY = nodePos.y - (HOTSPOT_HEIGHT / 2);

                // Apply the pan/zoom transform to get the final screen position and scale
                const hotspotScreenX = hotspotWorldX * transform.k + transform.x;
                const hotspotScreenY = hotspotWorldY * transform.k + transform.y;
                const hotspotScale = transform.k;

                return (
                  <motion.div
                    // This outer div handles the pan/zoom transformation
                    className="absolute top-0 left-0 topic-hotspot-wrapper"
                    style={{
                      width: HOTSPOT_WIDTH,
                      height: HOTSPOT_HEIGHT + 20, // To prevent clipping
                      pointerEvents: 'none',
                      zIndex: 30,
                      transformOrigin: 'top left',
                    }}
                    animate={{
                      x: hotspotScreenX,
                      y: hotspotScreenY,
                      scale: hotspotScale,
                    }}
                    transition={{
                      // Ensure pan/zoom updates are instant
                      x: { duration: 0 },
                      y: { duration: 0 },
                      scale: { duration: 0 },
                    }}
                  >
                    <motion.div
                      // This inner div handles the enter/exit animation relative to its parent
                      style={{
                        width: HOTSPOT_WIDTH,
                        height: HOTSPOT_HEIGHT, // The actual component height
                        transformOrigin: 'bottom left',
                        pointerEvents: 'auto',
                      }}
                      initial={{ opacity: 0, x: -10, scale: 0.95 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -10, scale: 0.95 }}
                      transition={{ type: 'spring', damping: 20, stiffness: 250 }}
                    >
                      <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><i className="fa-solid fa-spinner fa-spin text-2xl text-blue-500" /></div>}>
                          <TopicHotspot
                            key={hotspotData.node.id}
                            node={hotspotData.node}
                            incorrectQuestions={hotspotData.incorrectQuestions}
                            content={hotspotData.content}
                            isInGuidedReview={isInGuidedReview}
                            onClose={onCloseHotspot}
                            onMarkAsReviewed={() => onMarkAsReviewed(hotspotData.node.id)}
                            onExplainDifferently={onHotspotExplain}
                            onQuizAgain={onHotspotQuiz}
                            onAdvance={onAdvanceGuidedReview}
                            onBackToMain={onHotspotBackToMain}
                          />
                      </Suspense>
                    </motion.div>
                  </motion.div>
                )
              })()
            )}
          </AnimatePresence>
          
          <AnimatePresence>
            {contextMenu && (
                <NodeContextMenu
                    nodeId={contextMenu.nodeId}
                    node={originalNodesMap.get(contextMenu.nodeId)!}
                    position={{ x: contextMenu.x, y: contextMenu.y }}
                    onClose={handleCloseContextMenu}
                    onAdd={() => onAddChild(contextMenu.nodeId)}
                    onInsertParent={() => onInsertParentNode(contextMenu.nodeId)}
                    onDelete={() => onNodeDelete(contextMenu.nodeId)}
                    onGenerateIdeas={() => onGenerateIdeas(contextMenu.nodeId)}
                    onRephraseNode={() => onRephraseNode(contextMenu.nodeId)}
                    onExtractConcepts={() => onExtractConcepts(contextMenu.nodeId)}
                    onGenerateAnalogy={() => onGenerateAnalogy(contextMenu.nodeId)}
                    onSetColor={(color) => onSetNodeColor(contextMenu.nodeId, color)}
                    onFocusNode={() => onFocusNode(contextMenu.nodeId)}
                    onTestBranch={() => onTestBranch(contextMenu.nodeId)}
                    isGeneratingIdeas={generatingIdeasForNodeId === contextMenu.nodeId}
                    isRephrasing={rephrasingNodeId === contextMenu.nodeId}
                    isExtractingConcepts={extractingConceptsNodeId === contextMenu.nodeId}
                    isGeneratingAnalogy={generatingAnalogyNodeId === contextMenu.nodeId}
                />
            )}
          </AnimatePresence>
      </div>
    </div>
  );
});

export default MindMap;