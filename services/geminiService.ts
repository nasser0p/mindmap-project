import { GoogleGenAI, Type } from "@google/genai";
import { ExamConfig, Question, ExamResult, StudySprint, LearningProfile } from '../types';
import { v4 as uuidv4 } from 'uuid';


if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
}
const API_KEY = process.env.API_KEY;
const ai = new GoogleGenAI({ apiKey: API_KEY });

// A helper function to make JSON parsing more robust against common AI model errors.
function safeJsonParse<T>(jsonString: string): T {
    try {
        // AI models sometimes add a trailing comma, which is invalid in JSON.
        const cleanedString = jsonString.trim().replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(cleanedString) as T;
    } catch (error) {
        console.error("Failed to parse JSON string:", jsonString);
        // Re-throw with a more informative message, but keep the original error.
        throw new Error(`AI returned malformed JSON. ${ (error as Error).message }`);
    }
}

export type EnhancedNode = {
    n: string;
    text: string;
    summary?: string;
    type: 'CATEGORY' | 'GATE_TYPE' | 'CONCEPT' | 'EXPRESSION' | 'TRUTH_TABLE' | 'EXAMPLE';
    children?: EnhancedNode[];
};

// Define a schema with a fixed depth to prevent infinite recursion in the client library.
const MAX_DEPTH = 6;

// Base properties for a node
const nodeProperties = {
    n: { type: Type.STRING, description: "A unique identifier for the node, like the text in snake_case." },
    text: { type: Type.STRING, description: "The title of the mind map node." },
    summary: { type: Type.STRING, description: "A brief, one-sentence explanation of the concept." },
    type: { type: Type.STRING, enum: ['CATEGORY', 'GATE_TYPE', 'CONCEPT', 'EXPRESSION', 'TRUTH_TABLE', 'EXAMPLE'], description: "The type of content this node represents." },
};
const nodeRequired = ["n", "text", "type", "summary"];

// Create nested schemas up to MAX_DEPTH iteratively to avoid circular references.
let currentNodeSchema: any = {
    type: Type.OBJECT,
    properties: nodeProperties,
    required: nodeRequired,
};

for (let i = 0; i < MAX_DEPTH; i++) {
    currentNodeSchema = {
        type: Type.OBJECT,
        properties: {
            ...nodeProperties,
            children: {
                type: Type.ARRAY,
                description: "An array of nested child nodes.",
                items: currentNodeSchema,
            }
        },
        required: nodeRequired,
    };
}

const enhancedMindMapSchema = {
    type: Type.OBJECT,
    properties: {
        nodes: {
            type: Type.ARRAY,
            description: "The top-level nodes of the generated mind map.",
            items: currentNodeSchema
        }
    },
    required: ["nodes"]
};


