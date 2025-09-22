import { useState, useCallback, useEffect, useRef } from 'react';
import { db } from '../firebase';
import type { WriteBatch } from '../firebase';
import { MindMapNode, MindMapDocument, MindMapLink, Attachment, SourceDocumentFile, MindMapNodeData, LearningProfile, Chapter } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { NODE_COLORS, ROOT_NODE_COLOR, determineNodeColorByType } from '../constants';
import { hierarchy } from 'd3-hierarchy';

type HistoryState = {
  root: MindMapNode;
  links: MindMapLink[];
};

const createNewSubjectObject = (name: string, userId: string, color: string): Omit<MindMapDocument, 'id'> => {
  return {
    name,
    ownerId: userId,
    sourceDocuments: [],
    createdAt: new Date().toISOString(),
    color,
    learningProfile: {
        analogyPreference: 0,
        structurePreference: 0,
        visualPreference: 0,
        creationPreference: 0,
        interactionCount: 0,
    }
  };
};

const createNewChapterObject = (name: string, color: string, order: number): Omit<Chapter, 'id'> => {
    const rootId = uuidv4();
    return {
        name,
        order,
        root: {
            id: rootId,
            text: name,
            color: color,
            children: [],
            attachments: [],
            masteryScore: 0,
        },
        links: [],
        createdAt: new Date().toISOString(),
    };
};


const mapNodeRecursive = (
  targetId: string,
  node: MindMapNode,
  transform: (node: MindMapNode) => MindMapNode
): MindMapNode => {
  if (node.id === targetId) {
    return transform(node);
  }
  if (node.children) {
    return {
      ...node,
      children: node.children.map((child) =>
        mapNodeRecursive(targetId, child, transform)
      ),
    };
  }
  return node;
};

const deleteNodeRecursive = (targetId: string, node: MindMapNode): MindMapNode | null => {
    if (node.id === targetId) {
        return null; // This node should be deleted
    }

    if (node.children) {
        let hasChanged = false;
        const newChildren = node.children.map(child => {
            const newChild = deleteNodeRecursive(targetId, child);
            if (newChild !== child) { // Check for reference inequality, indicating a change in the subtree
                hasChanged = true;
            }
            return newChild;
        }).filter((child): child is MindMapNode => child !== null);

        // if a child was deleted, or a descendant was deleted, return a new parent node
        if (hasChanged) {
            return { ...node, children: newChildren };
        }
    }

    return node; // No changes in this subtree
};


const findNodeRecursive = (id: string, node: MindMapNode): MindMapNode | null => {
  if (node.id === id) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeRecursive(id, child);
      if (found) return found;
    }
  }
  return null;
};

// Helper to find parent of a node
const findParentRecursive = (targetId: string, node: MindMapNode): MindMapNode | null => {
    if (node.children) {
        for (const child of node.children) {
            if (child.id === targetId) {
                return node; // Found parent
            }
            const found = findParentRecursive(targetId, child);
            if (found) {
                return found;
            }
        }
    }
    return null;
};


// Helper to get all node IDs in a subtree
const getAllNodeIdsRecursive = (node: MindMapNode): string[] => {
    const ids = [node.id];
    if (node.children) {
        node.children.forEach(child => {
            ids.push(...getAllNodeIdsRecursive(child));
        });
    }
    return ids;
};

const getAllDescendantIds = (node: MindMapNode): string[] => {
    let ids: string[] = [];
    if (node.children) {
        node.children.forEach(child => {
            ids.push(child.id);
            ids = ids.concat(getAllDescendantIds(child));
        });
    }
    return ids;
};

const mapMultipleNodesRecursive = (
  node: MindMapNode,
  positions: Map<string, { x: number; y: number }>
): MindMapNode => {
  let hasChanged = false;
  let newNode = node;

  const ownUpdate = positions.get(node.id);
  if (ownUpdate) {
    newNode = { ...node, x: ownUpdate.x, y: ownUpdate.y };
    hasChanged = true;
  }

  if (node.children) {
    let childrenChanged = false;
    const newChildren = node.children.map(child => {
      const updatedChild = mapMultipleNodesRecursive(child, positions);
      if (updatedChild !== child) { 
        childrenChanged = true;
      }
      return updatedChild;
    });
    
    if (childrenChanged) {
      if (!hasChanged) {
        newNode = { ...node };
      }
      newNode.children = newChildren;
      hasChanged = true;
    }
  }
  return hasChanged ? newNode : node;
};


