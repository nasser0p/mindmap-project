import React, { useState, useEffect, useMemo, useRef, useCallback, forwardRef, useImperativeHandle, lazy, Suspense, useLayoutEffect } from 'react';
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
import FocusBar from './FocusBar';
import NodeContextMenu from './NodeContextMenu';
import { ToolMode } from './Toolbar';

const TopicHotspot = lazy(() => import('./TopicHotspot'));

export interface MindMapActions {
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;
}

// NOTE: Using the expanded props interface from Version 2 to support all new features.
interface MindMapProps {
  root: MindMapNodeData;
  links: MindMapLink[];
  toolMode: ToolMode;
  isReviewModeActive: boolean;
  selectedNodeIds: Set<string>;
  focusedNodeId: string | null;
  nodeToEditOnRender: string | null;
  generatingIdeasForNodeId: string | null;
  rephrasingNodeId: string | null;
  extractingConceptsNodeId: string | null;
  generatingAnalogyNodeId: string | null;
  identifyingLabelsNodeId: string | null;
  pastingImageNodeId: string | null;
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
  onNodePositionUpdate: (id: string, x: number, y: number) => void;
  onUpdateNodeSize: (id: string, width: number, height: number) => void;
  onMultipleNodePositionsUpdate: (positions: Map<string, { x: number; y: number }>) => void;
  onAddChild: (parentId: string) => void;
  onInsertParentNode: (childId: string) => void;
  onToggleCollapse: (nodeId: string) => void;
  onGenerateIdeas: (nodeId: string) => void;
  onRephraseNode: (nodeId: string) => void;
  onExtractConcepts: (nodeId: string) => void;
  onGenerateAnalogy: (nodeId: string) => void;
  onIdentifyAndLabel: (nodeId: string) => void;
  onTestBranch: (nodeId: string) => void;
  onSelectBranch: (nodeId: string) => void;
  onSelectChildren: (nodeId: string) => void;
  onSelectSiblings: (nodeId: string) => void;
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
const CLICK_DRAG_THRESHOLD = 5;
const TOOLBAR_WIDTH = 392;
const TOOLBAR_HEIGHT = 40;
const TOOLBAR_Y_OFFSET = 15;
const HOTSPOT_WIDTH = 360;
const HOTSPOT_HEIGHT = 420;
const HOTSPOT_X_OFFSET = 16;
const LONG_PRESS_DURATION = 400;
const TOUCH_MOVE_THRESHOLD = 10;

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

const MindMap = forwardRef<MindMapActions, MindMapProps>((props, ref) => {
  const { 
    root, 
    links: typedLinks,
    toolMode,
    isReviewModeActive,
    selectedNodeIds, 
    focusedNodeId,
    nodeToEditOnRender,
    generatingIdeasForNodeId,
    rephrasingNodeId,
    extractingConceptsNodeId,
    generatingAnalogyNodeId,
    identifyingLabelsNodeId,
    pastingImageNodeId,
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
    onNodePositionUpdate: persistNodePosition,
    onUpdateNodeSize,
    onMultipleNodePositionsUpdate,
    onAddChild,
    onInsertParentNode,
    onToggleCollapse,
    onGenerateIdeas,
    onRephraseNode,
    onExtractConcepts,
    onGenerateAnalogy,
    onIdentifyAndLabel,
    onTestBranch,
    onSelectBranch,
    onSelectChildren,
    onSelectSiblings,
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

  const dragStartOffsetsRef = useRef(new Map<string, { dx: number; dy: number }>());
  const nodePositionsRef = useRef(nodePositions);
  nodePositionsRef.current = nodePositions;

  const selectedNodeIdsRef = useRef(selectedNodeIds);
  useEffect(() => { selectedNodeIdsRef.current = selectedNodeIds; }, [selectedNodeIds]);

  const transformRef = useRef(transform);
  transformRef.current = transform;

  // KEY CHANGE: Adopting the ref pattern from V2 to prevent stale closures.
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });

  const nodeSizesRef = useRef(nodeSizes);
  useEffect(() => {
    nodeSizesRef.current = nodeSizes;
  }, [nodeSizes]);

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
            // FIX: Use direct method call to avoid potential `this` context issues with `call`.
            zoomBehaviorRef.current.scaleBy(svg.transition().duration(250), 1.2);
        }
    },
    zoomOut: () => {
        if (zoomBehaviorRef.current && svgRef.current) {
            const svg = select(svgRef.current);
            // FIX: Use direct method call to avoid potential `this` context issues with `call`.
            zoomBehaviorRef.current.scaleBy(svg.transition().duration(250), 0.8);
        }
    },
    // KEY CHANGE: Using the more accurate "zoomToFit" from V2.
    zoomToFit: () => {
        const svgElement = svgRef.current;
        const zoomBehavior = zoomBehaviorRef.current;
        if (!svgElement || !zoomBehavior || !dimensions.width) return;
        
        const allNodeIds = Array.from(nodePositions.keys());
        if (allNodeIds.length === 0) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        allNodeIds.forEach(id => {
            const pos = nodePositions.get(id);
            const size = nodeSizes[id] || { width: nodeWidth, height: minNodeHeight };
            if (pos) {
                minX = Math.min(minX, pos.x - size.width / 2);
                minY = Math.min(minY, pos.y - size.height / 2);
                maxX = Math.max(maxX, pos.x + size.width / 2);
                maxY = Math.max(maxY, pos.y + size.height / 2);
            }
        });
        
        if (minX === Infinity) return;

        const boundsWidth = maxX - minX;
        const boundsHeight = maxY - minY;
        const boundsCenterX = (minX + maxX) / 2;
        const boundsCenterY = (minY + maxY) / 2;
        
        if (!boundsWidth || !boundsHeight) return;
        
        const { width, height } = dimensions;
        const scale = 0.9 * Math.min(width / boundsWidth, height / boundsHeight);
        const newX = width / 2 - boundsCenterX * scale;
        const newY = height / 2 - boundsCenterY * scale;
        
        const newTransform = zoomIdentity.translate(newX, newY).scale(scale);
        const svg = select(svgElement);

        // FIX: Use direct method call for consistency and to resolve error. The .call() pattern has shown issues with `this` context.
        const transition = svg.transition().duration(750).ease(easeCubicOut);
        zoomBehavior.transform(transition, newTransform);
    }