export async function generateEnhancedMindMapFromFile(extractedText: string, base64Data: string, mimeType: string, contextNodeText: string): Promise<EnhancedNode[]> {
    try {
        const systemInstruction = `You are an expert at creating structured, hierarchical mind maps from text. Your goal is to synthesize and transform the provided document into a rich, insightful, and deeply nested mind map. Do not simply transcribe the document's structure. Your output should demonstrate a deeper understanding by adding explanatory summaries and creating logical groupings that may not be explicit in the original text. Your entire response MUST be a single, valid JSON object that strictly adheres to the provided schema.`;
        
        const prompt = `The user has provided a document that has been pre-processed into a structured Markdown format. Your task is to convert this structured text into a detailed, hierarchical mind map. The new mind map will be attached to a parent node titled "${contextNodeText}".

**Structured Document Content (Markdown):**
\`\`\`markdown
${extractedText}
\`\`\`

**Your Task:**
1.  **Leverage Structure:** The input is in Markdown. Pay close attention to headings (#, ##) and lists (-). Use this hierarchy as a strong guide for creating the parent-child relationships in your mind map. Headings should almost always become parent nodes.
2.  **Full-Text Analysis:** Read the ENTIRE text from start to finish to understand the main topics, their relationships, and the underlying concepts.
3.  **Synthesize and Structure:** Instead of just copying headings, identify the core themes of the document. These will be your top-level nodes.
4.  **Deepen the Hierarchy:** This is the most important instruction. Create a deeply nested, multi-level hierarchy. Your goal is to break down every concept into its smallest logical components. Do not stop at 2 or 3 levels; go as deep as the content allows, creating a rich tree structure. Use child nodes to represent sub-concepts, examples, types, or components of a parent topic.
5.  **Extract and Enrich Every Node:** This is crucial. For every single node you create, you MUST provide a 'summary'.
    *   **If the source text provides an explicit definition** (e.g., a term followed by a colon and a description like "Input Validation: Validate user input..."), you MUST use that exact definition as the summary.
    *   **If there is no explicit definition**, then you should generate a concise and insightful summary that explains the concept's purpose.
    This ensures the mind map accurately reflects the details in the source document.
6.  **Categorize and Identify:** Assign an accurate 'type' to every node and a unique 'n' identifier (e.g., lowercase_snake_case of the text).

For example, if the text has a section:
### Web Application Vulnerabilities
- Broken Authentication: Flaws in how an application manages user identity.
  - Guess weak passwords
  - Brute-force attacks
- SQL injection

Your JSON should represent this with deep nesting and summaries for every node, extracting the definition where available:
{
  "n": "web_application_vulnerabilities",
  "text": "Web Application Vulnerabilities",
  "type": "CATEGORY",
  "summary": "Common security weaknesses found in web applications that can be exploited by attackers.",
  "children": [
    { 
      "n": "broken_authentication",
      "text": "Broken Authentication", 
      "type": "CONCEPT",
      "summary": "Flaws in how an application manages user identity.",
      "children": [
        { 
          "n": "guess_weak_passwords", 
          "text": "Guess weak passwords", 
          "type": "EXAMPLE",
          "summary": "An attack method where common or simple passwords are used to gain access."
        },
        { 
          "n": "brute_force_attacks", 
          "text": "Brute-force attacks", 
          "type": "EXAMPLE",
          "summary": "An attack method that systematically tries all possible password combinations."
        }
      ]
    },
    {
      "n": "sql_injection",
      "text": "SQL injection",
      "type": "CONCEPT",
      "summary": "A vulnerability where an attacker can interfere with the queries that an application makes to its database."
    }
  ]
}

Now, apply this process to the entire "Structured Document Content (Markdown)" provided above. Generate a single JSON object containing a "nodes" array that represents the complete, hierarchical, and fully-summarized structure of the document.`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ 
              parts: [
                { text: prompt },
                { inlineData: { mimeType: mimeType, data: base64Data } }
              ]
            }],
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: enhancedMindMapSchema,
                temperature: 0.2,
            }
        });

        const textOutput = response.text;
        if (!textOutput) {
            console.error("Error generating mind map: AI response was empty or blocked.", response);
            throw new Error("Received an empty or blocked response from the AI. The content may have violated safety policies.");
        }
        
        const jsonText = textOutput.trim();
        const result = safeJsonParse<{ nodes: EnhancedNode[] }>(jsonText);
        if (result && Array.isArray(result.nodes)) {
            return result.nodes;
        } else {
            console.warn("Unexpected JSON structure from enhanced mind map generation:", result);
            return [];
        }

    } catch (error) {
        console.error("Error generating enhanced mind map from file with Gemini:", error);
        let message = "Failed to generate enhanced mind map. ";
        if (error instanceof Error) {
             message += error.message;
        }
        throw new Error(message);
    }
}

const imageLabelsSchema = {
    type: Type.OBJECT,
    properties: {
        labels: {
            type: Type.ARRAY,
            description: "A list of identified labels from the image.",
            items: {
                type: Type.OBJECT,
                properties: {
                    label: { type: Type.STRING, description: "The identified label or object name." },
                    summary: { type: Type.STRING, description: "A brief, one-sentence explanation of the identified part." }
                },
                required: ["label", "summary"]
            }
        }
    },
    required: ["labels"]
};