const useMindMapData = (userId: string | null) => {
  const [subjects, setSubjects] = useState<MindMapDocument[]>([]);
  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<{ undo: HistoryState[], redo: HistoryState[] }>({ undo: [], redo: [] });
  const migrationStatusRef = useRef(new Set<string>()); // Tracks which docs have been checked for migration

  const subjectsRef = useRef(subjects);
  useEffect(() => {
    subjectsRef.current = subjects;
  }, [subjects]);
  
  // Clear history when switching documents
  useEffect(() => {
      setHistory({ undo: [], redo: [] });
  }, [activeSubjectId, activeChapterId]);

  // --- ONE-TIME DATA MIGRATION ---
  const migrateDocument = useCallback(async (docData: MindMapDocument) => {
    if (!docData.root || migrationStatusRef.current.has(docData.id)) {
        return; // Already migrated or checked
    }
    migrationStatusRef.current.add(docData.id); // Mark as checked
    console.log(`Starting migration for subject: ${docData.name} (${docData.id})`);

    const docRef = db.collection('documents').doc(docData.id);
    const chaptersRef = docRef.collection('chapters');

    try {
        const batch = db.batch();
        const mainChapterData = {
            name: 'Main Chapter',
            order: 0,
            root: docData.root,
            links: docData.links || [],
            createdAt: new Date().toISOString(),
        };

        const newChapterRef = chaptersRef.doc();
        batch.set(newChapterRef, mainChapterData);

        const { root, links, ...subjectData } = docData;
        batch.set(docRef, subjectData);

        await batch.commit();
        console.log(`Migration successful for subject: ${docData.name}`);
    } catch (error) {
        console.error(`Migration failed for subject ${docData.id}:`, error);
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setSubjects([]);
      setActiveSubjectId(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = db.collection('documents').where('ownerId', '==', userId);
    
    const unsubscribe = q.onSnapshot((querySnapshot) => {
      const userSubjects = querySnapshot.docs
        .map(doc => ({ ...doc.data(), id: doc.id } as MindMapDocument))
        .sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateA - dateB;
        });
      
      userSubjects.forEach(migrateDocument);

      setSubjects(userSubjects);
      
      setActiveSubjectId(prevActiveId => {
          const currentActiveExists = userSubjects.some(d => d.id === prevActiveId);
          if (currentActiveExists) {
              return prevActiveId;
          }
          if(userSubjects.length > 0) {
              return userSubjects[userSubjects.length - 1].id;
          }
          return null;
      });
      
      setLoading(false);
    }, (error) => {
      console.error("Error fetching documents:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId, migrateDocument]);

  // Effect to fetch chapters for the active subject
  useEffect(() => {
    if (!activeSubjectId) {
        setChapters([]);
        setActiveChapterId(null);
        return;
    }
    const unsubscribeChapters = db.collection('documents').doc(activeSubjectId).collection('chapters')
        .orderBy('order')
        .onSnapshot(snapshot => {
            const fetchedChapters = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Chapter));
            setChapters(fetchedChapters);
            
            // Set active chapter
            setActiveChapterId(prevActiveChapterId => {
                const activeChapterStillExists = fetchedChapters.some(c => c.id === prevActiveChapterId);
                if (activeChapterStillExists) {
                    return prevActiveChapterId;
                }
                return fetchedChapters.length > 0 ? fetchedChapters[0].id : null;
            });
        });
    
    return () => unsubscribeChapters();
  }, [activeSubjectId]);

  const activeSubject = subjects.find(d => d.id === activeSubjectId) || null;
  const activeChapter = chapters.find(c => c.id === activeChapterId) || null;
  const activeChapterRef = (activeSubjectId && activeChapterId) ? db.collection('documents').doc(activeSubjectId).collection('chapters').doc(activeChapterId) : null;

  const findNode = useCallback((id: string) => {
    if (!activeChapter) return null;
    return findNodeRecursive(id, activeChapter.root);
  }, [activeChapter]);
  
  const findParentNode = useCallback((nodeId: string) => {
    if (!activeChapter || nodeId === activeChapter.root.id) return null;
    return findParentRecursive(nodeId, activeChapter.root);
  }, [activeChapter]);

  const updateMindMap = useCallback(async (updates: Partial<HistoryState>) => {
    if (!activeChapterRef || !activeChapter) return;

    setHistory(prev => {
        const newUndoStack = [...prev.undo, { root: activeChapter.root, links: activeChapter.links }];
        if (newUndoStack.length > 30) newUndoStack.shift(); 
        return { undo: newUndoStack, redo: [] }; 
    });

    await activeChapterRef.update(updates);
  }, [activeChapterRef, activeChapter]);
  
  const undo = useCallback(async () => {
    if (!activeChapterRef || !activeChapter || history.undo.length === 0) return;

    const lastStateToRestore = history.undo[history.undo.length - 1];
    const currentStateToSave = { root: activeChapter.root, links: activeChapter.links };

    setHistory(prev => ({
        undo: prev.undo.slice(0, -1),
        redo: [...prev.redo, currentStateToSave]
    }));
    
    await activeChapterRef.update({ root: lastStateToRestore.root, links: lastStateToRestore.links });
  }, [activeChapterRef, activeChapter, history]);

  const redo = useCallback(async () => {
      if (!activeChapterRef || !activeChapter || history.redo.length === 0) return;

      const nextStateToRestore = history.redo[history.redo.length - 1];
      const currentStateToSave = { root: activeChapter.root, links: activeChapter.links };

      setHistory(prev => ({
          undo: [...prev.undo, currentStateToSave],
          redo: prev.redo.slice(0, -1)
      }));
      
      await activeChapterRef.update({ root: nextStateToRestore.root, links: nextStateToRestore.links });
  }, [activeChapterRef, activeChapter, history]);

  const addSubject = useCallback(async () => {
    if (!userId) return null;
    const newSubjectColor = NODE_COLORS[subjects.length % NODE_COLORS.length];
    const newSubjectData = createNewSubjectObject('New Subject', userId, newSubjectColor);
    try {
        const docRef = await db.collection('documents').add(newSubjectData);
        // Also create a default first chapter
        const firstChapterData = createNewChapterObject('Main Chapter', newSubjectColor, 0);
        await docRef.collection('chapters').add(firstChapterData);
        
        setActiveSubjectId(docRef.id);
        return docRef.id;
    } catch(e) {
        console.error("Error creating subject", e);
        return null;
    }
  }, [userId, subjects]);

  const deleteSubject = useCallback(async (docId: string) => {
    await db.collection("documents").doc(docId).delete();
  }, []);

  const updateSubjectName = useCallback(async (docId: string, newName: string) => {
    const docRef = db.collection('documents').doc(docId);
    await docRef.update({ name: newName });
  }, []);

  const addChapter = useCallback(async (name: string) => {
    if (!activeSubjectId) return;
    const order = chapters.length > 0 ? Math.max(...chapters.map(c => c.order)) + 1 : 0;
    const color = NODE_COLORS[chapters.length % NODE_COLORS.length];
    const newChapterData = createNewChapterObject(name, color, order);
    await db.collection('documents').doc(activeSubjectId).collection('chapters').add(newChapterData);
  }, [activeSubjectId, chapters]);

  const deleteChapter = useCallback(async (chapterId: string) => {
    if (!activeSubjectId) return;
    await db.collection('documents').doc(activeSubjectId).collection('chapters').doc(chapterId).delete();
  }, [activeSubjectId]);

  const renameChapter = useCallback(async (chapterId: string, newName: string) => {
    if (!activeSubjectId) return;
    const chapterRef = db.collection('documents').doc(activeSubjectId).collection('chapters').doc(chapterId);
    await chapterRef.update({ name: newName });
  }, [activeSubjectId]);

  const switchActiveSubject = useCallback((docId: string) => {
    setActiveSubjectId(docId);
  }, []);

  const switchActiveChapter = useCallback((chapterId: string) => {
    setActiveChapterId(chapterId);
  }, []);
  
  const updateSourceDocuments = useCallback(async (newSourceDocs: SourceDocumentFile[]) => {
    if (!activeSubjectId) return;
    await db.collection('documents').doc(activeSubjectId).update({ sourceDocuments: newSourceDocs });
  }, [activeSubjectId]);

  const addChildNode = useCallback((parentId: string, text: string) => {
    if (!activeChapter) return;
    const parentNode = findNode(parentId);
    if (!parentNode || parentNode.x === undefined || parentNode.y === undefined) return;

    const HORIZONTAL_OFFSET = 320;
    const VERTICAL_OFFSET = 100;
    let newNodeX: number;
    let newNodeY: number;

    const siblings = parentNode.children || [];

    if (siblings.length > 0) {
        const lastSibling = siblings.reduce((last, current) => {
            return (current.y ?? -Infinity) > (last.y ?? -Infinity) ? current : last;
        });
        
        newNodeX = lastSibling.x ?? parentNode.x + HORIZONTAL_OFFSET;
        newNodeY = (lastSibling.y ?? parentNode.y) + VERTICAL_OFFSET;
    } else {
        newNodeX = parentNode.x + HORIZONTAL_OFFSET;
        newNodeY = parentNode.y;
    }

    const newNode: MindMapNode = {
      id: uuidv4(),
      text,
      x: newNodeX,
      y: newNodeY,
      children: [],
      color: parentNode.id === activeChapter.root.id ? NODE_COLORS[(parentNode.children?.length || 0) % NODE_COLORS.length] : parentNode.color,
      attachments: [],
      masteryScore: 0,
    };

    const newRoot = mapNodeRecursive(parentId, activeChapter.root, (node) => {
        return {
          ...node,
          isCollapsed: false,
          children: [...(node.children || []), newNode],
        };
    });
    updateMindMap({ root: newRoot });
  }, [activeChapter, findNode, updateMindMap]);
  
  const addMultipleChildrenNode = useCallback((parentId: string, ideas: { text: string }[]) => {
    if (!activeChapter) return;
    const parentNode = findNode(parentId);
    if (!parentNode || parentNode.x === undefined || parentNode.y === undefined) return;

    const siblings = parentNode.children || [];
    const totalIdeas = ideas.length;
    
    const radius = 350;
    const startAngle = -45; 
    const endAngle = 45;
    const angleSpread = endAngle - startAngle;

    const newNodes: MindMapNode[] = ideas.map((idea, index) => {
        const angleStep = totalIdeas > 1 ? angleSpread / (totalIdeas - 1) : 0;
        const angleDeg = startAngle + index * angleStep;
        const angleRad = angleDeg * (Math.PI / 180);

        const newNodeX = parentNode.x! + radius * Math.cos(angleRad);
        const newNodeY = parentNode.y! + radius * Math.sin(angleRad);
        
        return {
            id: uuidv4(),
            text: idea.text,
            x: newNodeX,
            y: newNodeY,
            children: [],
            color: parentNode.id === activeChapter.root.id ? NODE_COLORS[(siblings.length + index) % NODE_COLORS.length] : parentNode.color,
            attachments: [],
            masteryScore: 0,
        };
    });

    const newRoot = mapNodeRecursive(parentId, activeChapter.root, (node) => {
        return {
            ...node,
            isCollapsed: false,
            children: [...(node.children || []), ...newNodes],
        };
    });
    updateMindMap({ root: newRoot });
}, [activeChapter, findNode, updateMindMap]);


  const addNodeWithChildren = useCallback((parentId: string, newNodeData: MindMapNodeData) => {
    if (!activeChapter) return;
    const parentNode = findNode(parentId);
    if (!parentNode || parentNode.x === undefined || parentNode.y === undefined) return;

    let parentDepth = -1;
    hierarchy(activeChapter.root).each(d => {
        if (d.data.id === parentId) {
            parentDepth = d.depth;
        }
    });
    if (parentDepth === -1) return;

    const assignIdsAndProperties = (nodeData: MindMapNodeData, baseColor: string, level: number = 0): MindMapNode => {
        const nodeDepth = parentDepth + 1 + level;
        const finalColor = determineNodeColorByType(baseColor, nodeData.type, nodeDepth);

        const newNode: MindMapNode = {
            id: uuidv4(),
            text: nodeData.text,
            type: nodeData.type,
            color: finalColor,
            children: [],
            attachments: nodeData.attachments || [],
            masteryScore: 0,
        };

        if (nodeData.children) {
            newNode.children = nodeData.children.map((child) => 
                assignIdsAndProperties(child, baseColor, level + 1)
            );
        }
        return newNode;
    };

    const baseChildCount = parentNode.children?.length || 0;
    const newBranchBaseColor = NODE_COLORS[baseChildCount % NODE_COLORS.length];
    
    const fullyFormedNodeWithoutPos = assignIdsAndProperties(newNodeData, newBranchBaseColor);
    
    const HORIZONTAL_OFFSET = 320;
    const VERTICAL_OFFSET = 100;
    let newNodeX: number;
    let newNodeY: number;

    const siblings = parentNode.children || [];

    if (siblings.length > 0) {
        const lastSibling = siblings.reduce((last, current) => {
            return (current.y ?? -Infinity) > (last.y ?? -Infinity) ? current : last;
        });
        newNodeX = lastSibling.x ?? parentNode.x + HORIZONTAL_OFFSET;
        newNodeY = (lastSibling.y ?? parentNode.y) + VERTICAL_OFFSET;
    } else {
        newNodeX = parentNode.x + HORIZONTAL_OFFSET;
        newNodeY = parentNode.y;
    }
    
    const fullyFormedNode = {
        ...fullyFormedNodeWithoutPos,
        x: newNodeX,
        y: newNodeY,
    };

    const newRoot = mapNodeRecursive(parentId, activeChapter.root, (node) => {
        return {
            ...node,
            isCollapsed: false,
            children: [...(node.children || []), fullyFormedNode],
        };
    });
    updateMindMap({ root: newRoot });
  }, [activeChapter, findNode, updateMindMap]);

  const updateNodeText = useCallback(async (nodeId: string, newText: string) => {
    if(!activeChapter || !activeChapterRef) return;
    
    if (nodeId === activeChapter.root.id && activeChapter.root.text === activeChapter.name) {
        setHistory(prev => {
            const newUndoStack = [...prev.undo, { root: activeChapter.root, links: activeChapter.links }];
            if (newUndoStack.length > 30) newUndoStack.shift();
            return { undo: newUndoStack, redo: [] };
        });
        
        await activeChapterRef.update({ name: newText, 'root.text': newText });
    } else {
        const newRoot = mapNodeRecursive(nodeId, activeChapter.root, (node) => ({ ...node, text: newText }));
        updateMindMap({ root: newRoot });
    }
  }, [activeChapter, updateMindMap, activeChapterRef]);
  
  const updateNodeColor = useCallback((nodeId: string, color: string) => {
    if(!activeChapter) return;
    const newRoot = mapNodeRecursive(nodeId, activeChapter.root, (node) => ({ ...node, color }));
    updateMindMap({ root: newRoot });
  }, [activeChapter, updateMindMap]);

  const recolorBranchRecursive = (node: MindMapNode, color: string): MindMapNode => {
    const newNode = { ...node, color };
    if (node.children) {
        newNode.children = node.children.map(child => recolorBranchRecursive(child, color));
    }
    return newNode;
  };

  const updateMultipleNodesColor = useCallback((nodeIds: Set<string>, color: string) => {
      if (!activeChapter) return;
      let newRoot = activeChapter.root;
      nodeIds.forEach(nodeId => {
          newRoot = mapNodeRecursive(nodeId, newRoot, (nodeToRecolor) => recolorBranchRecursive(nodeToRecolor, color));
      });
      updateMindMap({ root: newRoot });
  }, [activeChapter, updateMindMap]);

  const updateNodePosition = useCallback((nodeId: string, x: number, y: number) => {
    if(!activeChapter) return;
    const newRoot = mapNodeRecursive(nodeId, activeChapter.root, (node) => ({ ...node, x, y }));
    updateMindMap({ root: newRoot });
  }, [activeChapter, updateMindMap]);
  
  const updateMultipleNodePositions = useCallback((positions: Map<string, { x: number, y: number }>) => {
    if (!activeChapter) return;
    const newRoot = mapMultipleNodesRecursive(activeChapter.root, positions);
    updateMindMap({ root: newRoot });
  }, [activeChapter, updateMindMap]);

  const persistLayoutPositions = useCallback(async (positions: Map<string, { x: number; y: number }>) => {
    if (!activeChapterRef || !activeChapter || positions.size === 0) return;
    const newRoot = mapMultipleNodesRecursive(activeChapter.root, positions);
    await activeChapterRef.update({ root: newRoot });
  }, [activeChapterRef, activeChapter]);

  const updateMultipleNodesMastery = useCallback((updates: Map<string, number>) => {
      if (!activeChapter) return;
      let newRoot = activeChapter.root;
      updates.forEach((score, nodeId) => {
          newRoot = mapNodeRecursive(nodeId, newRoot, (node) => ({ ...node, masteryScore: score }));
      });
      updateMindMap({ root: newRoot });
  }, [activeChapter, updateMindMap]);

  const updateLearningProfile = useCallback(async (newProfile: LearningProfile) => {
    if (!activeSubjectId) return;
    await db.collection('documents').doc(activeSubjectId).update({ learningProfile: newProfile });
  }, [activeSubjectId]);

  const deleteNode = useCallback(async (nodeId: string) => {
    if (!activeChapter || nodeId === activeChapter.root.id || !activeChapterRef) return;

    const nodeToDelete = findNodeRecursive(nodeId, activeChapter.root);
    if (!nodeToDelete) return; 
    const idsToDelete = new Set(getAllNodeIdsRecursive(nodeToDelete));

    const newRoot = deleteNodeRecursive(nodeId, activeChapter.root);

    if (newRoot) {
        const newLinks = activeChapter.links.filter(link => !idsToDelete.has(link.source) && !idsToDelete.has(link.target));
        updateMindMap({ root: newRoot, links: newLinks });
    }
  }, [activeChapter, activeChapterRef, updateMindMap]);

  const deleteMultipleNodes = useCallback(async (nodeIds: Set<string>) => {
    if (!activeChapter || nodeIds.size === 0 || !activeChapterRef) return;
    if (nodeIds.has(activeChapter.root.id)) {
      nodeIds.delete(activeChapter.root.id);
    }
    if (nodeIds.size === 0) return;

    const allIdsToDelete = new Set<string>();
    for (const nodeId of nodeIds) {
        const nodeToDelete = findNodeRecursive(nodeId, activeChapter.root);
        if (nodeToDelete) {
            getAllNodeIdsRecursive(nodeToDelete).forEach(id => allIdsToDelete.add(id));
        }
    }

    const newLinks = activeChapter.links.filter(link => 
        !allIdsToDelete.has(link.source) && !allIdsToDelete.has(link.target)
    );

    const deleteNodesRecursive = (node: MindMapNode): MindMapNode | null => {
        if (allIdsToDelete.has(node.id)) {
            return null;
        }
        if (node.children) {
            let hasChanged = false;
            const newChildren = node.children.map(child => {
                const updatedChild = deleteNodesRecursive(child);
                if (updatedChild !== child) {
                    hasChanged = true;
                }
                return updatedChild;
            }).filter((child): child is MindMapNode => child !== null);
            
            if (hasChanged) {
                return { ...node, children: newChildren };
            }
        }
        return node;
    };
    const newRoot = deleteNodesRecursive(activeChapter.root);

    if (newRoot) {
        updateMindMap({ root: newRoot, links: newLinks });
    }
  }, [activeChapter, activeChapterRef, updateMindMap]);

  const toggleNodeCollapse = useCallback((nodeId: string) => {
    if(!activeChapter) return;
    const newRoot = mapNodeRecursive(nodeId, activeChapter.root, (node) => ({ ...node, isCollapsed: !node.isCollapsed }));
    updateMindMap({ root: newRoot });
  }, [activeChapter, updateMindMap]);

  const moveNode = useCallback((sourceId: string, targetId: string) => {
    if (!activeChapter || sourceId === activeChapter.root.id || sourceId === targetId) return;

    const root = activeChapter.root;
    const isDescendant = (node: MindMapNode, id: string): boolean => {
      if (node.children) {
        for (const child of node.children) {
          if (child.id === id || isDescendant(child, id)) return true;
        }
      }
      return false;
    };
    
    const sourceNodeCheck = findNode(sourceId);
    if(sourceNodeCheck && isDescendant(sourceNodeCheck, targetId)) {
        alert("Cannot move a node into one of its own children.");
        return;
    }
    
    let movingNode: MindMapNode | null = null;
    const removeRecursive = (node: MindMapNode, id: string): MindMapNode => {
      if (!node.children) return node;
      const child = node.children.find(c => c.id === id);
      if (child) {
        movingNode = { ...child };
        return { ...node, children: node.children.filter(c => c.id !== id) };
      }
      return { ...node, children: node.children.map(c => removeRecursive(c, id)) };
    };

    const treeAfterRemoval = removeRecursive(root, sourceId);
    if (!movingNode) return;

    const updateColorsRecursive = (node: MindMapNode, newParentColor: string): MindMapNode => {
        const coloredNode = { ...node, color: newParentColor };
        if(coloredNode.children){
            coloredNode.children = coloredNode.children.map(child => updateColorsRecursive(child, newParentColor));
        }
        return coloredNode;
    }

    const addRecursive = (node: MindMapNode, parentId: string, nodeToAdd: MindMapNode): MindMapNode => {
      if (node.id === parentId) {
        const coloredNodeToAdd = updateColorsRecursive(nodeToAdd, node.color);
        return { ...node, isCollapsed: false, children: [...(node.children || []), coloredNodeToAdd] };
      }
      if (node.children) {
        return { ...node, children: node.children.map(c => addRecursive(c, parentId, nodeToAdd)) };
      }
      return node;
    };

    const newRoot = addRecursive(treeAfterRemoval, targetId, movingNode);
    updateMindMap({ root: newRoot });
  }, [activeChapter, updateMindMap, findNode]);

  const setNodeImage = useCallback((nodeId: string, imageInfo: { downloadURL: string; storagePath: string; } | null) => {
    if (!activeChapter) return;
    const newRoot = mapNodeRecursive(nodeId, activeChapter.root, (node) => {
      if (!imageInfo) {
        const { image, ...rest } = node;
        return { ...rest };
      }
      return { ...node, image: imageInfo };
    });
    updateMindMap({ root: newRoot });
  }, [activeChapter, updateMindMap]);

  const insertNodeBetween = useCallback((parentId: string, childId: string): string | null => {
    if (!activeChapter) return null;
    let newId: string | null = null;
    
    const root = activeChapter.root;
    const parentNode = findNodeRecursive(parentId, root);
    if (!parentNode || !parentNode.children) return null;

    const childIndex = parentNode.children.findIndex(c => c.id === childId);
    if (childIndex === -1) return null;

    const childNode = parentNode.children[childIndex];
    if (childNode.x === undefined || childNode.y === undefined || parentNode.x === undefined || parentNode.y === undefined) return null;
    
    const newNode: MindMapNode = {
        id: uuidv4(), text: 'New Idea', color: childNode.color,
        x: (parentNode.x + childNode.x) / 2, y: (parentNode.y + childNode.y) / 2,
        children: [], isCollapsed: false, attachments: [], masteryScore: 0,
    };
    newId = newNode.id;

    const shiftX = childNode.x - newNode.x;
    const shiftY = childNode.y - newNode.y;

    const shiftSubtree = (node: MindMapNode): MindMapNode => {
        const shiftedNode = { ...node, x: (node.x || 0) + shiftX, y: (node.y || 0) + shiftY };
        if (shiftedNode.children) {
            shiftedNode.children = shiftedNode.children.map(shiftSubtree);
        }
        return shiftedNode;
    };

    newNode.children = [shiftSubtree(childNode)];
    const newParentChildren = [...parentNode.children];
    newParentChildren.splice(childIndex, 1, newNode);

    const newRoot = mapNodeRecursive(parentId, root, (node) => ({ ...node, children: newParentChildren }));
    updateMindMap({ root: newRoot });
    return newId;
  }, [activeChapter, updateMindMap]);

  const addLink = useCallback((sourceId: string, targetId: string) => {
    if (!activeChapter) return;
    if (sourceId === targetId) return;
    const exists = activeChapter.links.some(
        link => (link.source === sourceId && link.target === targetId) || (link.source === targetId && link.target === sourceId)
    );
    if (exists) return;
    const newLink: MindMapLink = { id: uuidv4(), source: sourceId, target: targetId, label: 'related to' };
    updateMindMap({ links: [...activeChapter.links, newLink] });
  }, [activeChapter, updateMindMap]);

  const updateLinkLabel = useCallback((linkId: string, label: string) => {
    if (!activeChapter) return;
    const newLinks = activeChapter.links.map(link => link.id === linkId ? { ...link, label } : link);
    updateMindMap({ links: newLinks });
  }, [activeChapter, updateMindMap]);

  const deleteLink = useCallback((linkId: string) => {
    if (!activeChapter) return;
    const newLinks = activeChapter.links.filter(link => link.id !== linkId);
    updateMindMap({ links: newLinks });
  }, [activeChapter, updateMindMap]);

  const modifyAttachments = (nodeId: string, modifyFn: (attachments: Attachment[]) => Attachment[]) => {
    if (!activeChapter) return;
    const newRoot = mapNodeRecursive(nodeId, activeChapter.root, (node) => ({
      ...node, attachments: modifyFn(node.attachments || []),
    }));
    updateMindMap({ root: newRoot });
  };
  
  const addAttachment = useCallback((nodeId: string, attachment: Attachment) => {
    modifyAttachments(nodeId, (atts) => [...atts, attachment]);
  }, [modifyAttachments]);

  const updateAttachment = useCallback((nodeId: string, attachmentId: string, updatedContent: Attachment['content']) => {
    modifyAttachments(nodeId, (atts) => atts.map(att => att.id === attachmentId ? { ...att, content: updatedContent } : att) as Attachment[]);
  }, [modifyAttachments]);

  const deleteAttachment = useCallback((nodeId: string, attachmentId: string) => {
    modifyAttachments(nodeId, (atts) => atts.filter(att => att.id !== attachmentId));
  }, [modifyAttachments]);

  const addSourceDocument = useCallback((fileInfo: SourceDocumentFile) => {
    if (!activeSubjectId) return;
    const currentActiveDoc = subjectsRef.current.find(d => d.id === activeSubjectId);
    if (!currentActiveDoc) return;
    const newSourceDocs = [...(currentActiveDoc.sourceDocuments || []), fileInfo];
    updateSourceDocuments(newSourceDocs);
  }, [activeSubjectId, updateSourceDocuments]);
  
  const updateSourceDocument = useCallback((fileId: string, updates: Partial<Omit<SourceDocumentFile, 'id'>>) => {
    if (!activeSubjectId) return;
    const currentActiveDoc = subjectsRef.current.find(d => d.id === activeSubjectId);
    if (!currentActiveDoc || !currentActiveDoc.sourceDocuments) return;
    const newSourceDocs = currentActiveDoc.sourceDocuments.map(file => 
      file.id === fileId ? { ...file, ...updates } : file
    );
    updateSourceDocuments(newSourceDocs);
  }, [activeSubjectId, updateSourceDocuments]);

  const deleteSourceDocument = useCallback((fileId: string) => {
    if (!activeSubjectId) return;
    const currentActiveDoc = subjectsRef.current.find(d => d.id === activeSubjectId);
    if (!currentActiveDoc || !currentActiveDoc.sourceDocuments) return;
    const newSourceDocs = currentActiveDoc.sourceDocuments.filter(file => file.id !== fileId);
    updateSourceDocuments(newSourceDocs);
  }, [activeSubjectId, updateSourceDocuments]);
  
  return { 
    subjects,
    activeSubject,
    chapters,
    activeChapter,
    loading,
    findNode,
    findParentNode,
    getAllDescendantIds,
    addSubject,
    deleteSubject,
    updateSubjectName,
    switchActiveSubject,
    addChapter,
    deleteChapter,
    renameChapter,
    switchActiveChapter,
    addChildNode, 
    addMultipleChildrenNode,
// FIX: Export the 'addNodeWithChildren' function so it can be used by the App component.
    addNodeWithChildren, 
    updateNodeText, 
    updateNodeColor, 
    updateMultipleNodesColor,
    deleteNode,
    deleteMultipleNodes,
    moveNode, 
    updateNodePosition,
    updateMultipleNodePositions,
    persistLayoutPositions,
    toggleNodeCollapse,
    updateMultipleNodesMastery,
    updateLearningProfile,
    setNodeImage,
    addLink,
    updateLinkLabel,
    deleteLink,
    addAttachment,
    updateAttachment,
    deleteAttachment,
    insertNodeBetween,
    addSourceDocument,
    updateSourceDocument,
    deleteSourceDocument,
    undo,
    redo,
    canUndo: history.undo.length > 0,
    canRedo: history.redo.length > 0,
  };
};

export default useMindMapData;
