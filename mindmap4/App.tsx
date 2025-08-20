import React, { useState, useCallback, useEffect, useMemo, lazy, Suspense, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from './contexts/AuthContext';
import useMindMapData from './hooks/useMindMapData';
import MindMap, { MindMapActions } from './components/MindMap';
import Toolbar, { ToolMode } from './components/Toolbar';
import MobileToolbar from './components/MobileToolbar';
import { zoomIdentity, ZoomTransform } from 'd3-zoom';
import SubjectTabs from './components/SubjectTabs';
import Auth from './components/Auth';
import Spinner from './components/Spinner';
import SubjectMasteryDisplay from './components/SubjectMasteryDisplay';
import LandingPage from './components/LandingPage';
import MindMapShell from './components/MindMapShell';
import { db, storage } from './firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { processDocument } from './services/documentProcessor';
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
    explainConceptDifferently,
    generateSingleQuestion,
} from './services/geminiService';
import { MindMapNode, ChatMessage, Attachment, SourceDocumentFile, MindMapNodeData, ExamConfig, Question, ExamResult, StudySprint, LearningProfile, AiNudge, GlowNode, GradedAnswer, FeedbackCategory } from './types';
import { SUPER_ADMIN_UID } from './constants';

// Lazy-load components that are not critical for the initial render
const AiAssistant = lazy(() => import('./components/AiAssistant'));
const ImageLightbox = lazy(() => import('./components/ImageLightbox'));
const ExamModal = lazy(() => import('./components/ExamModal'));
const StudySprintModal = lazy(() => import('./components/StudySprintModal'));
const ThemeToggle = lazy(() => import('./components/ThemeToggle'));
const WelcomeModal = lazy(() => import('./components/WelcomeModal'));
const TutorialNudge = lazy(() => import('./components/TutorialNudge'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const FindInMap = lazy(() => import('./components/FindInMap'));
const GuidedReviewNudge = lazy(() => import('./components/GuidedReviewNudge'));
const FeedbackButton = lazy(() => import('./components/FeedbackButton'));
const FeedbackModal = lazy(() => import('./components/FeedbackModal'));
const ReviewModeBar = lazy(() => import('./components/ReviewModeBar'));


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

export type HotspotContent = {
    view: 'main' | 'explaining' | 'quizzing' | 'loading';
    explanation?: string;
    quiz?: Question;
    quizAnswer?: string;
    isQuizCorrect?: boolean;
};

// Helper function to fetch a file from a URL and convert it to a base64 string
const fileUrlToBase64 = async (url: string): Promise<string> => {
    // Note: This assumes the Firebase Storage URL is CORS-enabled for direct fetching.
    // If CORS errors occur, a proxy would be needed, but the current error is 404.
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error while fetching file! status: ${response.status}`);
    }
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (typeof reader.result === 'string') {
                // The result includes a data URI prefix (e.g., "data:application/pdf;base64,").
                // We need to strip this prefix to get the raw base64 data.
                const base64String = reader.result.split(',')[1];
                resolve(base64String);
            } else {
                reject(new Error("Failed to read file as a base64 string."));
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
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

const getBranchNodes = (rootNode: MindMapNode, branchRootId: string): MindMapNode[] => {
    const branchRoot = findNodeRecursive(branchRootId, rootNode);
    if (!branchRoot) return [];
    return getAllNodes(branchRoot);
};

// Helper function to find a node by ID (used by getBranchNodes)
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

const tutorialSteps = [
  // Part 1: The "Aha!" moment
  { id: 'add-subject', targetId: 'add-subject', message: 'Click the "+" button to create your first subject.', placement: 'bottom' },
  { id: 'open-ai-assistant', targetId: 'ai-assistant-bubble', message: 'Great! Now open the AI Assistant to automatically build your map from a document.', placement: 'top' },
  { id: 'go-to-documents', targetId: 'documents-tab', message: 'Go to the "Documents" tab to manage your source files.', placement: 'top' },
  { id: 'upload-file', targetId: 'upload-file-button', message: 'Upload a PDF or text file for the AI to analyze.', placement: 'bottom' },
  { id: 'generate-nodes', targetId: 'generate-nodes-button', message: 'Click the magic wand to transform your document into a structured mind map!', placement: 'left' },
  // Part 2: Feature Discovery
  { id: 'add-child-node', targetId: 'add-child-node', message: 'Your map is created! You can add your own ideas by selecting a node and clicking the "+" button.', placement: 'bottom' },
  { id: 'ai-assist', targetId: 'ai-assist-button', message: 'Use the AI Assist menu to brainstorm ideas, get analogies, and more for any selected node.', placement: 'bottom' },
  { id: 'selection-tool', targetId: 'selection-tool', message: 'Use the Selection Tool to select multiple nodes at once to color or delete them.', placement: 'bottom' },
  { id: 'mastery-display', targetId: 'mastery-display', message: 'This is your Mastery Score. Take AI-generated exams and complete study sprints to increase it!', placement: 'left' }
];

export type HotspotData = { 
    node: MindMapNode; 
    incorrectQuestions: GradedAnswer[]; 
    content: HotspotContent | null;
} | null;


const App: React.FC = () => {
  const { currentUser, loading: authLoading } = useAuth();
  const { 
    documents, 
    activeDocument,
    loading: dataLoading,
    switchActiveDocument,
    addDocument: originalAddDocument,
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
  
  const [selectedNodeIds, setSelectedNodeIdsInternal] = useState<Set<string>>(new Set());
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
  const [branchExamConfig, setBranchExamConfig] = useState<{ nodeId: string; nodeText: string; } | null>(null);
  const [studySprintState, setStudySprintState] = useState<StudySprintState>({
      view: 'closed',
      sprint: null,
      isLoading: false,
  });
  const [glowingNodes, setGlowingNodes] = useState<GlowNode[]>([]);
  const [lastCompletedExam, setLastCompletedExam] = useState<ExamState | null>(null);
  const [activeHotspotNodeId, setActiveHotspotNodeId] = useState<string | null>(null);
  const [hotspotContent, setHotspotContent] = useState<HotspotContent | null>(null);

  // Guided Review State
  const [showGuidedReviewNudge, setShowGuidedReviewNudge] = useState(false);
  const [guidedReviewPath, setGuidedReviewPath] = useState<GlowNode[]>([]);
  const [guidedReviewIndex, setGuidedReviewIndex] = useState(0);
  const [isInGuidedReview, setIsInGuidedReview] = useState(false);

  const [aiNudge, setAiNudge] = useState<AiNudge | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('mindmap-theme') as 'light' | 'dark') || 'light';
  });
  const [toolMode, setToolMode] = useState<ToolMode>('pan');
  
  // Search State
  const [isFindInMapOpen, setIsFindInMapOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [currentSearchResultIndex, setCurrentSearchResultIndex] = useState(0);
  const [nodeToCenterOn, setNodeToCenterOn] = useState<string | null>(null);
  
  // Tutorial State
  const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState<string | null>(null);
  const currentTutorial = tutorialSteps.find(step => step.id === tutorialStep);
  const isLastTutorialStep = currentTutorial ? tutorialSteps.findIndex(step => step.id === currentTutorial.id) === tutorialSteps.length - 1 : false;

  // Feedback State
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);

  const mindMapRef = useRef<MindMapActions>(null);
  const [zoomTransform, setZoomTransform] = useState<ZoomTransform>(zoomIdentity);
  
  // Derived state to determine if user is in an interactive review session
  const isReviewModeActive = useMemo(() => glowingNodes.length > 0, [glowingNodes]);
  
  const dismissGuidedReviewNudge = useCallback(() => {
      setShowGuidedReviewNudge(false);
  }, []);

  const setSelectedNodeIds = useCallback((ids: Set<string> | ((current: Set<string>) => Set<string>)) => {
    dismissGuidedReviewNudge();
    setSelectedNodeIdsInternal(ids);
  }, [dismissGuidedReviewNudge]);


  useEffect(() => {
    localStorage.setItem('mindmap-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);
  
  useEffect(() => {
    // Start tutorial for first-time users
    if (!authLoading && !dataLoading && currentUser) {
        const tutorialCompleted = localStorage.getItem('mindmaster-ai-tutorial-v1-completed');
        if (!tutorialCompleted) {
            // If there are no documents, show the welcome modal.
            if (documents.length === 0) {
                setIsWelcomeModalOpen(true);
            }
        }
    }
  }, [currentUser, authLoading, dataLoading, documents.length]);
  
  const advanceTutorial = (fromStep: string) => {
    const currentIndex = tutorialSteps.findIndex(step => step.id === fromStep);
    if (currentIndex > -1 && currentIndex + 1 < tutorialSteps.length) {
        setTutorialStep(tutorialSteps[currentIndex + 1].id);
    } else {
        // End of tutorial
        setTutorialStep(null);
        localStorage.setItem('mindmaster-ai-tutorial-v1-completed', 'true');
    }
  };

  const handleStartTutorial = () => {
    setIsWelcomeModalOpen(false);
    setTutorialStep(tutorialSteps[0].id);
  };

  const restartTutorial = useCallback(() => {
    // We don't want the welcome modal again, just the nudges.
    setIsWelcomeModalOpen(false);
    setTutorialStep(tutorialSteps[0].id);
  }, []);

  const handleSkipTutorial = () => {
    setTutorialStep(null);
    localStorage.setItem('mindmaster-ai-tutorial-v1-completed', 'true');
  };

  const addDocument = useCallback(async () => {
    const newDocId = await originalAddDocument();
    if (newDocId && tutorialStep === 'add-subject') {
        advanceTutorial('add-subject');
    }
  }, [originalAddDocument, tutorialStep]);

  const handleOpenAiAssistant = () => {
    setIsAiAssistantOpen(true);
    if (tutorialStep === 'open-ai-assistant') {
        advanceTutorial('open-ai-assistant');
    }
  };

  const handleAiTabChange = (tab: AiSidebarTab) => {
    setAiSidebarTab(tab);
    if (tab === 'documents' && tutorialStep === 'go-to-documents') {
        advanceTutorial('go-to-documents');
    }
  };

  const handleToggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  const handleZoomIn = () => mindMapRef.current?.zoomIn();
  const handleZoomOut = () => mindMapRef.current?.zoomOut();
  const handleZoomToFit = () => mindMapRef.current?.zoomToFit();

  const handleTransformChange = useCallback((newTransform: ZoomTransform) => {
      dismissGuidedReviewNudge();
      setZoomTransform(newTransform);
  }, [dismissGuidedReviewNudge]);

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
    setGlowingNodes([]); // Clear glowing nodes when switching subjects
    setAiNudge(null); // Clear any nudge when switching subjects
    setIsFindInMapOpen(false); // Close find on document switch
    setActiveHotspotNodeId(null); // Close hotspot
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
  
  const handleCloseFindInMap = useCallback(() => {
    setIsFindInMapOpen(false);
    setSearchQuery('');
  }, []);

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
  }, [activeDocument, lastAction, dataActions, setSelectedNodeIds]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // General app-level shortcuts that should work anywhere
      if (event.key === 'Escape') {
        setViewingImage(null);
        setFocusedNodeId(null);
        setActiveHotspotNodeId(null);
        if (isFindInMapOpen) {
            handleCloseFindInMap();
        }
        if (examState.view === 'active' && !window.confirm("Are you sure you want to exit the exam? Your progress will be lost.")) {
          // Do nothing
        } else if (examState.view !== 'closed') {
           setExamState({ view: 'closed', config: null, questions: [], results: null, questionToNodeIdMap: new Map() });
           setBranchExamConfig(null);
        }
         if (studySprintState.view !== 'closed') {
            setStudySprintState({ view: 'closed', sprint: null, isLoading: false });
        }
      }

       // Ctrl+F or Cmd+F to open search
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
          event.preventDefault();
          setIsFindInMapOpen(prev => !prev);
          setSearchQuery('');
      }

      // Don't trigger shortcuts if user is typing in an input/textarea
      const isEditingText = (event.target as HTMLElement)?.tagName === 'TEXTAREA' || (event.target as HTMLElement)?.tagName === 'INPUT';
      if (isEditingText) return;

      if (event.key.toLowerCase() === 'v') setToolMode('pan');
      if (event.key === 'Control') {
          if (toolMode !== 'select') setToolMode('select');
      }

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
    
    const handleKeyUp = (event: KeyboardEvent) => {
        if (event.key === 'Control') {
            if (toolMode !== 'pan') setToolMode('pan');
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, [examState.view, studySprintState.view, dataActions, lastSelectedNodeId, selectedNodeIds, toolMode, isFindInMapOpen, handleCloseFindInMap]);

  // Search Logic Effects
  useEffect(() => {
    if (!searchQuery || !activeDocument) {
      setSearchResults([]);
      return;
    }
    const allNodes = getAllNodes(activeDocument.root);
    const results = allNodes
      .filter(node => node.text.toLowerCase().includes(searchQuery.toLowerCase()))
      .map(node => node.id);
    
    setSearchResults(results);
    setCurrentSearchResultIndex(0);
  }, [searchQuery, activeDocument]);

  useEffect(() => {
    if (isFindInMapOpen && searchResults.length > 0) {
      const nodeIdToCenter = searchResults[currentSearchResultIndex];
      setNodeToCenterOn(nodeIdToCenter);
    } else {
      setNodeToCenterOn(null);
    }
  }, [isFindInMapOpen, searchResults, currentSearchResultIndex]);
  
  const handleNextSearchResult = () => {
    if (searchResults.length > 0) {
      setCurrentSearchResultIndex(prev => (prev + 1) % searchResults.length);
    }
  };

  const handlePreviousSearchResult = () => {
    if (searchResults.length > 0) {
      setCurrentSearchResultIndex(prev => (prev - 1 + searchResults.length) % searchResults.length);
    }
  };


  const handleNodeDrag = () => {
    dismissGuidedReviewNudge();
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
  }, [dataActions, activeDocument, setSelectedNodeIds]);

  const handleDeleteSelectedNodes = useCallback((nodeIdsToDelete: Set<string>) => {
    if (nodeIdsToDelete.size > 0) {
        deleteMultipleNodes(nodeIdsToDelete);
        setSelectedNodeIds(new Set()); // Clear selection after deletion
    }
  }, [deleteMultipleNodes, setSelectedNodeIds]);

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
              const node = selectedNodesData[0]
              context.path = findNodePath(activeDocument.root, node.id);
              context.currentNodeText = node.text;
              context.childrenTexts = node.children?.map(c => c.text) || [];
              if (node.image?.downloadURL) {
                  // This is simplified. In a real app, you would fetch the image
                  // and convert it to base64, but that's complex and requires cors setup.
                  // For now, we assume this is handled elsewhere or not implemented for simplicity.
              }
          } else {
              context.currentNodeText = `${selectedNodesData.length} nodes selected`;
              context.childrenTexts = selectedNodesData.map(n => n.text);
          }

          const answer = await askChatQuestion(context, question, activeDocument.learningProfile);
          setChatHistory(prev => [...prev, { role: 'model', text: answer }]);

      } catch (error) {
          console.error("AI chat error:", error);
          setChatHistory(prev => [...prev, { role: 'model', text: `Sorry, I ran into an error: ${(error as Error).message}` }]);
      } finally {
          setIsAiReplying(false);
      }
  }, [selectedNodesData, activeDocument, trackUserAction]);

  const handleAddAttachment = useCallback(async (nodeId: string, attachmentData: Omit<Attachment, 'id'>, file?: File) => {
    if (!currentUser || !activeDocument) return;

    if (attachmentData.type === 'image' && file) {
        const attachmentId = uuidv4();
        const filePath = `users/${currentUser.uid}/${activeDocument.id}/${attachmentId}-${file.name}`;
        const fileRef = storage.ref(filePath);
        
        try {
            const snapshot = await fileRef.put(file);
            const downloadURL = await snapshot.ref.getDownloadURL();
            const finalAttachment: Attachment = {
                id: attachmentId,
                type: 'image',
                content: { downloadURL, storagePath: filePath, name: file.name },
            };
             addAttachment(nodeId, finalAttachment);
             trackUserAction('ADD_IMAGE');
        } catch(error) {
            console.error("Error uploading image attachment:", error);
            alert(`Image upload failed: ${(error as Error).message}`);
        }
    } else {
        const finalAttachment = { ...attachmentData, id: uuidv4() } as Attachment;
        addAttachment(nodeId, finalAttachment);
    }
}, [addAttachment, currentUser, activeDocument, trackUserAction]);

  const handleDeleteAttachment = useCallback(async (nodeId: string, attachmentId: string) => {
    const node = dataActions.findNode(nodeId);
    const attachment = node?.attachments?.find(a => a.id === attachmentId);

    if (attachment && attachment.type === 'image') {
        try {
            await storage.ref(attachment.content.storagePath).delete();
        } catch (error) {
            console.error("Error deleting image from storage, it might have been already deleted:", error);
        }
    }
    deleteAttachment(nodeId, attachmentId);
  }, [deleteAttachment, dataActions]);

  const handleSetNodeImage = useCallback(async (nodeId: string, file: File) => {
    if (!currentUser || !activeDocument) return;
    trackUserAction('ADD_IMAGE');
    const filePath = `users/${currentUser.uid}/${activeDocument.id}/nodeImages/${nodeId}-${file.name}`;
    const fileRef = storage.ref(filePath);
    try {
        const snapshot = await fileRef.put(file);
        const downloadURL = await snapshot.ref.getDownloadURL();
        setNodeImage(nodeId, { downloadURL, storagePath: filePath });
    } catch (error) {
        console.error("Error uploading node image:", error);
        alert(`Image upload failed: ${(error as Error).message}`);
    }
  }, [setNodeImage, currentUser, activeDocument, trackUserAction]);

  const handleRemoveNodeImage = useCallback(async (nodeId: string) => {
      const node = dataActions.findNode(nodeId);
      if (!node?.image?.storagePath) return;

      try {
          await storage.ref(node.image.storagePath).delete();
      } catch (error) {
          console.error("Error deleting node image from storage:", error);
      }
      setNodeImage(nodeId, null);
  }, [setNodeImage, dataActions]);
  
  const handleInsertParentNode = useCallback((childId: string) => {
      if (activeDocument) {
          const parent = findParentNodeFromHook(childId);
          if (parent) {
              const newParentId = insertNodeBetween(parent.id, childId);
              if (newParentId) {
                  setNodeToEditOnRender(newParentId);
                  setSelectedNodeIds(new Set([newParentId]));
              }
          }
      }
  }, [activeDocument, findParentNodeFromHook, insertNodeBetween, setSelectedNodeIds]);

  const handleUploadAndProcessFile = useCallback(async (file: File) => {
      if (!currentUser || !activeDocument) return;
      
      if (tutorialStep === 'upload-file') {
        advanceTutorial('upload-file');
      }

      const fileId = uuidv4();
      const storagePath = `users/${currentUser.uid}/${activeDocument.id}/sourceDocuments/${fileId}-${file.name}`;
      
      const sourceDocFile: SourceDocumentFile = {
          id: fileId,
          name: file.name,
          storagePath,
          downloadURL: '',
          mimeType: file.type,
          status: 'uploading',
      };

      addSourceDocument(sourceDocFile);

      try {
          const fileRef = storage.ref(storagePath);
          const snapshot = await fileRef.put(file);
          const downloadURL = await snapshot.ref.getDownloadURL();
          
          updateSourceDocument(fileId, { downloadURL, status: 'ready' });
      } catch (error) {
          console.error("Error uploading source document:", error);
          updateSourceDocument(fileId, { status: 'error', errorMessage: (error as Error).message });
      }
  }, [currentUser, activeDocument, addSourceDocument, updateSourceDocument, tutorialStep]);

  const handleRetryUpload = (fileToRetry: SourceDocumentFile) => {
    // The original File object is lost, so a true "retry" isn't possible.
    // The best UX is to remove the failed entry and let the user try again from the start.
    deleteSourceDocument(fileToRetry.id);
    alert(`Removed failed upload for "${fileToRetry.name}". Please upload the file again.`);
  };

  const handleDeleteSourceDocument = useCallback(async (file: SourceDocumentFile) => {
      if (!window.confirm(`Are you sure you want to delete "${file.name}"? This file will be permanently removed.`)) return;
      
      try {
          await storage.ref(file.storagePath).delete();
      } catch (error) {
          console.error("Error deleting file from storage:", error);
          alert("Could not delete file from storage, but removing from list.");
      }
      deleteSourceDocument(file.id);
  }, [deleteSourceDocument]);
  
  const handleGenerateNodesFromFile = useCallback(async (file: SourceDocumentFile) => {
    if (selectedNodeIds.size !== 1 || !lastSelectedNodeId) {
        alert("Please select a single node to attach the new content to.");
        return;
    }
    const parentNode = dataActions.findNode(lastSelectedNodeId);
    if (!parentNode) return;
    
    if (tutorialStep === 'generate-nodes') {
        advanceTutorial('generate-nodes');
    }

    trackUserAction('GENERATE_FROM_FILE');
    setGeneratingNodesFromFileId(file.id);
    updateSourceDocument(file.id, { status: 'processing' });
    try {
        // Replaced backend fetch with client-side processing.
        // This runs text extraction and base64 conversion in parallel.
        const [text, base64Data] = await Promise.all([
            processDocument(file),
            fileUrlToBase64(file.downloadURL)
        ]);

        const enhancedNodes: EnhancedNode[] = await generateEnhancedMindMapFromFile(text, base64Data, file.mimeType, parentNode.text);

        const convertEnhancedToMindMapData = (nodes: EnhancedNode[]): MindMapNodeData[] => {
            return nodes.map(en => ({
                text: en.text,
                type: en.type,
                ...(en.children && { children: convertEnhancedToMindMapData(en.children) }),
                ...(en.summary && { attachments: [{ type: 'note', content: { text: en.summary } }] })
            } as MindMapNodeData));
        };

        const newMindMapNodes = convertEnhancedToMindMapData(enhancedNodes);
        
        newMindMapNodes.forEach(nodeData => {
            addNodeWithChildren(parentNode.id, nodeData);
        });

        updateSourceDocument(file.id, { status: 'ready' });
    } catch(error) {
        console.error("Error processing document and generating nodes:", error);
        updateSourceDocument(file.id, { status: 'error', errorMessage: (error as Error).message });
    } finally {
        setGeneratingNodesFromFileId(null);
    }
  }, [selectedNodeIds, lastSelectedNodeId, dataActions, updateSourceDocument, addNodeWithChildren, trackUserAction, tutorialStep]);

  const handleInitiateBranchExam = useCallback((nodeId: string) => {
      const node = dataActions.findNode(nodeId);
      if (node) {
          setBranchExamConfig({ nodeId, nodeText: node.text });
          setExamState(prev => ({ ...prev, view: 'config' }));
      }
  }, [dataActions]);

  const handleStartExam = useCallback(async (config: ExamConfig) => {
      if (!activeDocument) return;
      setExamState(prev => ({ ...prev, view: 'loading', config }));

      try {
          const isBranchExam = !!branchExamConfig;
          const nodesForExam = isBranchExam
              ? getBranchNodes(activeDocument.root, branchExamConfig.nodeId)
              : getAllNodes(activeDocument.root);
          
          if (nodesForExam.length === 0) {
              throw new Error("Could not find any nodes for this exam branch.");
          }

          const mindMapContext = nodesForExam.map(n => `- ${n.text}`).join('\n');

          const documentsContext = activeDocument.sourceDocuments
              .filter(d => d.status === 'ready')
              .map(d => `Document: ${d.name}`)
              .join('\n\n');

          const generatedQuestions = await generateExamQuestions(config, mindMapContext, documentsContext);

          const questionToNodeIdMap = new Map<string, string>();
          const questionsWithIds: Question[] = generatedQuestions.map(q => {
              const id = uuidv4();
              // Find the related node within the scope of the exam
              const relatedNode = nodesForExam.find(n => n.text === q.relatedNodeTopicText);
              if (relatedNode) {
                  questionToNodeIdMap.set(id, relatedNode.id);
              }
              return { ...q, id };
          });
          
          setExamState(prev => ({ ...prev, view: 'active', questions: questionsWithIds, questionToNodeIdMap }));
      } catch (error) {
          console.error("Failed to generate exam:", error);
          alert(`Could not create exam: ${(error as Error).message}`);
          setExamState({ view: 'closed', config: null, questions: [], results: null, questionToNodeIdMap: new Map() });
          setBranchExamConfig(null);
      }
  }, [activeDocument, branchExamConfig]);

  const handleSubmitExam = useCallback(async (answers: Map<string, string>, revealedHints: Set<string>) => {
      if (!activeDocument || examState.questions.length === 0) return;
      setExamState(prev => ({ ...prev, view: 'loading' }));

      try {
          const results = await gradeAndAnalyzeExam(examState.questions, answers);
          const finalExamState: ExamState = { ...examState, view: 'results', results };
          setExamState(finalExamState);
          setLastCompletedExam(finalExamState);
          
          const masteryUpdates = new Map<string, number>();
          results.analysis.forEach(res => {
              const question = examState.questions.find(q => q.questionText === res.questionText);
              if (!question) return;

              const nodeId = examState.questionToNodeIdMap.get(question.id);
              if (!nodeId) return;

              const node = dataActions.findNode(nodeId);
              if (!node) return;

              const oldScore = node.masteryScore || 0;
              const wasHintUsed = revealedHints.has(question.id);
              let scoreChange = 0;
              if (res.isCorrect && !wasHintUsed) scoreChange = 0.2; // Strong increase
              else if (res.isCorrect && wasHintUsed) scoreChange = 0.05; // Slight increase
              else scoreChange = -0.15; // Decrease
              
              const newScore = Math.max(0, Math.min(1, oldScore + scoreChange));
              masteryUpdates.set(nodeId, newScore);
          });
          
          dataActions.updateMultipleNodesMastery(masteryUpdates);

          const incorrectCounts = new Map<string, number>();
          results.analysis.forEach(res => {
              if (!res.isCorrect) {
                  const q = examState.questions.find(q => q.questionText === res.questionText);
                  if (q) {
                      const nodeId = examState.questionToNodeIdMap.get(q.id);
                      if (nodeId) {
                          incorrectCounts.set(nodeId, (incorrectCounts.get(nodeId) || 0) + 1);
                      }
                  }
              }
          });

          const newGlowingNodes: GlowNode[] = Array.from(incorrectCounts.entries()).map(([nodeId, count]) => ({
              nodeId,
              severity: count > 1 ? 'high' : 'low'
          }));

          setGlowingNodes(newGlowingNodes);
          if (newGlowingNodes.length > 0) {
              setShowGuidedReviewNudge(true);
          }
          
      } catch (error) {
           console.error("Failed to grade exam:", error);
           alert(`Could not grade exam: ${(error as Error).message}`);
           setExamState(prev => ({ ...prev, view: 'active' })); // Revert to active exam on error
      }
  }, [examState, dataActions, activeDocument]);
  
  const handleStartStudySprint = useCallback(async (duration: number) => {
    if (!activeDocument) return;
    setStudySprintState({ view: 'loading', sprint: null, isLoading: true });
    
    try {
        const allNodes = getAllNodes(activeDocument.root);
        const weakestNodes = allNodes.filter(n => (n.masteryScore || 0) < 0.5).sort((a,b) => (a.masteryScore || 0) - (b.masteryScore || 0));
        const weakestTopics = weakestNodes.slice(0, 5).map(n => n.text); // Get up to 5 weakest topics

        const mindMapContext = allNodes.map(n => `- ${n.text} (Mastery: ${Math.round((n.masteryScore || 0) * 100)}%)`).join('\n');
        const documentsContext = activeDocument.sourceDocuments.map(d => `Document: ${d.name}`).join('\n');

        const sprint = await generateStudySprint(duration, weakestTopics, mindMapContext, documentsContext);
        setStudySprintState({ view: 'active', sprint, isLoading: false });
    } catch (error) {
        console.error("Failed to generate study sprint:", error);
        alert(`Could not create study sprint: ${(error as Error).message}`);
        setStudySprintState({ view: 'closed', sprint: null, isLoading: false });
    }
  }, [activeDocument]);
  
  // --- Topic Hotspot & Review Mode Logic ---

  // Reactive effect to open/close hotspot based on selection
  useEffect(() => {
    if (selectedNodeIds.size === 1) {
        const selectedId = lastSelectedNodeId!;
        const isGlowing = glowingNodes.some(gn => gn.nodeId === selectedId);
        if (isGlowing) {
            setActiveHotspotNodeId(selectedId);
            setHotspotContent({ view: 'main' });
        } else {
            setActiveHotspotNodeId(null);
        }
    } else {
        // Close hotspot if multiple nodes are selected or selection is cleared
        setActiveHotspotNodeId(null);
    }
  }, [selectedNodeIds, lastSelectedNodeId, glowingNodes]);

  const handleFinishReview = useCallback(() => {
    setGlowingNodes([]);
    setActiveHotspotNodeId(null);
    setHotspotContent(null);
    setIsInGuidedReview(false);
    setShowGuidedReviewNudge(false);
    setGuidedReviewPath([]);
  }, []);

    const handleEndGuidedReview = useCallback(() => {
        setIsInGuidedReview(false);
        setGuidedReviewPath([]);
        setGuidedReviewIndex(0);
        setActiveHotspotNodeId(null);
        setHotspotContent(null);
    }, []);

    const handleCloseHotspot = useCallback(() => {
        setActiveHotspotNodeId(null);
        setHotspotContent(null);
        if (isInGuidedReview) {
            handleEndGuidedReview();
        }
    }, [isInGuidedReview, handleEndGuidedReview]);

    const handleMarkAsReviewed = useCallback((nodeId: string) => {
        // Now just closes the hotspot, doesn't remove the glow
        handleCloseHotspot();
    }, [handleCloseHotspot]);

    const handleHotspotExplain = useCallback(async (nodeText: string) => {
        setHotspotContent(prev => prev ? { ...prev, view: 'loading' } : null);
        try {
            const explanation = await explainConceptDifferently(nodeText);
            setHotspotContent(prev => prev ? { ...prev, view: 'explaining', explanation } : null);
        } catch (error) {
            alert(`Error generating explanation: ${(error as Error).message}`);
            setHotspotContent(prev => prev ? { ...prev, view: 'main' } : null);
        }
    }, []);

    const handleHotspotQuiz = useCallback(async (nodeText: string) => {
        setHotspotContent(prev => prev ? { ...prev, view: 'loading' } : null);
        try {
            const question = await generateSingleQuestion(nodeText);
            setHotspotContent(prev => prev ? { ...prev, view: 'quizzing', quiz: { ...question, id: uuidv4() } } : null);
        } catch (error) {
            alert(`Error generating quiz question: ${(error as Error).message}`);
            setHotspotContent(prev => prev ? { ...prev, view: 'main' } : null);
        }
    }, []);
    
    const handleHotspotBackToMain = useCallback(() => {
      setHotspotContent(prev => prev ? { ...prev, view: 'main' } : null);
    }, []);

    // --- Guided Review Logic ---
    const handleAdvanceGuidedReview = useCallback(() => {
        const nextIndex = guidedReviewIndex + 1;

        if (nextIndex >= guidedReviewPath.length) {
            handleEndGuidedReview();
        } else {
            setGuidedReviewIndex(nextIndex);
            const nextNode = guidedReviewPath[nextIndex];
            setNodeToCenterOn(nextNode.nodeId);
            // Select the node to trigger the reactive hotspot effect
            setSelectedNodeIds(new Set([nextNode.nodeId]));
        }
    }, [guidedReviewPath, guidedReviewIndex, handleEndGuidedReview, setSelectedNodeIds]);

    const handleStartGuidedReview = useCallback(() => {
        if (glowingNodes.length === 0) return;
        
        setShowGuidedReviewNudge(false);
        
        const sortedNodes = [...glowingNodes].sort((a, b) => {
            if (a.severity === 'high' && b.severity === 'low') return -1;
            if (a.severity === 'low' && b.severity === 'high') return 1;
            return 0;
        });

        setGuidedReviewPath(sortedNodes);
        setGuidedReviewIndex(0);
        setIsInGuidedReview(true);
        
        const firstNode = sortedNodes[0];
        setNodeToCenterOn(firstNode.nodeId);
        // Select the first node to automatically open its hotspot
        setSelectedNodeIds(new Set([firstNode.nodeId]));
    }, [glowingNodes, setSelectedNodeIds]);

    const hotspotData: HotspotData = useMemo(() => {
        if (!activeHotspotNodeId || !lastCompletedExam?.results) return null;
        const node = dataActions.findNode(activeHotspotNodeId);
        if (!node) return null;

        const incorrectQuestions = lastCompletedExam.results.analysis.filter(res => {
            if (res.isCorrect) return false;
            const q = lastCompletedExam.questions.find(q => q.questionText === res.questionText);
            return q && lastCompletedExam.questionToNodeIdMap.get(q.id) === activeHotspotNodeId;
        });

        return { node, incorrectQuestions, content: hotspotContent };
    }, [activeHotspotNodeId, lastCompletedExam, dataActions, hotspotContent]);

    // --- Feedback Logic ---
    const handleFeedbackSubmit = async (
        category: FeedbackCategory,
        summary: string,
        description: string,
        screenshotBlob: Blob | null
    ) => {
        if (!currentUser) return;

        let screenshotUrl = '';
        let storagePath = '';

        if (screenshotBlob) {
            const feedbackId = uuidv4();
            storagePath = `feedback/${feedbackId}/screenshot.png`;
            const fileRef = storage.ref(storagePath);
            const snapshot = await fileRef.put(screenshotBlob);
            screenshotUrl = await snapshot.ref.getDownloadURL();
        }

        await db.collection('feedback').add({
            userId: currentUser.uid,
            category,
            summary,
            description,
            screenshotUrl,
            storagePath,
            timestamp: new Date().toISOString(),
            clientInfo: {
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                screenWidth: window.screen.width,
                screenHeight: window.screen.height,
            },
            status: 'new',
        });
    };


  if (authLoading) {
    return <Spinner fullScreen />;
  }
  
  if (!currentUser) {
      return <LandingPage />;
  }

  // Admin Route
  if (currentUser.uid === SUPER_ADMIN_UID) {
    return (
      <Suspense fallback={<Spinner fullScreen />}>
        <div className={`w-screen h-screen overflow-hidden font-sans ${theme}`}>
          <AdminPanel user={currentUser} theme={theme} onToggleTheme={handleToggleTheme} />
        </div>
      </Suspense>
    );
  }

  // Regular User Route - check for data loading
  if (dataLoading) {
      return <Spinner fullScreen />;
  }

  return (
    <div className={`w-screen h-screen overflow-hidden flex flex-col font-sans ${theme}`}>
      <SubjectTabs
        documents={documents}
        activeDocumentId={activeDocument?.id ?? null}
        user={currentUser}
        onSwitch={switchActiveDocument}
        onAdd={addDocument}
        onDelete={deleteDocument}
        onRename={updateDocumentName}
        onRestartTutorial={restartTutorial}
      />
      <main className="flex-1 relative bg-slate-100 dark:bg-slate-900">
        <Toolbar 
          onUndo={dataActions.undo}
          onRedo={dataActions.redo}
          canUndo={dataActions.canUndo}
          canRedo={dataActions.canRedo}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onZoomToFit={handleZoomToFit}
          zoomLevel={zoomTransform.k}
          isSaving={false} // This can be wired up to a DB status
          toolMode={toolMode}
          onToolChange={setToolMode}
          selectedNodeCount={selectedNodeIds.size}
          onDeleteSelected={() => handleDeleteSelectedNodes(selectedNodeIds)}
          onSetSelectedColor={(color) => handleSetMultipleNodesColor(selectedNodeIds, color)}
          onToggleFindInMap={() => setIsFindInMapOpen(prev => !prev)}
        />
        
        <Suspense fallback={null}>
            <AnimatePresence>
                {isReviewModeActive && <ReviewModeBar onFinishReview={handleFinishReview} />}
            </AnimatePresence>
        </Suspense>

        <Suspense fallback={null}>
            <AnimatePresence>
                {isFindInMapOpen && (
                    <FindInMap
                        query={searchQuery}
                        onQueryChange={setSearchQuery}
                        resultCount={searchResults.length}
                        currentIndex={currentSearchResultIndex}
                        onNext={handleNextSearchResult}
                        onPrevious={handlePreviousSearchResult}
                        onClose={handleCloseFindInMap}
                    />
                )}
            </AnimatePresence>
        </Suspense>

        <div className="md:hidden">
          <MobileToolbar
            onUndo={dataActions.undo}
            onRedo={dataActions.redo}
            canUndo={dataActions.canUndo}
            canRedo={dataActions.canRedo}
            masteryScore={overallMastery}
            onStartExam={() => setExamState(prev => ({...prev, view: 'config'}))}
            onStartStudySprint={() => setStudySprintState(prev => ({...prev, view: 'config'}))}
            theme={theme}
            onToggleTheme={handleToggleTheme}
            toolMode={toolMode}
            onToolChange={setToolMode}
          />
        </div>
        
        <div className="hidden md:block">
          <Suspense fallback={null}>
            <ThemeToggle theme={theme} onToggle={handleToggleTheme} />
          </Suspense>
        </div>


        {activeDocument ? (
          <>
          <MindMap
            ref={mindMapRef}
            key={activeDocument.id}
            root={activeDocument.root}
            links={activeDocument.links}
            toolMode={toolMode}
            isReviewModeActive={isReviewModeActive}
            selectedNodeIds={selectedNodeIds}
            focusedNodeId={focusedNodeId}
            nodeToEditOnRender={nodeToEditOnRender}
            generatingIdeasForNodeId={generatingIdeasForNodeId}
            rephrasingNodeId={rephrasingNodeId}
            extractingConceptsNodeId={extractingConceptsNodeId}
            generatingAnalogyNodeId={generatingAnalogyNodeId}
            glowingNodes={glowingNodes}
            searchResultIds={searchResults}
            currentSearchResultId={searchResults[currentSearchResultIndex] ?? null}
            nodeToCenterOn={nodeToCenterOn}
            activeHotspotNodeId={activeHotspotNodeId}
            hotspotData={hotspotData}
            isInGuidedReview={isInGuidedReview}
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
            onTestBranch={handleInitiateBranchExam}
            onSetNodeColor={dataActions.updateNodeColor}
            onEditComplete={() => setNodeToEditOnRender(null)}
            onAddLink={dataActions.addLink}
            onUpdateLinkLabel={dataActions.updateLinkLabel}
            onDeleteLink={dataActions.deleteLink}
            onShowAttachments={(nodeId) => { setSelectedNodeIds(new Set([nodeId])); setAiSidebarTab('attachments'); setIsAiAssistantOpen(true); }}
            onSetNodeImage={handleSetNodeImage}
            onRemoveNodeImage={handleRemoveNodeImage}
            onViewImage={setViewingImage}
            onNodeDragStart={handleNodeDrag}
            getAllDescendantIds={(node) => dataActions.getAllDescendantIds(node)}
            onTransformChange={handleTransformChange}
            onLayoutUpdate={persistLayoutPositions}
            onSelectionEnd={() => { if(toolMode === 'select') setToolMode('pan'); }}
            onCloseHotspot={handleCloseHotspot}
            onMarkAsReviewed={handleMarkAsReviewed}
            onHotspotExplain={handleHotspotExplain}
            onHotspotQuiz={handleHotspotQuiz}
            onAdvanceGuidedReview={handleAdvanceGuidedReview}
            onHotspotBackToMain={handleHotspotBackToMain}
          />
          <div className="hidden md:block">
            <SubjectMasteryDisplay
              score={overallMastery}
              onStartExam={() => setExamState(prev => ({...prev, view: 'config'}))}
              onStartStudySprint={() => setStudySprintState(prev => ({...prev, view: 'config'}))}
            />
          </div>
          <Suspense fallback={null}>
              <AiAssistant
                  isOpen={isAiAssistantOpen}
                  onOpen={handleOpenAiAssistant}
                  onClose={() => setIsAiAssistantOpen(false)}
                  selectedNodes={selectedNodesData}
                  sourceDocuments={activeDocument.sourceDocuments || []}
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
                  onTabChange={handleAiTabChange}
                  onAddAttachment={handleAddAttachment}
                  onUpdateAttachment={updateAttachment}
                  onDeleteAttachment={handleDeleteAttachment}
                  onUploadFile={handleUploadAndProcessFile}
                  onRetryUpload={handleRetryUpload}
                  onDeleteFile={handleDeleteSourceDocument}
                  onGenerateNodes={handleGenerateNodesFromFile}
                  generatingNodesFromFileId={generatingNodesFromFileId}
                  aiNudge={aiNudge}
                  onNudgeDismiss={() => setAiNudge(null)}
              />
          </Suspense>
           <Suspense fallback={null}>
            <FeedbackButton onClick={() => setIsFeedbackModalOpen(true)} />
           </Suspense>
          </>
        ) : (
            documents.length > 0 ? <MindMapShell /> : (
              <div className="w-full h-full flex flex-col items-center justify-center text-center p-4">
                  <div className="w-24 h-24 bg-slate-200 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6">
                      <i className="fa-solid fa-folder-plus text-4xl text-slate-400 dark:text-slate-500"></i>
                  </div>
                  <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Create Your First Subject</h2>
                  <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-md">Click the "+" button in the top left corner to start a new mind map and begin your learning journey.</p>
              </div>
            )
        )}
      </main>
      <Suspense fallback={<ModalLoadingFallback />}>
          <AnimatePresence>
            {isWelcomeModalOpen && <WelcomeModal onStart={handleStartTutorial} />}
          </AnimatePresence>
          <ImageLightbox imageUrl={viewingImage} onClose={() => setViewingImage(null)} />
          <ExamModal
              state={examState}
              branchExamConfig={branchExamConfig}
              onStart={handleStartExam}
              onSubmit={handleSubmitExam}
              onClose={() => {
                setExamState({ view: 'closed', config: null, questions: [], results: null, questionToNodeIdMap: new Map() });
                setBranchExamConfig(null);
              }}
          />
          <StudySprintModal
              state={studySprintState}
              onStart={handleStartStudySprint}
              onClose={() => setStudySprintState({ view: 'closed', sprint: null, isLoading: false })}
          />
          <FeedbackModal
            isOpen={isFeedbackModalOpen}
            onClose={() => setIsFeedbackModalOpen(false)}
            onSubmit={handleFeedbackSubmit}
          />
      </Suspense>
      <Suspense fallback={null}>
        <AnimatePresence>
            {showGuidedReviewNudge && (
                <GuidedReviewNudge onStart={handleStartGuidedReview} onDismiss={dismissGuidedReviewNudge} />
            )}
        </AnimatePresence>
        {currentTutorial && (
            <TutorialNudge
                key={currentTutorial.id}
                targetId={currentTutorial.targetId}
                message={currentTutorial.message}
                placement={currentTutorial.placement as any}
                onNext={() => advanceTutorial(currentTutorial.id)}
                onSkip={handleSkipTutorial}
                isLastStep={isLastTutorialStep}
            />
        )}
      </Suspense>
    </div>
  );
};

export default App;