export async function identifyAndLabelImage(mimeType: string, data: string): Promise<{ label: string, summary: string }[]> {
    try {
        const systemInstruction = "You are a visual analysis expert. Your task is to examine the provided image and identify all distinct, labeled parts or significant objects within it. For each part you identify, provide its name and a concise, one-sentence summary explaining what it is or its function. Your response MUST be a single, valid JSON object that adheres to the schema.";

        const prompt = "Please analyze the image and return a JSON object containing an array of labels for the distinct parts identified in the image. For example, if the image is a diagram of a flower, identify parts like 'Petal', 'Stamen', 'Pistil', etc.";

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType, data } }
                ]
            }],
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: imageLabelsSchema,
                temperature: 0.3,
            }
        });

        const jsonText = response.text.trim();
        const result = safeJsonParse<{ labels: { label: string, summary: string }[] }>(jsonText);
        if (result && Array.isArray(result.labels)) {
            return result.labels;
        }
        throw new Error("AI did not return a valid list of labels.");

    } catch (error) {
        console.error("Error identifying and labeling image with Gemini:", error);
        throw new Error(`Failed to identify labels: ${(error as Error).message}`);
    }
}

// --- Exam Generation ---

const examQuestionSchema = {
    type: Type.OBJECT,
    properties: {
        questions: {
            type: Type.ARRAY,
            description: "An array of exam questions.",
            items: {
                type: Type.OBJECT,
                properties: {
                    questionText: { type: Type.STRING },
                    type: { type: Type.STRING, enum: ["multiple-choice", "short-answer", "true-false", "fill-in-the-blank"] },
                    options: { 
                        type: Type.ARRAY, 
                        items: { type: Type.STRING },
                        description: "An array of 4 strings for multiple-choice options. Null for short-answer.",
                    },
                    correctAnswer: { type: Type.STRING, description: "The correct answer. For multiple-choice, it must be one of the options." },
                    relatedNodeTopicText: { type: Type.STRING, description: "The exact text of the most relevant node from the provided mind map context." },
                    hint: { type: Type.STRING, description: "A helpful, one-sentence hint that guides the student towards the correct answer without revealing it directly." }
                },
                required: ["questionText", "type", "correctAnswer", "relatedNodeTopicText", "hint"]
            }
        }
    },
    required: ["questions"]
};

export async function generateExamQuestions(config: ExamConfig, mindMapContext: string, documentsContext: string): Promise<Omit<Question, 'id'>[]> {
    const systemInstruction = `You are an expert exam creator and AI Tutor. Your task is to generate a comprehensive ${config.type} based on the student's learning materials.`;
    
    const prompt = `Please generate an exam based on the following materials.

Exam Configuration:
- Type: ${config.type}
- Number of Questions: ${config.numQuestions}
- Question Types: ${config.questionTypes.join(', ')}

Student's Mind Map:
\`\`\`
${mindMapContext}
\`\`\`

Content from Uploaded Documents:
\`\`\`
${documentsContext || 'No documents provided.'}
\`\`\`

Instructions:
1. Create exactly ${config.numQuestions} questions that cover the key topics from the provided materials.
2. The questions should be a mix of the requested types: ${config.questionTypes.join(', ')}.
3. For "multiple-choice" questions, provide exactly 4 distinct options. One of them must be the correct answer.
4. For "short-answer" questions, the "options" field should be null.
5. For "true-false" questions, the "options" field MUST be an array of two strings: ["True", "False"].
6. For "fill-in-the-blank" questions, the "options" field should be null. The "questionText" should contain one or more blank placeholders (e.g., "____"). The "correctAnswer" should be the text that fills the blank.
7. CRUCIAL: For every question, you MUST identify the most relevant concept from the mind map. Provide this concept's exact text in the "relatedNodeTopicText" field. This is used to guide the student's review later.
8. For each question, also generate a 'hint'. The hint should be a single sentence that nudges the student in the right direction but does NOT give away the answer.
9. Your entire response MUST be a single, valid JSON object that adheres to the schema. Do not output any text or markdown formatting (like \`\`\`json) before or after the JSON block.`;
    
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: examQuestionSchema,
                temperature: 0.7,
            }
        });
        const jsonText = response.text.trim();
        const result = safeJsonParse<{ questions: Omit<Question, 'id'>[] }>(jsonText);
        if (result && Array.isArray(result.questions)) {
            return result.questions;
        }
        throw new Error("AI did not return a valid list of questions.");
    } catch(error) {
        console.error("Error generating exam questions with Gemini:", error);
        throw new Error(`Failed to generate exam questions: ${(error as Error).message}`);
    }
}

