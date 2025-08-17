import React, { useState, useCallback, useEffect, useMemo, lazy, Suspense, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from './contexts/AuthContext';
import useMindMapData from './hooks/useMindMapData';
import MindMap, { MindMapActions } from './components/MindMap';
import Toolbar from './components/Toolbar';
import { zoomIdentity, ZoomTransform } from 'd3-zoom';
import SubjectTabs from './components/SubjectTabs';
import Auth from './components/Auth';
import Spinner from './components/Spinner';
import SubjectMasteryDisplay from './components/SubjectMasteryDisplay';
import LandingPage from './components/LandingPage';
import MindMapShell from './components/MindMapShell';
import { storage } from './firebase';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { PALETTE_COLORS } from './constants';
import { 
    generateIdeasForNode, 
    rephraseNodeText, 
    extractKeyConcepts, 
    generateAnalogy, 
    askChatQuestion, 
    NodeContext,
    generateEnhancedMindMapFromFile,
    EnhancedNode,
    generateExamQuestions,
    gradeAndAnalyzeExam,
    generateStudySprint,
} from './services/geminiService';
import { MindMapNode, ChatMessage, Attachment, SourceDocumentFile, MindMapNodeData, ExamConfig, Question, ExamResult, StudySprint, LearningProfile, AiNudge } from './types';

// Lazy-load components that are not critical for the initial render
const AiAssistant = lazy(() => import('./components/AiAssistant'));
const ImageLightbox = lazy(() => import('./components/ImageLightbox'));
const ExamModal = lazy(() => import('./components/ExamModal'));
const StudySprintModal = lazy(() => import('./components/StudySprintModal'));
const ThemeToggle = lazy(() => import('./components/ThemeToggle'));


// --- MultiNodeToolbar Component ---
const MultiNodeToolbarButton = ({ icon, onClick, title, disabled = false }: { icon: string; onClick?: React.MouseEventHandler<HTMLButtonElement>; title: string; disabled?: boolean; }) => {
    const baseClasses = 'w-9 h-9 rounded-md flex items-center justify-center transition-colors text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50';
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={baseClasses}
            aria-label={title}
            title={title}
        >
            <i className={`fa-solid ${icon}`}></i>
        </button>
    )
}

const dropdownVariants: Variants = {
    hidden: { opacity: 0, y: 10, scale: 0.95, transition: { duration: 0.15 } },
    visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', damping: 15, stiffness: 200 } },
};

interface MultiNodeToolbarProps {
    count: number;
    onDelete: () => void;
    onSetColor: (color: string) => void;
}

