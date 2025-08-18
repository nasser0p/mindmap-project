import React, { useState, FormEvent, useRef, useEffect } from 'react';
import { motion, AnimatePresence, type Transition } from 'framer-motion';
import { MindMapNode, ChatMessage, Attachment, SourceDocumentFile, AiNudge } from '../types';
import Spinner from './Spinner';

interface AiAssistantProps {
    isOpen: boolean;
    onOpen: () => void;
    onClose: () => void;
    selectedNodes: MindMapNode[];
    sourceDocuments: SourceDocumentFile[];
    generatingNodesFromFileId: string | null;
    onGenerateIdeas: (nodeId: string) => void;
    onRephraseNode: (nodeId: string) => void;
    onExtractConcepts: (nodeId: string) => void;
    onGenerateAnalogy: (nodeId: string) => void;
    isGeneratingIdeas: boolean;
    isRephrasing: boolean;
    isExtractingConcepts: boolean;
    isGeneratingAnalogy: boolean;
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
    'onGenerateIdeas' | 'onRephraseNode' | 'onExtractConcepts' | 'onGenerateAnalogy' |
    'isGeneratingIdeas' | 'isRephrasing' | 'isExtractingConcepts' | 'isGeneratingAnalogy' |
    'chatHistory' | 'onChatSubmit' | 'isAiReplying'
>;

const TabButton: React.FC<{text: string, icon: string, isActive: boolean, onClick: () => void, count?: number}> = ({ text, icon, isActive, onClick, count=0 }) => (
    <button onClick={onClick} className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold border-b-2 transition-all duration-200 ${isActive ? 'border-blue-500 text-blue-500' : 'border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'}`}>
        <i className={`fa-solid ${icon}`}></i>
        <span>{text}</span>
        {count > 0 && <span className="text-xs bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold rounded-full px-2 py-0.5">{count}</span>}
    </button>
);

const AiToolsContent: React.FC<AiToolsContentProps> = (props) => {
     const { 
        selectedNodes, 
        onGenerateIdeas, onRephraseNode, onExtractConcepts, onGenerateAnalogy,
        isGeneratingIdeas, isRephrasing, isExtractingConcepts, isGeneratingAnalogy,
        chatHistory, onChatSubmit, isAiReplying
    } = props;
    const [chatInput, setChatInput] = useState("");
    const chatContainerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (chatContainerRef.current) chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }, [chatHistory]);

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
    const isRoot = !!(selectedNode && !selectedNode?.x && !selectedNode?.y);

    return (
    <>
        <div className="mb-6">
            <h3 className="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Quick Actions</h3>
            <div className="space-y-2">
                <QuickActionButton icon="fa-lightbulb" text="Brainstorm Ideas" onClick={() => onGenerateIdeas(selectedNode!.id)} loading={isGeneratingIdeas} disabled={!isSingleNodeSelected} title={!isSingleNodeSelected ? "Select a single node to generate ideas" : ""} />
                <QuickActionButton icon="fa-child-reaching" text="Explain with Analogy" onClick={() => onGenerateAnalogy(selectedNode!.id)} loading={isGeneratingAnalogy} disabled={!isSingleNodeSelected || isRoot} title={!isSingleNodeSelected ? "Select a single node" : isRoot ? "Cannot generate analogy for the root subject" : ""} />
                <QuickActionButton icon="fa-pen-nib" text="Rephrase Topic" onClick={() => onRephraseNode(selectedNode!.id)} loading={isRephrasing} disabled={!isSingleNodeSelected || isRoot} title={!isSingleNodeSelected ? "Select a single node" : isRoot ? "Cannot rephrase the root subject" : ""} />
                <QuickActionButton icon="fa-key" text="Extract Key Concepts" onClick={() => onExtractConcepts(selectedNode!.id)} loading={isExtractingConcepts} disabled={!isSingleNodeSelected || !hasChildren} title={!isSingleNodeSelected ? "Select a single node with children" : !hasChildren ? "This node needs children to extract concepts from" : ""} />
            </div>
        </div>
        
        <div className="flex-1 flex flex-col min-h-0">
            <h3 className="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Chat with AI Tutor</h3>
            <div ref={chatContainerRef} className="flex-1 overflow-y-auto -mx-2 px-2 space-y-4">
                {chatHistory.map((msg, index) => (
                    <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-blue-500 text-white rounded-br-lg' : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-bl-lg border border-slate-200 dark:border-slate-600'}`}>
                            {msg.text}
                        </div>
                    </div>
                ))}
                {isAiReplying && (
                    <div className="flex justify-start">
                        <div className="max-w-[85%] p-3 rounded-2xl text-sm bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-bl-lg border border-slate-200 dark:border-slate-600 flex items-center gap-2">
                            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0s'}}></span>
                            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s'}}></span>
                            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s'}}></span>
                        </div>
                    </div>
                )}
            </div>
            <form onSubmit={handleChatSubmit} className="mt-4">
                <div className="relative">
                    <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder={isSingleNodeSelected ? `Ask about "${selectedNode!.text}"...` : `Ask about these ${selectedNodes.length} topics...`} className="w-full pl-4 pr-12 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-400 transition-shadow text-sm" disabled={isAiReplying} />
                    <button type="submit" disabled={!chatInput.trim() || isAiReplying} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center hover:bg-blue-600 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors">
                        <i className="fa-solid fa-arrow-up"></i>
                    </button>
                </div>
            </form>
        </div>
    </>
    );
};

