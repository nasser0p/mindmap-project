import React, { useState, FormEvent, useRef, useEffect } from 'react';
import { motion, AnimatePresence, type Transition, useDragControls } from 'framer-motion';
import { MindMapNode, ChatMessage, Attachment, SourceDocumentFile, AiNudge } from '../types';
import Spinner from './Spinner';

interface AiAssistantProps {
    isOpen: boolean;
    onOpen: () => void;
    onClose: () => void;
    isMobile: boolean;
    selectedNodes: MindMapNode[];
    sourceDocuments: SourceDocumentFile[];
    generatingNodesFromFileId: string | null;
    onGenerateIdeas: (nodeId: string) => void;
    onRephraseNode: (nodeId: string) => void;
    onExtractConcepts: (nodeId: string) => void;
    onGenerateAnalogy: (nodeId: string) => void;
    onIdentifyAndLabel: (nodeId: string) => void;
    isGeneratingIdeas: boolean;
    isRephrasing: boolean;
    isExtractingConcepts: boolean;
    isGeneratingAnalogy: boolean;
    isIdentifyingLabels: boolean;
    chatHistory: ChatMessage[];
    onChatSubmit: (question: string) => void;
    isAiReplying: boolean;
    activeTab: 'ai' | 'attachments' | 'documents';
    onTabChange: (tab: 'ai' | 'attachments' | 'documents') => void;
    onAddAttachment: (nodeId: string, attachmentData: Omit<Attachment, 'id'>, file?: File) => void;
    onUpdateAttachment: (nodeId: string, attachmentId: string, updatedContent: Attachment['content']) => void;
    onDeleteAttachment: (nodeId: string, attachmentId: string) => void;
    onUploadFile: (file: File) => void;
    onRetryUpload: (file: SourceDocumentFile) => void;
    onDeleteFile: (file: SourceDocumentFile) => void;
    onGenerateNodes: (file: SourceDocumentFile) => void;
    aiNudge: AiNudge | null;
    onNudgeDismiss: () => void;
}

type AiToolsContentProps = Pick<AiAssistantProps,
    'selectedNodes' |
    'onGenerateIdeas' | 'onRephraseNode' | 'onExtractConcepts' | 'onGenerateAnalogy' | 'onIdentifyAndLabel' |
    'isGeneratingIdeas' | 'isRephrasing' | 'isExtractingConcepts' | 'isGeneratingAnalogy' | 'isIdentifyingLabels' |
    'chatHistory' | 'onChatSubmit' | 'isAiReplying'
>;