// FIX: Added missing dependency array to useImperativeHandle. The `zoomToFit` function relies on `dimensions`, `nodePositions`, and `nodeSizes` state, which could become stale without being listed as dependencies.
  }), [dimensions, nodePositions, nodeSizes]);

  const displayRoot = useMemo(() => {
    if (!focusedNodeId) {
        return root;
    }
    const focusedNode = findNodeById(JSON.parse(JSON.stringify(root)), focusedNodeId);
    return focusedNode || root;
  }, [root, focusedNodeId]);

  const originalNodesMap = useMemo(() => {
    const map = new Map<string, MindMapNodeData>();
    if (!root) return map;
    hierarchy<MindMapNodeData>(root).each(d => map.set(d.data.id, d.data));
    return map;
  }, [root]);
  
  const originalNodesMapRef = useRef(originalNodesMap);
  useEffect(() => {
    originalNodesMapRef.current = originalNodesMap;
  }, [originalNodesMap]);

  // KEY CHANGE: Using the more efficient and correct `useMemo` from V2 for layout calculation.
  const d3Root = useMemo(() => {
    const deepCloneAndFilter = (node: MindMapNodeData): MindMapNodeData => {
        const newNode = { ...node };
        if (node.isCollapsed) {
            newNode.children = [];
        } else if (node.children) {
            newNode.children = node.children.map((child) => deepCloneAndFilter(child));
        }
        return newNode;
    };
    const layoutReadyRoot = deepCloneAndFilter(displayRoot);
    const hierarchyData = hierarchy<MindMapNodeData>(layoutReadyRoot);
    
    const treeLayout = tree<MindMapNodeData>().nodeSize([200, 320]);
    treeLayout(hierarchyData);

    const siblingGroupX = new Map<string, number>();
    hierarchyData.each(node => {
        if (!node.children || node.children.length === 0) return;
        const firstMovedChild = node.children.find(child => originalNodesMap.get(child.data.id)?.x !== undefined);
        if (firstMovedChild) {
            const commonX = originalNodesMap.get(firstMovedChild.data.id)!.x!;
            siblingGroupX.set(node.data.id, commonX);
        }
    });

    hierarchyData.each(d => {
        const tempX = d.x;
        d.x = d.y;
        d.y = tempX;
        
        const originalNode = originalNodesMap.get(d.data.id);
        if (originalNode) {
            if (originalNode.x !== undefined) {
                d.x = originalNode.x;
            } else if (d.parent && siblingGroupX.has(d.parent.data.id)) {
                d.x = siblingGroupX.get(d.parent.data.id)!;
            }
            if (originalNode.y !== undefined) {
                d.y = originalNode.y;
            }
        }
    });

    return hierarchyData;
  }, [displayRoot, originalNodesMap]);

  useEffect(() => {
    if (!d3Root) return;
    const positionsToPersist = new Map<string, { x: number; y: number }>();
    let needsUpdate = false;
    for (const d of d3Root.descendants()) {
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
  
  // This effect populates the local `nodePositions` state. It ensures that all nodes,
  // including hidden children of collapsed nodes, have their positions available for
  // drag operations. It prioritizes persisted positions and falls back to calculated
  // layout positions for new or unpositioned visible nodes.
  useLayoutEffect(() => {
    if (d3Root) {
        const newPositions = new Map<string, { x: number; y: number }>();
        const allNodesInData = hierarchy<MindMapNodeData>(root).descendants();
        const layoutNodesMap = new Map(d3Root.descendants().map(n => [n.data.id, n]));

        allNodesInData.forEach(fullNode => {
            const fullNodeData = fullNode.data;
            // Prioritize the persisted position from the original data structure.
            if (fullNodeData.x !== undefined && fullNodeData.y !== undefined) {
                newPositions.set(fullNodeData.id, { x: fullNodeData.x, y: fullNodeData.y });
            } else {
                // If no persisted position, check if a layout was calculated for this node (i.e., it was visible).
                const layoutNode = layoutNodesMap.get(fullNodeData.id);
                if (layoutNode && layoutNode.x !== undefined && layoutNode.y !== undefined) {
                    newPositions.set(fullNodeData.id, { x: layoutNode.x, y: layoutNode.y });
                }
            }
        });
        setNodePositions(newPositions);
    }
  }, [d3Root, root]);

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const selectedNodeData = useMemo(() => originalNodesMap.get(lastSelectedNodeId || '') || null, [originalNodesMap, lastSelectedNodeId]);
  
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
  
  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    const svg = select(svgRef.current);
    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 3])
      .filter((evt) => {
        // Always allow wheel-based zooming.
        if (evt.type === 'wheel') return true;

        // Touch events logic
        const isTouchEvent = evt instanceof TouchEvent || (window.PointerEvent && evt instanceof PointerEvent && evt.pointerType === 'touch');
        if (isTouchEvent) {
            // On touch, allow panning/zooming if in pan mode.
            // The node drag filter is disabled for touch in pan mode, so this is safe.
            return toolMode === 'pan';
        }

        // Mouse events logic (original logic)
        // Only allow panning on the background, to allow node dragging to work on nodes.
        return toolMode === 'pan' && (evt.target as Element).closest('.node-group, .editable-link-group, .node-toolbar-wrapper, .topic-hotspot-wrapper, .focus-bar, .node-context-menu') === null;
      })
      .on('zoom', (event) => {
        setTransform(event.transform);
        onTransformChange(event.transform);
      });
    svg.call(zoomBehavior);
    svg.on("dblclick.zoom", null);
    zoomBehaviorRef.current = zoomBehavior;
    return () => { svg.on('.zoom', null); };
  }, [isInitialTransformSet, onTransformChange, toolMode]);

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = select(svgRef.current);
    let startPos: { x: number; y: number } | null = null;
    const selectionDrag = drag<SVGSVGElement, unknown>()
      .filter((event) => toolMode === 'select' && event.target === svgRef.current)
      .on('start', (event) => {
        const isTouchEvent = event.sourceEvent instanceof TouchEvent || (window.PointerEvent && event.sourceEvent instanceof PointerEvent && event.sourceEvent.pointerType === 'touch');
        if (isTouchEvent) {
          isAwaitingLongPressRef.current = true;
          const [touchX, touchY] = pointer(event, svgRef.current!);
          touchStartPosRef.current = { x: touchX, y: touchY };
          longPressTimerRef.current = setTimeout(() => {
            if (isAwaitingLongPressRef.current) {
              setIsBoxSelecting(true);
              if (typeof navigator.vibrate === 'function') navigator.vibrate(50);
              const currentTransform = zoomTransform(svgRef.current!);
              const [startX, startY] = currentTransform.invert([touchStartPosRef.current!.x, touchStartPosRef.current!.y]);
              startPos = { x: startX, y: startY };
              const newBox = { x: startPos.x, y: startPos.y, width: 0, height: 0 };
              setSelectionBox(newBox);
              setLongPressFeedback({x: startX, y: startY});
              selectionBoxRef.current = newBox;
            }
          }, LONG_PRESS_DURATION);
        } else {
          setIsBoxSelecting(true);
          const currentTransform = zoomTransform(svgRef.current!);
          const [x, y] = currentTransform.invert(pointer(event, svgRef.current!));
          startPos = { x, y };
          const newBox = { x: startPos.x, y: startPos.y, width: 0, height: 0 };
          setSelectionBox(newBox);
          selectionBoxRef.current = newBox;
        }
      })
      .on('drag', (event) => {
        if (isAwaitingLongPressRef.current) {
          const [currentX, currentY] = pointer(event, svgRef.current!);
          const dist = Math.sqrt(Math.pow(currentX - touchStartPosRef.current!.x, 2) + Math.pow(currentY - touchStartPosRef.current!.y, 2));
          if (dist > TOUCH_MOVE_THRESHOLD) {
            if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
            isAwaitingLongPressRef.current = false;
          }
        }
        if (!isBoxSelecting || !startPos) return;
        const currentTransform = zoomTransform(svgRef.current!);
        const [cursorX, cursorY] = currentTransform.invert(pointer(event, svgRef.current!));
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
            nodesRef.current.forEach(node => {
                const pos = nodePositionsRef.current.get(node.data.id);
                if (pos && pos.x >= x && pos.x <= x + width && pos.y >= y && pos.y <= y + height) {
                    selectedIds.add(node.data.id);
                }
            });
            const sourceEvent = event.sourceEvent as MouseEvent | TouchEvent;
            if ('shiftKey' in sourceEvent && sourceEvent.shiftKey) {
                const newSelection = new Set(selectedNodeIdsRef.current);
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
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, [toolMode, onNodeSelect, onSelectionEnd, isBoxSelecting]);

  const initialCenteringDoneRef = useRef(false);
  useEffect(() => { initialCenteringDoneRef.current = false; }, [root.id]);

  useEffect(() => {
    if (!dimensions.width || !svgRef.current || !zoomBehaviorRef.current || !isInitialTransformSet) return;
    const svg = select(svgRef.current);
    const zoomBehavior = zoomBehaviorRef.current;
    let targetNodeId: string | null = null;
    if (focusedNodeId) targetNodeId = focusedNodeId;
    else if (nodeToCenterOn) targetNodeId = nodeToCenterOn;
    else if (!initialCenteringDoneRef.current) {
        targetNodeId = root.id;
        initialCenteringDoneRef.current = true;
    }
    if (!targetNodeId) return;
    const targetNode = nodesRef.current.find(n => n.data.id === targetNodeId);
    if (!targetNode) return;
    const nodePos = nodePositionsRef.current.get(targetNode.data.id);
    if (!nodePos) return; 
    const { x: targetX, y: targetY } = nodePos;
    const svgNode = svg.node();
    if (!svgNode) return;
    const currentTransform = zoomTransform(svgNode);
    let k = currentTransform.k;
    if (nodeToCenterOn) k = Math.max(k, 1.2);
    const newTransform = zoomIdentity.translate(dimensions.width / 2 - targetX * k, dimensions.height / 2 - targetY * k).scale(k);
    // FIX: Use direct method call to avoid potential `this` context issues with `call`.
    const transition = svg.transition('zoom').duration(400).ease(easeCubicOut);
    zoomBehavior.transform(transition, newTransform);
  }, [focusedNodeId, nodeToCenterOn, isInitialTransformSet, dimensions, root.id]);

  const isDescendant = useCallback((node: HierarchyNode<MindMapNodeData>, id: string): boolean => node.descendants().some(d => d.data.id === id), []);

  // This effect sets up D3 drag handlers. It re-runs when the set of rendered nodes changes,
  // but crucially *not* when their positions change during a drag, which prevents D3's
  // internal drag state from being reset mid-gesture.
  useLayoutEffect(() => {
    if (!nodesContainerRef.current || nodes.length === 0) return;

    const htmlNodes = select(nodesContainerRef.current).selectAll<HTMLDivElement, HierarchyPointNode<MindMapNodeData>>('div.node-group');
    type DragEvent = D3DragEvent<HTMLDivElement, HierarchyPointNode<MindMapNodeData>, HierarchyPointNode<MindMapNodeData>>;

    const dragBehavior = drag<HTMLDivElement, HierarchyPointNode<MindMapNodeData>>()
      .filter((event) => {
        const { isReviewModeActive, focusedNodeId, contextMenu, toolMode } = propsRef.current;
        const isTouchEvent = event.sourceEvent instanceof TouchEvent || (window.PointerEvent && event.sourceEvent instanceof PointerEvent && event.sourceEvent.pointerType === 'touch');

        // On touch devices, disable node dragging when in pan mode to allow the canvas to be panned instead.
        if (isTouchEvent && toolMode === 'pan') {
            return false;
        }

        if (contextMenu || isReviewModeActive) return false;
        const target = event.target as Element;
        
        // Prevent drag from starting on specific interactive elements within a node.
        if (target.closest('.node-resize-handle, .node-toggle-button, .connector-handle, .attachment-button')) {
            return false;
        }

        if (focusedNodeId && (event.subject as HierarchyPointNode<MindMapNodeData>).data.id === focusedNodeId) return false;
        
        return !!target.closest('.mind-map-node-draggable-part');
      })
      .on('start', function (this: HTMLDivElement, event: DragEvent, d: HierarchyPointNode<MindMapNodeData>) {
        const { onNodeDragStart, onNodeSelect, contextMenu, getAllDescendantIds } = propsRef.current;
        if (contextMenu) {
            event.sourceEvent.stopPropagation();
            return;
        }
        onNodeDragStart();
        event.sourceEvent.stopPropagation();
        select(this).raise();
        
        let currentSelection = selectedNodeIdsRef.current;
        if (!currentSelection.has(d.data.id)) {
            currentSelection = new Set([d.data.id]);
            onNodeSelect(currentSelection);
        }
        setDraggedNodeId(d.data.id);
        
        const nodesToMove = new Set(currentSelection);
        currentSelection.forEach(nodeId => {
            const nodeData = originalNodesMapRef.current.get(nodeId);
            if (nodeData && nodeData.isCollapsed) {
                const descendantIds = getAllDescendantIds(nodeData);
                descendantIds.forEach(id => nodesToMove.add(id));
            }
        });
        
        const [worldX, worldY] = transformRef.current.invert([event.x, event.y]);
        dragStartOffsetsRef.current.clear();
        nodesToMove.forEach(id => {
            const nodePos = nodePositionsRef.current.get(id);
            if (nodePos) {
                dragStartOffsetsRef.current.set(id, { dx: nodePos.x - worldX, dy: nodePos.y - worldY });
            }
        });
      })
      .on('drag', function (this: HTMLDivElement, event: DragEvent, d: HierarchyPointNode<MindMapNodeData>) {
        if (propsRef.current.contextMenu) {
            return;
        }
        const [worldX, worldY] = transformRef.current.invert([event.x, event.y]);
        
        setNodePositions(currentPositions => {
            const newPositions = new Map(currentPositions);
            dragStartOffsetsRef.current.forEach((offset, id) => {
                newPositions.set(id, { x: worldX + offset.dx, y: worldY + offset.dy });
            });
            return newPositions;
        });
      })
      .on('end', function (this: HTMLDivElement, event: DragEvent, d: HierarchyPointNode<MindMapNodeData>) {
        const { onMultipleNodePositionsUpdate } = propsRef.current;
        
        const [worldX, worldY] = transformRef.current.invert([event.x, event.y]);
        const positionsToUpdate = new Map<string, { x: number; y: number }>();
        dragStartOffsetsRef.current.forEach((offset, id) => {
            positionsToUpdate.set(id, { x: worldX + offset.dx, y: worldY + offset.dy });
        });
        onMultipleNodePositionsUpdate(positionsToUpdate);
        
        setDraggedNodeId(null);
        dragStartOffsetsRef.current.clear();
      });

    htmlNodes.call(dragBehavior);

    // Add cleanup function to remove d3 handlers when the effect re-runs or component unmounts
    return () => {
      htmlNodes.on('.drag', null);
    };
  }, [nodes, isDescendant]);

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
      const [x, y] = pointer(e, svgRef.current!);
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
        if (targetNodeId) onAddLink(drawingLinkState.sourceId, targetNodeId);
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
    if(linkId) onNodeSelect(new Set<string>());
  }, [onNodeSelect]);

  const handleNodeSelect = useCallback((id: string, event: React.MouseEvent | React.TouchEvent) => {
      event.stopPropagation();
      setSelectedLinkId(null);
      const isCtrlOrMeta = 'ctrlKey' in event && (event.ctrlKey || event.metaKey);
      const isShift = 'shiftKey' in event && event.shiftKey;
      if (isShift) {
          const clickedNode = findNodeById(root, id);
          if (clickedNode) {
              const descendantIds = getAllDescendantIds(clickedNode);
              onNodeSelect(new Set([id, ...descendantIds]));
          }
      } else if (isCtrlOrMeta) {
          const newSelection = new Set(selectedNodeIds);
          if (newSelection.has(id)) newSelection.delete(id);
          else newSelection.add(id);
          onNodeSelect(newSelection);
      } else {
          onNodeSelect(new Set([id]));
      }
  }, [selectedNodeIds, onNodeSelect, root, getAllDescendantIds]);

  const handleShowContextMenu = useCallback((nodeId: string, x: number, y: number) => {
    onContextMenuChange({ nodeId, x, y });
    if (!selectedNodeIds.has(nodeId)) onNodeSelect(new Set([nodeId]));
  }, [selectedNodeIds, onNodeSelect, onContextMenuChange]);

  const handleCloseContextMenu = useCallback(() => onContextMenuChange(null), [onContextMenuChange]);
  
  if (!d3Root) return <div>Loading...</div>;
  
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
        onContextMenu={(e) => { if(e.target === svgRef.current) { e.preventDefault(); handleCloseContextMenu(); } }}
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
              const linkWithLivePositions = { ...link, source: { ...link.source, x: sourcePos.x, y: sourcePos.y }, target: { ...link.target, x: targetPos.x, y: targetPos.y }};
              return <Link key={`${link.source.data.id}-${link.target.data.id}`} link={linkWithLivePositions} />;
            })}
            {typedLinks.map(link => {
              const sourcePos = nodePositions.get(link.source);
              const targetPos = nodePositions.get(link.target);
              if (!sourcePos || !targetPos) return null;
              return <EditableLink key={link.id} link={link} sourcePos={sourcePos} targetPos={targetPos} onUpdate={onUpdateLinkLabel} onDelete={onDeleteLink} isSelected={selectedLinkId === link.id} onSelect={handleSelectLink} />;
            })}
          </g>
          {drawingLinkState && <path d={`M${nodePositions.get(drawingLinkState.sourceId)?.x},${nodePositions.get(drawingLinkState.sourceId)?.y}L${drawingLinkState.endPos.x},${drawingLinkState.endPos.y}`} stroke="#3b82f6" strokeWidth="2.5" strokeDasharray="5,5" fill="none" markerEnd="url(#arrowhead-selected)" style={{ pointerEvents: 'none' }} />}
          {selectionBox && <rect x={selectionBox.x} y={selectionBox.y} width={selectionBox.width} height={selectionBox.height} className="selection-box" fill="rgba(59, 130, 246, 0.1)" stroke="rgba(59, 130, 246, 0.8)" strokeWidth="1.5" strokeDasharray="3,3" />}
          <AnimatePresence>
            {longPressFeedback && <motion.circle cx={longPressFeedback.x} cy={longPressFeedback.y} r={0} fill="none" stroke="rgba(59, 130, 246, 0.8)" strokeWidth={2} initial={{ r: 0, opacity: 1 }} animate={{ r: 30, opacity: 0 }} transition={{ duration: 0.5, ease: 'easeOut' }} />}
          </AnimatePresence>
        </g>
      </svg>
      <div
          ref={nodesContainerRef}
          className="absolute top-0 left-0"
          style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
      >
          {nodes.map(d => {
            const originalNode = originalNodesMap.get(d.data.id);
            if (!originalNode) return null;
            const glowInfo = glowingNodes.find(n => n.nodeId === d.data.id);
            const pos = nodePositions.get(d.data.id);
            if (!pos) return null;
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
                  isPastingImage={pastingImageNodeId === d.data.id}
                  glowSeverity={glowInfo?.severity || null}
                  isSearchResult={searchResultIds.includes(d.data.id)}
                  isCurrentSearchResult={currentSearchResultId === d.data.id}
                  startInEditMode={nodeToEditOnRender === d.data.id}
                  originalChildrenCount={originalNode.children?.length || 0}
                  theme={theme}
                  onSelect={handleNodeSelect}
                  onUpdate={onNodeUpdate}
                  onUpdateNodeSize={onUpdateNodeSize}
                  onNodePositionUpdate={persistNodePosition}
                  onDelete={onNodeDelete}
                  onToggleCollapse={onToggleCollapse}
                  onEditComplete={onEditComplete}
                  onSizeChange={handleNodeSizeChange}
                  onStartLinkDraw={(id) => setDrawingLinkState({ sourceId: id, endPos: {x: pos.x, y: pos.y} })}
                  onShowAttachments={onShowAttachments}
                  onRemoveImage={onRemoveNodeImage}
                  onViewImage={onViewImage}
                  onShowContextMenu={handleShowContextMenu}
              />
            )
          })}

          {/* KEY CHANGE: Reverting to the more stable nested animation structure from V1 for the Toolbar. */}
          <AnimatePresence>
            {selectedNodeIds.size === 1 && lastSelectedNodeId && selectedNodeData && nodePositions.get(lastSelectedNodeId) && (
              (() => {
                const nodePos = nodePositions.get(lastSelectedNodeId)!;
                const nodeSize = nodeSizes[lastSelectedNodeId] || { height: minNodeHeight };
                const toolbarWorldX = nodePos.x - (TOOLBAR_WIDTH / 2);
                const toolbarWorldY = nodePos.y - (nodeSize.height / 2) - TOOLBAR_HEIGHT - TOOLBAR_Y_OFFSET;
                const toolbarScreenX = toolbarWorldX * transform.k + transform.x;
                const toolbarScreenY = toolbarWorldY * transform.k + transform.y;
                const toolbarScale = transform.k;
                return (
                  <motion.div
                    className="absolute top-0 left-0 z-20"
                    style={{ width: TOOLBAR_WIDTH, height: TOOLBAR_HEIGHT, pointerEvents: 'none', transformOrigin: 'top left' }}
                    animate={{ x: toolbarScreenX, y: toolbarScreenY, scale: toolbarScale }}
                    transition={{ x: { duration: 0 }, y: { duration: 0 }, scale: { duration: 0 } }}
                  >
                    <motion.div
                      className="node-toolbar-wrapper"
                      style={{ width: TOOLBAR_WIDTH, height: TOOLBAR_HEIGHT, transformOrigin: 'bottom center', pointerEvents: 'auto' }}
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
                        onIdentifyAndLabel={() => onIdentifyAndLabel(lastSelectedNodeId!)}
                        onTestBranch={() => onTestBranch(lastSelectedNodeId!)}
                        onSelectBranch={() => onSelectBranch(lastSelectedNodeId!)}
                        onSelectChildren={() => onSelectChildren(lastSelectedNodeId!)}
                        onSelectSiblings={() => onSelectSiblings(lastSelectedNodeId!)}
                        // FIX: Corrected prop name from `onSetNodeColor` to `onSetColor` to match the NodeToolbarProps interface.
                        onSetColor={(color) => onSetNodeColor(lastSelectedNodeId!, color)}
                        onFocusNode={() => onFocusNode(lastSelectedNodeId!)}
                        isGeneratingIdeas={generatingIdeasForNodeId === lastSelectedNodeId}
                        isRephrasing={rephrasingNodeId === lastSelectedNodeId}
                        isExtractingConcepts={extractingConceptsNodeId === lastSelectedNodeId}
                        isGeneratingAnalogy={generatingAnalogyNodeId === lastSelectedNodeId}
                        isIdentifyingLabels={identifyingLabelsNodeId === lastSelectedNodeId}
                        hasChildren={!!(selectedNodeData.children && selectedNodeData.children.length > 0)}
                        hasImage={!!selectedNodeData.image}
                        isRoot={selectedNodeData.id === root.id}
                      />
                    </motion.div>
                  </motion.div>
                )
              })()
            )}
          </AnimatePresence>

          {/* KEY CHANGE: Reverting to the more stable nested animation structure from V1 for the Hotspot. */}
          <AnimatePresence>
            {hotspotData && nodePositions.get(hotspotData.node.id) && (
              (() => {
                const nodePos = nodePositions.get(hotspotData.node.id)!;
                const nodeSize = nodeSizes[hotspotData.node.id] || { width: nodeWidth, height: minNodeHeight };
                const hotspotWorldX = nodePos.x + (nodeSize.width / 2) + HOTSPOT_X_OFFSET;
                const hotspotWorldY = nodePos.y - (HOTSPOT_HEIGHT / 2);
                const hotspotScreenX = hotspotWorldX * transform.k + transform.x;
                const hotspotScreenY = hotspotWorldY * transform.k + transform.y;
                const hotspotScale = transform.k;
                return (
                  <motion.div
                    className="absolute top-0 left-0 topic-hotspot-wrapper"
                    style={{ width: HOTSPOT_WIDTH, height: HOTSPOT_HEIGHT + 20, pointerEvents: 'none', zIndex: 30, transformOrigin: 'top left' }}
                    animate={{ x: hotspotScreenX, y: hotspotScreenY, scale: hotspotScale }}
                    transition={{ x: { duration: 0 }, y: { duration: 0 }, scale: { duration: 0 } }}
                  >
                    <motion.div
                      style={{ width: HOTSPOT_WIDTH, height: HOTSPOT_HEIGHT, transformOrigin: 'bottom left', pointerEvents: 'auto' }}
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
                            // FIX: Corrected prop name to pass the `onHotspotBackToMain` function from props.
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
                    onIdentifyAndLabel={() => onIdentifyAndLabel(contextMenu.nodeId)}
                    onSetColor={(color) => onSetNodeColor(contextMenu.nodeId, color)}
                    onFocusNode={() => onFocusNode(contextMenu.nodeId)}
                    onTestBranch={() => onTestBranch(contextMenu.nodeId)}
                    isGeneratingIdeas={generatingIdeasForNodeId === contextMenu.nodeId}
                    isRephrasing={rephrasingNodeId === contextMenu.nodeId}
                    isExtractingConcepts={extractingConceptsNodeId === contextMenu.nodeId}
                    isGeneratingAnalogy={generatingAnalogyNodeId === contextMenu.nodeId}
                    isIdentifyingLabels={identifyingLabelsNodeId === contextMenu.nodeId}
                />
            )}
          </AnimatePresence>
      </div>
      <AnimatePresence>
        {focusedNodeId && focusPath.length > 0 && (
          <FocusBar path={focusPath} onNavigate={onFocusNode} />
        )}
      </AnimatePresence>
    </div>
  );
});

export default MindMap;