const AttachmentsHub: React.FC<{ selectedNodes: MindMapNode[], onAddAttachment: (nodeId: string, attachmentData: Omit<Attachment, 'id'>, file?: File) => void; onUpdateAttachment: (nodeId: string, attachmentId: string, updatedContent: Attachment['content']) => void; onDeleteAttachment: (nodeId: string, attachmentId: string) => void; }> = ({ selectedNodes, onAddAttachment, onUpdateAttachment, onDeleteAttachment }) => {
    const [editingAttachment, setEditingAttachment] = useState<Partial<Attachment> | null>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    if(selectedNodes.length !== 1) {
        return <div className="text-center text-slate-500 dark:text-slate-400 pt-10"><p>Select a single node to manage its attachments.</p></div>;
    }
    const selectedNode = selectedNodes[0];

    const handleAddImageClick = () => imageInputRef.current?.click();

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !selectedNode) return;
        const attachmentData: Omit<Attachment, 'id'> = {
            type: 'image',
            content: { downloadURL: '', storagePath: '', name: '' }
        };
        onAddAttachment(selectedNode.id, attachmentData, file);
        event.target.value = '';
    };

    const handleSave = (att: Partial<Attachment>) => {
        if (!selectedNode) return;
        if (att.id) {
            onUpdateAttachment(selectedNode.id, att.id, att.content!);
        } else {
            onAddAttachment(selectedNode.id, att as Omit<Attachment, 'id'>);
        }
        setEditingAttachment(null);
    }
    
    const attachments = selectedNode?.attachments || [];

    if (!selectedNode) return null;

    return (
        <div className="flex-1 flex flex-col h-full">
            <h3 className="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Attachments</h3>
            <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-3">
                {attachments.length === 0 && !editingAttachment && (
                    <div className="text-center text-slate-500 dark:text-slate-400 pt-10">
                        <div className="w-16 h-16 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center mb-4 mx-auto">
                            <i className="fa-solid fa-folder-open text-2xl text-slate-400 dark:text-slate-500"></i>
                        </div>
                        <p className="font-semibold">No Attachments</p>
                        <p className="text-sm">Add notes, images, or links to enrich this idea.</p>
                    </div>
                )}
                {attachments.map(att => editingAttachment?.id === att.id ? (
                     <AttachmentForm key={att.id} attachment={editingAttachment} onSave={handleSave} onCancel={() => setEditingAttachment(null)} />
                ) : (
                    <AttachmentItem key={att.id} attachment={att} onEdit={() => setEditingAttachment(att)} onDelete={() => onDeleteAttachment(selectedNode.id, att.id)} />
                ))}

                {editingAttachment && !editingAttachment.id && (
                    <AttachmentForm attachment={editingAttachment} onSave={handleSave} onCancel={() => setEditingAttachment(null)} />
                )}
            </div>

            {!editingAttachment && (
                <div className="pt-4 mt-auto border-t border-slate-200/80 dark:border-slate-700/80 flex items-center justify-around">
                    <button onClick={() => setEditingAttachment({type: 'note'})} className="flex flex-col items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-blue-500 transition-colors text-sm p-2 rounded-md">
                        <i className="fa-solid fa-note-sticky text-xl"></i>
                        <span>Add Note</span>
                    </button>
                     <button onClick={handleAddImageClick} className="flex flex-col items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-blue-500 transition-colors text-sm p-2 rounded-md">
                        <i className="fa-solid fa-image text-xl"></i>
                        <span>Add Image</span>
                    </button>
                     <button onClick={() => setEditingAttachment({type: 'link'})} className="flex flex-col items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-blue-500 transition-colors text-sm p-2 rounded-md">
                        <i className="fa-solid fa-link text-xl"></i>
                        <span>Add Link</span>
                    </button>
                    <input type="file" ref={imageInputRef} onChange={handleFileChange} hidden accept="image/*" />
                </div>
            )}
        </div>
    )
}

