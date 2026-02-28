// Types for the code editor IDE
export interface FileNode {
    id: string;
    name: string;
    type: "file" | "folder";
    content?: string;
    language?: string;
    children?: FileNode[];
    isExpanded?: boolean;
}

export interface EditorTab {
    id: string;
    name: string;
    content: string;
    language: string;
    isDirty?: boolean;
}

export interface FileExplorerProps {
    files: FileNode[];
    selectedFileId: string | null;
    onFileSelect: (file: FileNode) => void;
    onToggleFolder: (folderId: string) => void;
    onCollapseAll: () => void;
}

export interface MonacoEditorWrapperProps {
    content: string;
    language: string;
    onChange?: (value: string | undefined) => void;
    readOnly?: boolean;
}

export interface CodeEditorProps {
    initialFiles?: FileNode[];
    className?: string;
    onFileChange?: (fileId: string, content: string) => void;
}

// Language mappings for file extensions
export const languageMap: Record<string, string> = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    json: "json",
    md: "markdown",
    css: "css",
    scss: "scss",
    html: "html",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
    sql: "sql",
    sh: "shell",
    bash: "shell",
    dockerfile: "dockerfile",
    gitignore: "plaintext",
    env: "plaintext",
};

// Get language from file name
export function getLanguageFromFileName(fileName: string): string {
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    return languageMap[ext] || "plaintext";
}

// File icon colors based on extension
export const fileIconColors: Record<string, string> = {
    js: "text-yellow-400",
    jsx: "text-blue-400",
    ts: "text-blue-500",
    tsx: "text-blue-400",
    py: "text-green-500",
    json: "text-yellow-500",
    md: "text-gray-400",
    css: "text-pink-400",
    scss: "text-pink-500",
    html: "text-orange-500",
    xml: "text-orange-400",
    yaml: "text-red-400",
    yml: "text-red-400",
    sql: "text-blue-300",
    sh: "text-green-400",
    env: "text-yellow-300",
    gitignore: "text-gray-500",
};