const examAnalysisSchema = {
    type: Type.OBJECT,
    properties: {
        score: { type: Type.NUMBER, description: "The percentage score, from 0 to 100." },
        analysis: {
            type: Type.ARRAY,
            description: "An analysis of each answer.",
            items: {
                type: Type.OBJECT,
                properties: {
                    questionText: { type: Type.STRING },
                    userAnswer: { type: Type.STRING },
                    correctAnswer: { type: Type.STRING },
                    isCorrect: { type: Type.BOOLEAN },
                    explanation: { type: Type.STRING, description: "A brief, helpful explanation for why the user's answer was incorrect, or a confirmation for a correct one." }
                },
                required: ["questionText", "userAnswer", "correctAnswer", "isCorrect", "explanation"]
            }
        }
    },
    required: ["score", "analysis"]
};


export async function gradeAndAnalyzeExam(questions: Question[], userAnswers: Map<string, string>): Promise<ExamResult> {
    const systemInstruction = `You are a helpful and encouraging AI Tutor. Your task is to grade a student's exam, calculate the score, and provide clear, constructive feedback for each question.`;
    
    const formattedAnswers = questions.map(q => ({
        question: q.questionText,
        correctAnswer: q.correctAnswer,
        userAnswer: userAnswers.get(q.id) || "Not answered"
    }));

    const prompt = `Please grade the following exam answers.

Exam content and student answers:
${JSON.stringify(formattedAnswers, null, 2)}

Instructions:
1. Compare each "userAnswer" to the "correctAnswer".
2. For short-answer questions, allow for minor variations in wording if the meaning is correct.
3. Calculate a final score as a percentage (0-100).
4. For each question, provide a helpful "explanation". 
   - If the answer is incorrect, explain the correct answer and why the user's answer was wrong.
   - If the answer is correct, give a brief confirmation.
5. Your entire response MUST be a single, valid JSON object adhering to the provided schema.`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: examAnalysisSchema,
                temperature: 0.3,
            }
        });

        const jsonText = response.text.trim();
        const result = safeJsonParse<ExamResult>(jsonText);
        if (result && typeof result.score === 'number' && Array.isArray(result.analysis)) {
            return result;
        }
        throw new Error("AI did not return a valid exam analysis.");
    } catch(error) {
        console.error("Error grading exam with Gemini:", error);
        throw new Error(`Failed to grade exam: ${(error as Error).message}`);
    }
}

// --- Topic Hotspot Actions ---

const explanationSchema = {
    type: Type.OBJECT,
    properties: {
        explanation: {
            type: Type.STRING,
            description: "A new, alternative explanation for the concept, using a different analogy or perspective to make it easier to understand."
        }
    },
    required: ["explanation"]
};

export async function explainConceptDifferently(topicText: string): Promise<string> {
    const systemInstruction = "You are an AI Tutor who excels at explaining complex topics in simple and creative ways. A student is stuck on a concept and needs a fresh perspective.";
    const prompt = `The student is struggling with the concept: "${topicText}". 
    
    Please provide a new, alternative explanation for this topic. Use a different analogy or frame it from a different perspective than a standard textbook definition. Keep the explanation concise and clear.`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: explanationSchema,
                temperature: 0.7,
            }
        });
        const jsonText = response.text.trim();
        const result = safeJsonParse<{ explanation: string }>(jsonText);
        if (result && result.explanation) {
            return result.explanation;
        }
        throw new Error("AI did not return a valid explanation.");
    } catch(error) {
        console.error("Error generating new explanation with Gemini:", error);
        throw new Error(`Failed to generate new explanation: ${(error as Error).message}`);
    }
}

