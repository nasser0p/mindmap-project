import * as pdfjs from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker?url';

// Set the worker source to the bundled worker file.
if (typeof window !== 'undefined' && 'Worker' in window) {
    pdfjs.GlobalWorkerOptions.workerSrc = PdfWorker;
}

// Type definition for the text items returned by pdf.js
// This mirrors the structure of the TextItem object.
interface PdfTextItem {
    str: string;
    transform: number[];
    width: number;
    height: number;
    dir: string;
    fontName: string;
    hasEOL: boolean;
}

// Internal representation for a block of text on a page.
interface TextBlock {
    text: string;
    x: number;
    y: number;
    height: number;
    fontName: string;
    endX: number;
}

/**
 * Processes a single page of a PDF to extract structured text as Markdown.
 * It analyzes font sizes and text positions to infer headings and lists.
 * @param page A proxy object for a single PDF page from pdf.js.
 * @returns A string containing the page content formatted as Markdown.
 */
async function processPdfPageAsMarkdown(page: pdfjs.PDFPageProxy): Promise<string> {
    const textContent = await page.getTextContent();
    const items = textContent.items.filter((item): item is PdfTextItem => 'str' in item && item.str.trim().length > 0);

    if (items.length === 0) return '';

    // 1. Convert pdf.js items to a more usable TextBlock format
    const blocks: TextBlock[] = items.map(item => ({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
        height: item.height,
        fontName: item.fontName,
        endX: item.transform[4] + item.width,
    }));

    // 2. Group blocks into lines based on vertical position
    const linesMap = new Map<number, TextBlock[]>();
    const Y_TOLERANCE = 5; // Vertical pixel tolerance for considering text to be on the same line

    for (const block of blocks) {
        // Find an existing line key that this block belongs to
        let lineKey = Array.from(linesMap.keys()).find(key => Math.abs(key - block.y) < Y_TOLERANCE);
        if (lineKey === undefined) {
            lineKey = block.y;
            linesMap.set(lineKey, []);
        }
        linesMap.get(lineKey)!.push(block);
    }

    // 3. Merge blocks on each line into single line objects and sort them top-to-bottom
    const lines: TextBlock[] = [];
    // Sort keys (y-coordinates) to process from top to bottom
    const sortedYKeys = Array.from(linesMap.keys()).sort((a, b) => b - a); 
    for (const y of sortedYKeys) {
        const lineBlocks = linesMap.get(y)!;
        lineBlocks.sort((a, b) => a.x - b.x); // Sort blocks left-to-right

        lines.push({
            text: lineBlocks.map(b => b.text).join(' ').trim(),
            x: lineBlocks[0].x,
            y: lineBlocks[0].y,
            height: Math.max(...lineBlocks.map(b => b.height)),
            fontName: lineBlocks[0].fontName, // Simplification: use first block's font
            endX: lineBlocks[lineBlocks.length - 1].endX,
        });
    }

    if (lines.length === 0) return '';

    // 4. Analyze font sizes to heuristically identify headings
    const fontSizes = lines.map(l => l.height).filter(h => h > 0);
    const avgFontSize = fontSizes.reduce((sum, size) => sum + size, 0) / fontSizes.length;
    const stdDev = Math.sqrt(fontSizes.map(x => Math.pow(x - avgFontSize, 2)).reduce((a, b) => a + b) / fontSizes.length);
    
    // Define heading thresholds based on standard deviation from the average font size
    const h1Size = avgFontSize + 1.9 * stdDev;
    const h2Size = avgFontSize + 1.4 * stdDev;

    // 5. Convert lines to Markdown format
    let markdown = '';
    for (const line of lines) {
        let prefix = '';
        if (line.height > h1Size) {
            prefix = '# ';
        } else if (line.height > h2Size) {
            prefix = '## ';
        } else if (line.text.trim().match(/^(•|\*|-)\s/)) { // Starts with a list marker
            prefix = '- ';
            // Remove the original bullet to avoid double-listing
            line.text = line.text.trim().replace(/^(•|\*|-)\s/, '').trim();
        }

        markdown += prefix + line.text + '\n\n'; // Add extra newline for paragraph spacing
    }

    return markdown.trim();
}


/**
 * Extracts text content from a PDF file, attempting to preserve structure as Markdown.
 * Falls back to simple text extraction if the structured approach fails.
 * @param fileUrl The URL to the PDF file.
 * @returns A promise that resolves to a single string containing all text from the PDF.
 */
async function processPdf(fileUrl: string): Promise<string> {
    try {
        const loadingTask = pdfjs.getDocument(fileUrl);
        const pdf = await loadingTask.promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const pageMarkdown = await processPdfPageAsMarkdown(page);
            fullText += `--- Page ${i} ---\n${pageMarkdown}\n\n`;
        }
        return fullText;
    } catch (error) {
        console.error("Error processing PDF with structural analysis:", error);
        // Fallback to simple text extraction if structured extraction fails
        try {
            console.log("Falling back to simple text extraction...");
            const loadingTask = pdfjs.getDocument(fileUrl);
            const pdf = await loadingTask.promise;
            let fallbackText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => ('str' in item ? item.str : '')).join(' ');
                fallbackText += `--- Page ${i} ---\n${pageText}\n\n`;
            }
            return fallbackText;
        } catch (fallbackError) {
             console.error("Fallback PDF processing failed:", fallbackError);
             throw new Error("Failed to extract text from the PDF file using both methods.");
        }
    }
}

/**
 * Processes a document to extract its text content. Supports PDF (with structure) and plain text files.
 * @param file An object containing the download URL and MIME type of the file.
 * @returns A promise that resolves to the extracted text content.
 */
export async function processDocument(file: { downloadURL: string, mimeType: string }): Promise<string> {
    if (file.mimeType === 'application/pdf') {
        return processPdf(file.downloadURL);
    }
    
    if (file.mimeType.startsWith('text/')) {
        try {
            const response = await fetch(file.downloadURL);
            if (!response.ok) {
                throw new Error(`Failed to fetch text file: ${response.statusText}`);
            }
            return await response.text();
        } catch (error) {
            console.error("Error fetching text document:", error);
            throw new Error("Failed to read the text file.");
        }
    }

    return `Cannot process file type: ${file.mimeType}. Only PDF and text files are supported for text extraction.`;
}
