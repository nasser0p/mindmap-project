import * as pdfjs from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker?url';

// Set the worker source to the bundled worker file.
// Vite, with the '?url' suffix, provides the correct path.
if (typeof window !== 'undefined' && 'Worker' in window) {
    pdfjs.GlobalWorkerOptions.workerSrc = PdfWorker;
}

/**
 * Extracts all text content from a PDF file.
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
            const textContent = await page.getTextContent();
            // The `str` property is on TextItem objects.
            const pageText = textContent.items.map(item => ('str' in item ? item.str : '')).join(' ');
            fullText += `--- Page ${i} ---\n${pageText}\n\n`;
        }

        return fullText;
    } catch (error) {
        console.error("Error processing PDF:", error);
        throw new Error("Failed to extract text from the PDF file.");
    }
}

/**
 * Processes a document to extract its text content. Currently supports PDF and plain text files.
 * @param file An object containing the download URL and MIME type of the file.
 * @returns A promise that resolves to the extracted text content.
 */
export async function processDocument(file: { downloadURL: string, mimeType: string }): Promise<string> {
    // Firebase Storage URLs with tokens are usually CORS-enabled.
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

    // Fallback for unsupported types
    return `Cannot process file type: ${file.mimeType}. Only PDF and text files are supported for text extraction.`;
}