const singleQuestionSchema = {
    type: Type.OBJECT,
    properties: {
        questionText: { type: Type.STRING },
        type: { type: Type.STRING, enum: ["multiple-choice", "short-answer"] },
        options: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "An array of 4 strings for multiple-choice options. Null for short-answer.",
        },
        correctAnswer: { type: Type.STRING },
        hint: { type: Type.STRING }
    },
    required: ["questionText", "type", "correctAnswer", "hint"]
};


export async function generateSingleQuestion(topicText: string): Promise<Omit<Question, 'id' | 'relatedNodeTopicText'>> {
    const systemInstruction = "You are an AI Tutor creating a quick check-in question to help a student solidify their understanding of a specific topic.";
    const prompt = `Please generate a single quiz question about the following topic: "${topicText}".

Instructions:
1. The question should directly test the core idea of the topic.
2. Choose either 'multiple-choice' or 'short-answer' format.
3. If multiple-choice, provide 4 distinct options.
4. Provide a correct answer and a helpful hint.
5. Your entire response MUST be a single, valid JSON object adhering to the schema.`;
    
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: singleQuestionSchema,
                temperature: 0.8,
            }
        });
        const jsonText = response.text.trim();
        const result = safeJsonParse<Omit<Question, 'id' | 'relatedNodeTopicText'>>(jsonText);
        if (result && result.questionText) {
            return result;
        }
        throw new Error("AI did not return a valid question.");
    } catch(error) {
        console.error("Error generating single question with Gemini:", error);
        throw new Error(`Failed to generate question: ${(error as Error).message}`);
    }
}


// --- Study Sprint Generation ---

const studySprintSchema = {
    type: Type.OBJECT,
    properties: {
        steps: {
            type: Type.ARRAY,
            description: "A list of timed steps for the study session.",
            items: {
                type: Type.OBJECT,
                properties: {
                    type: { type: Type.STRING, enum: ['FLASHCARD_REVIEW', 'FOCUSED_DEEP_DIVE', 'CONSOLIDATION_QUIZ'] },
                    title: { type: Type.STRING },
                    duration: { type: Type.NUMBER, description: "Duration in minutes" },
                    instructions: { type: Type.STRING, description: "Detailed instructions for the student for this step." },
                    quiz: {
                        type: Type.ARRAY,
                        description: "An array of 2-3 quiz questions. Only for 'CONSOLIDATION_QUIZ' type.",
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                questionText: { type: Type.STRING },
                                type: { type: Type.STRING, enum: ["multiple-choice", "short-answer"] },
                                options: { 
                                    type: Type.ARRAY, 
                                    items: { type: Type.STRING },
                                    description: "An array of 4 strings for multiple-choice options. Null for short-answer.",
                                },
                                correctAnswer: { type: Type.STRING },
                                hint: { type: Type.STRING },
                            },
                            required: ["questionText", "type", "correctAnswer", "hint"]
                        }
                    }
                },
                required: ["type", "title", "duration", "instructions"]
            }
        }
    },
    required: ["steps"]
};

