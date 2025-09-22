import React, { useState, FormEvent, useRef, useEffect } from 'react';
import { motion, AnimatePresence, type Transition, useDragControls } from 'framer-motion';
import { MindMapNode, ChatMessage, AiNudge, SourceDocumentFile } from '../types';

interface AiAssistantProps {
    isOpen: boolean;
    onOpen: () => void;
    onClose: () => void;
    isMobile: boolean;
    selectedNodes: MindMapNode[];
    chatHistory: ChatMessage[];
    onChatSubmit: (question: string) => void;
    isAiReplying: boolean;
    aiNudge: AiNudge | null;
    onNudgeDismiss: () => void;
    sourceDocuments: SourceDocumentFile[];
    onFileUpload: (file: File) => void;
    onDeleteFile: (fileId: string) => void;
    onGenerateNodesFromFile: (fileId: string) => void;
    generatingNodesFromFileId: string | null;
}

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
                : 'bg-white/70 dark:bg-slate-700/70 rounded-bl-lg border border-slate-200 dark:border-slate-600'
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

const NudgePanel: React.FC<{ nudge: AiNudge; onDismiss: () => void }> = ({ nudge, onDismiss }) => {
    const handleAction = async () => {
        await nudge.action();
        onDismiss();
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: -20, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -20, height: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="bg-blue-50/50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4 overflow-hidden"
        >
            <div className="flex items-start gap-3">
                <i className="fa-solid fa-lightbulb-on text-xl text-yellow-400 mt-1"></i>
                <div className="flex-1">
                    <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">Eureka Bot noticed something!</p>
                    <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">{nudge.message}</p>
                    <div className="mt-3 flex items-center gap-2">
                        <button
                            onClick={handleAction}
                            className="px-3 py-1 text-xs font-semibold bg-blue-500 text-white rounded-md hover:bg-blue-600"
                        >
                            {nudge.actionLabel}
                        </button>
                        <button
                            onClick={onDismiss}
                            className="px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md"
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

const TabButton: React.FC<{ text: string, icon: string, isActive: boolean, onClick: () => void, 'data-tutorial-id'?: string }> = ({ text, icon, isActive, onClick, 'data-tutorial-id': dataTutorialId }) => (
    <button
        onClick={onClick}
        data-tutorial-id={dataTutorialId}
        className={`relative flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors ${
            isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:bg-white/20 dark:hover:bg-slate-700/40'
        }`}
    >
        <i className={`fa-solid ${icon}`}></i>
        <span>{text}</span>
        {isActive && <motion.div layoutId="ai-assistant-tab-indicator" className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-blue-500" />}
    </button>
);

const FileStatusIcon: React.FC<{ status: SourceDocumentFile['status'] }> = ({ status }) => {
    switch (status) {
        case 'uploading':
            return <i className="fa-solid fa-spinner fa-spin text-blue-500" title="Uploading..."></i>;
        case 'processing':
            return <i className="fa-solid fa-cogs fa-spin text-purple-500" title="Processing..."></i>;
        case 'ready':
            return <i className="fa-solid fa-check-circle text-green-500" title="Ready"></i>;
        case 'error':
            return <i className="fa-solid fa-exclamation-circle text-red-500" title="Error"></i>;
        default:
            return null;
    }
};

const DocumentsPanel: React.FC<{
    documents: SourceDocumentFile[];
    onUploadClick: () => void;
    onDelete: (id: string) => void;
    onGenerate: (id: string) => void;
    generatingId: string | null;
}> = ({ documents, onUploadClick, onDelete, onGenerate, generatingId }) => {
    return (
        <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-2">
                {documents.map(doc => (
                    <div key={doc.id} className="p-3 bg-white/10 dark:bg-black/10 rounded-lg flex items-center gap-3 border border-slate-200/80 dark:border-slate-700/80">
                        <div className="w-6 text-center text-lg"><FileStatusIcon status={doc.status} /></div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate text-slate-800 dark:text-slate-100">{doc.name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">{doc.status}</p>
                        </div>
                        {doc.status === 'ready' && (
                            <button
                                onClick={() => onGenerate(doc.id)}
                                disabled={generatingId === doc.id}
                                className="px-3 py-1 text-xs font-semibold bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-wait flex items-center gap-2"
                                title="Generate mind map from this document"
                                data-tutorial-id="generate-nodes-button"
                            >
                                {generatingId === doc.id ? (
                                    <i className="fa-solid fa-spinner fa-spin"></i>
                                ) : (
                                    <i className="fa-solid fa-wand-magic-sparkles"></i>
                                )}
                                <span>Generate Map</span>
                            </button>
                        )}
                        <button
                            onClick={() => onDelete(doc.id)}
                            className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full text-slate-500 dark:text-slate-400 hover:bg-red-100 dark:hover:bg-red-900/50 hover:text-red-500 transition-colors"
                            title="Delete file"
                        >
                            <i className="fa-solid fa-trash-can text-xs"></i>
                        </button>
                    </div>
                ))}
                {documents.length === 0 && (
                     <div className="text-center text-slate-500 dark:text-slate-400 pt-12">
                        <i className="fa-solid fa-file-circle-plus text-4xl mb-3"></i>
                        <p className="font-semibold">No documents yet.</p>
                        <p className="text-sm">Upload a PDF or text file to get started.</p>
                    </div>
                )}
            </div>
            <button
                onClick={onUploadClick}
                data-tutorial-id="upload-file-button"
                className="mt-4 w-full py-2.5 bg-white/80 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-600 rounded-full font-semibold hover:bg-slate-50/80 dark:hover:bg-slate-700/80 transition-colors flex items-center justify-center gap-2"
            >
                <i className="fa-solid fa-upload"></i>
                <span>Upload File</span>
            </button>
        </div>
    );
};


const AiAssistant: React.FC<AiAssistantProps> = (props) => {
    const { 
        isOpen, onOpen, onClose, isMobile, selectedNodes,
        chatHistory, onChatSubmit, isAiReplying,
        aiNudge, onNudgeDismiss,
        sourceDocuments, onFileUpload, onDeleteFile,
        onGenerateNodesFromFile, generatingNodesFromFileId
    } = props;

    const [height, setHeight] = useState(window.innerHeight * 0.7);
    const dragControls = useDragControls();
    
    const [chatInput, setChatInput] = useState("");
    const [activeTab, setActiveTab] = useState<'chat' | 'documents'>('chat');
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    const startDrag = (event: React.PointerEvent) => {
        dragControls.start(event, { snapToCursor: false });
    };
    
    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            onFileUpload(file);
        }
        if(event.target) {
            event.target.value = '';
        }
    };


    const transition: Transition = {
        type: 'spring',
        stiffness: 350,
        damping: 35,
    };

    if (!isOpen) {
        // The floating bubble is the entry point on desktop only.
        if (!isMobile) {
            return (
                <motion.button
                    onClick={onOpen}
                    data-tutorial-id="ai-assistant-bubble"
                    className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-6 py-3 rounded-full text-white font-semibold shadow-lg transition-all duration-300 transform hover:scale-105 ${
                        aiNudge ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-blue-500 hover:bg-blue-600'
                    }`}
                    title="Ask AI"
                    layoutId="ai-assistant-bubble"
                    transition={transition}
                >
                    <AnimatePresence mode="wait">
                        {aiNudge ? (
                            <motion.div key="nudge" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="flex items-center gap-3">
                                <i className="fa-solid fa-lightbulb-on fa-beat" style={{'--fa-animation-duration': '2s'} as React.CSSProperties}></i>
                                <span>Eureka Bot has a tip!</span>
                            </motion.div>
                        ) : (
                            <motion.div key="default" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="flex items-center gap-3">
                               <i className="fa-solid fa-wand-magic-sparkles"></i>
                               <span>Ask AI Anything</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.button>
            );
        }
        return null; // On mobile, the entry point is in the MobileToolbar, so don't render anything here.
    }
    
    const isSingleNodeSelected = selectedNodes.length === 1;

    return (
        <motion.div
            layoutId="ai-assistant-bubble"
            className="fixed z-30 w-full bottom-0 right-0 rounded-t-2xl md:w-[420px] md:bottom-6 md:right-6 md:rounded-2xl glass-effect flex flex-col"
            transition={transition}
            style={{ 
                height: `min(${height}px, 90vh)`,
                originX: 0.5, 
                originY: 1 
            }}
        >
            <motion.div
                drag="y"
                dragControls={dragControls}
                dragListener={false}
                onPointerDown={startDrag}
                onDrag={(_event, info) => {
                    setHeight(prev => {
                        const newHeight = prev - info.delta.y;
                        const minHeight = 400;
                        const maxHeight = window.innerHeight * 0.95;
                        return Math.max(minHeight, Math.min(newHeight, maxHeight));
                    });
                }}
                className="absolute hidden md:block top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-4 pt-2 cursor-ns-resize group"
                title="Drag to resize"
            >
                <div className="w-10 h-1 bg-slate-300 dark:bg-slate-600 rounded-full mx-auto group-hover:bg-slate-400 dark:group-hover:bg-slate-500 transition-colors"></div>
            </motion.div>
            
             <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelected}
                className="hidden"
                accept=".pdf,.txt"
            />

            <div className="flex-1 flex flex-col p-4 overflow-hidden">
                <div className="flex-shrink-0 flex justify-between items-center pb-3 border-b border-white/20 dark:border-slate-700/60">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">AI Assistant</h2>
                    <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-white/30 dark:hover:bg-slate-700/50 transition-colors">
                        <i className="fa-solid fa-times"></i>
                    </button>
                </div>
                
                 <div className="flex-shrink-0 flex items-center gap-2 border-b border-white/20 dark:border-slate-700/60 mb-3">
                    <TabButton text="Chat" icon="fa-comments" isActive={activeTab === 'chat'} onClick={() => setActiveTab('chat')} data-tutorial-id="chat-tab" />
                    <TabButton text="Documents" icon="fa-file-lines" isActive={activeTab === 'documents'} onClick={() => setActiveTab('documents')} data-tutorial-id="documents-tab" />
                </div>


                <AnimatePresence>
                    {aiNudge && <NudgePanel nudge={aiNudge} onDismiss={onNudgeDismiss} />}
                </AnimatePresence>

                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        className="flex-1 flex flex-col min-h-0"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                    {activeTab === 'chat' ? (
                        <>
                        {selectedNodes.length > 0 ? (
                            <>
                                <div className="flex-shrink-0 p-3 mb-3 rounded-lg bg-white/10 dark:bg-black/10 border border-slate-200/80 dark:border-slate-700/80">
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{selectedNodes.length > 1 ? `Selected ${selectedNodes.length} Topics` : 'Current Topic'}</p>
                                <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                                    {selectedNodes.length === 1 ? selectedNodes[0].text : selectedNodes.map(n => n.text).join(', ')}
                                </p>
                            </div>
                            
                                <div ref={chatContainerRef} className="flex-1 overflow-y-auto -mx-2 px-2 space-y-4">
                                    {chatHistory.map((msg, index) => (
                                        <ChatBubble key={index} message={msg} />
                                    ))}
                                    {isAiReplying && (
                                        <div className="flex items-end gap-2 justify-start">
                                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center self-start">
                                                <i className="fa-solid fa-wand-magic-sparkles text-slate-500 dark:text-slate-300"></i>
                                            </div>
                                            <div className="max-w-[85%] p-3 rounded-2xl rounded-bl-lg bg-white/70 dark:bg-slate-700/70 border border-slate-200 dark:border-slate-600 flex items-center gap-2">
                                                <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0s'}}></span>
                                                <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s'}}></span>
                                                <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s'}}></span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <form onSubmit={handleChatSubmit} className="mt-4 flex-shrink-0">
                                    <div className="relative">
                                        <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder={isSingleNodeSelected ? `Ask about "${selectedNodes[0].text}"...` : `Ask about these ${selectedNodes.length} topics...`} className="w-full pl-4 pr-12 py-2.5 bg-white/80 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-600 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow text-sm" disabled={isAiReplying} />
                                        <button type="submit" disabled={!chatInput.trim() || isAiReplying} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center hover:bg-blue-600 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors">
                                            <i className="fa-solid fa-arrow-up"></i>
                                        </button>
                                    </div>
                                </form>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-500 dark:text-slate-400 p-4">
                                <div className="w-20 h-20 rounded-full bg-slate-200/50 dark:bg-slate-800/50 flex items-center justify-center mb-4">
                                    <i className="fa-solid fa-hand-pointer text-3xl text-slate-400 dark:text-slate-500"></i>
                                </div>
                                <p className="font-semibold text-lg">Select a Node</p>
                                <p>Click on any topic in your mind map to start interacting with the AI.</p>
                            </div>
                        )}
                        </>
                    ) : (
                        <DocumentsPanel
                            documents={sourceDocuments}
                            onUploadClick={handleUploadClick}
                            onDelete={onDeleteFile}
                            onGenerate={onGenerateNodesFromFile}
                            generatingId={generatingNodesFromFileId}
                        />
                    )}
                    </motion.div>
                </AnimatePresence>
            </div>
        </motion.div>
    );
};

export default AiAssistant;