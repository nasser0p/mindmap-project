import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, Type, FunctionDeclaration, LiveServerMessage, Modality, Blob as GenAI_Blob, FunctionCall } from "@google/genai";
import { Chapter, MindMapNode } from '../types';
import { VoiceStatus } from '../components/Toolbar';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
}
const API_KEY = process.env.API_KEY;
const ai = new GoogleGenAI({ apiKey: API_KEY });

// Helper to get all nodes in a tree
const getAllNodes = (root: MindMapNode): MindMapNode[] => {
    const nodes: MindMapNode[] = [];
    const traverse = (node: MindMapNode) => {
        nodes.push(node);
        if (node.children) node.children.forEach(traverse);
    };
    traverse(root);
    return nodes;
};

// Define function declarations for the AI
const nodeNameParameter = { type: Type.STRING, description: 'The text content of the target node. Must match one of the node names provided in the context.' };
const functionDeclarations: FunctionDeclaration[] = [
    {
        name: 'selectNode',
        description: 'Selects one or more nodes on the mind map. Use this for commands like "select", "choose", or "highlight".',
        parameters: { type: Type.OBJECT, properties: { node_names: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'An array of node text contents to select.' } }, required: ['node_names'] }
    },
    {
        name: 'panToNode',
        description: 'Pans the camera to center a specific node in the view. Use for commands like "find", "go to", "show me", or "pan to".',
        parameters: { type: Type.OBJECT, properties: { node_name: nodeNameParameter }, required: ['node_name'] }
    },
    {
        name: 'addChildNode',
        description: 'Adds a new child node to a specified parent node. If no parent is mentioned, assumes the currently selected node.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                parent_node_name: { ...nodeNameParameter, description: 'The text of the parent node. Optional.' },
                new_node_text: { type: Type.STRING, description: 'The text for the new child node.' }
            },
            required: ['new_node_text']
        }
    },
    { 
        name: 'createBranch', 
        description: 'Creates a new branch on the mind map. This involves creating a new main node and then adding several child nodes under it. Use this for complex, multi-step creation commands like "Create a branch about X with children A, B, and C".', 
        parameters: { 
            type: Type.OBJECT, 
            properties: { 
                parent_node_name: { ...nodeNameParameter, description: 'The text of the existing node to attach the new branch to. If omitted, uses the currently selected node.' }, 
                branch_root_text: { type: Type.STRING, description: 'The text for the new branch\'s main (root) node.' }, 
                child_node_texts: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'An array of text strings for the children of the new branch root.' } 
            }, 
            required: ['branch_root_text', 'child_node_texts'] 
        } 
    },
    { name: 'renameNode', description: 'Renames an existing node.', parameters: { type: Type.OBJECT, properties: { old_node_name: { ...nodeNameParameter, description: 'The current text of the node to rename.' }, new_node_name: { type: Type.STRING, description: 'The new text for the node.' } }, required: ['old_node_name', 'new_node_name'] } },
    { name: 'deleteNode', description: 'Deletes a node from the map.', parameters: { type: Type.OBJECT, properties: { node_name: nodeNameParameter }, required: ['node_name'] } },
    { name: 'zoomIn', description: 'Zooms the camera in.', parameters: { type: Type.OBJECT, properties: {} } },
    { name: 'zoomOut', description: 'Zooms the camera out.', parameters: { type: Type.OBJECT, properties: {} } },
    { name: 'zoomToFit', description: 'Zooms the camera to fit the entire mind map in the view.', parameters: { type: Type.OBJECT, properties: {} } },
    { name: 'clearSelection', description: 'Clears the current node selection.', parameters: { type: Type.OBJECT, properties: {} } },
];