export async function generateStudySprint(duration: number, weakestTopics: string[], mindMapContext: string, documentsContext: string): Promise<StudySprint> {
    const systemInstruction = "You are a pragmatic and encouraging AI learning coach. Your goal is to create a structured, actionable, and timed study plan to help a student improve their understanding of specific topics they are struggling with.";

    const prompt = `A student has requested a focused study sprint for ${duration} minutes.

Their weakest topics are:
${weakestTopics.length > 0 ? weakestTopics.join('\n') : "The student is just starting out, focus on foundational topics."}

Here is the context of their full mind map:
\`\`\`
${mindMapContext}
\`\`\`

Here is context from their uploaded documents:
\`\`\`
${documentsContext || 'No documents provided.'}
\`\`\`

**Your Task:**
Create a study sprint with a total duration that closely matches the requested ${duration} minutes.

**Instructions:**
1.  **Prioritize:** Focus the plan on the provided "weakest topics".
2.  **Vary Activities:** Create a sequence of 2-4 steps using different types ('FLASHCARD_REVIEW', 'FOCUSED_DEEP_DIVE', 'CONSOLIDATION_QUIZ'). A good plan often starts with review, moves to a deep dive, and ends with a quiz.
3.  **Be Specific:** In 'FOCUSED_DEEP_DIVE' steps, give concrete, actionable instructions. For example: "Read the section on 'Boolean Algebra' in your notes, then add two new child nodes to your 'Logic Gates' topic explaining AND and OR gates in your own words."
4.  **Allocate Time:** Assign a reasonable 'duration' in minutes to each step. The sum of all step durations should be as close as possible to the total ${duration} minutes.
5.  **Create a Micro-Quiz:** If you include a 'CONSOLIDATION_QUIZ' step, it MUST contain 2-3 new questions. These questions should be directly related to the topics covered in the preceding steps of THIS study sprint. Provide hints for these questions.
6.  **Adhere to Schema:** Your entire output must be a single, valid JSON object that strictly adheres to the provided schema. Ensure all strings are properly escaped.`;
    
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: studySprintSchema,
                temperature: 0.7,
            }
        });
        const jsonText = response.text.trim();
        const result = safeJsonParse<StudySprint>(jsonText);
        if (result && Array.isArray(result.steps)) {
             // Add unique IDs to quiz questions if they exist
            result.steps.forEach((step: any) => {
                if (step.quiz && Array.isArray(step.quiz)) {
                    step.quiz.forEach((q: any) => q.id = uuidv4());
                }
            });
            return result;
        }
        throw new Error("AI did not return a valid study sprint plan.");
    } catch(error) {
        console.error("Error generating study sprint with Gemini:", error);
        throw new Error(`Failed to generate study sprint: ${(error as Error).message}`);
    }
}


// --- Existing AI Services ---

const ideasSchema = {
    type: Type.OBJECT,
    properties: {
        ideas: {
            type: Type.ARRAY,
            description: "A list of 3 to 5 brief, creative ideas or sub-topics related to the main topic. Each idea should be a short phrase.",
            items: {
                type: Type.OBJECT,
                properties: {
                    text: {
                        type: Type.STRING,
                        description: "The text of the idea or sub-topic."
                    }
                },
                required: ["text"]
            }
        }
    },
    required: ["ideas"]
};

export async function generateIdeasForNode(
    nodeText: string,
    mindMapContext: string,
    documentsContext: string,
    profile?: LearningProfile,
    image?: { mimeType: string; data: string; }
): Promise<{text: string}[]> {
    try {
        const contentParts: ({ text: string; } | { inlineData: { mimeType: string; data: string; }; })[] = [];
        let promptIntro: string;

        if (image) {
            promptIntro = `You are an expert AI assistant helping a user expand their mind map.
The user has selected a node with an image and the following caption: "${nodeText}".
Your task is to brainstorm 3 to 5 new, related sub-topics or ideas that can be added as children to this selected node. Your ideas MUST be based on the visual content of the provided image.
To generate the most relevant ideas, you MUST use the following context:`;
            contentParts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
        } else {
            promptIntro = `You are an expert AI assistant helping a user expand their mind map.
The user has selected a node with the text: "${nodeText}".
Your task is to brainstorm 3 to 5 new, related sub-topics or ideas that can be added as children to this selected node.
To generate the most relevant ideas, you MUST use the following context:`;
        }

        let prompt = `${promptIntro}

**1. Full Mind Map Structure:**
This is the structure of the entire mind map the user is working on. Use it to understand the relationships between topics and avoid suggesting ideas that are already present or out of place.
\`\`\`
${mindMapContext}
\`\`\`

**2. Content from User's Documents:**
This is the source material the user has uploaded. Your ideas should be based on or inspired by this content. If no documents are provided, rely on the mind map context and your general knowledge.
\`\`\`
${documentsContext || 'No documents provided.'}
\`\`\`

**Instructions:**
- Your ideas must be directly related to the selected node: "${nodeText}".
- The ideas should be new and not already exist as children of the selected node in the mind map context.
- Where possible, the ideas should be inspired by the provided document content.
- Provide short, actionable phrases.
- Your entire response MUST be a single, valid JSON object that adheres to the provided schema.`;

        if (profile) {
            if (profile.structurePreference > 0.4) { // Top-down learner
                prompt += " Focus on higher-level categories or abstract concepts that this topic belongs to.";
            } else if (profile.structurePreference < -0.4) { // Bottom-up learner
                prompt += " Focus on concrete examples, specific instances, or components of this topic.";
            }
        }

        contentParts.push({ text: prompt });

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: { parts: contentParts },
            config: {
                responseMimeType: "application/json",
                responseSchema: ideasSchema,
                temperature: 0.8,
                topP: 0.95,
            }
        });

        const jsonText = response.text.trim();
        if (!jsonText) {
            throw new Error("Received an empty response from the AI.");
        }
        
        const result = safeJsonParse<{ ideas: { text: string }[] }>(jsonText);

        if (result && Array.isArray(result.ideas)) {
            return result.ideas.filter((idea: any) => typeof idea.text === 'string');
        } else {
            console.warn("Unexpected JSON structure:", result);
            return [];
        }

    } catch (error) {
        console.error("Error generating ideas with Gemini:", error);
        let message = "Failed to generate ideas. ";
        if(error instanceof Error) {
            message += error.message;
        }
        throw new Error(message);
    }
}

