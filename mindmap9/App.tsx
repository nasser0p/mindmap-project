import React, { useState, useCallback, useEffect, useMemo, lazy, Suspense, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from './contexts/AuthContext';
import useMindMapData from './hooks/useMindMapData';
import useIsMobile from './hooks/useIsMobile';
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
    identifyAndLabelImage,
} from './services/geminiService';
import { MindMapNode, ChatMessage, Attachment, SourceDocumentFile, MindMapNodeData, ExamConfig, Question, ExamResult, StudySprint, LearningProfile, AiNudge, GlowNode, GradedAnswer, FeedbackCategory, Chapter, SearchResult } from './types';
import { SUPER_ADMIN_UID } from './constants';
import ChapterSidebar from './components/ChapterSidebar';

// Lazy-load components that are not critical for the initial render
// FIX: The lazy import expects a module with a 'default' export. While the error points here, the fix is in AiAssistant.tsx to ensure it has a default export.
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

// FIX: Added 'as const' to ensure placement property is inferred as a literal type, not a generic string.
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
] as const;

export type HotspotData = { 
    node: MindMapNode; 
    incorrectQuestions: GradedAnswer[]; 
    content: HotspotContent | null;
} | null;

// New helper function to serialize the mind map for the AI
const serializeMindMap = (node: MindMapNode, indent = 0): string => {
    let result = `${'  '.repeat(indent)}- ${node.text}\n`;
    // Only include children if the node is not collapsed to respect user's view
    if (node.children && !node.isCollapsed) {
        for (const child of node.children) {
            result += serializeMindMap(child, indent + 1);
        }
    }
    return result;
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
  const [identifyingLabelsNodeId, setIdentifyingLabelsNodeId] = useState<string | null>(null);
  const [generatingNodesFromFileId, setGeneratingNodesFromFileId] = useState<string | null>(null);
  const [pastingImageNodeId, setPastingImageNodeId] = useState<string | null>(null);
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
  const [isExamScopeModalOpen, setIsExamScopeModalOpen] = useState(false);
  const [examScope, setExamScope] = useState<'chapter' | 'subject'>('chapter');
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
    setAiSidebarTab('ai');
    setGlowingNodes([]); // Clear glowing nodes when switching subjects
    setAiNudge(null); // Clear any nudge when switching subjects
    setIsFindInMapOpen(false); // Close find on document switch
    setActiveHotspotNodeId(null); // Close hotspot
    setContextMenu(null); // Close context menu
  }, [activeSubject?.id, activeChapter?.id]); // Depend on the ID, not the object reference.

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
    if (selectedNodeIds.size === 0 || !activeChapter) return [];
    return Array.from(selectedNodeIds).map(id => dataActions.findNode(id)).filter(Boolean) as MindMapNode[];
  }, [selectedNodeIds, activeChapter, dataActions]);

  const overallMastery = useMemo(() => {
    if (chapters.length === 0) return 0;
    return calculateOverallMastery(chapters);
  }, [chapters]);
  
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

  const handleSetNodeImage = useCallback(async (nodeId: string, file: File) => {
    if (!currentUser || !activeSubject) return;
    trackUserAction('ADD_IMAGE');
    const filePath = `users/${currentUser.uid}/${activeSubject.id}/nodeImages/${nodeId}-${file.name}`;
    const fileRef = storage.ref(filePath);
    try {
        const snapshot = await fileRef.put(file);
        const downloadURL = await snapshot.ref.getDownloadURL();
        setNodeImage(nodeId, { downloadURL, storagePath: filePath, mimeType: file.type });
    } catch (error) {
        console.error("Error uploading node image:", error);
        alert(`Image upload failed: ${(error as Error).message}`);
    }
  }, [setNodeImage, currentUser, activeSubject, trackUserAction]);


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

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedNodeIds.size > 0) {
          event.preventDefault(); // Prevent browser back navigation on Backspace
          handleDeleteSelectedNodes(selectedNodeIds);
      }

      if (event.key.toLowerCase() === 'v') setToolMode('pan');
      if (event.key === 'Control') {
          if (toolMode !== 'select') handleToolChange('select');
      }
    };
    
    const handleKeyUp = (event: KeyboardEvent) => {
        if (event.key === 'Control' && toolMode === 'select') {
            handleToolChange('pan');
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedNodeIds, handleDeleteSelectedNodes, isFindInMapOpen, handleCloseFindInMap, examState, studySprintState, toolMode]);
  
  const handlePaste = useCallback(async (event: ClipboardEvent) => {
    if (selectedNodeIds.size !== 1) return;
    const isEditingText = (event.target as HTMLElement)?.tagName === 'TEXTAREA' || (event.target as HTMLElement)?.tagName === 'INPUT';
    if (isEditingText) return;
    
    const items = event.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
            const file = items[i].getAsFile();
            if (file) {
                const nodeId = Array.from(selectedNodeIds)[0];
                setPastingImageNodeId(nodeId);
                try {
                    await handleSetNodeImage(nodeId, file);
                } finally {
                    setPastingImageNodeId(null);
                }
            }
            break;
        }
    }
  }, [selectedNodeIds, handleSetNodeImage]);

  useEffect(() => {
      document.addEventListener('paste', handlePaste);
      return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  // --- AI HANDLERS ---

  const handleGenerateIdeas = useCallback(async (nodeId: string) => {
    if (!activeChapter || !activeSubject) return;
    setGeneratingIdeasForNodeId(nodeId);
    try {
        const node = dataActions.findNode(nodeId);
        if (!node) throw new Error("Node not found");

        const mindMapContext = serializeMindMap(activeChapter.root);
        
        const fullDocText = await Promise.all(
            activeSubject.sourceDocuments
                .filter(doc => doc.status === 'ready')
                .map(doc => processDocument(doc).catch(e => {
                    console.error(`Failed to process document ${doc.name} for context:`, e);
                    return '';
                }))
        );
        const documentsContext = fullDocText.join('\n\n');

        trackUserAction('GENERATE_IDEAS');

        let imageContext: { mimeType: string; data: string; } | undefined = undefined;
        if (node.image?.downloadURL && node.image?.mimeType) {
            try {
                const base64Data = await fileUrlToBase64(node.image.downloadURL);
                imageContext = { mimeType: node.image.mimeType, data: base64Data };
            } catch (error) {
                console.error("Failed to fetch image for AI ideas generation:", error);
            }
        }
        
        const ideas = await generateIdeasForNode(
            node.text, 
            mindMapContext, 
            documentsContext, 
            activeSubject.learningProfile,
            imageContext
        );
        
        if (ideas.length > 0) {
            dataActions.addMultipleChildrenNode(nodeId, ideas);
        } else {
            alert("The AI couldn't generate new ideas for this topic.");
        }

    } catch (error) {
        console.error("Error generating ideas:", error);
        alert(`Failed to generate ideas: ${(error as Error).message}`);
    } finally {
        setGeneratingIdeasForNodeId(null);
    }
  }, [activeChapter, activeSubject, dataActions, trackUserAction]);

  const handleRephraseNode = useCallback(async (nodeId: string) => {
    setRephrasingNodeId(nodeId);
    try {
        const node = dataActions.findNode(nodeId);
        if (!node) throw new Error("Node not found");
        const rephrasedText = await rephraseNodeText(node.text);
        dataActions.updateNodeText(nodeId, rephrasedText);
    } catch (error) {
        console.error("Error rephrasing node:", error);
        alert(`Failed to rephrase text: ${(error as Error).message}`);
    } finally {
        setRephrasingNodeId(null);
    }
  }, [dataActions]);

  const handleExtractKeyConcepts = useCallback(async (nodeId: string) => {
    setExtractingConceptsNodeId(nodeId);
    try {
        const node = dataActions.findNode(nodeId);
        if (!node || !node.children) throw new Error("Node or children not found");
        const childrenTexts = node.children.map(c => c.text);
        const concepts = await extractKeyConcepts(node.text, childrenTexts);
        if (concepts.length > 0) {
            dataActions.addMultipleChildrenNode(nodeId, concepts);
        } else {
            alert("The AI couldn't find distinct key concepts to extract.");
        }
    } catch(error) {
        console.error("Error extracting concepts:", error);
        alert(`Failed to extract concepts: ${(error as Error).message}`);
    } finally {
        setExtractingConceptsNodeId(null);
    }
  }, [dataActions]);

  const handleGenerateAnalogy = useCallback(async (nodeId: string) => {
    setGeneratingAnalogyNodeId(nodeId);
    trackUserAction('GENERATE_ANALOGY');
    try {
        const node = dataActions.findNode(nodeId);
        if (!node) throw new Error("Node not found");
        const analogy = await generateAnalogy(node.text, activeSubject?.learningProfile);
        const newNodeId = dataActions.addChildNode(nodeId, analogy);
        if (newNodeId) {
            setSelectedNodeIds(new Set([newNodeId]));
        }
    } catch(error) {
        console.error("Error generating analogy:", error);
        alert(`Failed to generate analogy: ${(error as Error).message}`);
    } finally {
        setGeneratingAnalogyNodeId(null);
    }
  }, [dataActions, activeSubject, trackUserAction, setSelectedNodeIds]);
  
  const handleIdentifyAndLabel = useCallback(async (nodeId: string) => {
    if (!activeChapter) return;
    setIdentifyingLabelsNodeId(nodeId);
    try {
        const node = dataActions.findNode(nodeId);
        if (!node?.image?.downloadURL || !node.image.mimeType) {
            throw new Error("Node has no image to analyze.");
        }

        const base64Data = await fileUrlToBase64(node.image.downloadURL);
        const labeledItems = await identifyAndLabelImage(node.image.mimeType, base64Data);

        if (labeledItems.length > 0) {
            const ideas = labeledItems.map(item => ({
                text: item.label,
                note: item.summary
            }));
            dataActions.addMultipleChildrenNode(nodeId, ideas);
        } else {
            alert("The AI couldn't identify any specific labels in this image.");
        }

    } catch (error) {
        console.error("Error identifying and labeling image:", error);
        alert(`Failed to identify labels: ${(error as Error).message}`);
    } finally {
        setIdentifyingLabelsNodeId(null);
    }
  }, [activeChapter, dataActions]);

  const handleAiChatSubmit = useCallback(async (question: string) => {
    if (!activeChapter || selectedNodeIds.size === 0) return;
    setIsAiReplying(true);
    setChatHistory(prev => [...prev, { role: 'user', text: question }]);
    trackUserAction('ASK_DIRECT_QUESTION');

    try {
        const mainNodeId = Array.from(selectedNodeIds)[0];
        const mainNode = dataActions.findNode(mainNodeId);
        if (!mainNode) throw new Error("Selected node not found");

        const context: NodeContext = {
            path: findNodePath(activeChapter.root, mainNodeId),
            currentNodeText: mainNode.text,
            childrenTexts: mainNode.children?.map(c => c.text) || []
        };
        
        if (mainNode.image?.downloadURL && mainNode.image.mimeType) {
            try {
                const base64Data = await fileUrlToBase64(mainNode.image.downloadURL);
                context.image = {
                    mimeType: mainNode.image.mimeType,
                    data: base64Data
                };
            } catch (error) {
                console.error("Failed to fetch image for AI chat:", error);
                // Non-fatal, proceed without image context
            }
        }

        const responseText = await askChatQuestion(context, question, activeSubject?.learningProfile);
        setChatHistory(prev => [...prev, { role: 'model', text: responseText }]);

    } catch (error) {
        console.error("Error getting AI chat response:", error);
        const errorMessage = `Sorry, I encountered an error: ${(error as Error).message}`;
        setChatHistory(prev => [...prev, { role: 'model', text: errorMessage }]);
    } finally {
        setIsAiReplying(false);
    }
  }, [activeChapter, selectedNodeIds, dataActions, activeSubject, trackUserAction]);

  const handleGenerateNodesFromFile = useCallback(async (file: SourceDocumentFile) => {
    if (!activeChapter || !activeSubject) return;
    const parentNodeId = lastSelectedNodeId || activeChapter.root.id;
    setGeneratingNodesFromFileId(file.id);
    try {
        const parentNode = dataActions.findNode(parentNodeId);
        if (!parentNode) throw new Error("Parent node not found");

        // Step 1: Process the document to get its text content
        const extractedText = await processDocument(file);
        
        // Step 2: Get base64 data for multimodal analysis
        const base64Data = await fileUrlToBase64(file.downloadURL);

        // Step 3: Call the enhanced Gemini service
        const enhancedNodes = await generateEnhancedMindMapFromFile(
            extractedText, 
            base64Data, 
            file.mimeType, 
            parentNode.text
        );

        // Step 4: Add the generated nodes to the mind map
        // FIX: 'addNodeWithChildren' was being called on 'dataActions' but it was destructured directly from the hook.
        enhancedNodes.forEach(nodeData => {
            addNodeWithChildren(parentNodeId, nodeData);
        });

        if (tutorialStep === 'generate-nodes') {
            advanceTutorial('generate-nodes');
        }

    } catch (error) {
        console.error("Error generating nodes from file:", error);
        alert(`Failed to generate mind map: ${(error as Error).message}`);
    } finally {
        setGeneratingNodesFromFileId(null);
    }
  }, [activeChapter, activeSubject, lastSelectedNodeId, dataActions, tutorialStep, addNodeWithChildren]);
  
  const handleFileUpload = useCallback(async (file: File) => {
    if (!currentUser || !activeSubject) return;
    const fileId = uuidv4();
    const newFile: SourceDocumentFile = {
        id: fileId,
        name: file.name,
        storagePath: '',
        downloadURL: '',
        mimeType: file.type,
        status: 'uploading',
    };
    addSourceDocument(newFile);

    const filePath = `users/${currentUser.uid}/${activeSubject.id}/sourceDocuments/${fileId}-${file.name}`;
    const fileRef = storage.ref(filePath);
    try {
        const snapshot = await fileRef.put(file);
        const downloadURL = await snapshot.ref.getDownloadURL();
        updateSourceDocument(fileId, { downloadURL, storagePath: filePath, status: 'ready' });
        if (tutorialStep === 'upload-file') {
            advanceTutorial('upload-file');
        }
    } catch (error) {
        console.error("Error uploading source file:", error);
        updateSourceDocument(fileId, { status: 'error', errorMessage: (error as Error).message });
    }
  }, [addSourceDocument, updateSourceDocument, currentUser, activeSubject, tutorialStep]);

  const handleDeleteFile = useCallback(async (file: SourceDocumentFile) => {
      if (!window.confirm(`Are you sure you want to delete "${file.name}"?`)) return;
      try {
        await storage.ref(file.storagePath).delete();
        deleteSourceDocument(file.id);
      } catch (error) {
          console.error("Error deleting source file:", error);
          if ((error as any).code === 'storage/object-not-found') {
              console.warn("File not found in storage, deleting from Firestore anyway.");
              deleteSourceDocument(file.id);
          } else {
             alert(`Failed to delete file: ${(error as Error).message}`);
          }
      }
  }, [deleteSourceDocument]);

  // --- Exam Handlers ---
  const handleStartExam = useCallback(async (config: ExamConfig, branchNodeId?: string) => {
    if (!activeSubject || !activeChapter) return;
    setExamState(prev => ({ ...prev, view: 'loading' }));

    try {
        let mindMapContext: string;
        let documents: SourceDocumentFile[] = [];

        if (branchNodeId) { // Branch exam
            const branchNodes = getBranchNodes(activeChapter.root, branchNodeId);
            const branchRoot = branchNodes[0];
            if (!branchRoot) throw new Error("Branch root not found");
            mindMapContext = serializeMindMap(branchRoot);
            documents = activeSubject.sourceDocuments; // Use all subject docs
        } else if (examScope === 'subject') { // Subject exam
            mindMapContext = chapters.map(c => `--- Chapter: ${c.name} ---\n${serializeMindMap(c.root)}`).join('\n\n');
            documents = activeSubject.sourceDocuments;
        } else { // Chapter exam (default)
            mindMapContext = serializeMindMap(activeChapter.root);
            documents = activeSubject.sourceDocuments;
        }

        const fullDocText = await Promise.all(
            documents.filter(doc => doc.status === 'ready')
                     .map(doc => processDocument(doc).catch(e => ''))
        );
        const documentsContext = fullDocText.join('\n\n');

        const generatedQuestions = await generateExamQuestions(config, mindMapContext, documentsContext);
        const questionsWithIds: Question[] = generatedQuestions.map(q => ({ ...q, id: uuidv4() }));
        
        const allMapNodes = chapters.flatMap(c => getAllNodes(c.root));
        const questionToNodeIdMap = new Map<string, string>();
        questionsWithIds.forEach(q => {
            const relatedNode = allMapNodes.find(node => node.text.toLowerCase() === q.relatedNodeTopicText?.toLowerCase());
            if (relatedNode) {
                questionToNodeIdMap.set(q.id, relatedNode.id);
            }
        });

        setExamState({
            view: 'active',
            config,
            questions: questionsWithIds,
            results: null,
            questionToNodeIdMap
        });
    } catch (error) {
        console.error("Error starting exam:", error);
        alert(`Failed to generate exam: ${(error as Error).message}`);
        setExamState({ view: 'closed', config: null, questions: [], results: null, questionToNodeIdMap: new Map() });
    } finally {
        setIsExamScopeModalOpen(false);
        setBranchExamConfig(null);
    }
  }, [activeSubject, activeChapter, chapters, examScope]);

  const handleOpenExamConfig = (scope: 'chapter' | 'subject') => {
      setExamScope(scope);
      setIsExamScopeModalOpen(false);
      setExamState(prev => ({ ...prev, view: 'config' }));
  };
  
  const handleTestBranch = (nodeId: string) => {
      const node = dataActions.findNode(nodeId);
      if (!node) return;
      setBranchExamConfig({ nodeId, nodeText: node.text });
      setExamState(prev => ({...prev, view: 'config'}));
  };

  const handleSubmitExam = useCallback(async (answers: Map<string, string>, revealedHints: Set<string>) => {
      if (examState.questions.length === 0) return;
      setExamState(prev => ({ ...prev, view: 'loading' }));
      try {
          const results = await gradeAndAnalyzeExam(examState.questions, answers);
          setExamState(prev => ({ ...prev, view: 'results', results }));
          
          // Update Mastery Scores
          const newMasteryScores = new Map<string, number>();
          results.analysis.forEach(res => {
              const question = examState.questions.find(q => q.questionText === res.questionText);
              if (question) {
                  const nodeId = examState.questionToNodeIdMap.get(question.id);
                  if (nodeId) {
                      const parentNode = findParentNodeFromHook(nodeId);
                      const currentScore = dataActions.findNode(nodeId)?.masteryScore || 0;
                      const hasHint = revealedHints.has(question.id);
                      let scoreChange = res.isCorrect ? (hasHint ? 0.05 : 0.1) : (hasHint ? -0.15 : -0.1);

                      // Smaller impact for root's direct children
                      if(parentNode && activeChapter && parentNode.id === activeChapter.root.id) {
                          scoreChange *= 0.75;
                      }

                      const newScore = Math.max(0, Math.min(1, currentScore + scoreChange));
                      newMasteryScores.set(nodeId, newScore);
                  }
              }
          });
          dataActions.updateMultipleNodesMastery(newMasteryScores);
          
          const incorrectNodes = results.analysis
            .filter(a => !a.isCorrect)
            .map(a => {
                const q = examState.questions.find(q => q.questionText === a.questionText);
                return q ? examState.questionToNodeIdMap.get(q.id) : undefined;
            })
            .filter((id): id is string => !!id);
          
          const highSeverityIds = new Set(incorrectNodes);
          const newGlowingNodes = Array.from(highSeverityIds).map(nodeId => ({ nodeId, severity: 'high' as const }));
          setGlowingNodes(newGlowingNodes);

          if (newGlowingNodes.length > 0) {
              setShowGuidedReviewNudge(true);
          }
          setLastCompletedExam({ ...examState, results });

      } catch(error) {
          console.error("Error submitting exam:", error);
          alert(`Failed to grade exam: ${(error as Error).message}`);
          setExamState(prev => ({ ...prev, view: 'active' })); // Revert to active exam
      }
  }, [examState, dataActions, findParentNodeFromHook, activeChapter]);
  
  const handleCloseExam = useCallback(() => {
    setExamState({ view: 'closed', config: null, questions: [], results: null, questionToNodeIdMap: new Map() });
    setBranchExamConfig(null);
  }, []);
  
  // --- Study Sprint Handlers ---
  const handleStartStudySprint = useCallback(async (duration: number) => {
    if (!activeChapter || !activeSubject) return;
    setStudySprintState({ view: 'loading', sprint: null, isLoading: true });
    
    try {
        const allNodes = chapters.flatMap(c => getAllNodes(c.root));
        const weakestTopics = allNodes
            .filter(n => n.masteryScore < 0.5)
            .sort((a,b) => a.masteryScore - b.masteryScore)
            .slice(0, 5) // Top 5 weakest
            .map(n => n.text);
        
        const mindMapContext = chapters.map(c => `--- Chapter: ${c.name} ---\n${serializeMindMap(c.root)}`).join('\n\n');
        
        const fullDocText = await Promise.all(
            activeSubject.sourceDocuments
                .filter(doc => doc.status === 'ready')
                .map(doc => processDocument(doc).catch(e => ''))
        );
        const documentsContext = fullDocText.join('\n\n');

        const sprint = await generateStudySprint(duration, weakestTopics, mindMapContext, documentsContext);
        setStudySprintState({ view: 'active', sprint, isLoading: false });

    } catch(error) {
        console.error("Error generating study sprint:", error);
        alert(`Failed to generate study sprint: ${(error as Error).message}`);
        setStudySprintState({ view: 'closed', sprint: null, isLoading: false });
    }
  }, [activeSubject, chapters]);

  // --- Search Handlers ---
  const handleSearch = useCallback(() => {
    if (!searchQuery) {
        setSearchResults([]);
        return;
    }
    const nodesToSearch = searchScope === 'subject' 
        ? chapters.flatMap(c => getAllNodes(c.root).map(node => ({ ...node, chapterId: c.id, chapterName: c.name })))
        : activeChapter ? getAllNodes(activeChapter.root).map(node => ({...node, chapterId: activeChapter.id, chapterName: activeChapter.name})) : [];
    
    const results = nodesToSearch
        .filter(node => node.text.toLowerCase().includes(searchQuery.toLowerCase()))
        .map(node => ({
            nodeId: node.id,
            chapterId: (node as any).chapterId,
            chapterName: (node as any).chapterName,
            nodeText: node.text
        }));

    setSearchResults(results);
    setCurrentSearchResultIndex(0);
  }, [searchQuery, searchScope, chapters, activeChapter]);

  useEffect(() => {
    const handler = setTimeout(() => handleSearch(), 300);
    return () => clearTimeout(handler);
  }, [handleSearch]);

  useEffect(() => {
    if (searchResults.length > 0) {
        const currentResult = searchResults[currentSearchResultIndex];
        if (currentResult.chapterId !== activeChapter?.id) {
            switchActiveChapter(currentResult.chapterId);
            setNodeToCenterAfterChapterSwitch(currentResult.nodeId);
        } else {
            setNodeToCenterOn(currentResult.nodeId);
        }
    } else {
        setNodeToCenterOn(null);
    }
  }, [searchResults, currentSearchResultIndex, activeChapter?.id, switchActiveChapter]);

  // Effect to handle centering after a chapter switch from search
  useEffect(() => {
    if (nodeToCenterAfterChapterSwitch && activeChapter?.id) {
        // Find the result that matches the node to center
        const result = searchResults.find(r => r.nodeId === nodeToCenterAfterChapterSwitch);
        if (result && result.chapterId === activeChapter.id) {
            setNodeToCenterOn(nodeToCenterAfterChapterSwitch);
            setNodeToCenterAfterChapterSwitch(null); // Clear the trigger
        }
    }
  }, [activeChapter?.id, nodeToCenterAfterChapterSwitch, searchResults]);
  
  // Guided Review Handlers
  const handleStartGuidedReview = useCallback(() => {
    if (glowingNodes.length > 0) {
        const sortedPath = [...glowingNodes].sort((a, b) => (b.severity === 'high' ? 1 : -1) - (a.severity === 'high' ? 1 : -1));
        setGuidedReviewPath(sortedPath);
        setGuidedReviewIndex(0);
        setIsInGuidedReview(true);
        setActiveHotspotNodeId(sortedPath[0].nodeId);
        setShowGuidedReviewNudge(false);
    }
  }, [glowingNodes]);

  const handleAdvanceGuidedReview = useCallback(() => {
    if (guidedReviewIndex < guidedReviewPath.length - 1) {
        const nextIndex = guidedReviewIndex + 1;
        setGuidedReviewIndex(nextIndex);
        setActiveHotspotNodeId(guidedReviewPath[nextIndex].nodeId);
    } else {
        // End of review
        setIsInGuidedReview(false);
        setActiveHotspotNodeId(null);
        setGlowingNodes([]); // Clear highlights after review
    }
  }, [guidedReviewIndex, guidedReviewPath]);

  // Hotspot Handlers
  const activeHotspotNodeData = useMemo(() => {
    if (!activeHotspotNodeId || !lastCompletedExam || !lastCompletedExam.results) return null;
    const node = dataActions.findNode(activeHotspotNodeId);
    if (!node) return null;
    
    const incorrectQuestions = lastCompletedExam.results.analysis.filter(res => {
        if (res.isCorrect) return false;
        const question = lastCompletedExam.questions.find(q => q.questionText === res.questionText);
        return question && lastCompletedExam.questionToNodeIdMap.get(question.id) === activeHotspotNodeId;
    });

    return {
        node,
        incorrectQuestions,
        content: hotspotContent,
    };
  }, [activeHotspotNodeId, lastCompletedExam, dataActions, hotspotContent]);

  const handleMarkNodeAsReviewed = useCallback((nodeId: string) => {
    setGlowingNodes(prev => prev.filter(n => n.nodeId !== nodeId));
    setActiveHotspotNodeId(null);
  }, []);

  const handleHotspotExplain = useCallback(async (nodeText: string) => {
      setHotspotContent({ view: 'loading' });
      try {
          const explanation = await explainConceptDifferently(nodeText);
          setHotspotContent({ view: 'explaining', explanation });
      } catch (error) {
          console.error(error);
          alert(`Failed to get explanation: ${(error as Error).message}`);
          setHotspotContent({ view: 'main' });
      }
  }, []);

  const handleHotspotQuiz = useCallback(async (nodeText: string) => {
      setHotspotContent({ view: 'loading' });
      try {
          const quiz = await generateSingleQuestion(nodeText);
          setHotspotContent({ view: 'quizzing', quiz: {...quiz, id: 'hotspot-quiz'} });
      } catch (error) {
          console.error(error);
          alert(`Failed to get quiz: ${(error as Error).message}`);
          setHotspotContent({ view: 'main' });
      }
  }, []);
  
  useEffect(() => {
    if(activeHotspotNodeId) {
        setHotspotContent({ view: 'main' }); // Reset content when hotspot changes
    } else {
        setHotspotContent(null);
    }
  }, [activeHotspotNodeId]);

  const handleSendFeedback = useCallback(async (category: FeedbackCategory, summary: string, description: string, screenshotBlob: Blob | null) => {
    if(!currentUser) throw new Error("User not authenticated.");
    const feedbackId = uuidv4();
    let screenshotUrl: string | undefined;
    let storagePath: string | undefined;

    if (screenshotBlob) {
        storagePath = `feedback/${feedbackId}/${uuidv4()}.png`;
        const screenshotRef = storage.ref(storagePath);
        const snapshot = await screenshotRef.put(screenshotBlob);
        screenshotUrl = await snapshot.ref.getDownloadURL();
    }
    
    const feedbackData = {
        id: feedbackId,
        userId: currentUser.uid,
        category, summary, description, screenshotUrl, storagePath,
        timestamp: new Date().toISOString(),
        clientInfo: {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            screenWidth: window.screen.width,
            screenHeight: window.screen.height,
        },
        status: 'new' as const,
    };
    await db.collection('feedback').doc(feedbackId).set(feedbackData);
  }, [currentUser]);

  // --- RENDER LOGIC ---

  if (authLoading || (currentUser && dataLoading)) {
    return <Spinner fullScreen={true} />;
  }
  
  if (!currentUser) {
    if (authView === 'landing') {
        return <LandingPage onGoToLogin={() => setAuthView('login')} />;
    }
    return <Auth onGoToLanding={() => setAuthView('landing')} />;
  }

  if (SUPER_ADMIN_UID && currentUser.uid === SUPER_ADMIN_UID) {
      return (
          <Suspense fallback={<Spinner fullScreen />}>
              <AdminPanel user={currentUser} theme={theme} onToggleTheme={handleToggleTheme} />
          </Suspense>
      );
  }

  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden">
      <Suspense>
        {isWelcomeModalOpen && <WelcomeModal onStart={handleStartTutorial} />}
      </Suspense>
      <SubjectTabs
        documents={subjects}
        activeDocumentId={activeSubject?.id || null}
        user={currentUser}
        editingSubjectId={editingSubjectId}
        onSwitch={switchActiveSubject}
        onAdd={addSubject}
        onDelete={deleteSubject}
        onRename={updateSubjectName}
        onStartEdit={(id) => setEditingSubjectId(id)}
        onEndEdit={() => setEditingSubjectId(null)}
        onRestartTutorial={restartTutorial}
      />
      
      {activeSubject && chapters.length >= 1 && (
        <ChapterSidebar
            chapters={chapters}
            activeChapterId={activeChapter?.id || null}
            onSwitchChapter={switchActiveChapter}
            onAddChapter={addChapter}
            onDeleteChapter={deleteChapter}
            onRenameChapter={renameChapter}
        />
      )}

      <main className="flex-1 min-h-0 relative">
        {activeChapter ? (
          <MindMap
            ref={mindMapRef}
            root={activeChapter.root}
            links={activeChapter.links}
            toolMode={toolMode}
            isReviewModeActive={isReviewModeActive}
            selectedNodeIds={selectedNodeIds}
            focusedNodeId={focusedNodeId}
            nodeToEditOnRender={nodeToEditOnRender}
            generatingIdeasForNodeId={generatingIdeasForNodeId}
            rephrasingNodeId={rephrasingNodeId}
            extractingConceptsNodeId={extractingConceptsNodeId}
            generatingAnalogyNodeId={generatingAnalogyNodeId}
            identifyingLabelsNodeId={identifyingLabelsNodeId}
            pastingImageNodeId={pastingImageNodeId}
            glowingNodes={glowingNodes}
            searchResultIds={searchResults.map(r => r.nodeId)}
            currentSearchResultId={searchResults.length > 0 ? searchResults[currentSearchResultIndex]?.nodeId : null}
            nodeToCenterOn={nodeToCenterOn}
            activeHotspotNodeId={activeHotspotNodeId}
            hotspotData={activeHotspotNodeData}
            isInGuidedReview={isInGuidedReview}
            contextMenu={contextMenu}
            theme={theme}
            onNodeSelect={setSelectedNodeIds}
            onFocusNode={setFocusedNodeId}
            onNodeUpdate={dataActions.updateNodeText}
            onNodeDelete={dataActions.deleteNode}
            onDeleteNodes={handleDeleteSelectedNodes}
            onNodeMove={dataActions.moveNode}
            onNodePositionUpdate={dataActions.updateNodePosition}
            onUpdateNodeSize={dataActions.updateNodeSize}
            onMultipleNodePositionsUpdate={dataActions.updateMultipleNodePositions}
            onAddChild={(parentId) => { dataActions.addChildNode(parentId, 'New Idea'); setLastAction({ type: 'ADD_CHILD', parentId }); trackUserAction('MANUAL_ADD_CHILD'); }}
            onInsertParentNode={(childId) => { const newId = insertNodeBetween(findParentNodeFromHook(childId)?.id || '', childId); if (newId) { setSelectedNodeIds(new Set([newId])); setNodeToEditOnRender(newId); } }}
            onToggleCollapse={dataActions.toggleNodeCollapse}
            onGenerateIdeas={handleGenerateIdeas}
            onRephraseNode={handleRephraseNode}
            onExtractConcepts={handleExtractKeyConcepts}
            onGenerateAnalogy={handleGenerateAnalogy}
            onIdentifyAndLabel={handleIdentifyAndLabel}
            onTestBranch={handleTestBranch}
            onSelectBranch={(nodeId) => { const node = dataActions.findNode(nodeId); if (node) { const ids = dataActions.getAllDescendantIds(node); setSelectedNodeIds(new Set([nodeId, ...ids])); } }}
            onSelectChildren={(nodeId) => { const node = dataActions.findNode(nodeId); if (node && node.children) setSelectedNodeIds(new Set(node.children.map(c => c.id))); }}
            onSelectSiblings={(nodeId) => { const parent = findParentNodeFromHook(nodeId); if (parent && parent.children) setSelectedNodeIds(new Set(parent.children.map(c => c.id))); }}
            onSetNodeColor={dataActions.updateNodeColor}
            onEditComplete={() => setNodeToEditOnRender(null)}
            onAddLink={dataActions.addLink}
            onUpdateLinkLabel={dataActions.updateLinkLabel}
            onDeleteLink={dataActions.deleteLink}
            onShowAttachments={() => { setIsAiAssistantOpen(true); setAiSidebarTab('attachments'); }}
            onSetNodeImage={handleSetNodeImage}
            onRemoveNodeImage={(nodeId) => setNodeImage(nodeId, null)}
            onViewImage={setViewingImage}
            onNodeDragStart={() => setSelectedNodeIdsInternal(ids => new Set(ids))}
            getAllDescendantIds={dataActions.getAllDescendantIds}
            onTransformChange={handleTransformChange}
            onLayoutUpdate={persistLayoutPositions}
            onSelectionEnd={(event) => { if (event.type === 'end' && event.sourceEvent?.type === 'mouseup' && toolMode === 'select') { setToolMode('pan'); } }}
            onCloseHotspot={() => setActiveHotspotNodeId(null)}
            onMarkAsReviewed={handleMarkNodeAsReviewed}
            onHotspotExplain={handleHotspotExplain}
            onHotspotQuiz={handleHotspotQuiz}
            onAdvanceGuidedReview={handleAdvanceGuidedReview}
            onHotspotBackToMain={() => setHotspotContent({ view: 'main' })}
            onContextMenuChange={setContextMenu}
          />
        ) : (
          <MindMapShell />
        )}

        {isMobile ? (
             <MobileToolbar 
                toolMode={toolMode}
                onToolChange={handleToolChange}
                onUndo={dataActions.undo}
                onRedo={dataActions.redo}
                canUndo={dataActions.canUndo}
                canRedo={dataActions.canRedo}
                masteryScore={overallMastery}
                onStartStudySprint={() => setStudySprintState(prev => ({...prev, view: 'config'}))}
                onStartExam={() => setIsExamScopeModalOpen(true)}
                theme={theme}
                onToggleTheme={handleToggleTheme}
                onOpenAiAssistant={handleOpenAiAssistant}
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                onZoomToFit={handleZoomToFit}
                onSendFeedback={() => setIsFeedbackModalOpen(true)}
             />
        ) : (
             <Toolbar
                onUndo={dataActions.undo}
                onRedo={dataActions.redo}
                canUndo={dataActions.canUndo}
                canRedo={dataActions.canRedo}
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                onZoomToFit={handleZoomToFit}
                zoomLevel={zoomTransform.k}
                isSaving={false} // Placeholder
                toolMode={toolMode}
                onToolChange={handleToolChange}
                selectedNodeCount={selectedNodeIds.size}
                onDeleteSelected={() => handleDeleteSelectedNodes(selectedNodeIds)}
                onSetSelectedColor={(color) => updateMultipleNodesColor(selectedNodeIds, color)}
                isFindInMapOpen={isFindInMapOpen}
                onToggleFindInMap={() => setIsFindInMapOpen(prev => !prev)}
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                searchScope={searchScope}
                onSearchScopeChange={setSearchScope}
                searchResults={searchResults}
                currentSearchResultIndex={currentSearchResultIndex}
                onNextSearchResult={() => setCurrentSearchResultIndex(i => (i + 1) % searchResults.length)}
                onPreviousSearchResult={() => setCurrentSearchResultIndex(i => (i - 1 + searchResults.length) % searchResults.length)}
                onCloseFindInMap={handleCloseFindInMap}
                isReviewModeActive={isReviewModeActive}
                onFinishReview={() => setGlowingNodes([])}
            />
        )}
      </main>

       <Suspense fallback={<ModalLoadingFallback />}>
            <ImageLightbox imageUrl={viewingImage} onClose={() => setViewingImage(null)} />
            <AiAssistant
                isOpen={isAiAssistantOpen}
                onOpen={handleOpenAiAssistant}
                onClose={() => setIsAiAssistantOpen(false)}
                isMobile={isMobile}
                selectedNodes={selectedNodesData}
                sourceDocuments={activeSubject?.sourceDocuments || []}
                generatingNodesFromFileId={generatingNodesFromFileId}
                onGenerateIdeas={handleGenerateIdeas}
                onRephraseNode={handleRephraseNode}
                onExtractConcepts={handleExtractKeyConcepts}
                onGenerateAnalogy={handleGenerateAnalogy}
                onIdentifyAndLabel={handleIdentifyAndLabel}
                isGeneratingIdeas={!!generatingIdeasForNodeId}
                isRephrasing={!!rephrasingNodeId}
                isExtractingConcepts={!!extractingConceptsNodeId}
                isGeneratingAnalogy={!!generatingAnalogyNodeId}
                isIdentifyingLabels={!!identifyingLabelsNodeId}
                chatHistory={chatHistory}
                onChatSubmit={handleAiChatSubmit}
                isAiReplying={isAiReplying}
                activeTab={aiSidebarTab}
                onTabChange={handleAiTabChange}
                onAddAttachment={addAttachment}
                onUpdateAttachment={updateAttachment}
                onDeleteAttachment={deleteAttachment}
                onUploadFile={handleFileUpload}
                onRetryUpload={(file) => { const f = uploadingFiles.get(file.id); if(f) handleFileUpload(f) }}
                onDeleteFile={handleDeleteFile}
                onGenerateNodes={handleGenerateNodesFromFile}
                aiNudge={aiNudge}
                onNudgeDismiss={() => setAiNudge(null)}
            />
            <ExamModal state={examState} branchExamConfig={branchExamConfig} onStart={(config) => handleStartExam(config, branchExamConfig?.nodeId)} onSubmit={handleSubmitExam} onClose={handleCloseExam} />
            <StudySprintModal state={studySprintState} onStart={handleStartStudySprint} onClose={() => setStudySprintState({ view: 'closed', sprint: null, isLoading: false })} />
            <ExamScopeModal isOpen={isExamScopeModalOpen} onClose={() => setIsExamScopeModalOpen(false)} onSelectScope={handleOpenExamConfig} />
            <FeedbackModal isOpen={isFeedbackModalOpen} onClose={() => setIsFeedbackModalOpen(false)} onSubmit={handleSendFeedback} />
       </Suspense>
       {!isMobile && (
        <Suspense>
            <ThemeToggle theme={theme} onToggle={handleToggleTheme} />
            {showGuidedReviewNudge && <GuidedReviewNudge onStart={handleStartGuidedReview} onDismiss={dismissGuidedReviewNudge} />}
            {tutorialStep && currentTutorial && <TutorialNudge {...currentTutorial} onNext={() => advanceTutorial(tutorialStep)} onSkip={handleSkipTutorial} isLastStep={isLastTutorialStep} />}
            <FeedbackButton onClick={() => setIsFeedbackModalOpen(true)} />
            {showTouchSelectTip && <TouchSelectTip onDismiss={dismissTouchSelectTip} />}
        </Suspense>
       )}
    </div>
  );
};

export default App;