const AttachmentItem: React.FC<{attachment: Attachment, onEdit: () => void, onDelete: () => void}> = ({ attachment, onEdit, onDelete }) => {
    const renderContent = () => {
        switch(attachment.type) {
            case 'note': return <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">{attachment.content.text}</p>
            case 'image': return (
                <div>
                    <img src={attachment.content.downloadURL} alt={attachment.content.name} className="rounded-lg max-h-40 w-auto mb-2" />
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{attachment.content.name}</p>
                </div>
            )
            case 'link': return (
                <a href={attachment.content.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    <p className="font-semibold">{attachment.content.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{attachment.content.url}</p>
                </a>
            )
        }
    }
    const iconMap = { note: 'fa-note-sticky', image: 'fa-image', link: 'fa-link' };

    return (
        <div className="group relative bg-white/70 dark:bg-slate-800/70 p-3 rounded-lg border border-slate-200/80 dark:border-slate-700/80 shadow-sm">
            <div className="flex items-start gap-3">
                <i className={`fa-solid ${iconMap[attachment.type]} text-slate-400 dark:text-slate-500 mt-1`}></i>
                <div className="flex-1 min-w-0">{renderContent()}</div>
            </div>
             <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={onEdit} className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 flex items-center justify-center"><i className="fa-solid fa-pencil text-xs"></i></button>
                <button onClick={onDelete} className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-600 hover:bg-red-200 dark:hover:bg-red-900/50 text-slate-600 hover:text-red-600 flex items-center justify-center"><i className="fa-solid fa-trash-can text-xs"></i></button>
            </div>
        </div>
    )
}

const AttachmentForm: React.FC<{attachment: Partial<Attachment>, onSave: (att: Partial<Attachment>) => void, onCancel: () => void}> = ({ attachment, onSave, onCancel }) => {
    const getInitialContent = (): Partial<Attachment['content']> => {
        if (attachment.content) {
            return attachment.content;
        }
        switch (attachment.type) {
            case 'note': return { text: '' };
            case 'link': return { url: '', title: '' };
            case 'image': return { downloadURL: '', storagePath: '', name: '' };
            default:
                console.error("AttachmentForm: attachment type is undefined for new attachment.");
                return { text: '' };
        }
    };
    
    const [content, setContent] = useState<Partial<Attachment['content']>>(getInitialContent());
    
    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        
        switch (attachment.type) {
            case 'note': {
                const noteContent = content as { text: string };
                if (!noteContent.text.trim()) { alert("Note cannot be empty."); return; }
                onSave({ ...attachment, content: noteContent, type: 'note' });
                break;
            }
            case 'link': {
                const linkContent = content as { url: string; title: string };
                if (!linkContent.title?.trim() || !linkContent.url?.trim()) { alert("Please provide both a title and a URL."); return; }
                onSave({ ...attachment, content: linkContent, type: 'link' });
                break;
            }
        }
    }
    
    const renderFormFields = () => {
        switch(attachment.type) {
            case 'note': {
                const noteContent = content as { text: string };
                return ( <textarea value={noteContent.text} onChange={e => setContent({ text: e.target.value })} placeholder="Write your note..." className="w-full h-32 p-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded-md text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" autoFocus /> );
            }
            case 'link': {
                const linkContent = content as { url: string, title: string };
                return (
                     <div className="space-y-2">
                         <input type="text" value={linkContent.title || ''} onChange={e => setContent({ ...linkContent, title: e.target.value })} placeholder="Title" className="w-full p-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded-md text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" autoFocus />
                         <input type="url" value={linkContent.url || ''} onChange={e => setContent({ ...linkContent, url: e.target.value })} placeholder="https://example.com" className="w-full p-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded-md text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" />
                     </div>
                );
            }
            default: return null;
        }
    }

    return (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-blue-400 shadow-lg">
            {renderFormFields()}
            <div className="flex justify-end gap-2 mt-2">
                <button type="button" onClick={onCancel} className="px-3 py-1 text-sm rounded-md bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600">Cancel</button>
                <button type="submit" className="px-3 py-1 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600">Save</button>
            </div>
        </form>
    )
};

const DocumentsHub: React.FC<Pick<AiAssistantProps, 'sourceDocuments' | 'onUploadFile' | 'onRetryUpload' | 'onDeleteFile' | 'onGenerateNodes' | 'generatingNodesFromFileId'>> = (props) => {
    const { sourceDocuments, onUploadFile, onRetryUpload, onDeleteFile, onGenerateNodes, generatingNodesFromFileId } = props;
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleUploadClick = () => fileInputRef.current?.click();

    const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            onUploadFile(file);
        }
        event.target.value = ''; // Reset input
    };

    const getIconForMimeType = (mimeType?: string) => {
        if (!mimeType) return 'fa-file';
        if (mimeType.includes('pdf')) return 'fa-file-pdf text-red-500';
        if (mimeType.includes('word') || mimeType.includes('document')) return 'fa-file-word text-blue-500';
        if (mimeType.includes('image')) return 'fa-file-image text-purple-500';
        return 'fa-file';
    };

    return (
        <div className="flex-1 flex flex-col h-full">
            <div className="flex-shrink-0 mb-3 flex justify-between items-center">
                <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Source Documents</h3>
                <button onClick={handleUploadClick} className="px-3 py-1 text-xs font-semibold bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 transition-colors">
                    <i className="fa-solid fa-plus mr-1.5"></i>Upload File
                </button>
                <input type="file" ref={fileInputRef} onChange={handleFileSelected} hidden />
            </div>
            <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-2">
                {sourceDocuments.length === 0 ? (
                    <div className="text-center text-slate-500 dark:text-slate-400 pt-10">
                        <div className="w-16 h-16 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center mb-4 mx-auto">
                            <i className="fa-solid fa-file-arrow-up text-2xl text-slate-400 dark:text-slate-500"></i>
                        </div>
                        <p className="font-semibold">No Documents Uploaded</p>
                        <p className="text-sm">Upload PDFs or other files to use them as context.</p>
                    </div>
                ) : (
                    sourceDocuments.map(file => (
                        <div key={file.id} className="group bg-white/70 dark:bg-slate-800/70 p-2 rounded-lg border border-slate-200/80 dark:border-slate-700/80 shadow-sm flex items-center gap-3">
                            <i className={`fa-solid ${getIconForMimeType(file.mimeType)} text-xl w-6 text-center`}></i>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{file.name}</p>
                                {file.status === 'error' && <p className="text-xs text-red-500 truncate">Error: {file.errorMessage}</p>}
                            </div>
                            <div className="flex items-center gap-1">
                                {file.status === 'uploading' && <Spinner fullScreen={false}/>}
                                {file.status === 'processing' && <Spinner fullScreen={false}/>}
                                {file.status === 'error' && <button onClick={() => onRetryUpload(file)} title="Retry Upload" className="w-6 h-6 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-blue-500"><i className="fa-solid fa-rotate-right text-xs"></i></button>}
                                
                                {file.status === 'ready' && (
                                    <>
                                        <a href={file.downloadURL} target="_blank" rel="noopener noreferrer" title={`View ${file.name}`} className="w-6 h-6 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-blue-500">
                                            <i className="fa-solid fa-eye text-xs"></i>
                                        </a>
                                        <button onClick={() => onGenerateNodes(file)} disabled={generatingNodesFromFileId === file.id} title="Generate nodes from this document" className="w-6 h-6 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-blue-500 disabled:opacity-50">
                                            <i className={`fa-solid ${generatingNodesFromFileId === file.id ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'} text-xs`}></i>
                                        </button>
                                    </>
                                )}
                                
                                <button onClick={() => onDeleteFile(file)} title="Delete File" className="w-6 h-6 rounded-full hover:bg-red-200 dark:hover:bg-red-900/50 flex items-center justify-center text-slate-400 hover:text-red-500">
                                    <i className="fa-solid fa-trash-can text-xs"></i>
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
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
            className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4 overflow-hidden"
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


const AiAssistant: React.FC<AiAssistantProps> = (props) => {
    const { 
        isOpen, onOpen, onClose, selectedNodes, activeTab, onTabChange,
        aiNudge, onNudgeDismiss
    } = props;

    const transition: Transition = {
        type: 'spring',
        stiffness: 350,
        damping: 35,
    };

    if (!isOpen) {
        return (
            <motion.button
                onClick={onOpen}
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

    const attachmentCount = selectedNodes.length === 1 ? selectedNodes[0].attachments?.length || 0 : 0;
    const documentCount = props.sourceDocuments.length || 0;
    
    return (
        <motion.div
            layoutId="ai-assistant-bubble"
            className="fixed z-30 w-full h-[85vh] bottom-0 right-0 rounded-t-2xl md:w-[420px] md:h-[calc(100vh-80px)] md:max-h-[700px] md:bottom-6 md:right-6 md:rounded-2xl bg-slate-100/80 dark:bg-slate-900/80 backdrop-blur-lg shadow-2xl flex flex-col border border-transparent dark:border-slate-700"
            transition={transition}
            style={{ originX: 0.5, originY: 1 }}
        >
            <div className="flex-1 flex flex-col p-4 overflow-hidden">
                <div className="flex-shrink-0 flex justify-between items-center pb-3 mb-3 border-b border-slate-300/60 dark:border-slate-700/60">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">AI Assistant</h2>
                    <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-300/50 dark:hover:bg-slate-700/50 transition-colors">
                        <i className="fa-solid fa-times"></i>
                    </button>
                </div>

                <AnimatePresence>
                    {aiNudge && <NudgePanel nudge={aiNudge} onDismiss={onNudgeDismiss} />}
                </AnimatePresence>

                <div className="flex-1 flex flex-col min-h-0">
                {selectedNodes.length > 0 ? (
                    <>
                        <div className="flex-shrink-0 -mx-4 px-4 bg-slate-100/80 dark:bg-transparent">
                             <div className="p-3 mb-3 rounded-lg bg-white/60 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{selectedNodes.length > 1 ? `Selected ${selectedNodes.length} Topics` : 'Current Topic'}</p>
                                <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                                    {selectedNodes.length === 1 ? selectedNodes[0].text : selectedNodes.map(n => n.text).join(', ')}
                                </p>
                            </div>
                            <div className="flex border-b border-slate-300/60 dark:border-slate-700/60">
                                <TabButton text="AI Tools" icon="fa-wand-magic-sparkles" isActive={activeTab === 'ai'} onClick={() => onTabChange('ai')} />
                                <TabButton text="Attachments" icon="fa-paperclip" isActive={activeTab === 'attachments'} onClick={() => onTabChange('attachments')} count={attachmentCount} />
                                <TabButton text="Documents" icon="fa-file-lines" isActive={activeTab === 'documents'} onClick={() => onTabChange('documents')} count={documentCount} />
                            </div>
                        </div>
                       
                        <div className="flex-1 min-h-0 mt-4">
                            {activeTab === 'ai' && <AiToolsContent {...props} />}
                            {activeTab === 'attachments' && <AttachmentsHub selectedNodes={selectedNodes} {...props} />}
                            {activeTab === 'documents' && <DocumentsHub {...props} />}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-500 dark:text-slate-400 p-4">
                        <div className="w-20 h-20 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center mb-4">
                            <i className="fa-solid fa-hand-pointer text-3xl text-slate-400 dark:text-slate-500"></i>
                        </div>
                        <p className="font-semibold text-lg">Select a Node</p>
                        <p>Click on any topic in your mind map to start interacting with the AI.</p>
                    </div>
                )}
                </div>
            </div>
        </motion.div>
    );
};

export default AiAssistant;