const rephraseSchema = {
    type: Type.OBJECT,
    properties: {
        text: {
            type: Type.STRING,
            description: "A single, short, rephrased alternative for the given text. It should be creative and concise."
        }
    },
    required: ["text"]
};

export async function rephraseNodeText(nodeText: string): Promise<string> {
    try {
        const prompt = `Rephrase the following mind map node text. Make it more creative or clear, but keep it short: "${nodeText}"`;
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: rephraseSchema,
                temperature: 0.7,
            }
        });
        const jsonText = response.text.trim();
        if (!jsonText) throw new Error("Received an empty response from the AI for rephrasing.");
        
        const result = safeJsonParse<{ text: string }>(jsonText);
        if (result && typeof result.text === 'string') {
            return result.text;
        } else {
            throw new Error("Unexpected JSON structure for rephrased text.");
        }
    } catch (error) {
        console.error("Error rephrasing node text with Gemini:", error);
        let message = "Failed to rephrase text. ";
        if(error instanceof Error) message += error.message;
        throw new Error(message);
    }
}

const keyConceptsSchema = {
    type: Type.OBJECT,
    properties: {
        concepts: {
            type: Type.ARRAY,
            description: "A list of 2 to 4 key concepts or themes derived from the provided topic and sub-topics. Each concept should be a short phrase.",
            items: {
                type: Type.OBJECT,
                properties: {
                    text: {
                        type: Type.STRING,
                        description: "The text of the key concept."
                    }
                },
                required: ["text"]
            }
        }
    },
    required: ["concepts"]
};


export async function extractKeyConcepts(parentText: string, childrenTexts: string[]): Promise<{ text: string }[]> {
    try {
        if (childrenTexts.length === 0) {
            throw new Error("Cannot extract concepts from a node with no children.");
        }
        const prompt = `Given a main topic "{${parentText}}" and its sub-topics: [${childrenTexts.join(', ')}], identify the 2-4 most important key concepts or unifying themes. Return these as short, distinct phrases.`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: keyConceptsSchema,
                temperature: 0.6,
            }
        });

        const jsonText = response.text.trim();
        if (!jsonText) throw new Error("Received empty response from the AI for concept extraction.");

        const result = safeJsonParse<{ concepts: { text: string }[] }>(jsonText);
        if (result && Array.isArray(result.concepts)) {
            return result.concepts.filter((concept: any) => typeof concept.text === 'string');
        } else {
            throw new Error("Unexpected JSON structure for key concepts.");
        }

    } catch (error) {
        console.error("Error extracting key concepts with Gemini:", error);
        let message = "Failed to extract key concepts. ";
        if (error instanceof Error) message += error.message;
        throw new Error(message);
    }
}

