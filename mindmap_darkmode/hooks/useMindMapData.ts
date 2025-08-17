import { useState, useCallback, useEffect, useRef } from 'react';
import { db } from '../firebase';
import type { WriteBatch } from '../firebase';
import { MindMapNode, MindMapDocument, MindMapLink, Attachment, SourceDocumentFile, MindMapNodeData, LearningProfile } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { NODE_COLORS, ROOT_NODE_COLOR } from '../constants';

type HistoryState = {
  root: MindMapNode;
  links: MindMapLink[];
};

const createNewMindMapObject = (name: string, userId: string, existingDocsCount: number): Omit<MindMapDocument, 'id'> => {
  const rootId = uuidv4();
  const rootColor = NODE_COLORS[existingDocsCount % NODE_COLORS.length] || ROOT_NODE_COLOR;
  return {
    name,
    ownerId: userId,
    root: {
      id: rootId,
      text: name,
      color: rootColor,
      children: [],
      attachments: [],
      masteryScore: 0,
      // Positions will be applied by the layout engine in the component
    },
    links: [],
    sourceDocuments: [],
    createdAt: new Date().toISOString(),
    learningProfile: {
        analogyPreference: 0,
        structurePreference: 0,
        visualPreference: 0,
        creationPreference: 0,
        interactionCount: 0,
    }
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

/**
 * Recursively traverses the mind map tree and applies position updates from a map.
 * This function performs a single pass and creates new node objects immutably
 * only for the nodes that have changed or are ancestors of changed nodes.
 * @param node The current node in the traversal.
 * @param positions A map of nodeId to new {x, y} coordinates.
 * @returns The updated node, or the original node if no changes occurred in its subtree.
 */
const mapMultipleNodesRecursive = (
  node: MindMapNode,
  positions: Map<string, { x: number; y: number }>
): MindMapNode => {
  let hasChanged = false;
  let newNode = node;

  // 1. Check if the current node itself needs an update
  const ownUpdate = positions.get(node.id);
  if (ownUpdate) {
    newNode = { ...node, x: ownUpdate.x, y: ownUpdate.y };
    hasChanged = true;
  }

  // 2. Recurse through children to see if any of them have changed
  if (node.children) {
    let childrenChanged = false;
    const newChildren = node.children.map(child => {
      const updatedChild = mapMultipleNodesRecursive(child, positions);
      if (updatedChild !== child) { // Referential equality check
        childrenChanged = true;
      }
      return updatedChild;
    });

    // If any child changed, we need to update the parent's children array
    if (childrenChanged) {
      // If we haven't created a new node object for the parent yet, do it now
      if (!hasChanged) {
        newNode = { ...node };
      }
      newNode.children = newChildren;
      hasChanged = true;
    }
  }

  // 3. Return the new node if it or any descendant has changed, otherwise return the original
  return hasChanged ? newNode : node;
};


const useMindMapData = (userId: string | null) => {
  const [documents, setDocuments] = useState<MindMapDocument[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<{ undo: HistoryState[], redo: HistoryState[] }>({ undo: [], redo: [] });

  const documentsRef = useRef(documents);
  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);
  
  // Clear history when switching documents
  useEffect(() => {
      setHistory({ undo: [], redo: [] });
  }, [activeDocumentId]);

  useEffect(() => {
    if (!userId) {
      setDocuments([]);
      setActiveDocumentId(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = db.collection('documents').where('ownerId', '==', userId);
    
    const unsubscribe = q.onSnapshot((querySnapshot) => {
      const userDocs = querySnapshot.docs
        .map(doc => ({ ...doc.data(), id: doc.id } as MindMapDocument))
        .sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateA - dateB;
        });

      setDocuments(userDocs);
      
      setActiveDocumentId(prevActiveId => {
          const currentActiveExists = userDocs.some(d => d.id === prevActiveId);
          if (currentActiveExists) {
              return prevActiveId;
          }
          if(userDocs.length > 0) {
              return userDocs[userDocs.length - 1].id;
          }
          return null;
      });
      
      setLoading(false);
    }, (error) => {
      console.error("Error fetching documents:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  const activeDocument = documents.find(d => d.id === activeDocumentId) || null;
  const activeDocRef = activeDocumentId ? db.collection('documents').doc(activeDocumentId) : null;

  const findNode = useCallback((id: string) => {
    if (!activeDocument) return null;
    return findNodeRecursive(id, activeDocument.root);
  }, [activeDocument]);
  
  const findParentNode = useCallback((nodeId: string) => {
    if (!activeDocument || nodeId === activeDocument.root.id) return null;
    return findParentRecursive(nodeId, activeDocument.root);
  }, [activeDocument]);

  const updateMindMap = useCallback(async (updates: Partial<HistoryState>) => {
    if (!activeDocRef || !activeDocument) return;

    // Take a snapshot of the current state BEFORE updating
    setHistory(prev => {
        const newUndoStack = [...prev.undo, { root: activeDocument.root, links: activeDocument.links }];
        if (newUndoStack.length > 30) newUndoStack.shift(); // Limit history size
        return { undo: newUndoStack, redo: [] }; // Clear redo on new action
    });

    await activeDocRef.update(updates);
  }, [activeDocRef, activeDocument]);
  
  const undo = useCallback(async () => {
    if (!activeDocRef || !activeDocument || history.undo.length === 0) return;

    const lastStateToRestore = history.undo[history.undo.length - 1];
    const currentStateToSave = { root: activeDocument.root, links: activeDocument.links };

    setHistory(prev => ({
        undo: prev.undo.slice(0, -1),
        redo: [...prev.redo, currentStateToSave]
    }));
    
    // Apply the previous state WITHOUT creating a new history entry
    await activeDocRef.update({ root: lastStateToRestore.root, links: lastStateToRestore.links });
  }, [activeDocRef, activeDocument, history]);

  const redo = useCallback(async () => {
      if (!activeDocRef || !activeDocument || history.redo.length === 0) return;

      const nextStateToRestore = history.redo[history.redo.length - 1];
      const currentStateToSave = { root: activeDocument.root, links: activeDocument.links };

      setHistory(prev => ({
          undo: [...prev.undo, currentStateToSave],
          redo: prev.redo.slice(0, -1)
      }));
      
      // Apply the next state WITHOUT creating a new history entry
      await activeDocRef.update({ root: nextStateToRestore.root, links: nextStateToRestore.links });
  }, [activeDocRef, activeDocument, history]);


  const addDocument = useCallback(async () => {
    if (!userId) return null;
    const newDocData = createNewMindMapObject('New Subject', userId, documents.length);
    try {
        const docRef = await db.collection('documents').add(newDocData);
        setActiveDocumentId(docRef.id);
        return docRef.id;
    } catch(e) {
        console.error("Error creating document", e);
        return null;
    }
  }, [userId, documents]);

  const deleteDocument = useCallback(async (docId: string) => {
    // TODO: This should also clean up all files in Firebase Storage associated with the document.
    // This requires a Cloud Function for proper implementation to avoid orphaned files.
    // For now, we just delete the Firestore entry.
    await db.collection("documents").doc(docId).delete();
  }, []);

  const updateDocumentName = useCallback(async (docId: string, newName: string) => {
    const docToUpdate = documents.find(d => d.id === docId);
    if (!docToUpdate) return;
    const docRef = db.collection('documents').doc(docId);

    const newRoot = docToUpdate.root.text === docToUpdate.name ? { ...docToUpdate.root, text: newName } : docToUpdate.root;
    await docRef.update({ name: newName, root: newRoot });
  }, [documents]);

  const switchActiveDocument = useCallback((docId: string) => {
    setActiveDocumentId(docId);
  }, []);
  
  const updateSourceDocuments = useCallback(async (newSourceDocs: SourceDocumentFile[]) => {
    if (!activeDocRef) return;
    await activeDocRef.update({ sourceDocuments: newSourceDocs });
  }, [activeDocRef]);

  const addChildNode = useCallback((parentId: string, text: string) => {
    if (!activeDocument) return;
    const parentNode = findNode(parentId);
    if (!parentNode) return;
    
    const newNode: MindMapNode = {
      id: uuidv4(),
      text,
      children: [],
      color: parentNode.id === activeDocument.root.id ? NODE_COLORS[(parentNode.children?.length || 0) % 3] : parentNode.color,
      attachments: [],
      masteryScore: 0,
    };

    const newRoot = mapNodeRecursive(parentId, activeDocument.root, (node) => {
        // Reset only the vertical position of all existing children to trigger re-layout
        const existingChildrenReset = (node.children || []).map(child => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { y, ...rest } = child;
            return rest as MindMapNode;
        });

        return {
          ...node,
          isCollapsed: false,
          children: [...existingChildrenReset, newNode],
        };
    });
    updateMindMap({ root: newRoot });
  }, [activeDocument, findNode, updateMindMap]);
  
  const addMultipleChildrenNode = useCallback((parentId: string, ideas: { text: string }[]) => {
    if(!activeDocument) return;
    const parentNode = findNode(parentId);
    if (!parentNode) return;

    const baseChildCount = parentNode.children?.length || 0;
    const newNodes: MindMapNode[] = ideas.map((idea, index) => ({
      id: uuidv4(),
      text: idea.text,
      children: [],
      color: parentNode.id === activeDocument.root.id ? NODE_COLORS[(baseChildCount + index) % 3] : parentNode.color,
      attachments: [],
      masteryScore: 0,
    }));

    const newRoot = mapNodeRecursive(parentId, activeDocument.root, (node) => {
        // Reset only the vertical position of all existing children to trigger re-layout
        const existingChildrenReset = (node.children || []).map(child => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { y, ...rest } = child;
            return rest as MindMapNode;
        });

        return {
          ...node,
          isCollapsed: false,
          children: [...existingChildrenReset, ...newNodes],
        };
    });
    updateMindMap({ root: newRoot });
  }, [activeDocument, findNode, updateMindMap]);

  const addNodeWithChildren = useCallback((parentId: string, newNodeData: MindMapNodeData) => {
      if (!activeDocument) return;
      const parentNode = findNode(parentId);
      if (!parentNode) return;

      const assignIdsAndColors = (node: MindMapNodeData, parentColor: string, parentLevelChildCount: number, level: number = 0): MindMapNode => {
          const newNode: MindMapNode = {
              ...node,
              id: uuidv4(),
              color: level === 0 
                  ? (parentNode.id === activeDocument.root.id ? NODE_COLORS[parentLevelChildCount % 3] : parentColor)
                  : parentColor,
              children: [],
              attachments: node.attachments || [],
              masteryScore: 0,
          };
          if (node.children) {
              newNode.children = node.children.map((child, index) => assignIdsAndColors(child, newNode.color, index, level + 1));
          }
          return newNode;
      };

      const baseChildCount = parentNode.children?.length || 0;
      const fullyFormedNode = assignIdsAndColors(newNodeData, parentNode.color, baseChildCount);

      const newRoot = mapNodeRecursive(parentId, activeDocument.root, (node) => {
          // Reset only the vertical position of all existing children to trigger re-layout
          const existingChildrenReset = (node.children || []).map(child => {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { y, ...rest } = child;
              return rest as MindMapNode;
          });

          return {
              ...node,
              isCollapsed: false,
              children: [...existingChildrenReset, fullyFormedNode],
          };
      });
      updateMindMap({ root: newRoot });
  }, [activeDocument, findNode, updateMindMap]);

  const updateNodeText = useCallback(async (nodeId: string, newText: string) => {
    if(!activeDocument || !activeDocRef) return;
    
    // If we're updating the root node's text, also update the document name
    // if they were previously the same.
    if (nodeId === activeDocument.root.id && activeDocument.root.text === activeDocument.name) {
        const newRoot = { ...activeDocument.root, text: newText };
        
        // Take history snapshot before the update
        setHistory(prev => {
            const newUndoStack = [...prev.undo, { root: activeDocument.root, links: activeDocument.links }];
            if (newUndoStack.length > 30) newUndoStack.shift();
            return { undo: newUndoStack, redo: [] };
        });
        
        // Update both name and root in one go to keep them synced
        await activeDocRef.update({ name: newText, root: newRoot });
    } else {
        const newRoot = mapNodeRecursive(nodeId, activeDocument.root, (node) => ({ ...node, text: newText }));
        // This function handles history creation internally
        updateMindMap({ root: newRoot });
    }
  }, [activeDocument, updateMindMap, activeDocRef]);
  
  const updateNodeColor = useCallback((nodeId: string, color: string) => {
    if(!activeDocument) return;
    const newRoot = mapNodeRecursive(nodeId, activeDocument.root, (node) => ({ ...node, color }));
    updateMindMap({ root: newRoot });
  }, [activeDocument, updateMindMap]);

  const updateMultipleNodesColor = useCallback((nodeIds: Set<string>, color: string) => {
    if (!activeDocument) return;
    let newRoot = activeDocument.root;
    nodeIds.forEach(nodeId => {
        newRoot = mapNodeRecursive(nodeId, newRoot, (node) => ({ ...node, color }));
    });
    updateMindMap({ root: newRoot });
  }, [activeDocument, updateMindMap]);

  const updateNodePosition = useCallback((nodeId: string, x: number, y: number) => {
    if(!activeDocument) return;
    const newRoot = mapNodeRecursive(nodeId, activeDocument.root, (node) => ({ ...node, x, y }));
    updateMindMap({ root: newRoot });
  }, [activeDocument, updateMindMap]);
  
  const updateMultipleNodePositions = useCallback((positions: Map<string, { x: number, y: number }>) => {
    if (!activeDocument) return;
    const newRoot = mapMultipleNodesRecursive(activeDocument.root, positions);
    updateMindMap({ root: newRoot });
  }, [activeDocument, updateMindMap]);

  const persistLayoutPositions = useCallback(async (positions: Map<string, { x: number; y: number }>) => {
    // This function is for automatic layout updates and SHOULD NOT create a history entry.
    if (!activeDocRef || !activeDocument || positions.size === 0) return;
    const newRoot = mapMultipleNodesRecursive(activeDocument.root, positions);
    // Directly update Firestore without going through updateMindMap (which creates history)
    await activeDocRef.update({ root: newRoot });
    // No need to optimistically update local state; the onSnapshot listener will handle it.
  }, [activeDocRef, activeDocument]);

  const updateMultipleNodesMastery = useCallback((updates: Map<string, number>) => {
      if (!activeDocument) return;
      let newRoot = activeDocument.root;
      updates.forEach((score, nodeId) => {
          newRoot = mapNodeRecursive(nodeId, newRoot, (node) => ({ ...node, masteryScore: score }));
      });
      updateMindMap({ root: newRoot });
  }, [activeDocument, updateMindMap]);

  const updateLearningProfile = useCallback(async (newProfile: LearningProfile) => {
    if (!activeDocRef) return;
    await activeDocRef.update({ learningProfile: newProfile });
  }, [activeDocRef]);

  const deleteNode = useCallback(async (nodeId: string) => {
    if (!activeDocument || nodeId === activeDocument.root.id || !activeDocRef) return;

    // Find the node to be deleted to get its subtree IDs for link cleanup
    const nodeToDelete = findNodeRecursive(nodeId, activeDocument.root);
    if (!nodeToDelete) return; // Node not found, shouldn't happen
    const idsToDelete = new Set(getAllNodeIdsRecursive(nodeToDelete));

    const newRoot = deleteNodeRecursive(nodeId, activeDocument.root);

    if (newRoot) {
        const newLinks = activeDocument.links.filter(link => !idsToDelete.has(link.source) && !idsToDelete.has(link.target));
        updateMindMap({ root: newRoot, links: newLinks });
    }
  }, [activeDocument, activeDocRef, updateMindMap]);

  const deleteMultipleNodes = useCallback(async (nodeIds: Set<string>) => {
    if (!activeDocument || nodeIds.size === 0 || !activeDocRef) return;

    // Prevent deleting the root node
    if (nodeIds.has(activeDocument.root.id)) {
      nodeIds.delete(activeDocument.root.id);
    }
    if (nodeIds.size === 0) return;

    // 1. Get all descendant IDs of the nodes to be deleted
    const allIdsToDelete = new Set<string>();
    for (const nodeId of nodeIds) {
        const nodeToDelete = findNodeRecursive(nodeId, activeDocument.root);
        if (nodeToDelete) {
            getAllNodeIdsRecursive(nodeToDelete).forEach(id => allIdsToDelete.add(id));
        }
    }

    // 2. Filter links
    const newLinks = activeDocument.links.filter(link => 
        !allIdsToDelete.has(link.source) && !allIdsToDelete.has(link.target)
    );

    // 3. Recursively remove nodes from the tree
    const deleteNodesRecursive = (node: MindMapNode): MindMapNode | null => {
        if (allIdsToDelete.has(node.id)) {
            return null;
        }

        if (node.children) {
            let hasChanged = false;
            const newChildren = node.children.map(child => {
                const updatedChild = deleteNodesRecursive(child);
                if (updatedChild !== child) { // Correctly check for reference inequality
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

    const newRoot = deleteNodesRecursive(activeDocument.root);

    if (newRoot) {
        updateMindMap({ root: newRoot, links: newLinks });
    }
  }, [activeDocument, activeDocRef, updateMindMap]);

  const toggleNodeCollapse = useCallback((nodeId: string) => {
    if(!activeDocument) return;
    const newRoot = mapNodeRecursive(nodeId, activeDocument.root, (node) => ({ ...node, isCollapsed: !node.isCollapsed }));
    updateMindMap({ root: newRoot });
  }, [activeDocument, updateMindMap]);

  const moveNode = useCallback((sourceId: string, targetId: string) => {
    if (!activeDocument || sourceId === activeDocument.root.id || sourceId === targetId) return;

    const root = activeDocument.root;

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
  }, [activeDocument, updateMindMap, findNode]);

  const setNodeImage = useCallback((nodeId: string, imageInfo: { downloadURL: string; storagePath: string; } | null) => {
    if (!activeDocument) return;
    const newRoot = mapNodeRecursive(nodeId, activeDocument.root, (node) => {
      if (!imageInfo) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { image, ...rest } = node;
        return { ...rest };
      }
      return { ...node, image: imageInfo };
    });
    updateMindMap({ root: newRoot });
  }, [activeDocument, updateMindMap]);

  const insertNodeBetween = useCallback((parentId: string, childId: string): string | null => {
    if (!activeDocument) return null;
    let newId: string | null = null;
    
    const root = activeDocument.root;
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
  }, [activeDocument, updateMindMap]);

  const addLink = useCallback((sourceId: string, targetId: string) => {
    if (!activeDocument) return;
    if (sourceId === targetId) return;
    const exists = activeDocument.links.some(
        link => (link.source === sourceId && link.target === targetId) || (link.source === targetId && link.target === sourceId)
    );
    if (exists) return;
    const newLink: MindMapLink = { id: uuidv4(), source: sourceId, target: targetId, label: 'related to' };
    updateMindMap({ links: [...activeDocument.links, newLink] });
  }, [activeDocument, updateMindMap]);

  const updateLinkLabel = useCallback((linkId: string, label: string) => {
    if (!activeDocument) return;
    const newLinks = activeDocument.links.map(link => link.id === linkId ? { ...link, label } : link);
    updateMindMap({ links: newLinks });
  }, [activeDocument, updateMindMap]);

  const deleteLink = useCallback((linkId: string) => {
    if (!activeDocument) return;
    const newLinks = activeDocument.links.filter(link => link.id !== linkId);
    updateMindMap({ links: newLinks });
  }, [activeDocument, updateMindMap]);

  const modifyAttachments = (nodeId: string, modifyFn: (attachments: Attachment[]) => Attachment[]) => {
    if (!activeDocument) return;
    const newRoot = mapNodeRecursive(nodeId, activeDocument.root, (node) => ({
      ...node, attachments: modifyFn(node.attachments || []),
    }));
    updateMindMap({ root: newRoot });
  };
  
  const addAttachment = useCallback((nodeId: string, attachmentData: Omit<Attachment, 'id'>) => {
    const newAttachment = { ...attachmentData, id: uuidv4() } as Attachment;
    modifyAttachments(nodeId, (atts) => [...atts, newAttachment]);
  }, [modifyAttachments]);

  const updateAttachment = useCallback((nodeId: string, attachmentId: string, updatedContent: Attachment['content']) => {
    modifyAttachments(nodeId, (atts) => atts.map(att => att.id === attachmentId ? { ...att, content: updatedContent } : att) as Attachment[]);
  }, [modifyAttachments]);

  const deleteAttachment = useCallback((nodeId: string, attachmentId: string) => {
    modifyAttachments(nodeId, (atts) => atts.filter(att => att.id !== attachmentId));
  }, [modifyAttachments]);

  const addSourceDocument = useCallback((fileInfo: SourceDocumentFile) => {
    if (!activeDocumentId) return;
    const currentActiveDoc = documentsRef.current.find(d => d.id === activeDocumentId);
    if (!currentActiveDoc) return;
    const newSourceDocs = [...(currentActiveDoc.sourceDocuments || []), fileInfo];
    updateSourceDocuments(newSourceDocs);
  }, [activeDocumentId, updateSourceDocuments]);
  
  const updateSourceDocument = useCallback((fileId: string, updates: Partial<Omit<SourceDocumentFile, 'id'>>) => {
    if (!activeDocumentId) return;
    const currentActiveDoc = documentsRef.current.find(d => d.id === activeDocumentId);
    if (!currentActiveDoc || !currentActiveDoc.sourceDocuments) return;
    const newSourceDocs = currentActiveDoc.sourceDocuments.map(file => 
      file.id === fileId ? { ...file, ...updates } : file
    );
    updateSourceDocuments(newSourceDocs);
  }, [activeDocumentId, updateSourceDocuments]);

  const deleteSourceDocument = useCallback((fileId: string) => {
    if (!activeDocumentId) return;
    const currentActiveDoc = documentsRef.current.find(d => d.id === activeDocumentId);
    if (!currentActiveDoc || !currentActiveDoc.sourceDocuments) return;
    const newSourceDocs = currentActiveDoc.sourceDocuments.filter(file => file.id !== fileId);
    updateSourceDocuments(newSourceDocs);
  }, [activeDocumentId, updateSourceDocuments]);
  
  return { 
    documents,
    activeDocument,
    loading,
    findNode,
    findParentNode,
    getAllDescendantIds,
    addDocument,
    deleteDocument,
    updateDocumentName,
    switchActiveDocument,
    addChildNode, 
    addMultipleChildrenNode,
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