const MultiNodeToolbar: React.FC<MultiNodeToolbarProps> = ({ count, onDelete, onSetColor }) => {
    const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);

    return (
        <motion.div
            className="absolute top-44 left-6 z-20 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md rounded-lg shadow-lg p-1 flex items-center gap-1 border border-slate-200/80 dark:border-slate-700/80"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        >
            <div className="px-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{count} nodes selected</div>
            <div className="w-px h-6 bg-slate-300 dark:bg-slate-600 mx-1"></div>

            <div className="relative" onMouseEnter={() => setIsColorPickerOpen(true)} onMouseLeave={() => setIsColorPickerOpen(false)}>
                <MultiNodeToolbarButton icon="fa-palette" title="Change color" />
                <AnimatePresence>
                    {isColorPickerOpen && (
                        <motion.div
                            initial="hidden"
                            animate="visible"
                            exit="hidden"
                            variants={dropdownVariants}
                            className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 p-2 z-10"
                        >
                            <div className="grid grid-cols-5 gap-2 p-1">
                                {PALETTE_COLORS.map(color => (
                                    <motion.button
                                        key={color}
                                        onClick={() => onSetColor(color)}
                                        className="w-7 h-7 rounded-full"
                                        style={{ backgroundColor: color }}
                                        aria-label={`Set color to ${color}`}
                                        title={`Set color to ${color}`}
                                        whileHover={{ scale: 1.2, transition: { duration: 0.1 } }}
                                        whileTap={{ scale: 0.9 }}
                                    />
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            <MultiNodeToolbarButton icon="fa-trash-can" onClick={onDelete} title="Delete selected nodes" />
        </motion.div>
    );
};

// --- Main App Component ---

type AppAction = {
  type: 'ADD_CHILD';
  parentId: string;
} | null;

type AiSidebarTab = 'ai' | 'attachments' | 'documents';

type LearningActionType = 
    | 'GENERATE_ANALOGY'
    | 'ASK_DIRECT_QUESTION'
    | 'GENERATE_IDEAS'
    | 'MANUAL_ADD_CHILD'
    | 'ADD_IMAGE'
    | 'GENERATE_FROM_FILE';

type ExamState = {
    view: 'closed' | 'config' | 'loading' | 'active' | 'results';
    config: ExamConfig | null;
    questions: Question[];
    results: ExamResult | null;
    questionToNodeIdMap: Map<string, string>;
};

type StudySprintState = {
    view: 'closed' | 'config' | 'loading' | 'active' | 'completed';
    sprint: StudySprint | null;
    isLoading: boolean;
};


const findNodePath = (root: MindMapNode, nodeId: string): string[] => {
    const path: MindMapNode[] = [];
    function find(node: MindMapNode): boolean {
        path.push(node);
        if (node.id === nodeId) return true;
        if (node.children) {
            for (const child of node.children) {
                if (find(child)) return true;
            }
        }
        path.pop();
        return false;
    }
    find(root);
    return path.slice(0, -1).map(n => n.text);
};

const getAllNodes = (root: MindMapNode): MindMapNode[] => {
    const nodes: MindMapNode[] = [];
    const traverse = (node: MindMapNode) => {
        nodes.push(node);
        if (node.children) node.children.forEach(traverse);
    };
    traverse(root);
    return nodes;
};

const calculateOverallMastery = (root: MindMapNode): number => {
    const scores: { score: number; weight: number }[] = [];
    const traverse = (node: MindMapNode, depth: number) => {
        // Default masteryScore to 0 if it's missing, null, or undefined.
        const score = node.masteryScore || 0;
        const weight = 1 / Math.pow(2, depth);
        scores.push({ score, weight });
        if (node.children) {
            node.children.forEach(child => traverse(child, depth + 1));
        }
    };
    traverse(root, 0);

    if (scores.length === 0) return 0;
    
    const totalWeightedScore = scores.reduce((acc, s) => acc + s.score * s.weight, 0);
    const totalWeight = scores.reduce((acc, s) => acc + s.weight, 0);

    return totalWeight === 0 ? 0 : totalWeightedScore / totalWeight;
};

const findParentNode = (root: MindMapNode, nodeId: string): MindMapNode | null => {
    if (!root.children) return null;
    for (const child of root.children) {
        if (child.id === nodeId) return root;
        const found = findParentNode(child, nodeId);
        if (found) return found;
    }
    return null;
};

const ModalLoadingFallback = () => (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center">
        <Spinner fullScreen={false} />
    </div>
);


const App: React.FC = () => {
  const { currentUser, loading: authLoading } = useAuth();
  const { 
    documents, 
    activeDocument,
    loading: dataLoading,
    switchActiveDocument,
    addDocument,
    deleteDocument,
    updateDocumentName,
    addAttachment,
    updateAttachment,
    deleteAttachment,
    setNodeImage,
    insertNodeBetween,
    findParentNode: findParentNodeFromHook,
    addSourceDocument,
    updateSourceDocument,
    deleteSourceDocument,
    addNodeWithChildren,
    updateLearningProfile,
    deleteMultipleNodes,
    persistLayoutPositions,
    updateMultipleNodesColor,
    ...dataActions 
  } = useMindMapData(currentUser?.uid ?? null);
  
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [nodeToEditOnRender, setNodeToEditOnRender] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<AppAction>(null);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [generatingIdeasForNodeId, setGeneratingIdeasForNodeId] = useState<string | null>(null);
  const [rephrasingNodeId, setRephrasingNodeId] = useState<string | null>(null);
  const [extractingConceptsNodeId, setExtractingConceptsNodeId] = useState<string | null>(null);
  const [generatingAnalogyNodeId, setGeneratingAnalogyNodeId] = useState<string | null>(null);
  const [generatingNodesFromFileId, setGeneratingNodesFromFileId] = useState<string | null>(null);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [aiSidebarTab, setAiSidebarTab] = useState<AiSidebarTab>('ai');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isAiReplying, setIsAiReplying] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<Map<string, File>>(new Map());
  const [examState, setExamState] = useState<ExamState>({
    view: 'closed',
    config: null,
    questions: [],
    results: null,
    questionToNodeIdMap: new Map(),
  });
  const [studySprintState, setStudySprintState] = useState<StudySprintState>({
      view: 'closed',
      sprint: null,
      isLoading: false,
  });
  const [glowingNodeIds, setGlowingNodeIds] = useState<string[]>([]);
  const [aiNudge, setAiNudge] = useState<AiNudge | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('mindmap-theme') as 'light' | 'dark') || 'light';
  });

  const mindMapRef = useRef<MindMapActions>(null);
  const [zoomTransform, setZoomTransform] = useState<ZoomTransform>(zoomIdentity);
  
  useEffect(() => {
    localStorage.setItem('mindmap-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  const handleZoomIn = () => mindMapRef.current?.zoomIn();
  const handleZoomOut = () => mindMapRef.current?.zoomOut();
  const handleZoomToFit = () => mindMapRef.current?.zoomToFit();

  const handleTransformChange = useCallback((newTransform: ZoomTransform) => {
      setZoomTransform(newTransform);
  }, []);

  const trackUserAction = useCallback((action: LearningActionType) => {
    if (!activeDocument || !updateLearningProfile) return;

    const currentProfile = activeDocument.learningProfile || {
        analogyPreference: 0,
        structurePreference: 0,
        visualPreference: 0,
        creationPreference: 0,
        interactionCount: 0,
    };

    const newProfile: LearningProfile = { ...currentProfile };
    const decay = 0.95; // Old preferences slowly decay toward neutral
    const nudge = 0.2; // How much each action affects the score

    switch (action) {
        case 'GENERATE_ANALOGY':
            newProfile.analogyPreference = (newProfile.analogyPreference * decay) + nudge;
            break;
        case 'ASK_DIRECT_QUESTION':
            newProfile.analogyPreference = (newProfile.analogyPreference * decay) - (nudge / 2); // Less strong signal
            break;
        case 'GENERATE_IDEAS':
            newProfile.structurePreference = (newProfile.structurePreference * decay) + (nudge / 2);
            newProfile.creationPreference = (newProfile.creationPreference * decay) - (nudge / 2);
            break;
        case 'MANUAL_ADD_CHILD':
            newProfile.structurePreference = (newProfile.structurePreference * decay) - (nudge / 2);
            newProfile.creationPreference = (newProfile.creationPreference * decay) + nudge;
            break;
        case 'ADD_IMAGE':
            newProfile.visualPreference = (newProfile.visualPreference * decay) + nudge;
            break;
        case 'GENERATE_FROM_FILE':
            newProfile.creationPreference = (newProfile.creationPreference * decay) - nudge;
            break;
    }
    
    // Clamp values between -1 and 1
    newProfile.analogyPreference = Math.max(-1, Math.min(1, newProfile.analogyPreference));
    newProfile.structurePreference = Math.max(-1, Math.min(1, newProfile.structurePreference));
    newProfile.visualPreference = Math.max(-1, Math.min(1, newProfile.visualPreference));
    newProfile.creationPreference = Math.max(-1, Math.min(1, newProfile.creationPreference));

    newProfile.interactionCount += 1;
    
    // Persist to DB. We write every time for real-time adaptation.
    updateLearningProfile(newProfile);
  }, [activeDocument, updateLearningProfile]);

  // This effect resets state ONLY when switching to a new subject/document.
  useEffect(() => {
    setSelectedNodeIds(activeDocument ? new Set([activeDocument.root.id]) : new Set());
    setFocusedNodeId(null);
    setIsAiAssistantOpen(false);
    setChatHistory([]);
    setAiSidebarTab('ai');
    setGlowingNodeIds([]); // Clear glowing nodes when switching subjects
    setAiNudge(null); // Clear any nudge when switching subjects
  }, [activeDocument?.id]); // Depend on the ID, not the object reference.

  const lastSelectedNodeId = useMemo(() => {
    if (selectedNodeIds.size === 0) return null;
    return Array.from(selectedNodeIds).pop()!;
  }, [selectedNodeIds]);

  useEffect(() => {
    setChatHistory([]);
    if(aiSidebarTab !== 'documents') {
        setAiSidebarTab('ai');
    }
    // Don't clear nudge when just selecting a new node.
  }, [lastSelectedNodeId]);

  const selectedNodesData = useMemo(() => {
    if (selectedNodeIds.size === 0 || !activeDocument) return [];
    return Array.from(selectedNodeIds).map(id => dataActions.findNode(id)).filter(Boolean) as MindMapNode[];
  }, [selectedNodeIds, activeDocument, dataActions]);

  const overallMastery = useMemo(() => {
    if (!activeDocument) return 0;
    return calculateOverallMastery(activeDocument.root);
  }, [activeDocument]);

  useEffect(() => {
    if (lastAction?.type === 'ADD_CHILD' && activeDocument) {
      const parentNode = dataActions.findNode(lastAction.parentId);
      if (parentNode?.children?.length) {
        const newNode = parentNode.children[parentNode.children.length - 1];
        setSelectedNodeIds(new Set([newNode.id]));
        setNodeToEditOnRender(newNode.id);
      }
      setLastAction(null);
    }
  }, [activeDocument, lastAction, dataActions]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // General app-level shortcuts that should work anywhere
      if (event.key === 'Escape') {
        setViewingImage(null);
        setFocusedNodeId(null);
        if (examState.view === 'active' && !window.confirm("Are you sure you want to exit the exam? Your progress will be lost.")) {
          // Do nothing
        } else if (examState.view !== 'closed') {
           setExamState({ view: 'closed', config: null, questions: [], results: null, questionToNodeIdMap: new Map() });
        }
         if (studySprintState.view !== 'closed') {
            setStudySprintState({ view: 'closed', sprint: null, isLoading: false });
        }
      }

      // Don't trigger shortcuts if user is typing in an input/textarea
      const isEditingText = (event.target as HTMLElement)?.tagName === 'TEXTAREA' || (event.target as HTMLElement)?.tagName === 'INPUT';
      if (isEditingText) return;

      // Undo/Redo logic
      if (event.ctrlKey || event.metaKey) { // Handle Ctrl or Cmd key
          if (event.key.toLowerCase() === 'z') {
              event.preventDefault();
              dataActions.undo();
          } else if (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z')) {
              event.preventDefault();
              dataActions.redo();
          }
      }

      // Edit on Enter
      if (event.key === 'Enter' && selectedNodeIds.size === 1) {
          event.preventDefault();
          setNodeToEditOnRender(lastSelectedNodeId);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [examState.view, studySprintState.view, dataActions, lastSelectedNodeId, selectedNodeIds]);

  const handleNodeDrag = () => {
    if (glowingNodeIds.length > 0) {
      setGlowingNodeIds([]);
    }
    if(aiNudge){
        setAiNudge(null);
    }
  };

  const handleAddChildAndEdit = useCallback((parentId: string) => {
    trackUserAction('MANUAL_ADD_CHILD');
    dataActions.addChildNode(parentId, 'New Idea');
    setLastAction({ type: 'ADD_CHILD', parentId });
  },[dataActions, trackUserAction]);

  const handleDeleteNode = useCallback((nodeIdToDelete: string) => {
    if (activeDocument) {
        const parent = findParentNode(activeDocument.root, nodeIdToDelete);
        dataActions.deleteNode(nodeIdToDelete);
        setSelectedNodeIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(nodeIdToDelete);
            if (newSet.size === 0 && parent) {
                newSet.add(parent.id);
            } else if (newSet.size === 0) {
                newSet.add(activeDocument.root.id);
            }
            return newSet;
        });
    }
  }, [dataActions, activeDocument]);

  const handleDeleteSelectedNodes = useCallback((nodeIdsToDelete: Set<string>) => {
    if (nodeIdsToDelete.size > 0) {
        deleteMultipleNodes(nodeIdsToDelete);
        setSelectedNodeIds(new Set()); // Clear selection after deletion
    }
  }, [deleteMultipleNodes]);

  const handleSetMultipleNodesColor = useCallback((nodeIds: Set<string>, color: string) => {
    updateMultipleNodesColor(nodeIds, color);
  }, [updateMultipleNodesColor]);

  const handleGenerateIdeas = useCallback(async (nodeId: string) => {
    const node = dataActions.findNode(nodeId);
    if (!node || !activeDocument) return;
    trackUserAction('GENERATE_IDEAS');
    setGeneratingIdeasForNodeId(nodeId);
    try {
        const ideas = await generateIdeasForNode(node.text, activeDocument.learningProfile);
        if (ideas && ideas.length > 0) dataActions.addMultipleChildrenNode(nodeId, ideas);
        else alert("The AI couldn't generate new ideas for this topic.");
    } catch (error) {
        console.error("Failed to generate AI ideas:", error);
        alert(`Error: ${(error as Error).message}`);
    } finally {
        setGeneratingIdeasForNodeId(null);
    }
  }, [dataActions, activeDocument, trackUserAction]);

  const handleRephraseNode = useCallback(async (nodeId: string) => {
      const node = dataActions.findNode(nodeId);
      if (!node || !activeDocument || node.id === activeDocument.root.id) return;
      setRephrasingNodeId(nodeId);
      try {
          const newText = await rephraseNodeText(node.text);
          dataActions.updateNodeText(nodeId, newText);
      } catch (error) {
          console.error("Failed to rephrase node:", error);
          alert(`Error: ${(error as Error).message}`);
      } finally {
          setRephrasingNodeId(null);
      }
  }, [dataActions, activeDocument]);
  
  const handleExtractConcepts = useCallback(async (nodeId: string) => {
      const node = dataActions.findNode(nodeId);
      if (!node || !node.children || node.children.length === 0) return;
      setExtractingConceptsNodeId(nodeId);
      try {
          const childrenTexts = node.children.map(c => c.text);
          const concepts = await extractKeyConcepts(node.text, childrenTexts);
           if (concepts && concepts.length > 0) dataActions.addMultipleChildrenNode(nodeId, concepts);
           else alert("The AI couldn't extract key concepts.");
      } catch (error) {
          console.error("Failed to extract key concepts:", error);
          alert(`Error: ${(error as Error).message}`);
      } finally {
          setExtractingConceptsNodeId(null);
      }
  }, [dataActions]);

   const handleGenerateAnalogy = useCallback(async (nodeId: string) => {
    const node = dataActions.findNode(nodeId);
    if (!node || !activeDocument || node.id === activeDocument.root.id) return;
    trackUserAction('GENERATE_ANALOGY');
    setGeneratingAnalogyNodeId(nodeId);
    try {
        const analogy = await generateAnalogy(node.text, activeDocument.learningProfile);
        dataActions.addChildNode(nodeId, analogy);
    } catch (error) {
        console.error("Failed to generate analogy:", error);
        alert(`Error: ${(error as Error).message}`);
    } finally {
        setGeneratingAnalogyNodeId(null);
    }
  }, [dataActions, activeDocument, trackUserAction]);

  const handleAiChatSubmit = useCallback(async (question: string) => {
      if (selectedNodesData.length === 0 || !activeDocument) return;
      trackUserAction('ASK_DIRECT_QUESTION');
      setChatHistory(prev => [...prev, { role: 'user', text: question }]);
      setIsAiReplying(true);
      try {
          const context: NodeContext = {
            path: [],
            currentNodeText: '',
            childrenTexts: [],
          };
          
          if (selectedNodesData.length === 1) {
              const node = selectedNodesData[0];
              context.path = findNodePath(activeDocument.root, node.id);
              context.currentNodeText = node.text;
              context.childrenTexts = node.children?.map(c => c.text) ?? [];
              if (node.image?.downloadURL) {
                  const response = await fetch(node.image.downloadURL);
                  const blob = await response.blob();
                  const dataUrl = await new Promise<string>(resolve => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(reader.result as string);
                      reader.readAsDataURL(blob);
                  });
                  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
                  if (match) context.image = { mimeType: match[1], data: match[2] };
              }
          } else {
              // Create a serialized string of the selected nodes and their direct relationships
              const serializeSelection = (nodes: MindMapNode[]): string => {
                  let contextString = "The user has selected multiple related nodes:\n";
                  const nodeMap = new Map(nodes.map(n => [n.id, n]));
                  const parentChildMap = new Map<string, string[]>();
                  
                  nodes.forEach(node => {
                      const parent = findParentNode(activeDocument.root, node.id);
                      if (parent && nodeMap.has(parent.id)) {
                          if (!parentChildMap.has(parent.id)) parentChildMap.set(parent.id, []);
                          parentChildMap.get(parent.id)!.push(node.text);
                      }
                  });

                  nodes.forEach(node => {
                      if (!nodes.some(n => n.children?.some(c => c.id === node.id))) {
                          contextString += `- "${node.text}"`;
                          if (parentChildMap.has(node.id)) {
                              contextString += ` which has the following selected children: [${parentChildMap.get(node.id)!.join(', ')}]`;
                          }
                          contextString += "\n";
                      }
                  });
                  return contextString;
              };
              context.currentNodeText = serializeSelection(selectedNodesData);
          }

          const answer = await askChatQuestion(context, question, activeDocument.learningProfile);
          setChatHistory(prev => [...prev, { role: 'model', text: answer }]);
      } catch (error) {
          console.error("Failed to get chat response:", error);
          setChatHistory(prev => [...prev, { role: 'model', text: `Sorry, I ran into an error. ${(error as Error).message}` }]);
      } finally {
          setIsAiReplying(false);
      }
  }, [selectedNodesData, activeDocument, trackUserAction]);

  const handleSetNodeColor = useCallback((nodeId: string, color: string) => {
      if (!activeDocument) return;
      dataActions.updateNodeColor(nodeId, color);
  }, [dataActions, activeDocument]);

  const handleShowAttachments = useCallback((nodeId: string) => {
    setSelectedNodeIds(new Set([nodeId]));
    setAiSidebarTab('attachments');
    setIsAiAssistantOpen(true);
  }, []);

  const uploadToStorage = async (file: File, path: string): Promise<{ downloadURL: string, storagePath: string }> => {
    const storageRef = storage.ref(path);
    const snapshot = await storageRef.put(file);
    const downloadURL = await snapshot.ref.getDownloadURL();
    return { downloadURL, storagePath: path };
  };

  const handleAddAttachment = useCallback(async (nodeId: string, attachmentData: Omit<Attachment, 'id'>, file?: File) => {
    if (!currentUser) return;
    if (file && attachmentData.type === 'image') {
        trackUserAction('ADD_IMAGE');
        const storagePath = `users/${currentUser.uid}/attachments/${uuidv4()}-${file.name}`;
        const { downloadURL } = await uploadToStorage(file, storagePath);
        const finalAttachment: Omit<Attachment, 'id'> = {
            type: 'image',
            content: { downloadURL, storagePath, name: file.name }
        };
        addAttachment(nodeId, finalAttachment);
    } else {
        addAttachment(nodeId, attachmentData);
    }
  }, [addAttachment, currentUser, trackUserAction]);

  const handleUpdateAttachment = useCallback((nodeId: string, attachmentId: string, updatedContent: Attachment['content']) => {
    updateAttachment(nodeId, attachmentId, updatedContent);
  }, [updateAttachment]);

  const handleDeleteAttachment = useCallback(async (nodeId: string, attachmentId: string) => {
    const node = dataActions.findNode(nodeId);
    const attachment = node?.attachments?.find(a => a.id === attachmentId);
    if (attachment?.type === 'image' && attachment.content.storagePath) {
        const storageRef = storage.ref(attachment.content.storagePath);
        try { await storageRef.delete(); } catch (e) { console.error("Error deleting attachment from storage", e); }
    }
    deleteAttachment(nodeId, attachmentId);
  }, [deleteAttachment, dataActions]);

  const handleSetNodeImage = useCallback(async (nodeId: string, file: File) => {
    if (!currentUser) return;
    trackUserAction('ADD_IMAGE');
    const oldNode = dataActions.findNode(nodeId);
    if (oldNode?.image?.storagePath) {
        try { await storage.ref(oldNode.image.storagePath).delete(); } catch(e) { console.error("Error deleting old image", e); }
    }
    const storagePath = `users/${currentUser.uid}/node-images/${uuidv4()}-${file.name}`;
    const { downloadURL } = await uploadToStorage(file, storagePath);
    setNodeImage(nodeId, { downloadURL, storagePath });
  }, [currentUser, setNodeImage, dataActions, trackUserAction]);

  const handleRemoveNodeImage = useCallback(async (nodeId: string) => {
    const node = dataActions.findNode(nodeId);
    if(node?.image?.storagePath) {
        try { await storage.ref(node.image.storagePath).delete(); } catch(e) { console.error("Error deleting image", e); }
    }
    setNodeImage(nodeId, null);
  }, [setNodeImage, dataActions]);

  const handleViewImage = useCallback((downloadURL: string) => setViewingImage(downloadURL), []);
  const handleCloseImageView = useCallback(() => setViewingImage(null), []);

  const handleInsertParentNode = useCallback((childId: string) => {
    const parent = findParentNodeFromHook(childId);
    if (parent) {
      const newId = insertNodeBetween(parent.id, childId);
      if (newId) {
        setSelectedNodeIds(new Set([newId]));
        setNodeToEditOnRender(newId);
      }
    }
  }, [findParentNodeFromHook, insertNodeBetween]);

  const handleUploadFile = useCallback(async (file: File) => {
    if (!activeDocument || !currentUser) return;
    const tempId = uuidv4();
    const storagePath = `users/${currentUser.uid}/source-docs/${activeDocument.id}/${uuidv4()}-${file.name}`;
    
    setUploadingFiles(prev => new Map(prev).set(tempId, file));
    addSourceDocument({ id: tempId, name: file.name, mimeType: file.type, status: 'uploading', storagePath, downloadURL: '' });
    
    try {
      const { downloadURL } = await uploadToStorage(file, storagePath);
      updateSourceDocument(tempId, { status: 'ready', storagePath, downloadURL });
      setUploadingFiles(prev => {
        const newMap = new Map(prev);
        newMap.delete(tempId);
        return newMap;
      });
    } catch (e) {
      console.error("File upload failed:", e);
      updateSourceDocument(tempId, { status: 'error', errorMessage: (e as Error).message });
    }
  }, [activeDocument, currentUser, addSourceDocument, updateSourceDocument]);

  const handleRetryUpload = useCallback(async (fileInfo: SourceDocumentFile) => {
    const fileToRetry = uploadingFiles.get(fileInfo.id);
    if (!fileToRetry) {
      alert("Could not find the original file to retry the upload. Please try uploading it again.");
      console.error("Original file not found for retry:", fileInfo.id);
      return;
    }

    updateSourceDocument(fileInfo.id, { status: 'uploading', errorMessage: '' });

    try {
      const { downloadURL } = await uploadToStorage(fileToRetry, fileInfo.storagePath);
      updateSourceDocument(fileInfo.id, { status: 'ready', storagePath: fileInfo.storagePath, downloadURL });
      setUploadingFiles(prev => {
        const newMap = new Map(prev);
        newMap.delete(fileInfo.id);
        return newMap;
      });
    } catch (e) {
      console.error("File retry upload failed:", e);
      updateSourceDocument(fileInfo.id, { status: 'error', errorMessage: (e as Error).message });
    }
  }, [uploadingFiles, updateSourceDocument]);
  
  const handleGenerateNodesFromDoc = useCallback(async (file: SourceDocumentFile) => {
    if (selectedNodeIds.size !== 1 || !file.downloadURL) {
      alert("Please select a single node to attach the generated content to.");
      return;
    }
    trackUserAction('GENERATE_FROM_FILE');
    const node = dataActions.findNode(lastSelectedNodeId!);
    if (!node) return;
  
    setGeneratingNodesFromFileId(file.id);
    try {
      updateSourceDocument(file.id, { status: 'processing' });
      
      // Step 1: Process document to extract text (now dynamically imported)
      const { processDocument } = await import('./services/documentProcessor');
      const extractedText = await processDocument(file);

      if (extractedText.startsWith('Cannot process file type')) {
          throw new Error(extractedText);
      }
      
      // Step 2: Fetch the original file to get its raw data for the AI model's visual context
      const response = await fetch(file.downloadURL);
      if (!response.ok) {
        throw new Error(`Failed to download file for analysis: ${response.statusText}`);
      }
      const blob = await response.blob();
  
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          if (base64) resolve(base64);
          else reject(new Error("Failed to read file as Base64."));
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
  
      // Step 3: Call Gemini with both extracted text and the raw file data
      const newNodes = await generateEnhancedMindMapFromFile(extractedText, base64Data, file.mimeType, node.text);
  
      const convertEnhancedNode = (enhancedNode: EnhancedNode): MindMapNodeData => {
          const mindMapNodeData: MindMapNodeData = {
              text: enhancedNode.text,
          };
          
          const children: MindMapNodeData[] = [];
          if (enhancedNode.summary) {
              children.push({ text: enhancedNode.summary });
          }
          if (enhancedNode.children) {
              children.push(...enhancedNode.children.map(convertEnhancedNode));
          }
  
          if (children.length > 0) {
              mindMapNodeData.children = children;
          }
      
          return mindMapNodeData;
      };

      if (newNodes && newNodes.length > 0) {
        newNodes.forEach(newNode => {
            addNodeWithChildren(lastSelectedNodeId!, convertEnhancedNode(newNode));
        });
      } else {
        alert("The AI couldn't generate a summary from this document.");
      }
  
      updateSourceDocument(file.id, { status: 'ready' });
    } catch (e) {
      const error = e as Error;
      console.error("Node generation from file failed:", error);
      alert(`Error generating from file: ${error.message}`);
      updateSourceDocument(file.id, { status: 'error', errorMessage: error.message });
    } finally {
      setGeneratingNodesFromFileId(null);
    }
  }, [selectedNodeIds, lastSelectedNodeId, dataActions, updateSourceDocument, addNodeWithChildren, trackUserAction]);
  
  const handleDeleteFile = useCallback(async (file: SourceDocumentFile) => {
    if(window.confirm("Are you sure you want to remove this document? This cannot be undone.")) {
        try {
            if (file.storagePath) {
                 await storage.ref(file.storagePath).delete();
            }
        } catch (e: any) {
            if (e.code !== 'storage/object-not-found') {
                console.error("Error deleting from storage, but proceeding to delete database entry:", e);
            }
        }
        
        try {
            deleteSourceDocument(file.id);
            setUploadingFiles(prev => {
                const newMap = new Map(prev);
                newMap.delete(file.id);
                return newMap;
            });
        } catch(e) {
            console.error("Failed to delete source file record", e);
            alert("Error deleting file. Please try again.");
        }
    }
  }, [deleteSourceDocument]);

  const serializeMindMapForAI = (node: MindMapNode, indent = ''): string => {
      let result = `${indent}- ${node.text} (Mastery: ${Math.round((node.masteryScore || 0) * 100)}%)\n`;
      if (node.children && !node.isCollapsed) {
          for (const child of node.children) {
              result += serializeMindMapForAI(child, indent + '  ');
          }
      }
      return result;
  };
  
  const getDocumentContext = async (): Promise<string> => {
    if (!activeDocument?.sourceDocuments) return '';
    
    // NOTE: This is a placeholder for server-side text extraction.
    // Client-side PDF/DOCX parsing is too heavy. For now, we'll just use file names as context.
    const fileNames = activeDocument.sourceDocuments
        .filter(doc => doc.status === 'ready')
        .map(doc => doc.name)
        .join(', ');

    return fileNames ? `The user has uploaded the following documents: ${fileNames}.` : '';
  };


  const mapTopicToNodeId = useCallback((topicText: string, rootNode: MindMapNode): string | null => {
      let bestMatchId: string | null = null;
      let highestSimilarity = 0.5; // Require at least 50% similarity

      function simplifiedJaccard(a: string, b: string): number {
          const setA = new Set(a.toLowerCase().split(/\s+/));
          const setB = new Set(b.toLowerCase().split(/\s+/));
          const intersection = new Set([...setA].filter(x => setB.has(x)));
          const union = new Set([...setA, ...setB]);
          return union.size === 0 ? 0 : intersection.size / union.size;
      }
      
      function traverse(node: MindMapNode) {
          const similarity = simplifiedJaccard(topicText, node.text);
          if (similarity > highestSimilarity) {
              highestSimilarity = similarity;
              bestMatchId = node.id;
          }
          if(node.children) node.children.forEach(traverse);
      }
      traverse(rootNode);
      return bestMatchId;
  }, []);

  const handleStartExam = useCallback(async (config: ExamConfig) => {
    if (!activeDocument) return;
    setGlowingNodeIds([]);
    setAiNudge(null);
    setExamState(prev => ({ ...prev, view: 'loading', config }));

    try {
        const mindMapContext = serializeMindMapForAI(activeDocument.root);
        const documentsContext = await getDocumentContext();

        const rawQuestions = await generateExamQuestions(config, mindMapContext, documentsContext);
        
        const newQuestionToNodeIdMap = new Map<string, string>();
        const questionsWithIds: Question[] = rawQuestions.map(q => {
            const id = uuidv4();
            if (q.relatedNodeTopicText) {
                const nodeId = mapTopicToNodeId(q.relatedNodeTopicText, activeDocument.root);
                if(nodeId) newQuestionToNodeIdMap.set(id, nodeId);
            }
            return { ...q, id };
        });

        setExamState(prev => ({
            ...prev,
            view: 'active',
            questions: questionsWithIds,
            questionToNodeIdMap: newQuestionToNodeIdMap,
        }));

    } catch (error) {
        console.error("Failed to start exam:", error);
        alert(`Error: ${(error as Error).message}`);
        setExamState(prev => ({ ...prev, view: 'config' }));
    }
  }, [activeDocument, mapTopicToNodeId]);

  const handleSubmitExam = useCallback(async (answers: Map<string, string>, revealedHints: Set<string>) => {
    if (!activeDocument) return;
    setExamState(prev => ({ ...prev, view: 'loading' }));
    try {
        const results = await gradeAndAnalyzeExam(examState.questions, answers);
        
        const incorrectNodeIds = new Set<string>();
        const nodePerformance = new Map<string, { correct: number; total: number }>();

        results.analysis.forEach((ans, index) => {
            const question = examState.questions[index];
            const nodeId = examState.questionToNodeIdMap.get(question.id);
            if (nodeId) {
                if (!nodePerformance.has(nodeId)) {
                    nodePerformance.set(nodeId, { correct: 0, total: 0 });
                }
                const perf = nodePerformance.get(nodeId)!;
                perf.total++;
                if (ans.isCorrect) {
                    perf.correct++;
                } else {
                    incorrectNodeIds.add(nodeId);
                }
            }
        });
        setGlowingNodeIds(Array.from(incorrectNodeIds));

        const masteryUpdates = new Map<string, number>();
        for (const [nodeId, perf] of nodePerformance.entries()) {
            const node = dataActions.findNode(nodeId);
            if (node) {
                const currentScore = node.masteryScore || 0;
                const examAccuracy = perf.correct / perf.total;
                // Weighted average: 50% old score, 50% new score.
                const newScore = (currentScore * 0.5) + (examAccuracy * 0.5);
                masteryUpdates.set(nodeId, Math.max(0, Math.min(1, newScore)));
            }
        }

        if (masteryUpdates.size > 0) {
            dataActions.updateMultipleNodesMastery(masteryUpdates);
        }

        setExamState(prev => ({ ...prev, view: 'results', results }));

        // Eureka Bot Trigger Logic
        let nudge: AiNudge | null = null;
        
        const stagnantNodes: { id: string, score: number, text: string }[] = [];
        for (const [nodeId, newScore] of masteryUpdates.entries()) {
            const node = dataActions.findNode(nodeId);
            if (node) {
                const oldScore = node.masteryScore || 0;
                if (newScore <= oldScore && newScore < 0.8) { // Only nudge if not mastered
                    stagnantNodes.push({ id: nodeId, score: newScore, text: node.text });
                }
            }
        }

        if (stagnantNodes.length > 0) {
            stagnantNodes.sort((a, b) => a.score - b.score);
            const targetNode = stagnantNodes[0];
            nudge = {
                nodeId: targetNode.id,
                message: `I noticed "${targetNode.text}" is still a bit tricky. How about we try a different approach to help it click?`,
                actionLabel: 'Explain with Analogy',
                action: () => handleGenerateAnalogy(targetNode.id),
            };
        } else {
            const hintUsageByNode = new Map<string, { hints: number, total: number }>();
            for (const question of examState.questions) {
                const nodeId = examState.questionToNodeIdMap.get(question.id);
                if (nodeId) {
                    if (!hintUsageByNode.has(nodeId)) hintUsageByNode.set(nodeId, { hints: 0, total: 0 });
                    const stats = hintUsageByNode.get(nodeId)!;
                    stats.total++;
                    if (revealedHints.has(question.id)) stats.hints++;
                }
            }
            
            for (const [nodeId, stats] of hintUsageByNode.entries()) {
                if (stats.total > 0 && (stats.hints / stats.total) >= 0.75) {
                    const node = dataActions.findNode(nodeId);
                    if (node && (node.masteryScore || 0) < 0.9) { // Don't nudge if already mastered
                         nudge = {
                            nodeId: nodeId,
                            message: `It seems the hints for "${node.text}" were useful. Would you like a detailed summary to help lock it in?`,
                            actionLabel: 'Create Summary',
                            action: () => handleGenerateAnalogy(nodeId), // Re-using analogy for summary/definition
                        };
                        break;
                    }
                }
            }
        }

        if (nudge) {
            setAiNudge(nudge);
            setSelectedNodeIds(new Set([nudge.nodeId]));
            setIsAiAssistantOpen(true);
        }

    } catch(error) {
        console.error("Failed to grade exam:", error);
        alert(`Error: ${(error as Error).message}`);
        setExamState(prev => ({ ...prev, view: 'active' }));
    }
  }, [examState.questions, examState.questionToNodeIdMap, dataActions, handleGenerateAnalogy]);
  
  const handleCloseExamModal = useCallback(() => {
    setExamState({ view: 'closed', config: null, questions: [], results: null, questionToNodeIdMap: new Map() });
    // Keep glowingNodeIds so they are visible after closing the modal.
  }, []);

  const handleStartStudySprint = useCallback(async (duration: number) => {
    if (!activeDocument) return;
    setStudySprintState({ view: 'loading', sprint: null, isLoading: true });
    
    try {
      const allNodes = getAllNodes(activeDocument.root);
      const weakestNodes = allNodes
        .filter(n => n.id !== activeDocument.root.id)
        .sort((a, b) => (a.masteryScore || 0) - (b.masteryScore || 0))
        .slice(0, 5)
        .map(n => `"${n.text}" (Mastery: ${Math.round((n.masteryScore || 0) * 100)}%)`);

      const mindMapContext = serializeMindMapForAI(activeDocument.root);
      const documentsContext = await getDocumentContext();

      const sprint = await generateStudySprint(duration, weakestNodes, mindMapContext, documentsContext);

      setStudySprintState({
        view: 'active',
        sprint,
        isLoading: false
      });

    } catch (error) {
      console.error("Failed to generate study sprint:", error);
      alert(`Error generating study sprint: ${(error as Error).message}`);
      setStudySprintState({ view: 'config', sprint: null, isLoading: false });
    }
  }, [activeDocument]);

  const handleCloseStudySprintModal = useCallback(() => {
    setStudySprintState({ view: 'closed', sprint: null, isLoading: false });
  }, []);


  if (authLoading) return <Spinner />;
  if (!currentUser) return <LandingPage />;

  return (
    <div className="w-screen h-screen overflow-hidden flex flex-col bg-white text-slate-800 dark:bg-slate-900 dark:text-slate-100">
      <SubjectTabs
        documents={documents}
        activeDocumentId={activeDocument?.id ?? null}
        user={currentUser}
        onSwitch={switchActiveDocument}
        onAdd={addDocument}
        onDelete={deleteDocument}
        onRename={updateDocumentName}
      />
      <main className="flex-1 flex flex-col relative">
        <div className="flex-1 relative dotted-background">
          {dataLoading ? <MindMapShell /> : activeDocument ? (
            <>
              <AnimatePresence>
                  {selectedNodeIds.size > 1 && (
                      <MultiNodeToolbar
                          count={selectedNodeIds.size}
                          onDelete={() => handleDeleteSelectedNodes(selectedNodeIds)}
                          onSetColor={(color) => handleSetMultipleNodesColor(selectedNodeIds, color)}
                      />
                  )}
              </AnimatePresence>
              <Toolbar
                onUndo={dataActions.undo}
                onRedo={dataActions.redo}
                canUndo={dataActions.canUndo}
                canRedo={dataActions.canRedo}
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                onZoomToFit={handleZoomToFit}
                zoomLevel={zoomTransform.k}
                isSaving={dataLoading}
              />
              <MindMap
                ref={mindMapRef}
                key={activeDocument.id}
                root={activeDocument.root}
                links={activeDocument.links}
                selectedNodeIds={selectedNodeIds}
                focusedNodeId={focusedNodeId}
                nodeToEditOnRender={nodeToEditOnRender}
                generatingIdeasForNodeId={generatingIdeasForNodeId}
                rephrasingNodeId={rephrasingNodeId}
                extractingConceptsNodeId={extractingConceptsNodeId}
                generatingAnalogyNodeId={generatingAnalogyNodeId}
                glowingNodeIds={glowingNodeIds}
                onNodeSelect={setSelectedNodeIds}
                onFocusNode={setFocusedNodeId}
                onNodeUpdate={dataActions.updateNodeText}
                onNodeDelete={handleDeleteNode}
                onDeleteNodes={handleDeleteSelectedNodes}
                onNodeMove={dataActions.moveNode}
                onNodePositionUpdate={dataActions.updateNodePosition}
                onMultipleNodePositionsUpdate={dataActions.updateMultipleNodePositions}
                onAddChild={handleAddChildAndEdit}
                onInsertParentNode={handleInsertParentNode}
                onToggleCollapse={dataActions.toggleNodeCollapse}
                onGenerateIdeas={handleGenerateIdeas}
                onRephraseNode={handleRephraseNode}
                onExtractConcepts={handleExtractConcepts}
                onGenerateAnalogy={handleGenerateAnalogy}
                onSetNodeColor={handleSetNodeColor}
                onEditComplete={() => setNodeToEditOnRender(null)}
                onAddLink={dataActions.addLink}
                onUpdateLinkLabel={dataActions.updateLinkLabel}
                onDeleteLink={dataActions.deleteLink}
                onShowAttachments={handleShowAttachments}
                onSetNodeImage={handleSetNodeImage}
                onRemoveNodeImage={handleRemoveNodeImage}
                onViewImage={handleViewImage}
                onNodeDragStart={handleNodeDrag}
                getAllDescendantIds={dataActions.getAllDescendantIds}
                onTransformChange={handleTransformChange}
                onLayoutUpdate={persistLayoutPositions}
            />
            <SubjectMasteryDisplay
                score={overallMastery}
                onClick={() => setStudySprintState({ view: 'config', sprint: null, isLoading: false })}
            />
            <button 
                onClick={() => setExamState(prev => ({ ...prev, view: 'config' }))}
                className="fixed bottom-6 right-6 w-16 h-16 bg-blue-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-blue-600 transition-all duration-300 transform hover:scale-110 z-20"
                title="Start an Exam"
              >
                <i className="fa-solid fa-graduation-cap text-2xl"></i>
              </button>
            <Suspense fallback={null}>
                <ThemeToggle theme={theme} onToggle={handleToggleTheme} />
            </Suspense>
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                <h2 className="text-xl font-semibold text-slate-600">No Subjects</h2>
                <p className="text-slate-500 mt-2">Create a new subject to get started.</p>
              </div>
            </div>
          )}
        </div>
      </main>
      <Suspense fallback={null}>
        <AiAssistant
            isOpen={isAiAssistantOpen}
            onOpen={() => setIsAiAssistantOpen(true)}
            onClose={() => setIsAiAssistantOpen(false)}
            selectedNodes={selectedNodesData}
            sourceDocuments={activeDocument?.sourceDocuments ?? []}
            generatingNodesFromFileId={generatingNodesFromFileId}
            onGenerateIdeas={handleGenerateIdeas}
            onRephraseNode={handleRephraseNode}
            onExtractConcepts={handleExtractConcepts}
            onGenerateAnalogy={handleGenerateAnalogy}
            isGeneratingIdeas={!!generatingIdeasForNodeId}
            isRephrasing={!!rephrasingNodeId}
            isExtractingConcepts={!!extractingConceptsNodeId}
            isGeneratingAnalogy={!!generatingAnalogyNodeId}
            chatHistory={chatHistory}
            onChatSubmit={handleAiChatSubmit}
            isAiReplying={isAiReplying}
            activeTab={aiSidebarTab}
            onTabChange={setAiSidebarTab}
            onAddAttachment={handleAddAttachment}
            onUpdateAttachment={handleUpdateAttachment}
            onDeleteAttachment={handleDeleteAttachment}
            onUploadFile={handleUploadFile}
            onRetryUpload={handleRetryUpload}
            onDeleteFile={handleDeleteFile}
            onGenerateNodes={handleGenerateNodesFromDoc}
            aiNudge={aiNudge}
            onNudgeDismiss={() => setAiNudge(null)}
          />
      </Suspense>
      <Suspense fallback={null}>
        <ImageLightbox imageUrl={viewingImage} onClose={handleCloseImageView} />
      </Suspense>
       {examState.view !== 'closed' && (
        <Suspense fallback={<ModalLoadingFallback />}>
            <ExamModal 
              state={examState}
              onStart={handleStartExam}
              onSubmit={handleSubmitExam}
              onClose={handleCloseExamModal}
            />
        </Suspense>
       )}
      {studySprintState.view !== 'closed' && (
        <Suspense fallback={<ModalLoadingFallback />}>
            <StudySprintModal
              state={studySprintState}
              onStart={handleStartStudySprint}
              onClose={handleCloseStudySprintModal}
            />
        </Suspense>
      )}
    </div>
  );
};

export default App;