const analogySchema = {
    type: Type.OBJECT,
    properties: {
        analogy: {
            type: Type.STRING,
            description: "A single, concise, and simple analogy or definition to explain the given concept."
        }
    },
    required: ["analogy"]
}

export async function generateAnalogy(nodeText: string, profile?: LearningProfile): Promise<string> {
    try {
        let prompt;
        // If student prefers facts, give a definition. Otherwise, give an analogy.
        if (profile && profile.analogyPreference < -0.3) {
            prompt = `Provide a concise, single-sentence definition for the concept: "${nodeText}". Place this sentence in the 'analogy' field of the JSON output.`;
        } else {
            prompt = `Explain the concept of "${nodeText}" using a simple analogy, as if explaining it to a curious high school student. The explanation should be a single, short sentence. Place this sentence in the 'analogy' field of the JSON output.`;
        }

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: analogySchema,
                temperature: 0.7,
            }
        });
        const jsonText = response.text.trim();
        if (!jsonText) throw new Error("Received an empty response from the AI for analogy generation.");

        const result = safeJsonParse<{ analogy: string }>(jsonText);
        if (result && typeof result.analogy === 'string' && result.analogy.trim() !== '') {
            const prefix = (profile && profile.analogyPreference < -0.3) ? 'Definition:' : 'Analogy:';
            return `${prefix} ${result.analogy}`;
        } else {
            throw new Error("Unexpected or empty JSON structure for analogy.");
        }

    } catch (error) {
        console.error("Error generating analogy with Gemini:", error);
        let message = "Failed to generate analogy. ";
        if (error instanceof Error) message += error.message;
        throw new Error(message);
    }
}

export interface NodeContext {
    path: string[];
    currentNodeText: string;
    childrenTexts: string[];
    image?: {
        mimeType: string;
        data: string;
    };
}

export async function askChatQuestion(context: NodeContext, question: string, profile?: LearningProfile): Promise<string> {
     try {
        let systemInstruction = "You are a helpful and friendly AI tutor assisting a student with their mind map. Your goal is to explain concepts clearly, provide examples, and encourage deeper thinking. Use the provided context of the mind map, including any images, to give relevant answers. Keep your answers concise and easy to understand.";
        
        if (profile) {
            if (profile.analogyPreference > 0.4) {
                systemInstruction += " This student responds well to analogies and relatable examples. Please try to incorporate them in your explanation where appropriate.";
            } else if (profile.analogyPreference < -0.4) {
                systemInstruction += " This student prefers direct, factual, and concise explanations. Please avoid overly metaphorical language and stick to the key points.";
            }
        }
        
        let promptText = "The student is working on a mind map.\n";
        
        if (context.path.length > 0) {
            promptText += `Path to current topic: ${context.path.join(' -> ')}\n`;
        }
        
        if (context.image) {
            promptText += `The student has selected a node with an image and the following caption: "${context.currentNodeText}"\nYour answer MUST consider the content of the provided image.\n`;
        } else {
            promptText += `Current topic: "${context.currentNodeText}"\n`;
        }

        if (context.childrenTexts.length > 0) {
            promptText += `Sub-topics of "${context.currentNodeText}": [${context.childrenTexts.join(', ')}]\n`;
        }

        promptText += `\nThe student's question is: "${question}"`;

        const contentParts: ({ text: string; } | { inlineData: { mimeType: string; data: string; }; })[] = [];

        if (context.image) {
            contentParts.push({
                inlineData: {
                    mimeType: context.image.mimeType,
                    data: context.image.data,
                },
            });
        }
        contentParts.push({ text: promptText });
        
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: { parts: contentParts },
            config: {
              systemInstruction: systemInstruction,
              temperature: 0.7,
              topP: 1,
            },
        });

        const text = response.text;
        if (!text) {
             throw new Error("Received an empty response from the AI tutor.");
        }
        return text;

     } catch (error) {
        console.error("Error getting chat response from Gemini:", error);
        let message = "Failed to get response from AI tutor. ";
        if (error instanceof Error) message += error.message;
        throw new Error(message);
     }
}
