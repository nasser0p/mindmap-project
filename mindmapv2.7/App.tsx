import React, { useState, useCallback, useEffect, useMemo, lazy, Suspense, useRef, useReducer } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from './contexts/AuthContext';
import useMindMapData from './hooks/useMindMapData';
import useIsMobile from './hooks/useIsMobile';
import useVoiceAssistant from './hooks/useVoiceAssistant';
import MindMap, { MindMapActions } from './components/MindMap';
import Toolbar, { ToolMode, VoiceStatus } from './components/Toolbar';
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
    generateNodesFromText,
} from './services/geminiService';
import { MindMapNode, ChatMessage, Attachment, SourceDocumentFile, MindMapNodeData, ExamConfig, Question, ExamResult, StudySprint, LearningProfile, AiNudge, GlowNode, GradedAnswer, FeedbackCategory, Chapter, SearchResult, VoiceCommandContext } from './types';
import { SUPER_ADMIN_UID } from './constants';
import ChapterSidebar from './components/ChapterSidebar';

// Lazy-load components that are not critical for the initial render
const AiAssistant = lazy(() => import('./components/AiAssistant'));
const ImageLightbox = lazy(() => import('./components/ImageLightbox'));
const ExamModal = lazy(() => import('./components/ExamModal'));
const StudySprintModal = lazy(() => import('./components/StudySprintModal'));
const ThemeToggle = lazy(() => import('./components/ThemeToggle'));
const WelcomeModal = lazy(() => import('./components/WelcomeModal'));
const TutorialNudge = lazy(() => import('./components/TutorialNudge'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const GuidedReviewNudge = lazy(() => import('./components/GuidedReviewNudge'));
const FeedbackButton = lazy(() => import('./components/FeedbackButton'));
const FeedbackModal = lazy(() => import('./components/FeedbackModal'));
const TouchSelectTip = lazy(() => import('./components/TouchSelectTip'));
const ExamScopeModal = lazy(() => import('./components/ExamScopeModal'));
const NavigationPanel = lazy(() => import('./components/NavigationPanel'));
const VoiceCommandOverlay = lazy(() => import('./components/VoiceCommandOverlay'));


// --- Main App Component ---

type AppAction = {
  type: 'ADD_CHILD';
  parentId: string;
} | null;

type LearningActionType = 
    | 'GENERATE_ANALOGY'
    | 'ASK_DIRECT_QUESTION'
    | 'GENERATE_IDEAS'
    | 'MANUAL_ADD_CHILD'
    | 'ADD_IMAGE'
    | 'GENERATE_FROM_FILE';

// --- Exam State Management Reducer ---

type ExamState = {
    view: 'closed' | 'scope' | 'config' | 'loading' | 'active' | 'grading' | 'results';
    scope: 'chapter' | 'subject';
    branchConfig: { nodeId: string; nodeText: string; } | null;
    config: ExamConfig | null;
    questions: Question[];
    results: ExamResult | null;
    questionToNodeIdMap: Map<string, string>;
    revealedHints: Set<string>;
    progress: number;
    progressMessage: string;
};

type ExamAction =
  | { type: 'OPEN_SCOPE_MODAL' }
  | { type: 'SET_SCOPE_AND_OPEN_CONFIG'; payload: 'chapter' | 'subject' }
  | { type: 'START_BRANCH_EXAM'; payload: { nodeId: string; nodeText: string } }
  | { type: 'START_GENERATION'; payload: ExamConfig }
  | { type: 'SET_PROGRESS'; payload: { progress: number; message: string } }
  | { type: 'GENERATION_SUCCESS'; payload: { questions: Question[]; questionToNodeIdMap: Map<string, string> } }
  | { type: 'SUBMIT'; payload: { revealedHints: Set<string> } }
  | { type: 'ADD_GRADED_ANSWER'; payload: { gradedAnswer: GradedAnswer } }
  | { type: 'GRADING_COMPLETE' }
  | { type: 'FAIL_AND_CLOSE' }
  | { type: 'REVERT_TO_ACTIVE' }
  | { type: 'CLOSE' }
  | { type: 'FINISH_REVIEW_SESSION' };

const initialExamState: ExamState = {
    view: 'closed',
    scope: 'chapter',
    branchConfig: null,
    config: null,
    questions: [],
    results: null,
    questionToNodeIdMap: new Map(),
    revealedHints: new Set(),
    progress: 0,
    progressMessage: '',
};

function examReducer(state: ExamState, action: ExamAction): ExamState {
    switch (action.type) {
        case 'OPEN_SCOPE_MODAL':
            return { ...state, view: 'scope' };
        case 'SET_SCOPE_AND_OPEN_CONFIG':
            return { ...state, scope: action.payload, view: 'config' };
        case 'START_BRANCH_EXAM':
            return { ...state, branchConfig: action.payload, scope: 'chapter', view: 'config' };
        case 'START_GENERATION':
            return { ...state, config: action.payload, view: 'loading', progress: 0, progressMessage: 'Initializing...' };
        case 'SET_PROGRESS':
            return { ...state, progress: action.payload.progress, progressMessage: action.payload.message };
        case 'GENERATION_SUCCESS':
            return { ...state, questions: action.payload.questions, questionToNodeIdMap: action.payload.questionToNodeIdMap, view: 'active' };
        case 'SUBMIT':
            return {
                ...state,
                view: 'grading',
                revealedHints: action.payload.revealedHints,
                results: { score: 0, analysis: [] }, // Initialize results object
            };
        case 'ADD_GRADED_ANSWER': {
            if (!state.results) return state; // Should not happen
            const newAnalysis = [...state.results.analysis, action.payload.gradedAnswer];
            const correctCount = newAnalysis.filter(a => a.isCorrect).length;
            const newScore = Math.round((correctCount / state.questions.length) * 100);
            return {
                ...state,
                results: {
                    ...state.results,
                    analysis: newAnalysis,
                    score: newScore,
                },
            };
        }
        case 'GRADING_COMPLETE':
            return { ...state, view: 'results' };
        case 'FAIL_AND_CLOSE':
            alert(`Operation failed. Please try again.`);
            return initialExamState;
        case 'REVERT_TO_ACTIVE':
             alert(`Could not grade exam. Please try again.`);
            return { ...state, view: 'active' };
        case 'CLOSE':
            // Don't clear results, as they are needed for review mode.
            // Just close the modal view.
            return {
                ...state,
                view: 'closed',
                config: null,
                branchConfig: null,
            };
        case 'FINISH_REVIEW_SESSION':
            // This action fully resets the state after review is done.
            return initialExamState;
        default:
            return state;
    }
}

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

export type ContextMenuData = {
    nodeId: string;
    x: number;
    y: number;
} | null;

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

const calculateOverallMastery = (chapters: Chapter[]): number => {
    const scores: { score: number; weight: number }[] = [];
    const traverse = (node: MindMapNode, depth: number) => {
        const score = node.masteryScore || 0;
        const weight = 1 / Math.pow(2, depth);
        scores.push({ score, weight });
        if (node.children) {
            node.children.forEach(child => traverse(child, depth + 1));
        }
    };
    chapters.forEach(chapter => traverse(chapter.root, 0));

    if (scores.length === 0) return 0;
    
    const totalWeightedScore = scores.reduce((acc, s) => acc + s.score * s.weight, 0);
    const totalWeight = scores.reduce((acc, s) => acc + s.weight, 0);

    return totalWeight === 0 ? 0 : totalWeightedScore / totalWeight;
};

const calculateChapterMastery = (chapter: Chapter): number => {
    if (!chapter) return 0;
    const scores: { score: number; weight: number }[] = [];
    const traverse = (node: MindMapNode, depth: number) => {
        const score = node.masteryScore || 0;
        const weight = 1 / Math.pow(2, depth);
        scores.push({ score, weight });
        if (node.children) {
            node.children.forEach(child => traverse(child, depth + 1));
        }
    };
    traverse(chapter.root, 0);

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

// Helper functions moved from MindMap.tsx
const findNodeById = (root: MindMapNode, nodeId: string): MindMapNode | null => {
  if (root.id === nodeId) return root;
  if (root.children) {
    for (const child of root.children) {
      const found = findNodeById(child, nodeId);
      if (found) return found;
    }
  }
  return null;
}

const findNodePathObjects = (root: MindMapNode, nodeId: string): MindMapNode[] => {
    function find(currentPath: MindMapNode[], node: MindMapNode): MindMapNode[] | null {
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

const App: React.FC = () => {
  const { currentUser, loading: authLoading } = useAuth();
  const { 
    subjects, 
    activeSubject,
    chapters,
    activeChapter,
    loading: dataLoading,
    switchActiveSubject,
    addSubject: originalAddSubject,
    deleteSubject,
    updateSubjectName,
    addChapter,
    deleteChapter,
    renameChapter,
    switchActiveChapter,
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
    updateCustomPrompts,
    deleteMultipleNodes,
    persistLayoutPositions,
    updateMultipleNodesColor,
    ...dataActions 
  } = useMindMapData(currentUser?.uid ?? null);
  
  const [selectedNodeIds, setSelectedNodeIdsInternal] = useState<Set<string>>(new Set());
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [nodeToEditOnRender, setNodeToEditOnRender] = useState<string | null>(null);
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<AppAction>(null);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [generatingIdeasForNodeId, setGeneratingIdeasForNodeId] = useState<string | null>(null);
  const [rephrasingNodeId, setRephrasingNodeId] = useState<string | null>(null);
  const [extractingConceptsNodeId, setExtractingConceptsNodeId] = useState<string | null>(null);
  const [generatingAnalogyNodeId, setGeneratingAnalogyNodeId] = useState<string | null>(null);
  const [generatingNodesFromFileId, setGeneratingNodesFromFileId] = useState<string | null>(null);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isAiReplying, setIsAiReplying] = useState(false);
  const [generatingNodesFromChat, setGeneratingNodesFromChat] = useState<string | null>(null);
  
  const [examState, dispatchExam] = useReducer(examReducer, initialExamState);

  const [studySprintState, setStudySprintState] = useState<StudySprintState>({
      view: 'closed',
      sprint: null,
      isLoading: false,
  });
  const [glowingNodes, setGlowingNodes] = useState<GlowNode[]>([]);
  const [activeHotspotNodeId, setActiveHotspotNodeId] = useState<string | null>(null);
  const [hotspotContent, setHotspotContent] = useState<HotspotContent | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuData>(null);

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
  const [searchScope, setSearchScope] = useState<'chapter' | 'subject'>('chapter');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [currentSearchResultIndex, setCurrentSearchResultIndex] = useState(0);
  const [nodeToCenterOn, setNodeToCenterOn] = useState<string | null>(null);
  const [nodeToCenterAfterChapterSwitch, setNodeToCenterAfterChapterSwitch] = useState<string | null>(null);
  
  // Tutorial State
  const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState<string | null>(null);
  const currentTutorial = tutorialSteps.find(step => step.id === tutorialStep);
  const isLastTutorialStep = currentTutorial ? tutorialSteps.findIndex(step => step.id === currentTutorial.id) === tutorialSteps.length - 1 : false;

  // Feedback State
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [showTouchSelectTip, setShowTouchSelectTip] = useState(false);
  
  const isMobile = useIsMobile();
  const mindMapRef = useRef<MindMapActions>(null);
  const [zoomTransform, setZoomTransform] = useState<ZoomTransform>(zoomIdentity);
  
  // Unauthenticated view state
  const [authView, setAuthView] = useState<'landing' | 'login'>('landing');

  // Derived state to determine if user is in an interactive review session
  const isReviewModeActive = useMemo(() => glowingNodes.length > 0, [glowingNodes]);
  
  const handleToggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  const handleZoomIn = () => mindMapRef.current?.zoomIn();
  const handleZoomOut = () => mindMapRef.current?.zoomOut();
  const handleZoomToFit = () => mindMapRef.current?.zoomToFit();

  const handleDeleteNode = useCallback((nodeIdToDelete: string) => {
    if (activeChapter) {
        const parent = findParentNode(activeChapter.root, nodeIdToDelete);
        dataActions.deleteNode(nodeIdToDelete);
        setSelectedNodeIdsInternal(prev => {
            const newSet = new Set(prev);
            newSet.delete(nodeIdToDelete);
            if (newSet.size === 0 && parent) {
                newSet.add(parent.id);
            } else if (newSet.size === 0) {
                newSet.add(activeChapter.root.id);
            }
            return newSet;
        });
    }
  }, [dataActions, activeChapter]);
  
  const lastSelectedNodeId = useMemo(() => {
    if (selectedNodeIds.size === 0) return null;
    return Array.from(selectedNodeIds).pop()!;
  }, [selectedNodeIds]);

  // --- Voice Assistant Integration ---
  const voiceAssistantActions = useMemo(() => ({
    setSelectedNodeIds: setSelectedNodeIdsInternal,
    setFocusedNodeId,
    addChildNode: dataActions.addChildNode,
    addNodeWithChildren,
    updateNodeText: dataActions.updateNodeText,
    deleteNode: handleDeleteNode,
    zoomIn: handleZoomIn,
    zoomOut: handleZoomOut,
    zoomToFit: handleZoomToFit,
    findNode: dataActions.findNode,
  }), [dataActions, handleDeleteNode, addNodeWithChildren]);

  const overallMastery = useMemo(() => {
    if (chapters.length === 0) return 0;
    return calculateOverallMastery(chapters);
  }, [chapters]);

  const chapterMasteryScores = useMemo(() => {
    const scores = new Map<string, number>();
    if (chapters.length === 0) return scores;
    chapters.forEach(chapter => {
        scores.set(chapter.id, calculateChapterMastery(chapter));
    });
    return scores;
  }, [chapters]);

  const masteryLevel = useMemo(() => {
    if (overallMastery < 0.4) return 'beginner';
    if (overallMastery < 0.8) return 'intermediate';
    return 'expert';
  }, [overallMastery]);

  const currentStudyPath = useMemo(() => {
      if (guidedReviewPath.length > 0) {
          return guidedReviewPath.map(node => node.nodeId);
      }
      return null;
  }, [guidedReviewPath]);

  const {
    voiceStatus,
    voiceTranscript,
    handleToggleVoiceAssistant,
    isVoiceAssistantEnabled,
  } = useVoiceAssistant({
    activeChapter,
    selectedNodeIds,
    lastSelectedNodeId,
    actions: voiceAssistantActions,
    masteryScore: overallMastery,
    masteryLevel,
    currentStudyPath,
  });


  const handleToolChange = (mode: ToolMode) => {
    setToolMode(mode);
    // Show a one-time tip for touch users when they first enter select mode.
    if (mode === 'select' && ('ontouchstart' in window) && !localStorage.getItem('mindmaster-touch-select-tip-shown')) {
      setShowTouchSelectTip(true);
    }
  };

  const dismissTouchSelectTip = () => {
    setShowTouchSelectTip(false);
    localStorage.setItem('mindmaster-touch-select-tip-shown', 'true');
  };

  const dismissGuidedReviewNudge = useCallback(() => {
      setShowGuidedReviewNudge(false);
  }, []);

  const setSelectedNodeIds = useCallback((ids: Set<string> | ((current: Set<string>) => Set<string>)) => {
    dismissGuidedReviewNudge();
    setSelectedNodeIdsInternal(ids);
  }, [dismissGuidedReviewNudge]);

    // --- DERIVED STATE & MEMOIZATION FOR NAVIGATION ---
  const focusPath = useMemo(() => {
    if (!focusedNodeId || !activeChapter) return activeChapter ? [activeChapter.root] : [];
    return findNodePathObjects(activeChapter.root, focusedNodeId);
  }, [activeChapter, focusedNodeId]);

  const displayRootForNav = useMemo(() => {
    if (!focusedNodeId || !activeChapter) return activeChapter?.root;
    return findNodeById(activeChapter.root, focusedNodeId) || activeChapter.root;
  }, [activeChapter, focusedNodeId]);

  const focusedNodeIdSet = useMemo(() => {
    if (!focusedNodeId || !activeChapter) return null;
    
    const pathObjects = findNodePathObjects(activeChapter.root, focusedNodeId);
    if (pathObjects.length === 0) return null; // Node not found
    
    const focusedNode = pathObjects[pathObjects.length - 1];
    const ids = new Set(pathObjects.map(n => n.id)); // Add ancestors + self
    
    dataActions.getAllDescendantIds(focusedNode).forEach(id => ids.add(id)); // Add descendants
    return ids;
  }, [focusedNodeId, activeChapter, dataActions]);

  const branchMasteryScores = useMemo(() => {
    if (!activeChapter) return new Map<string, number>();

    const scores = new Map<string, number>();
    const allNodesInChapter = getAllNodes(activeChapter.root);

    const calculateBranchMastery = (startNode: MindMapNode): number => {
        const branchNodes = getAllNodes(startNode);
        if (branchNodes.length === 0) return 0;
        const totalScore = branchNodes.reduce((sum, node) => sum + (node.masteryScore || 0), 0);
        return totalScore / branchNodes.length;
    };

    allNodesInChapter.forEach(node => {
        scores.set(node.id, calculateBranchMastery(node));
    });

    return scores;
  }, [activeChapter]);


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
            if (subjects.length === 0) {
                setIsWelcomeModalOpen(true);
            }
        }
    }
  }, [currentUser, authLoading, dataLoading, subjects.length]);
  
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

  const addSubject = useCallback(async () => {
    const newDocId = await originalAddSubject();
    if (newDocId) {
        setEditingSubjectId(newDocId); // Set new subject to be editable
        if (tutorialStep === 'add-subject') {
            advanceTutorial('add-subject');
        }
    }
  }, [originalAddSubject, tutorialStep]);

  const handleOpenAiAssistant = () => {
    setIsAiAssistantOpen(true);
    if (tutorialStep === 'open-ai-assistant') {
        advanceTutorial('open-ai-assistant');
    }
  };

  const handleTransformChange = useCallback((newTransform: ZoomTransform) => {
      dismissGuidedReviewNudge();
      setZoomTransform(newTransform);
  }, [dismissGuidedReviewNudge]);

  const trackUserAction = useCallback((action: LearningActionType) => {
    if (!activeSubject || !updateLearningProfile) return;

    const currentProfile = activeSubject.learningProfile || {
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
  }, [activeSubject, updateLearningProfile]);

  // This effect resets state ONLY when switching to a new subject/document.
  useEffect(() => {
    setSelectedNodeIds(activeChapter ? new Set([activeChapter.root.id]) : new Set());
    setFocusedNodeId(null);
    setIsAiAssistantOpen(false);
    setChatHistory([]);
    setGlowingNodes([]); // Clear glowing nodes when switching subjects
    setAiNudge(null); // Clear any nudge when switching subjects
    setIsFindInMapOpen(false); // Close find on document switch
    setActiveHotspotNodeId(null); // Close hotspot
    setContextMenu(null); // Close context menu
  }, [activeSubject?.id, activeChapter?.id]); // Depend on the ID, not the object reference.

  useEffect(() => {
    setChatHistory([]);
    // Don't clear nudge when just selecting a new node.
  }, [lastSelectedNodeId]);

  const selectedNodesData = useMemo(() => {
    if (selectedNodeIds.size === 0 || !activeChapter) return [];
    return Array.from(selectedNodeIds).map(id => dataActions.findNode(id)).filter(Boolean) as MindMapNode[];
  }, [selectedNodeIds, activeChapter, dataActions]);

  const customPrompts = activeSubject?.learningProfile?.customPrompts || ["Explain this topic", "Summarize key points", "Give an example"];
  
  const handleCloseFindInMap = useCallback(() => {
    setIsFindInMapOpen(false);
    setSearchQuery('');
  }, []);

  const handleDeleteSelectedNodes = useCallback((nodeIdsToDelete: Set<string>) => {
    if (nodeIdsToDelete.size > 0) {
        // Prevent deleting the root node.
        const ids = new Set(nodeIdsToDelete);
        if (activeChapter) {
            ids.delete(activeChapter.root.id);
        }
        if (ids.size > 0) {
            deleteMultipleNodes(ids);
            setSelectedNodeIds(new Set<string>()); // Clear selection after deletion
        }
    }
  }, [deleteMultipleNodes, setSelectedNodeIds, activeChapter]);

  useEffect(() => {
    if (lastAction?.type === 'ADD_CHILD' && activeChapter) {
      const parentNode = dataActions.findNode(lastAction.parentId);
      if (parentNode?.children?.length) {
        const newNode = parentNode.children[parentNode.children.length - 1];
        setSelectedNodeIds(new Set([newNode.id]));
        setNodeToEditOnRender(newNode.id);
      }
      setLastAction(null);
    }
  }, [activeChapter, lastAction, dataActions, setSelectedNodeIds]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // General app-level shortcuts that should work anywhere
      if (event.key === 'Escape') {
        setViewingImage(null);
        setFocusedNodeId(null);
        setActiveHotspotNodeId(null);
        setContextMenu(null);
        if (isFindInMapOpen) {
            handleCloseFindInMap();
        }
        if (examState.view === 'active' && !window.confirm("Are you sure you want to exit the exam? Your progress will be lost.")) {
          // Do nothing
        } else if (examState.view !== 'closed') {
           dispatchExam({ type: 'CLOSE' });
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

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedNodeIds.size > 0) {
          event.preventDefault(); // Prevent browser back navigation on Backspace
          handleDeleteSelectedNodes(selectedNodeIds);
      }

      if (event.key.toLowerCase() === 'v') setToolMode('pan');
      if (event.key === 'Control') {
          if (toolMode !== 'select') handleToolChange('select');
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

      // Edit on Enter or F2
      if ((event.key === 'Enter' || event.key === 'F2') && selectedNodeIds.size === 1) {
          event.preventDefault();
          setNodeToEditOnRender(lastSelectedNodeId);
      }
    };
    
    const handleKeyUp = (event: KeyboardEvent) => {
        if (event.key === 'Control') {
            if (toolMode !== 'pan') handleToolChange('pan');
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, [examState.view, studySprintState.view, dataActions, lastSelectedNodeId, selectedNodeIds, toolMode, isFindInMapOpen, handleCloseFindInMap, handleDeleteSelectedNodes]);

  // Search Logic Effects
  useEffect(() => {
    if (!searchQuery || !activeSubject) {
        setSearchResults([]);
        return;
    }

    let results: SearchResult[] = [];
    if (searchScope === 'chapter' && activeChapter) {
        const allNodes = getAllNodes(activeChapter.root);
        results = allNodes
            .filter(node => node.text.toLowerCase().includes(searchQuery.toLowerCase()))
            .map(node => ({
                nodeId: node.id,
                chapterId: activeChapter.id,
                chapterName: activeChapter.name,
                nodeText: node.text
            }));
    } else if (searchScope === 'subject') {
        chapters.forEach(chapter => {
            const allNodes = getAllNodes(chapter.root);
            const chapterResults = allNodes
                .filter(node => node.text.toLowerCase().includes(searchQuery.toLowerCase()))
                .map(node => ({
                    nodeId: node.id,
                    chapterId: chapter.id,
                    chapterName: chapter.name,
                    nodeText: node.text
                }));
            results.push(...chapterResults);
        });
    }
    
    setSearchResults(results);
    setCurrentSearchResultIndex(0);
  }, [searchQuery, searchScope, activeChapter, chapters, activeSubject]);

  // Effect to handle centering after a potential chapter switch from search
  useEffect(() => {
    if (nodeToCenterAfterChapterSwitch && activeChapter?.id) {
        // Ensure the active chapter is the one we intended to switch to
        const targetChapterForNode = chapters.find(c => findNodeRecursive(nodeToCenterAfterChapterSwitch, c.root));
        if (targetChapterForNode && targetChapterForNode.id === activeChapter.id) {
            setNodeToCenterOn(nodeToCenterAfterChapterSwitch);
            setNodeToCenterAfterChapterSwitch(null);
        }
    }
  }, [activeChapter, nodeToCenterAfterChapterSwitch, chapters]);

  const handleNavigateToSearchResult = useCallback((index: number) => {
    if (searchResults.length === 0) return;
    const result = searchResults[index];
    setCurrentSearchResultIndex(index);
    
    if (result.chapterId !== activeChapter?.id) {
        setNodeToCenterAfterChapterSwitch(result.nodeId);
        switchActiveChapter(result.chapterId);
    } else {
        setNodeToCenterOn(result.nodeId);
    }
  }, [searchResults, activeChapter, switchActiveChapter]);

  const handleNextSearchResult = () => {
    if (searchResults.length > 0) {
      const nextIndex = (currentSearchResultIndex + 1) % searchResults.length;
      handleNavigateToSearchResult(nextIndex);
    }
  };

  const handlePreviousSearchResult = () => {
    if (searchResults.length > 0) {
      const prevIndex = (currentSearchResultIndex - 1 + searchResults.length) % searchResults.length;
      handleNavigateToSearchResult(prevIndex);
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

  const handleSetMultipleNodesColor = useCallback((nodeIds: Set<string>, color: string) => {
    updateMultipleNodesColor(nodeIds, color);
  }, [updateMultipleNodesColor]);

  // --- Advanced Selection Handlers ---
  const handleSelectBranch = useCallback((nodeId: string) => {
    if (!activeChapter) return;
    const node = dataActions.findNode(nodeId);
    if (!node) return;

    const branchIds = new Set([nodeId, ...dataActions.getAllDescendantIds(node)]);
    setSelectedNodeIds(branchIds);
  }, [activeChapter, dataActions, setSelectedNodeIds]);

  const handleSelectChildren = useCallback((nodeId: string) => {
    if (!activeChapter) return;
    const node = dataActions.findNode(nodeId);
    if (!node || !node.children || node.children.length === 0) return;

    const childrenIds = new Set(node.children.map(c => c.id));
    setSelectedNodeIds(childrenIds);
  }, [activeChapter, dataActions, setSelectedNodeIds]);

  const handleSelectSiblings = useCallback((nodeId: string) => {
    if (!activeChapter) return;
    const parent = findParentNodeFromHook(nodeId);
    if (!parent || !parent.children) return;

    const siblingIds = new Set(parent.children.map(c => c.id));
    setSelectedNodeIds(siblingIds);
  }, [activeChapter, findParentNodeFromHook, setSelectedNodeIds]);


  const handleGenerateIdeas = useCallback(async (nodeId: string) => {
    const node = dataActions.findNode(nodeId);
    if (!node || !activeSubject || !activeChapter) return;
    trackUserAction('GENERATE_IDEAS');
    setGeneratingIdeasForNodeId(nodeId);
    try {
        const mindMapContext = `The entire mind map is structured as follows:\n${getAllNodes(activeChapter.root).map(n => `- ${n.text}`).join('\n')}`;

        const documentsContext = activeSubject.sourceDocuments.filter(d => d.status === 'ready').map(d => `Document: ${d.name}`).join('\n\n');

        const ideas = await generateIdeasForNode(
            node.text,
            mindMapContext,
            documentsContext,
            activeSubject.learningProfile
        );

        if (ideas && ideas.length > 0) {
            dataActions.addMultipleChildrenNode(nodeId, ideas);
        } else {
            alert("The AI couldn't generate new ideas for this topic.");
        }
    } catch (error) {
        console.error("Failed to generate AI ideas:", error);
        alert(`Error: ${(error as Error).message}`);
    } finally {
        setGeneratingIdeasForNodeId(null);
    }
  }, [dataActions, activeSubject, activeChapter, trackUserAction]);

  const handleRephraseNode = useCallback(async (nodeId: string) => {
      const node = dataActions.findNode(nodeId);
      if (!node || !activeChapter || node.id === activeChapter.root.id) return;
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
  }, [dataActions, activeChapter]);
  
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
    if (!node || !activeSubject || (activeChapter && node.id === activeChapter.root.id)) return;
    trackUserAction('GENERATE_ANALOGY');
    setGeneratingAnalogyNodeId(nodeId);
    try {
        const analogy = await generateAnalogy(node.text, activeSubject.learningProfile);
        dataActions.addChildNode(nodeId, analogy);
    } catch (error) {
        console.error("Failed to generate analogy:", error);
        alert(`Error: ${(error as Error).message}`);
    } finally {
        setGeneratingAnalogyNodeId(null);
    }
  }, [dataActions, activeSubject, activeChapter, trackUserAction]);

  const handleAiChatSubmit = useCallback(async (question: string) => {
      if (selectedNodesData.length === 0 || !activeChapter || !activeSubject) return;
      trackUserAction('ASK_DIRECT_QUESTION');
      const userMessage: ChatMessage = { role: 'user', text: question, id: uuidv4() };
      setChatHistory(prev => [...prev, userMessage]);
      setIsAiReplying(true);
      try {
          const context: NodeContext = {
            path: [],
            currentNodeText: '',
            childrenTexts: [],
          };
          
          if (selectedNodesData.length === 1) {
              const node = selectedNodesData[0]
              context.path = findNodePath(activeChapter.root, node.id);
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

          const answer = await askChatQuestion(context, question, activeSubject.learningProfile);
          const modelMessage: ChatMessage = { role: 'model', text: answer, id: uuidv4() };
          setChatHistory(prev => [...prev, modelMessage]);

      } catch (error) {
          console.error("AI chat error:", error);
          const errorMessage: ChatMessage = { role: 'model', text: `Sorry, I ran into an error: ${(error as Error).message}`, id: uuidv4() };
          setChatHistory(prev => [...prev, errorMessage]);
      } finally {
          setIsAiReplying(false);
      }
  }, [selectedNodesData, activeChapter, activeSubject, trackUserAction]);

  const handleGenerateNodesFromText = useCallback(async (messageText: string, messageId: string) => {
    if (!activeChapter) return;
    
    // Determine parent node: selected node or root
    const parentId = lastSelectedNodeId || activeChapter.root.id;
    
    setGeneratingNodesFromChat(messageId);
    try {
        const ideas = await generateNodesFromText(messageText);
        if (ideas && ideas.length > 0) {
            dataActions.addMultipleChildrenNode(parentId, ideas);
        } else {
            alert("The AI couldn't extract distinct points to create nodes from this text.");
        }
    } catch (error) {
        console.error("Failed to generate nodes from text:", error);
        alert(`Error: ${(error as Error).message}`);
    } finally {
        setGeneratingNodesFromChat(null);
    }
  }, [activeChapter, lastSelectedNodeId, dataActions]);


  const handleSetNodeImage = useCallback(async (nodeId: string, file: File) => {
    if (!currentUser || !activeSubject) return;
    trackUserAction('ADD_IMAGE');
    const filePath = `users/${currentUser.uid}/${activeSubject.id}/nodeImages/${nodeId}-${file.name}`;
    const fileRef = storage.ref(filePath);
    try {
        const snapshot = await fileRef.put(file);
        const downloadURL = await snapshot.ref.getDownloadURL();
        setNodeImage(nodeId, { downloadURL, storagePath: filePath });
    } catch (error) {
        console.error("Error uploading node image:", error);
        alert(`Image upload failed: ${(error as Error).message}`);
    }
  }, [setNodeImage, currentUser, activeSubject, trackUserAction]);

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
      if (activeChapter) {
          const parent = findParentNodeFromHook(childId);
          if (parent) {
              const newParentId = insertNodeBetween(parent.id, childId);
              if (newParentId) {
                  setNodeToEditOnRender(newParentId);
                  setSelectedNodeIds(new Set([newParentId]));
              }
          }
      }
  }, [activeChapter, findParentNodeFromHook, insertNodeBetween, setSelectedNodeIds]);

  const handleInitiateBranchExam = useCallback((nodeId: string) => {
      const node = dataActions.findNode(nodeId);
      if (node) {
          dispatchExam({ type: 'START_BRANCH_EXAM', payload: { nodeId, nodeText: node.text } });
      }
  }, [dataActions]);

  const handleStartExam = useCallback(async (config: ExamConfig) => {
      if (!activeSubject) return;
      dispatchExam({ type: 'START_GENERATION', payload: config });

      try {
          let nodesForExam: MindMapNode[] = [];
          let mindMapContext = '';
          const buildContext = (node: MindMapNode, depth = 0): string => {
              let str = `${'  '.repeat(depth)}- ${node.text}\n`;
              if (node.children) {
                  str += node.children.map(child => buildContext(child, depth + 1)).join('');
              }
              return str;
          };

          if (examState.branchConfig && activeChapter) {
              nodesForExam = getBranchNodes(activeChapter.root, examState.branchConfig.nodeId);
              if (nodesForExam.length > 0) {
                   const rootNode = findNodeRecursive(examState.branchConfig.nodeId, activeChapter.root);
                   if (rootNode) mindMapContext = `Branch: ${rootNode.text}\n${buildContext(rootNode)}`;
              }
          } else if (examState.scope === 'chapter' && activeChapter) {
              nodesForExam = getAllNodes(activeChapter.root);
              mindMapContext = `Chapter: ${activeChapter.name}\n${buildContext(activeChapter.root)}`;
          } else if (examState.scope === 'subject') {
              nodesForExam = chapters.flatMap(c => getAllNodes(c.root));
              mindMapContext = chapters.map(c => `Chapter: ${c.name}\n${buildContext(c.root)}`).join('\n\n');
          }
          
          if (nodesForExam.length === 0) throw new Error("Could not find any nodes for this exam scope.");
          
          const progressCallback = (progress: number, message: string) => dispatchExam({ type: 'SET_PROGRESS', payload: { progress, message } });

          let documentsContent = '';
          if (activeSubject.sourceDocuments.length > 0) {
              const readyDocs = activeSubject.sourceDocuments.filter(d => d.status === 'ready');
              for (const doc of readyDocs) {
                  try {
                      progressCallback(0.1, `Analyzing document: ${doc.name}...`);
                      const text = await processDocument(doc);
                      documentsContent += `--- Document Content: ${doc.name} ---\n${text}\n\n`;
                  } catch (e) {
                      console.error(`Failed to process document ${doc.name} for exam generation:`, e);
                  }
              }
          }

          const focusTopics = nodesForExam.filter(n => (n.masteryScore || 0) < 0.6).map(n => n.text);
          const reviewTopics = nodesForExam.filter(n => (n.masteryScore || 0) >= 0.6).map(n => n.text);

          if (focusTopics.length === 0 && reviewTopics.length > 0) {
              const topicsToMove = Math.max(1, Math.floor(reviewTopics.length * 0.25));
              for (let i = 0; i < topicsToMove; i++) {
                  focusTopics.push(reviewTopics.splice(Math.floor(Math.random() * reviewTopics.length), 1)[0]);
              }
          } else if (reviewTopics.length === 0 && focusTopics.length > 0) {
              const topicsToMove = Math.max(1, Math.floor(focusTopics.length * 0.25));
              for (let i = 0; i < topicsToMove; i++) {
                  reviewTopics.push(focusTopics.splice(Math.floor(Math.random() * focusTopics.length), 1)[0]);
              }
          }

          const prioritizedTopics = { focus: focusTopics, review: reviewTopics };
          
          const generatedQuestions = await generateExamQuestions(config, prioritizedTopics, mindMapContext, documentsContent, progressCallback);

          const questionToNodeIdMap = new Map<string, string>();
          const questionsWithIds: Question[] = generatedQuestions.map(q => {
              const id = uuidv4();
              const relatedNode = nodesForExam.find(n => n.text === q.relatedNodeTopicText);
              if (relatedNode) questionToNodeIdMap.set(id, relatedNode.id);
              return { ...q, id };
          });
          
          dispatchExam({ type: 'GENERATION_SUCCESS', payload: { questions: questionsWithIds, questionToNodeIdMap } });
      } catch (error) {
          console.error("Failed to generate exam:", error);
          dispatchExam({ type: 'FAIL_AND_CLOSE' });
      }
  }, [activeChapter, activeSubject, chapters, examState.branchConfig, examState.scope]);

  const handleSubmitExam = useCallback(async (answers: Map<string, string>, revealedHints: Set<string>) => {
    if (!activeSubject || examState.questions.length === 0) return;
    dispatchExam({ type: 'SUBMIT', payload: { revealedHints } });

    try {
        const onProgressCallback = (gradedAnswer: GradedAnswer) => dispatchExam({ type: 'ADD_GRADED_ANSWER', payload: { gradedAnswer } });
        await gradeAndAnalyzeExam(examState.questions, answers, onProgressCallback);
        dispatchExam({ type: 'GRADING_COMPLETE' });

    } catch (error) {
        console.error("Failed to grade exam:", error);
        dispatchExam({ type: 'REVERT_TO_ACTIVE' });
    }
  }, [examState.questions, activeSubject]);
  
  useEffect(() => {
    if (examState.view === 'results' && examState.results) {
        const masteryUpdates = new Map<string, number>();
        examState.results.analysis.forEach(res => {
            const question = examState.questions.find(q => q.questionText === res.questionText);
            if (!question) return;
            const nodeId = examState.questionToNodeIdMap.get(question.id);
            if (!nodeId) return;
            const node = dataActions.findNode(nodeId);
            if (!node) return;

            const oldScore = node.masteryScore || 0;
            const scoreChange = res.isCorrect ? (examState.revealedHints.has(question.id) ? 0.05 : 0.2) : -0.15;
            masteryUpdates.set(nodeId, Math.max(0, Math.min(1, oldScore + scoreChange)));
        });
        dataActions.updateMultipleNodesMastery(masteryUpdates);

        const incorrectCounts = new Map<string, number>();
        examState.results.analysis.forEach(res => {
            if (!res.isCorrect) {
                const q = examState.questions.find(q => q.questionText === res.questionText);
                if (q) {
                    const nodeId = examState.questionToNodeIdMap.get(q.id);
                    if (nodeId) incorrectCounts.set(nodeId, (incorrectCounts.get(nodeId) || 0) + 1);
                }
            }
        });

        const newGlowingNodes: GlowNode[] = Array.from(incorrectCounts.entries()).map(([nodeId, count]) => ({ nodeId, severity: count > 1 ? 'high' : 'low' }));
        setGlowingNodes(newGlowingNodes);
        if (newGlowingNodes.length > 0) setShowGuidedReviewNudge(true);
    }
  }, [examState.view, examState.results, examState.questions, examState.questionToNodeIdMap, examState.revealedHints, dataActions]);
  
  const handleStartStudySprint = useCallback(async (duration: number) => {
    if (!activeSubject || chapters.length === 0) return;
    setStudySprintState({ view: 'loading', sprint: null, isLoading: true });
    
    try {
        const allNodes = chapters.flatMap(c => getAllNodes(c.root));
        const weakestNodes = allNodes.filter(n => (n.masteryScore || 0) < 0.5).sort((a,b) => (a.masteryScore || 0) - (b.masteryScore || 0));
        const weakestTopics = weakestNodes.slice(0, 5).map(n => n.text);

        const mindMapContext = allNodes.map(n => `- ${n.text} (Mastery: ${Math.round((n.masteryScore || 0) * 100)}%)`).join('\n');
        const documentsContext = activeSubject.sourceDocuments.map(d => `Document: ${d.name}`).join('\n');

        const sprint = await generateStudySprint(duration, weakestTopics, mindMapContext, documentsContext);
        setStudySprintState({ view: 'active', sprint, isLoading: false });
    } catch (error) {
        console.error("Failed to generate study sprint:", error);
        alert(`Could not create study sprint: ${(error as Error).message}`);
        setStudySprintState({ view: 'closed', sprint: null, isLoading: false });
    }
  }, [activeSubject, chapters]);
  
    const handleFileUpload = useCallback(async (file: File) => {
    if (!currentUser || !activeSubject) return;
    
    if (file.size > 10 * 1024 * 1024) { // 10 MB limit
        alert("File size exceeds 10 MB limit.");
        return;
    }
    if (!['application/pdf', 'text/plain'].includes(file.type)) {
        alert("Invalid file type. Please upload a PDF or TXT file.");
        return;
    }

    const fileId = uuidv4();
    const filePath = `users/${currentUser.uid}/${activeSubject.id}/sourceDocuments/${fileId}-${file.name}`;
    const fileRef = storage.ref(filePath);

    const placeholderDoc: SourceDocumentFile = { id: fileId, name: file.name, storagePath: filePath, downloadURL: '', mimeType: file.type, status: 'uploading' };
    addSourceDocument(placeholderDoc);

    try {
        const snapshot = await fileRef.put(file);
        const downloadURL = await snapshot.ref.getDownloadURL();
        updateSourceDocument(fileId, { downloadURL, status: 'processing' });
        
        if (tutorialStep === 'upload-file') advanceTutorial('upload-file');

        await processDocument({ downloadURL, mimeType: file.type });
        updateSourceDocument(fileId, { status: 'ready' });

    } catch (error) {
        console.error("Error during file upload and processing:", error);
        updateSourceDocument(fileId, { status: 'error', errorMessage: (error as Error).message });
    }
  }, [currentUser, activeSubject, addSourceDocument, updateSourceDocument, tutorialStep]);

  const handleDeleteFile = useCallback(async (fileId: string) => {
    if (!activeSubject) return;
    const fileToDelete = activeSubject.sourceDocuments.find(f => f.id === fileId);
    if (!fileToDelete) return;
    
    deleteSourceDocument(fileId); 

    try {
        await storage.ref(fileToDelete.storagePath).delete();
    } catch (error) {
        console.error("Failed to delete file from storage:", error);
    }
  }, [activeSubject, deleteSourceDocument]);

  const handleGenerateEnhancedMindMap = useCallback(async (fileId: string) => {
    if (!activeSubject || !lastSelectedNodeId) return;

    const file = activeSubject.sourceDocuments.find(doc => doc.id === fileId);
    const contextNode = dataActions.findNode(lastSelectedNodeId);

    if (!file || file.status !== 'ready' || !contextNode) {
        alert("Please select a ready document and a node to attach the map to.");
        return;
    }

    setGeneratingNodesFromFileId(fileId);
    trackUserAction('GENERATE_FROM_FILE');

    try {
        const extractedText = await processDocument(file);
        const base64Data = await fileUrlToBase64(file.downloadURL);
        const newNodes = await generateEnhancedMindMapFromFile(extractedText, base64Data, file.mimeType, contextNode.text);

        if (newNodes && newNodes.length > 0) {
            newNodes.forEach(nodeData => addNodeWithChildren(lastSelectedNodeId, nodeData));
             if (tutorialStep === 'generate-nodes') advanceTutorial('generate-nodes');
        } else {
            alert("The AI couldn't generate a mind map from this document.");
        }
    } catch (error) {
        console.error("Error generating enhanced mind map:", error);
        alert(`An error occurred: ${(error as Error).message}`);
    } finally {
        setGeneratingNodesFromFileId(null);
    }
}, [activeSubject, lastSelectedNodeId, dataActions, trackUserAction, tutorialStep, addNodeWithChildren]);
  
  // --- Topic Hotspot & Review Mode Logic ---
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
    dispatchExam({ type: 'FINISH_REVIEW_SESSION' });
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
        if (isInGuidedReview) handleEndGuidedReview();
    }, [isInGuidedReview, handleEndGuidedReview]);

    const handleMarkAsReviewed = useCallback((nodeId: string) => {
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
        if (nextIndex >= guidedReviewPath.length) handleEndGuidedReview();
        else {
            setGuidedReviewIndex(nextIndex);
            const nextNode = guidedReviewPath[nextIndex];
            setNodeToCenterOn(nextNode.nodeId);
            setSelectedNodeIds(new Set([nextNode.nodeId]));
        }
    }, [guidedReviewPath, guidedReviewIndex, handleEndGuidedReview, setSelectedNodeIds]);

    const handleStartGuidedReview = useCallback(() => {
        if (glowingNodes.length === 0) return;
        setShowGuidedReviewNudge(false);
        const sortedNodes = [...glowingNodes].sort((a, b) => (a.severity === 'high' && b.severity === 'low') ? -1 : (a.severity === 'low' && b.severity === 'high') ? 1 : 0);
        setGuidedReviewPath(sortedNodes);
        setGuidedReviewIndex(0);
        setIsInGuidedReview(true);
        const firstNode = sortedNodes[0];
        setNodeToCenterOn(firstNode.nodeId);
        setSelectedNodeIds(new Set([firstNode.nodeId]));
    }, [glowingNodes, setSelectedNodeIds]);

    const hotspotData: HotspotData = useMemo(() => {
        if (!activeHotspotNodeId || !examState.results) return null;
        const node = dataActions.findNode(activeHotspotNodeId);
        if (!node) return null;

        const incorrectQuestions = examState.results.analysis.filter(res => {
            if (res.isCorrect) return false;
            const q = examState.questions.find(q => q.questionText === res.questionText);
            return q && examState.questionToNodeIdMap.get(q.id) === activeHotspotNodeId;
        });

        return { node, incorrectQuestions, content: hotspotContent };
    }, [activeHotspotNodeId, examState, dataActions, hotspotContent]);

    // --- Feedback Logic ---
    const handleFeedbackSubmit = async (category: FeedbackCategory, summary: string, description: string, screenshotBlob: Blob | null) => {
        if (!currentUser) return;
        let screenshotUrl = '', storagePath = '';
        if (screenshotBlob) {
            const feedbackId = uuidv4();
            storagePath = `feedback/${feedbackId}/screenshot.png`;
            const fileRef = storage.ref(storagePath);
            const snapshot = await fileRef.put(screenshotBlob);
            screenshotUrl = await snapshot.ref.getDownloadURL();
        }
        await db.collection('feedback').add({
            userId: currentUser.uid, category, summary, description, screenshotUrl, storagePath,
            timestamp: new Date().toISOString(),
            clientInfo: { userAgent: navigator.userAgent, platform: navigator.platform, screenWidth: window.screen.width, screenHeight: window.screen.height },
            status: 'new',
        });
    };

  if (authLoading) return <Spinner fullScreen />;
  if (!currentUser) {
    switch (authView) {
        case 'login': return <Auth onGoToLanding={() => setAuthView('landing')} />;
        default: return <LandingPage onGoToLogin={() => setAuthView('login')} />;
    }
  }
  if (currentUser.uid === SUPER_ADMIN_UID) {
    return (
      <Suspense fallback={<Spinner fullScreen />}>
        <div className={`w-screen h-screen overflow-hidden font-sans ${theme}`}>
          <AdminPanel user={currentUser} theme={theme} onToggleTheme={handleToggleTheme} />
        </div>
      </Suspense>
    );
  }
  if (dataLoading) return <Spinner fullScreen />;

  return (
    <div className={`w-screen h-screen overflow-hidden flex flex-col font-sans ${theme}`}>
      <SubjectTabs
        documents={subjects}
        activeDocumentId={activeSubject?.id ?? null}
        user={currentUser}
        editingSubjectId={editingSubjectId}
        onSwitch={switchActiveSubject}
        onAdd={addSubject}
        onDelete={deleteSubject}
        onRename={updateSubjectName}
        onStartEdit={setEditingSubjectId}
        onEndEdit={() => setEditingSubjectId(null)}
        onRestartTutorial={restartTutorial}
      />
      <main className="flex-1 relative bg-slate-100 dark:bg-slate-900 flex flex-col">
        {activeSubject && (
            <ChapterSidebar
                chapters={chapters}
                activeChapterId={activeChapter?.id ?? null}
                chapterMasteryScores={chapterMasteryScores}
                onSwitchChapter={switchActiveChapter}
                onAddChapter={addChapter}
                onDeleteChapter={deleteChapter}
                onRenameChapter={renameChapter}
            />
        )}
        <div className="flex-1 relative">
            {!isMobile && activeChapter && displayRootForNav && (
              <Suspense fallback={null}>
                <NavigationPanel
                  path={focusPath}
                  displayRoot={displayRootForNav}
                  onNavigate={setFocusedNodeId}
                  branchMasteryScores={branchMasteryScores}
                />
              </Suspense>
            )}
            {!isMobile && (
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
                onToolChange={handleToolChange}
                selectedNodeCount={selectedNodeIds.size}
                onDeleteSelected={() => handleDeleteSelectedNodes(selectedNodeIds)}
                onSetSelectedColor={(color) => handleSetMultipleNodesColor(selectedNodeIds, color)}
                isFindInMapOpen={isFindInMapOpen}
                onToggleFindInMap={() => setIsFindInMapOpen(prev => !prev)}
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                searchScope={searchScope}
                onSearchScopeChange={setSearchScope}
                searchResults={searchResults}
                currentSearchResultIndex={currentSearchResultIndex}
                onNextSearchResult={handleNextSearchResult}
                onPreviousSearchResult={handlePreviousSearchResult}
                onCloseFindInMap={handleCloseFindInMap}
                isReviewModeActive={isReviewModeActive}
                onFinishReview={handleFinishReview}
                voiceStatus={voiceStatus}
                onToggleVoiceAssistant={handleToggleVoiceAssistant}
                isVoiceAssistantEnabled={isVoiceAssistantEnabled}
              />
            )}
            
            {!isMobile && activeSubject && (
                <SubjectMasteryDisplay
                    score={overallMastery}
                    onStartStudySprint={() => setStudySprintState(prev => ({...prev, view: 'config'}))}
                    onStartExam={() => dispatchExam({ type: 'OPEN_SCOPE_MODAL' })}
                />
            )}

            {isMobile && (
              <MobileToolbar
                onUndo={dataActions.undo}
                onRedo={dataActions.redo}
                canUndo={dataActions.canUndo}
                canRedo={dataActions.canRedo}
                masteryScore={overallMastery}
                onStartExam={() => dispatchExam({ type: 'OPEN_SCOPE_MODAL' })}
                onStartStudySprint={() => setStudySprintState(prev => ({...prev, view: 'config'}))}
                theme={theme}
                onToggleTheme={handleToggleTheme}
                toolMode={toolMode}
                onToolChange={handleToolChange}
                onOpenAiAssistant={handleOpenAiAssistant}
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                onZoomToFit={handleZoomToFit}
                onSendFeedback={() => setIsFeedbackModalOpen(true)}
              />
            )}
            
            {!isMobile && (
              <Suspense fallback={null}>
                <ThemeToggle theme={theme} onToggle={handleToggleTheme} />
              </Suspense>
            )}
            
            {activeChapter ? (
              <>
                <MindMap
                  ref={mindMapRef}
                  key={activeChapter.id}
                  chapterRoot={activeChapter.root}
                  links={activeChapter.links}
                  toolMode={toolMode}
                  isReviewModeActive={isReviewModeActive}
                  selectedNodeIds={selectedNodeIds}
                  focusedNodeId={focusedNodeId}
                  focusedNodeIdSet={focusedNodeIdSet}
                  nodeToEditOnRender={nodeToEditOnRender}
                  generatingIdeasForNodeId={generatingIdeasForNodeId}
                  rephrasingNodeId={rephrasingNodeId}
                  extractingConceptsNodeId={extractingConceptsNodeId}
                  generatingAnalogyNodeId={generatingAnalogyNodeId}
                  glowingNodes={glowingNodes}
                  searchResultIds={searchResults.map(r => r.nodeId)}
                  currentSearchResultId={searchResults[currentSearchResultIndex]?.nodeId ?? null}
                  nodeToCenterOn={nodeToCenterOn}
                  activeHotspotNodeId={activeHotspotNodeId}
                  hotspotData={hotspotData}
                  isInGuidedReview={isInGuidedReview}
                  contextMenu={contextMenu}
                  theme={theme}
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
                  onSelectBranch={handleSelectBranch}
                  onSelectChildren={handleSelectChildren}
                  onSelectSiblings={handleSelectSiblings}
                  onSetNodeColor={dataActions.updateNodeColor}
                  onEditComplete={() => setNodeToEditOnRender(null)}
                  onNodeDoubleClickEdit={setNodeToEditOnRender}
                  onAddLink={dataActions.addLink}
                  onUpdateLinkLabel={dataActions.updateLinkLabel}
                  onDeleteLink={dataActions.deleteLink}
                  onSetNodeImage={handleSetNodeImage}
                  onRemoveNodeImage={handleRemoveNodeImage}
                  onViewImage={setViewingImage}
                  onNodeDragStart={handleNodeDrag}
                  getAllDescendantIds={(node) => dataActions.getAllDescendantIds(node)}
                  onTransformChange={handleTransformChange}
                  onLayoutUpdate={persistLayoutPositions}
                  onSelectionEnd={(_event) => { if(toolMode === 'select') handleToolChange('pan'); }}
                  onCloseHotspot={handleCloseHotspot}
                  onMarkAsReviewed={handleMarkAsReviewed}
                  onHotspotExplain={handleHotspotExplain}
                  onHotspotQuiz={handleHotspotQuiz}
                  onAdvanceGuidedReview={handleAdvanceGuidedReview}
                  onHotspotBackToMain={handleHotspotBackToMain}
                  onContextMenuChange={setContextMenu}
                />
                <Suspense fallback={null}>
                    <AiAssistant
                        isOpen={isAiAssistantOpen}
                        onOpen={handleOpenAiAssistant}
                        onClose={() => setIsAiAssistantOpen(false)}
                        isMobile={isMobile}
                        selectedNodes={selectedNodesData}
                        chatHistory={chatHistory}
                        onChatSubmit={handleAiChatSubmit}
                        isAiReplying={isAiReplying}
                        aiNudge={aiNudge}
                        onNudgeDismiss={() => setAiNudge(null)}
                        sourceDocuments={activeSubject?.sourceDocuments || []}
                        onFileUpload={handleFileUpload}
                        onDeleteFile={handleDeleteFile}
                        onGenerateNodesFromFile={handleGenerateEnhancedMindMap}
                        generatingNodesFromFileId={generatingNodesFromFileId}
                        customPrompts={customPrompts}
                        onUpdateCustomPrompts={updateCustomPrompts}
                        onGenerateNodesFromText={handleGenerateNodesFromText}
                        generatingNodesFromChat={generatingNodesFromChat}
                    />
                </Suspense>
              </>
            ) : (
                subjects.length > 0 ? <MindMapShell /> : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-center p-4">
                      <div className="w-24 h-24 bg-slate-200 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6">
                          <i className="fa-solid fa-folder-plus text-4xl text-slate-400 dark:text-slate-500"></i>
                      </div>
                      <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Create Your First Subject</h2>
                      <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-md">Click the "+" button in the top left corner to start a new mind map and begin your learning journey.</p>
                  </div>
                )
            )}
        </div>
        <Suspense fallback={<ModalLoadingFallback />}>
            <AnimatePresence>
              {isWelcomeModalOpen && <WelcomeModal onStart={handleStartTutorial} />}
            </AnimatePresence>
            <ImageLightbox imageUrl={viewingImage} onClose={() => setViewingImage(null)} />
            <ExamScopeModal 
              isOpen={examState.view === 'scope'}
              onClose={() => dispatchExam({ type: 'CLOSE' })}
              onSelectScope={(scope) => dispatchExam({ type: 'SET_SCOPE_AND_OPEN_CONFIG', payload: scope })}
            />
            <ExamModal
                state={examState}
                branchExamConfig={examState.branchConfig}
                onStart={handleStartExam}
                onSubmit={handleSubmitExam}
                onClose={() => dispatchExam({ type: 'CLOSE' })}
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
            {voiceStatus !== 'idle' && !isMobile && (
                <VoiceCommandOverlay status={voiceStatus} transcript={voiceTranscript} />
            )}
        </Suspense>
        <Suspense fallback={null}>
          <AnimatePresence>
              {showGuidedReviewNudge && (
                  <GuidedReviewNudge onStart={handleStartGuidedReview} onDismiss={dismissGuidedReviewNudge} />
              )}
          </AnimatePresence>
          <AnimatePresence>
            {showTouchSelectTip && <TouchSelectTip onDismiss={dismissTouchSelectTip} />}
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
      </main>
    </div>
  );
};

export default App;
