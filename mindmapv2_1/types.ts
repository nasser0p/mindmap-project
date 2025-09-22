export interface MindMapLink {
  id: string;
  source: string; // source node id
  target: string; // target node id
  label: string;
}

export type Attachment = {
  id: string;
} & (
  | { type: 'note'; content: { text: string } }
  | { type: 'image'; content: { downloadURL: string; storagePath: string; name: string; } }
  | { type: 'link'; content: { url: string; title: string } }
);

export interface SourceDocumentFile {
  id: string;
  name: string;
  storagePath: string;
  downloadURL: string;
  mimeType: string;
  status: 'uploading' | 'processing' | 'ready' | 'error';
  errorMessage?: string;
}

export interface MindMapNode {
  id: string;
  text: string;
  image?: {
    downloadURL: string;
    storagePath: string;
  };
  children?: MindMapNode[];
  color: string;
  x?: number;
  y?: number;
  isCollapsed?: boolean;
  attachments?: Attachment[];
  masteryScore: number; // 0 to 1, where 1 is 100% mastery
  type?: 'CATEGORY' | 'GATE_TYPE' | 'CONCEPT' | 'EXPRESSION' | 'TRUTH_TABLE' | 'EXAMPLE';
}

export interface LearningProfile {
    analogyPreference: number; // -1 (factual) to 1 (analogy)
    structurePreference: number; // -1 (bottom-up) to 1 (top-down)
    visualPreference: number; // -1 (textual) to 1 (visual)
    creationPreference: number; // -1 (AI-generated) to 1 (manual)
    interactionCount: number;
}

export interface AiNudge {
  message: string;
  actionLabel: string;
  action: () => Promise<void>; // The action to perform
  nodeId: string; // The node the nudge is for
}

// Represents a Chapter, which contains the actual mind map data
export interface Chapter {
  id: string;
  name: string;
  root: MindMapNode;
  links: MindMapLink[];
  order: number;
  createdAt: string;
}

// Represents a Subject (the top-level document), which is a container for chapters.
export interface MindMapDocument {
  id: string;
  name: string;
  ownerId: string;
  sourceDocuments: SourceDocumentFile[];
  learningProfile: LearningProfile;
  createdAt: string;
  color?: string;
  // DEPRECATED: These will be migrated to the first chapter.
  root?: MindMapNode; 
  links?: MindMapLink[];
}


export type ChatMessage = {
  role: 'user' | 'model';
  text: string;
};

export interface MindMapNodeData extends Omit<MindMapNode, 'id' | 'color' | 'children' | 'masteryScore'> {
  children?: MindMapNodeData[];
  type?: 'CATEGORY' | 'GATE_TYPE' | 'CONCEPT' | 'EXPRESSION' | 'TRUTH_TABLE' | 'EXAMPLE';
}

// Exam Feature Types
export type QuestionType = 'multiple-choice' | 'short-answer' | 'true-false' | 'fill-in-the-blank';

export interface ExamConfig {
    type: 'Quiz' | 'Midterm' | 'Final';
    numQuestions: number;
    questionTypes: QuestionType[];
}

export interface Question {
    id: string;
    questionText: string;
    type: QuestionType;
    options: string[] | null;
    correctAnswer: string;
    relatedNodeTopicText?: string;
    hint: string;
}

export interface GradedAnswer {
    questionText: string;
    userAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    explanation: string;
}

export interface ExamResult {
    score: number;
    analysis: GradedAnswer[];
}

export interface GlowNode {
  nodeId: string;
  severity: 'high' | 'low';
}

// Study Sprint Types
export type StudyStepType = 'FLASHCARD_REVIEW' | 'FOCUSED_DEEP_DIVE' | 'CONSOLIDATION_QUIZ';

export interface StudyStep {
    type: StudyStepType;
    title: string;
    duration: number; // in minutes
    instructions: string;
    quiz?: Question[]; // For CONSOLIDATION_QUIZ type
}

export interface StudySprint {
    steps: StudyStep[];
}

// Feedback Types
export type FeedbackCategory = 'bug' | 'feature' | 'general';
export type FeedbackStatus = 'new' | 'in-progress' | 'resolved' | 'archived';

export interface Feedback {
  id: string;
  userId: string;
  category: FeedbackCategory;
  summary: string;
  description: string;
  screenshotUrl?: string;
  storagePath?: string;
  timestamp: string; // ISO string
  clientInfo: {
    userAgent: string;
    platform: string;
    screenWidth: number;
    screenHeight: number;
  };
  status: FeedbackStatus;
}

// Search Types
export interface SearchResult {
  nodeId: string;
  chapterId: string;
  chapterName: string;
  nodeText: string;
}