const TabButton: React.FC<{text: string, icon: string, isActive: boolean, onClick: () => void, count?: number, "data-tutorial-id"?: string}> = ({ text, icon, isActive, onClick, count=0, "data-tutorial-id": dataTutorialId }) => (
    <button onClick={onClick} data-tutorial-id={dataTutorialId} className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold border-b-2 transition-all duration-200 ${isActive ? 'border-blue-500 text-blue-500' : 'border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'}`}>
        <i className={`fa-solid ${icon}`}></i>
        <span>{text}</span>
        {count > 0 && <span className="text-xs bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold rounded-full px-2 py-0.5">{count}</span>}
    </button>
);


const SimpleMarkdown: React.FC<{ text: string }> = React.memo(({ text }) => {
    const html = text
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/^\s*[-*]\s+(.*)/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/gs, (match) => `<ul>${match}</ul>`)
        .replace(/<\/ul>\s*<ul>/g, '')
        .replace(/\n/g, '<br />');

    return <div className="prose prose-sm dark:prose-invert max-w-full" dangerouslySetInnerHTML={{ __html: html }} />;
});


const ChatBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(message.text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const isUser = message.role === 'user';

    return (
        <div className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
            {!isUser && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center self-start">
                    <i className="fa-solid fa-wand-magic-sparkles text-slate-500 dark:text-slate-300"></i>
                </div>
            )}
            <div className={`group relative max-w-[85%] p-3 rounded-2xl text-sm ${
                isUser 
                ? 'bg-blue-500 text-white rounded-br-lg' 
                : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-bl-lg border border-slate-200 dark:border-slate-600'
            }`}>
                <SimpleMarkdown text={message.text} />
                {!isUser && (
                    <button 
                        onClick={handleCopy}
                        className="absolute -bottom-3 right-2 w-7 h-7 bg-slate-100 dark:bg-slate-600 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-200 dark:hover:bg-slate-500"
                        title="Copy text"
                    >
                        <AnimatePresence mode="wait">
                        <motion.i 
                            key={copied ? 'check' : 'copy'}
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.5, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className={`fa-solid ${copied ? 'fa-check text-green-500' : 'fa-copy'} text-xs`}
                        />
                        </AnimatePresence>
                    </button>
                )}
            </div>
            {isUser && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center">
                    <i className="fa-solid fa-user text-slate-500 dark:text-slate-300"></i>
                </div>
            )}
        </div>
    );
};


const AiToolsContent: React.FC<AiToolsContentProps> = (props) => {
     const { 
        selectedNodes, 
        onGenerateIdeas, onRephraseNode, onExtractConcepts, onGenerateAnalogy, onIdentifyAndLabel,
        isGeneratingIdeas, isRephrasing, isExtractingConcepts, isGeneratingAnalogy, isIdentifyingLabels,
        chatHistory, onChatSubmit, isAiReplying
    } = props;
    const [chatInput, setChatInput] = useState("");
    const chatContainerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [chatHistory, isAiReplying]);

    const handleChatSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!chatInput.trim() || isAiReplying) return;
        onChatSubmit(chatInput);
        setChatInput("");
    };

    const QuickActionButton: React.FC<{icon: string, text: string, onClick: () => void, loading: boolean, disabled: boolean, title?: string}> = ({ icon, text, onClick, loading, disabled, title }) => (
        <button onClick={onClick} disabled={loading || disabled} title={title} className="flex items-center w-full p-2 rounded-lg text-left text-slate-700 dark:text-slate-200 bg-white/50 dark:bg-slate-800/50 hover:bg-white/80 dark:hover:bg-slate-800/80 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-200/80 dark:border-slate-700/80 shadow-sm">
            <div className="w-8 h-8 rounded-md flex items-center justify-center bg-white dark:bg-slate-700 shadow-inner-sm">
                {loading ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className={`fa-solid ${icon} text-slate-600 dark:text-slate-300`}></i>}
            </div>
            <span className="ml-3 font-medium text-sm">{text}</span>
        </button>
    );

    const isSingleNodeSelected = selectedNodes.length === 1;
    const selectedNode = isSingleNodeSelected ? selectedNodes[0] : null;
    const hasChildren = !!(selectedNode?.children && selectedNode.children.length > 0);
    const hasImage = !!selectedNode?.image;
    const isRoot = !!(selectedNode && !selectedNode?.x && !selectedNode?.y);

    return (
    <div className="flex flex-col h-full">
        <div className="mb-4 flex-shrink-0">
            <h3 className="mb-2 text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
                <QuickActionButton icon="fa-lightbulb" text="Brainstorm" onClick={() => onGenerateIdeas(selectedNode!.id)} loading={isGeneratingIdeas} disabled={!isSingleNodeSelected} title={!isSingleNodeSelected ? "Select a single node to generate ideas" : ""} />
                <QuickActionButton icon="fa-tags" text="Identify & Label" onClick={() => onIdentifyAndLabel(selectedNode!.id)} loading={isIdentifyingLabels} disabled={!isSingleNodeSelected || !hasImage} title={!isSingleNodeSelected ? "Select a single node with an image" : !hasImage ? "This node needs an image to identify labels" : ""} />
                <QuickActionButton icon="fa-child-reaching" text="Analogy" onClick={() => onGenerateAnalogy(selectedNode!.id)} loading={isGeneratingAnalogy} disabled={!isSingleNodeSelected || isRoot} title={!isSingleNodeSelected ? "Select a single node" : isRoot ? "Cannot generate analogy for the root subject" : ""} />
                <QuickActionButton icon="fa-pen-nib" text="Rephrase" onClick={() => onRephraseNode(selectedNode!.id)} loading={isRephrasing} disabled={!isSingleNodeSelected || isRoot} title={!isSingleNodeSelected ? "Select a single node" : isRoot ? "Cannot rephrase the root subject" : ""} />
                <QuickActionButton icon="fa-key" text="Key Concepts" onClick={() => onExtractConcepts(selectedNode!.id)} loading={isExtractingConcepts} disabled={!isSingleNodeSelected || !hasChildren} title={!isSingleNodeSelected ? "Select a single node with children" : !hasChildren ? "This node needs children to extract concepts from" : ""} />
            </div>
        </div>
        
        <div className="flex-1 flex flex-col min-h-0">
            <h3 className="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Chat with AI Tutor</h3>
            <div ref={chatContainerRef} className="flex-1 overflow-y-auto -mx-2 px-2 space-y-4">
                {chatHistory.map((msg, index) => (
                    <ChatBubble key={index} message={msg} />
                ))}
                {isAiReplying && (
                     <div className="flex items-end gap-2 justify-start">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center self-start">
                            <i className="fa-solid fa-wand-magic-sparkles text-slate-500 dark:text-slate-300"></i>
                        </div>
                        <div className="max-w-[85%] p-3 rounded-2xl rounded-bl-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center gap-2">
                            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0s'}}></span>
                            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s'}}></span>
                            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s'}}></span>
                        </div>
                    </div>
                )}
            </div>
            <form onSubmit={handleChatSubmit} className="mt-4 flex-shrink-0">
                <div className="relative">
                    <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder={isSingleNodeSelected ? `Ask about "${selectedNode!.text}"...` : `Ask about these ${selectedNodes.length} topics...`} className="w-full pl-4 pr-12 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow text-sm" disabled={isAiReplying} />
                    <button type="submit" disabled={!chatInput.trim() || isAiReplying} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center disabled:opacity-50">
                        <i className="fa-solid fa-paper-plane"></i>
                    </button>
                </div>
            </form>
        </div>
    </div>
    );
};

const DocumentsContent: React.FC<Pick<AiAssistantProps, 'sourceDocuments' | 'generatingNodesFromFileId' | 'onUploadFile' | 'onRetryUpload' | 'onDeleteFile' | 'onGenerateNodes'>> = (props) => {
    const { sourceDocuments, generatingNodesFromFileId, onUploadFile, onRetryUpload, onDeleteFile, onGenerateNodes } = props;
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            onUploadFile(e.target.files[0]);
        }
        e.target.value = '';
    };

    const getFileIcon = (mimeType: string) => {
        if (mimeType.includes('pdf')) return 'fa-file-pdf text-red-500';
        if (mimeType.startsWith('text')) return 'fa-file-alt text-slate-500';
        return 'fa-file text-slate-500';
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex-shrink-0 mb-4">
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept=".pdf,.txt"
                />
                <button
                    onClick={handleUploadClick}
                    data-tutorial-id="upload-file-button"
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 transition-colors shadow-sm"
                >
                    <i className="fa-solid fa-upload"></i>
                    <span>Upload File</span>
                </button>
                <p className="text-xs text-center text-slate-500 dark:text-slate-400 mt-2">Supports PDF and TXT files.</p>
            </div>
            <div className="flex-1 overflow-y-auto -mx-2 px-2">
                {sourceDocuments.length > 0 ? (
                    <ul className="space-y-2">
                        {sourceDocuments.map(file => (
                            <li key={file.id} className="bg-white dark:bg-slate-700/50 p-3 rounded-lg flex items-center gap-3 border border-slate-200 dark:border-slate-700">
                                <i className={`fa-solid ${getFileIcon(file.mimeType)} text-2xl w-6 text-center`}></i>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{file.name}</p>
                                    {file.status === 'uploading' && <p className="text-xs text-slate-500 dark:text-slate-400">Uploading...</p>}
                                    {file.status === 'ready' && <p className="text-xs text-green-600 dark:text-green-400">Ready to use</p>}
                                    {file.status === 'error' && <p className="text-xs text-red-500 dark:text-red-400 truncate" title={file.errorMessage}>Error: {file.errorMessage}</p>}
                                </div>
                                <div className="flex items-center gap-1.5">
                                    {file.status === 'ready' && (
                                        <button
                                            onClick={() => onGenerateNodes(file)}
                                            disabled={!!generatingNodesFromFileId}
                                            data-tutorial-id={sourceDocuments.length === 1 ? 'generate-nodes-button' : undefined}
                                            className="w-8 h-8 flex items-center justify-center rounded-full text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50 hover:bg-blue-200 dark:hover:bg-blue-900 disabled:opacity-50 disabled:cursor-not-allowed"
                                            title="Generate mind map from this file"
                                        >
                                            {generatingNodesFromFileId === file.id ? <Spinner fullScreen={false} /> : <i className="fa-solid fa-wand-magic-sparkles"></i>}
                                        </button>
                                    )}
                                    {file.status === 'error' && (
                                        <button onClick={() => onRetryUpload(file)} className="w-8 h-8 flex items-center justify-center rounded-full text-yellow-600 bg-yellow-100 hover:bg-yellow-200" title="Retry Upload">
                                            <i className="fa-solid fa-rotate-right"></i>
                                        </button>
                                    )}
                                    <button onClick={() => onDeleteFile(file)} className="w-8 h-8 flex items-center justify-center rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600" title="Delete file">
                                        <i className="fa-solid fa-trash-can"></i>
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="text-center py-10">
                        <i className="fa-solid fa-file-circle-plus text-4xl text-slate-400 dark:text-slate-500"></i>
                        <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">No documents uploaded</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Upload a file to get started.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

const AiAssistant: React.FC<AiAssistantProps> = (props) => {
    const { isOpen, onOpen, onClose, isMobile, activeTab, onTabChange, selectedNodes, ...rest } = props;
    const dragControls = useDragControls();

    const transition: Transition = {
        type: "spring",
        stiffness: 400,
        damping: 40,
    };

    if (!isOpen) {
        return (
             <motion.button
                onClick={onOpen}
                className="fixed bottom-6 right-6 lg:bottom-auto lg:top-1/2 lg:-translate-y-1/2 lg:right-0 z-20 w-16 h-16 bg-blue-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-blue-600 transition-all duration-300 transform hover:scale-110 lg:rounded-r-none lg:w-12 lg:h-24"
                title="Open AI Assistant"
                data-tutorial-id="ai-assistant-bubble"
                initial={{ x: 100 }}
                animate={{ x: 0 }}
                exit={{ x: 100 }}
            >
                <i className="fa-solid fa-wand-magic-sparkles text-2xl"></i>
            </motion.button>
        );
    }
    
    return (
        <motion.div
            drag={!isMobile ? "x" : "y"}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
            className={`fixed z-30 bg-slate-100/80 dark:bg-slate-900/80 backdrop-blur-md shadow-2xl border-slate-200 dark:border-slate-700 ${isMobile ? 'bottom-0 left-0 right-0 h-[75vh] rounded-t-2xl border-t' : 'top-0 right-0 h-full w-[420px] border-l'}`}
            initial={isMobile ? { y: '100%' } : { x: '100%' }}
            animate={isMobile ? { y: 0 } : { x: 0 }}
            exit={isMobile ? { y: '100%' } : { x: '100%' }}
            transition={transition}
        >
            <div className={`absolute bg-slate-300 dark:bg-slate-600 rounded-full cursor-grab active:cursor-grabbing ${isMobile ? 'top-2 left-1/2 -translate-x-1/2 w-10 h-1.5' : 'top-1/2 -translate-y-1/2 left-0 w-1.5 h-10'}`} onPointerDown={(e) => dragControls.start(e)} />
            <div className="flex flex-col h-full">
                <div className="flex-shrink-0 flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700">
                    <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">AI Assistant</h2>
                    <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                        <i className="fa-solid fa-times"></i>
                    </button>
                </div>

                <div className="border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                    <div className="flex">
                        <TabButton text="AI Tools" icon="fa-wand-magic-sparkles" isActive={activeTab === 'ai'} onClick={() => onTabChange('ai')} />
                        <TabButton text="Attachments" icon="fa-paperclip" isActive={activeTab === 'attachments'} onClick={() => onTabChange('attachments')} count={selectedNodes[0]?.attachments?.length} />
                        <TabButton text="Documents" icon="fa-file-lines" isActive={activeTab === 'documents'} onClick={() => onTabChange('documents')} count={props.sourceDocuments.length} data-tutorial-id="documents-tab"/>
                    </div>
                </div>

                <div className="flex-1 p-4 overflow-y-auto">
                    {activeTab === 'ai' && <AiToolsContent {...props} />}
                    {activeTab === 'attachments' && <div>Attachments content goes here.</div>}
                    {activeTab === 'documents' && <DocumentsContent {...props} />}
                </div>
            </div>
        </motion.div>
    );
};

export default AiAssistant;