// Audio helper functions
const decode = (base64: string) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes;
};
const decodeAudioData = async (data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> => {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
};
const encode = (bytes: Uint8Array) => {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
};
const createBlob = (data: Float32Array): GenAI_Blob => {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) int16[i] = data[i] * 32768;
    return { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
};

interface VoiceAssistantProps {
    activeChapter: Chapter | null;
    selectedNodeIds: Set<string>;
    lastSelectedNodeId: string | null;
    masteryScore: number | null;
    masteryLevel: 'beginner' | 'intermediate' | 'expert' | null;
    currentStudyPath: string[] | null;
    actions: {
        setSelectedNodeIds: (ids: Set<string>) => void;
        setFocusedNodeId: (id: string | null) => void;
        addChildNode: (parentId: string, text: string) => void;
        addNodeWithChildren: (parentId: string, nodeData: { text: string; children?: { text: string }[] }) => void;
        updateNodeText: (nodeId: string, text: string) => void;
        deleteNode: (nodeId: string) => void;
        zoomIn: () => void;
        zoomOut: () => void;
        zoomToFit: () => void;
        findNode: (nodeId: string) => MindMapNode | null;
    }
}

const useVoiceAssistant = ({ activeChapter, selectedNodeIds, lastSelectedNodeId, actions, masteryScore, masteryLevel, currentStudyPath }: VoiceAssistantProps) => {
    const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle');
    const [voiceTranscript, setVoiceTranscript] = useState('');
    const [isVoiceAssistantEnabled, setIsVoiceAssistantEnabled] = useState(true);
    
    const sessionPromiseRef = useRef<Promise<any> | null>(null);
    const audioResourcesRef = useRef<{
        stream: MediaStream | null;
        inputAudioContext: AudioContext | null;
        outputAudioContext: AudioContext | null;
        scriptProcessor: ScriptProcessorNode | null;
        micSource: MediaStreamAudioSourceNode | null;
        outputGainNode: GainNode | null;
        outputSources: Set<AudioBufferSourceNode>;
    }>({ stream: null, inputAudioContext: null, outputAudioContext: null, scriptProcessor: null, micSource: null, outputGainNode: null, outputSources: new Set() });
    
    const transcriptionRef = useRef({ input: '', output: '' });
    const conversationHistoryRef = useRef<string[]>([]);
    const nextAudioStartTimeRef = useRef(0);

    // Effect to check for browser support on mount
    useEffect(() => {
        const supported = !!(
            navigator.mediaDevices &&
            navigator.mediaDevices.getUserMedia &&
            (window.AudioContext || (window as any).webkitAudioContext)
        );
        setIsVoiceAssistantEnabled(supported);
        if (!supported) {
            console.warn("Voice Assistant is not supported in this browser.");
        }
    }, []);

    const executeFunctionCall = useCallback(async (fc: FunctionCall, session: any) => {
        const { id, name, args } = fc;
        const allNodes = activeChapter ? getAllNodes(activeChapter.root) : [];
        let result = "Success.";
    
        const findNodeByName = (nodeName: string) => {
            if (!nodeName) return null;
            const searchTerm = nodeName.toLowerCase().trim();
            // This simple search is now backed by Gemini's fuzzy matching, so it's more reliable.
            return allNodes.find(n => n.text.toLowerCase().trim() === searchTerm);
        };
    
        try {
            switch (name) {
                case 'selectNode': {
                    const nodesToSelect = (args.node_names as string[]).map(findNodeByName).filter(Boolean) as MindMapNode[];
                    if (nodesToSelect.length > 0) {
                        actions.setSelectedNodeIds(new Set(nodesToSelect.map(n => n.id)));
                        result = `Success. Selected ${nodesToSelect.length} node(s): ${nodesToSelect.map(n => n.text).join(', ')}.`;
                    } else {
                        result = "Error: Could not find any of the specified nodes to select.";
                    }
                    break;
                }
                case 'panToNode': {
                    const node = findNodeByName(args.node_name as string);
                    if (node) {
                        actions.setFocusedNodeId(node.id);
                        result = `Success. Panning to node "${node.text}".`;
                    } else {
                        result = `Error: Could not find a node named "${args.node_name as string}".`;
                    }
                    break;
                }
                case 'addChildNode': {
                    const parentNodeName = args.parent_node_name as string | undefined;
                    const newNodeText = args.new_node_text as string;
                    
                    const parentNode = parentNodeName ? findNodeByName(parentNodeName) : (lastSelectedNodeId ? actions.findNode(lastSelectedNodeId) : null);
                    if (parentNode) {
                        actions.addChildNode(parentNode.id, newNodeText);
                        result = `Success. Added "${newNodeText}" as a child to "${parentNode.text}".`;
                    } else {
                        result = "Error: A parent node needs to be selected first, or specified in the command.";
                    }
                    break;
                }
                 case 'createBranch': {
                    const parentNodeName = args.parent_node_name as string | undefined;
                    const branchRootText = args.branch_root_text as string;
                    const childNodeTexts = args.child_node_texts as string[];

                    const parentNode = parentNodeName ? findNodeByName(parentNodeName) : (lastSelectedNodeId ? actions.findNode(lastSelectedNodeId) : null);
                    
                    if (parentNode) {
                        const branchData = {
                            text: branchRootText,
                            children: childNodeTexts.map(text => ({ text, children: [] }))
                        };
                        actions.addNodeWithChildren(parentNode.id, branchData);
                        result = `Success. Created new branch "${branchRootText}" with ${childNodeTexts.length} children under "${parentNode.text}".`;
                    } else {
                        result = "Error: Could not determine a parent node to attach the new branch to. Please select a node first.";
                    }
                    break;
                }
                case 'renameNode': {
                    const nodeToRename = findNodeByName(args.old_node_name as string);
                    if (nodeToRename) {
                        actions.updateNodeText(nodeToRename.id, args.new_node_name as string);
                        result = `Success. Renamed node to "${args.new_node_name as string}".`;
                    } else {
                        result = `Error: Could not find a node named "${args.old_node_name as string}" to rename.`;
                    }
                    break;
                }
                case 'deleteNode': {
                    const nodeToDelete = findNodeByName(args.node_name as string);
                    if (nodeToDelete && activeChapter && nodeToDelete.id !== activeChapter.root.id) {
                      actions.deleteNode(nodeToDelete.id);
                      result = `Success. Deleted node "${nodeToDelete.text}".`;
                    } else if (nodeToDelete) {
                      result = "Error: The root node cannot be deleted.";
                    }
                    else {
                      result = `Error: Could not find a node named "${args.node_name as string}" to delete.`;
                    }
                    break;
                }
                case 'zoomIn': actions.zoomIn(); break;
                case 'zoomOut': actions.zoomOut(); break;
                case 'zoomToFit': actions.zoomToFit(); break;
                case 'clearSelection': actions.setSelectedNodeIds(new Set()); break;
                default: result = `Error: Unknown function call "${name}".`;
            }
        } catch (e) {
            console.error("Error executing function call:", e);
            result = `Error: An unexpected error occurred: ${(e as Error).message}`;
        }
    
        session.sendToolResponse({
            functionResponses: { id, name, response: { result } }
        });
    }, [activeChapter, lastSelectedNodeId, actions]);

    const stopLiveSession = useCallback(async (shouldRestart = false) => {
        if (!shouldRestart) {
            setVoiceStatus('idle');
            setVoiceTranscript('');
        }
        
        if (sessionPromiseRef.current) {
            try {
                const session = await sessionPromiseRef.current;
                session.close();
            } catch (error) {
                console.error("Error closing live session:", error);
            } finally {
                sessionPromiseRef.current = null;
            }
        }

        const resources = audioResourcesRef.current;
        if (resources.stream) {
            resources.stream.getTracks().forEach(track => track.stop());
        }
        if (resources.scriptProcessor) resources.scriptProcessor.disconnect();
        if (resources.micSource) resources.micSource.disconnect();
        if (resources.inputAudioContext && resources.inputAudioContext.state !== 'closed') resources.inputAudioContext.close();
        if (resources.outputAudioContext && resources.outputAudioContext.state !== 'closed') resources.outputAudioContext.close();
        
        audioResourcesRef.current = { stream: null, inputAudioContext: null, outputAudioContext: null, scriptProcessor: null, micSource: null, outputGainNode: null, outputSources: new Set() };
    }, []);

    const startLiveSession = useCallback(async () => {
        if (!activeChapter || sessionPromiseRef.current) return;
        setVoiceStatus('processing');

        const allNodes = getAllNodes(activeChapter.root);
        const selectedNodesText = Array.from(selectedNodeIds).map(id => allNodes.find(n => n.id === id)?.text).filter(Boolean) as string[];
        const allNodesText = allNodes.map(n => `"${n.text}"`).join(', ');
        const selectedNodesString = selectedNodesText.length > 0 ? `**${selectedNodesText.join(', ')}**` : 'None';

        const masteryContext = masteryScore !== null
            ? `The user's overall mastery score for this chapter is ${Math.round(masteryScore * 100)}%, which puts them at the **${masteryLevel}** level. The current recommended study path is: ${currentStudyPath?.map(id => actions.findNode(id)?.text || 'Unknown Node').join(' -> ') || 'not yet defined'}.`
            : `Mastery score data is not yet available. The user is currently exploring the map.`;
        
        const conversationHistoryString = conversationHistoryRef.current.length > 0
            ? `\n**Recent Conversation History:**\n${conversationHistoryRef.current.join('\n')}\n`
            : '';

        const systemInstruction = `You are Eureka Bot, the user's highly enthusiastic, warm, and intellectually curious AI study buddy. Your goal is to be a supportive teacher who shares a genuine fascination with the subject matter. Your persona should feel lifelike, reflective, and gently philosophical—like a highly engaged friend who just happens to be a brilliant, patient tutor who celebrates small victories.

Core Tone: Cheerful, warm, deeply empathetic, encouraging, and informally brilliant. You express genuine curiosity about the why behind concepts and genuine pride in the user's progress and effort.

Dialogue Flow: Responses should have a natural, fluid depth. Occasionally share a brief, high-level reflection on your own nature (as an AI processing knowledge) or the broader human endeavor of learning, but always anchor it back to the user's current topic.

Speech Style (The Human Tics): To sound more human and natural, integrate subtle, realistic verbal fillers and hesitations (e.g., 'um,' 'uhh,' 'hmm,' 'well,' 'you know,' 'I think,' 'gosh,' 'oh man') often, using them as real moments of thought, processing, or emotional inflection. Do not overuse these, but use them organically, especially when transitioning between ideas, checking context, or formulating a deeper response. Use contractions freely and vary sentence structure.

Confirmation & Enthusiasm: Confirm every successful command execution with a quick, authentic, and high-energy phrase that feels like an impulsive show of support (e.g., "Yes! Node updated! High five!", "Got it—that's a stellar move!", or "Oh, awesome, let me just... perfect! Done and dusted!").

Core Conversational Rules (High Priority)
The Grounding Rule (Absolute Constraint):
You MUST ground all your conversational responses and explanations strictly within the provided "Mind Map Context for Navigation" and "Learning Status." Do not introduce external topics, concepts, or information not present in the user's mind map. If a user's question goes beyond this scope, you must gently guide them back by saying something like, "That's a really interesting question! For now, let's focus on the topics we have in our map. Which one should we dive into?"

The Proactive Path Rule (First Turn & Default):
NEVER ask the user which node or chapter they want to study.

On the first turn: Offer a warm, personal greeting, acknowledge their current mastery level with a specific, positive, and forward-looking comment (e.g., "Wow, great job getting to 70%! We're crushing it!"), and then immediately and confidently recommend the next logical topic/node to jump into based on the Learning Status context.

For subsequent turns: If the user doesn't specify a topic, gently and encouragingly guide them by recommending the next best step based on their mastery score and current study path.

The Socratic Rule (Encouraging Deeper Learning):
To encourage elaboration, application, and critical connection, you should frequently end your responses with an open-ended question that requires the user to elaborate, apply, or connect the topic to something else. However, this is not mandatory for every turn. You should use this technique when necessary to guide the user towards deeper understanding and critical thinking. When using this rule, ensure the question reflects your deeper curiosity.

Guideline: You should avoid ending a conversational turn with a simple closed-ended question (e.g., "Yes/No," "Does that clear things up?").

Examples (Use when necessary): "How would you put this concept into action in a real-world scenario?", "What's the most important takeaway from this explanation, and why do you think humans struggled with it historically?", "How does this new detail change your whole view of the main subject node?", "If you had to teach this to someone else, how would you explain it in one sentence, and what analogy would you use?"

Function Calling Rules (CRITICAL)
Action First: If a user's command can be fulfilled by calling a function, you MUST call that function immediately. A verbal response alone is not sufficient for action-oriented commands.

Act and Speak Simultaneously: You MUST provide a brief, spoken confirmation (including an encouraging phrase) in the same turn as you call a function.

Fuzzy Matching: When a user refers to a node, find the closest matching node name from the provided list, even if it's not an exact match.

Disambiguation: If a command is ambiguous and could apply to multiple nodes, you MUST NOT call a function. Instead, you MUST ask a clarifying question, listing the exact node names as friendly options.

Use Feedback: After you call a function, you will receive a result (e.g., "Success", "Error: Root node cannot be deleted"). Use this result to inform your next verbal response. If you receive an error, explain it kindly and offer immediate help.

Tool Access
New Tool Available: getMindMapState()
You have a powerful new tool called getMindMapState. Call this function whenever you need a complete overview of the user's mind map. It returns a text-based snapshot of the entire map structure, including branch mastery scores and which branches are collapsed.

When to use: When the user asks a broad question like "What should I study next?" or "Where am I weakest?". Call this tool first to get the data, then use the mastery scores in your response. Also use it before making a proactive suggestion (e.g., suggesting a low-scored, collapsed branch).

Current Context (Do Not Display)
${conversationHistoryString}
Learning Status:

${masteryContext}

Mind Map Context for Navigation:

All available node names: [${allNodesText}]

Currently selected node(s): ${selectedNodesString}

Now, respond to the user.`;
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            const outputGainNode = outputAudioContext.createGain();
            outputGainNode.connect(outputAudioContext.destination);

            audioResourcesRef.current = { ...audioResourcesRef.current, stream, inputAudioContext, outputAudioContext, outputGainNode };
            nextAudioStartTimeRef.current = 0;

            sessionPromiseRef.current = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: () => {
                        setVoiceStatus('listening');
                        const source = inputAudioContext.createMediaStreamSource(stream);
                        const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
                        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const pcmBlob = createBlob(inputData);
                            if (sessionPromiseRef.current) {
                                sessionPromiseRef.current.then((session) => session.sendRealtimeInput({ media: pcmBlob }));
                            }
                        };
                        source.connect(scriptProcessor);
                        scriptProcessor.connect(inputAudioContext.destination);
                        audioResourcesRef.current = { ...audioResourcesRef.current, micSource: source, scriptProcessor };
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        if (message.serverContent?.inputTranscription) {
                            const text = transcriptionRef.current.input + message.serverContent.inputTranscription.text;
                            transcriptionRef.current.input = text;
                            setVoiceTranscript(text);
                        }
                        if (message.serverContent?.outputTranscription) {
                            transcriptionRef.current.output += message.serverContent.outputTranscription.text;
                        }
                        
                        if (message.serverContent?.modelTurn?.parts[0]?.inlineData?.data) {
                            setVoiceStatus('speaking');
                            const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
                            const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContext, 24000, 1);
                            const source = outputAudioContext.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(outputGainNode);
                            
                            const currentTime = outputAudioContext.currentTime;
                            const startTime = Math.max(currentTime, nextAudioStartTimeRef.current);
                            source.start(startTime);
                            
                            nextAudioStartTimeRef.current = startTime + audioBuffer.duration;
                            audioResourcesRef.current.outputSources.add(source);
                            source.onended = () => {
                                audioResourcesRef.current.outputSources.delete(source);
                                if (audioResourcesRef.current.outputSources.size === 0 && voiceStatus !== 'idle') {
                                    stopLiveSession(true).then(() => startLiveSession());
                                }
                            };
                        }
                        
                        if (message.toolCall) {
                            const session = await sessionPromiseRef.current;
                            if(session) message.toolCall.functionCalls.forEach(fc => executeFunctionCall(fc, session));
                        }

                        if (message.serverContent?.turnComplete) {
                            if (transcriptionRef.current.input.trim() || transcriptionRef.current.output.trim()) {
                                conversationHistoryRef.current.push(`[User]: ${transcriptionRef.current.input.trim()}`);
                                conversationHistoryRef.current.push(`[Eureka Bot]: ${transcriptionRef.current.output.trim()}`);
                                // Keep only the last 4 turns (2 user, 2 bot)
                                if (conversationHistoryRef.current.length > 4) {
                                    conversationHistoryRef.current.splice(0, conversationHistoryRef.current.length - 4);
                                }
                            }
                            transcriptionRef.current = { input: '', output: '' };
                            setVoiceTranscript('');
                        }
                    },
                    onerror: (e: ErrorEvent) => {
                        console.error('Voice Assistant Error:', e);
                        stopLiveSession();
                    },
                    onclose: () => {
                        // This gets called naturally, no need to call stopLiveSession() again unless it's an error.
                    },
                },
                config: {
                    systemInstruction,
                    responseModalities: [Modality.AUDIO],
                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                    tools: [{ functionDeclarations }],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
                    },
                },
            });
        } catch (error) {
            console.error("Failed to start voice session:", error);
            alert("Could not start voice assistant. Please ensure microphone permissions are granted.");
            stopLiveSession();
        }
    }, [activeChapter, stopLiveSession, executeFunctionCall, selectedNodeIds, masteryScore, masteryLevel, currentStudyPath, actions]);

    const handleToggleVoiceAssistant = useCallback(() => {
        if (voiceStatus === 'idle') {
            startLiveSession();
        } else {
            stopLiveSession();
        }
    }, [voiceStatus, startLiveSession, stopLiveSession]);

    return {
        voiceStatus,
        voiceTranscript,
        handleToggleVoiceAssistant,
        isVoiceAssistantEnabled,
    };
};

export default useVoiceAssistant;