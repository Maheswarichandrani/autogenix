"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OnMount, BeforeMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";

// Dynamically import Monaco Editor to avoid SSR issues
const MonacoEditor = dynamic(
    () => import("@monaco-editor/react").then((mod) => mod.default),
    {
        ssr: false,
        loading: () => <EditorLoadingState />,
    }
);

// Loading state component
function EditorLoadingState() {
    return (
        <div className="flex flex-col items-center justify-center h-full bg-background">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
            <span className="text-sm text-muted-foreground">
                Initializing editor...
            </span>
        </div>
    );
}

// Monaco editor wrapper props
interface MonacoEditorWrapperProps {
    content: string;
    language: string;
    fileName?: string;
    onChange?: (value: string | undefined) => void;
    readOnly?: boolean;
    className?: string;
}

// Disable Monaco validation markers (red underlines) for preview mode
const disableValidation: BeforeMount = (monaco) => {
    // Disable TypeScript/JavaScript validation
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: true,
        noSuggestionDiagnostics: true,
    });
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: true,
        noSuggestionDiagnostics: true,
    });

    // Disable JSON validation
    monaco.languages.json?.jsonDefaults?.setDiagnosticsOptions?.({
        validate: false,
    });
};

// Custom VS Code themes with Zinc colors
const defineCustomTheme: BeforeMount = (monaco) => {
    // First disable all validation to remove red underlines
    disableValidation(monaco);

    // Dark theme
    monaco.editor.defineTheme("nexus-dark", {
        base: "vs-dark",
        inherit: true,
        rules: [
            { token: "comment", foreground: "71717a", fontStyle: "italic" }, // zinc-500
            { token: "keyword", foreground: "8ab4f8" }, // Blue
            { token: "string", foreground: "fda4af" }, // Rose-300
            { token: "number", foreground: "86efac" }, // Green-300
            { token: "type", foreground: "67e8f9" }, // Cyan-300
            { token: "class", foreground: "67e8f9" }, // Cyan-300
            { token: "function", foreground: "fde047" }, // Yellow-300
            { token: "variable", foreground: "d4d4d8" }, // Zinc-300
            { token: "constant", foreground: "8ab4f8" }, // Blue
            { token: "parameter", foreground: "a1a1aa" }, // Zinc-400
            { token: "property", foreground: "e4e4e7" }, // Zinc-200
            { token: "punctuation", foreground: "a1a1aa" }, // Zinc-400
            { token: "operator", foreground: "8ab4f8" }, // Blue
            { token: "tag", foreground: "8ab4f8" }, // Blue
            { token: "attribute.name", foreground: "fde047" }, // Yellow-300
            { token: "attribute.value", foreground: "fda4af" }, // Rose-300
        ],
        colors: {
            "editor.background": "#09090b", // zinc-950
            "editor.foreground": "#fafafa", // zinc-50
            "editor.lineHighlightBackground": "#18181b", // zinc-900
            "editor.selectionBackground": "#3b82f64d", // Blue with opacity
            "editor.inactiveSelectionBackground": "#3f3f4680", // zinc-700 with opacity
            "editorLineNumber.foreground": "#52525b", // zinc-600
            "editorLineNumber.activeForeground": "#d4d4d8", // zinc-300
            "editorCursor.foreground": "#8ab4f8", // Blue
            "editor.selectionHighlightBackground": "#3b82f633", // Blue highlight
            "editorIndentGuide.background": "#27272a", // zinc-800
            "editorIndentGuide.activeBackground": "#52525b", // zinc-600
            "editorBracketMatch.background": "#3b82f633", // Blue match
            "editorBracketMatch.border": "#8ab4f8", // Blue
            "scrollbarSlider.background": "#27272a99", // zinc-800
            "scrollbarSlider.hoverBackground": "#3f3f46cc", // zinc-700
            "scrollbarSlider.activeBackground": "#52525bcc", // zinc-600
            "editorGutter.background": "#09090b", // zinc-950
            "editorWidget.background": "#18181b", // zinc-900
            "editorWidget.border": "#27272a", // zinc-800
            "editorSuggestWidget.background": "#18181b", // zinc-900
            "editorSuggestWidget.border": "#27272a", // zinc-800
            "editorSuggestWidget.selectedBackground": "#3f3f46", // zinc-700
            "editorHoverWidget.background": "#18181b", // zinc-900
            "editorHoverWidget.border": "#27272a", // zinc-800
        },
    });

    // Light theme
    monaco.editor.defineTheme("nexus-light", {
        base: "vs",
        inherit: true,
        rules: [
            { token: "comment", foreground: "71717a", fontStyle: "italic" }, // zinc-500
            { token: "keyword", foreground: "2563eb" }, // Blue-600
            { token: "string", foreground: "be123c" }, // Rose-700
            { token: "number", foreground: "15803d" }, // Green-700
            { token: "type", foreground: "0e7490" }, // Cyan-700
            { token: "class", foreground: "0e7490" }, // Cyan-700
            { token: "function", foreground: "a16207" }, // Yellow-700
            { token: "variable", foreground: "27272a" }, // Zinc-800
            { token: "constant", foreground: "2563eb" }, // Blue-600
            { token: "parameter", foreground: "52525b" }, // Zinc-600
            { token: "property", foreground: "3f3f46" }, // Zinc-700
            { token: "punctuation", foreground: "71717a" }, // Zinc-500
            { token: "operator", foreground: "2563eb" }, // Blue-600
            { token: "tag", foreground: "2563eb" }, // Blue-600
            { token: "attribute.name", foreground: "a16207" }, // Yellow-700
            { token: "attribute.value", foreground: "be123c" }, // Rose-700
        ],
        colors: {
            "editor.background": "#fafafa", // zinc-50
            "editor.foreground": "#18181b", // zinc-900
            "editor.lineHighlightBackground": "#f4f4f5", // zinc-100
            "editor.selectionBackground": "#3b82f64d", // Blue with opacity
            "editor.inactiveSelectionBackground": "#e4e4e780", // zinc-200 with opacity
            "editorLineNumber.foreground": "#a1a1aa", // zinc-400
            "editorLineNumber.activeForeground": "#52525b", // zinc-600
            "editorCursor.foreground": "#2563eb", // Blue-600
            "editor.selectionHighlightBackground": "#3b82f633", // Blue highlight
            "editorIndentGuide.background": "#e4e4e7", // zinc-200
            "editorIndentGuide.activeBackground": "#a1a1aa", // zinc-400
            "editorBracketMatch.background": "#3b82f633", // Blue match
            "editorBracketMatch.border": "#2563eb", // Blue-600
            "scrollbarSlider.background": "#d4d4d899", // zinc-300
            "scrollbarSlider.hoverBackground": "#a1a1aacc", // zinc-400
            "scrollbarSlider.activeBackground": "#71717acc", // zinc-500
            "editorGutter.background": "#fafafa", // zinc-50
            "editorWidget.background": "#ffffff", // white
            "editorWidget.border": "#e4e4e7", // zinc-200
            "editorSuggestWidget.background": "#ffffff", // white
            "editorSuggestWidget.border": "#e4e4e7", // zinc-200
            "editorSuggestWidget.selectedBackground": "#f4f4f5", // zinc-100
            "editorHoverWidget.background": "#ffffff", // white
            "editorHoverWidget.border": "#e4e4e7", // zinc-200
        },
    });
};

// Monaco Editor Wrapper Component
export function MonacoEditorWrapper({
    content,
    language,
    fileName,
    onChange,
    readOnly = true, // Default to read-only for preview mode
    className,
}: MonacoEditorWrapperProps) {
    const [isEditorReady, setIsEditorReady] = useState(false);
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const { theme, resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    // Track mounting state for hydration
    useEffect(() => {
        setMounted(true);
    }, []);

    // Get the effective theme (resolving "system" to actual theme)
    const effectiveTheme = mounted ? (theme === "system" ? resolvedTheme : theme) : "dark";
    const monacoTheme = effectiveTheme === "light" ? "nexus-light" : "nexus-dark";

    // Update Monaco theme when theme changes
    useEffect(() => {
        if (editorRef.current && mounted) {
            editorRef.current.updateOptions({
                theme: monacoTheme,
            });
        }
    }, [monacoTheme, mounted]);

    // Handle editor mount
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const handleEditorMount: OnMount = useCallback((editor, _monaco) => {
        editorRef.current = editor;
        setIsEditorReady(true);

        // Configure editor options
        editor.updateOptions({
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
            fontLigatures: true,
            lineHeight: 20,
            letterSpacing: 0.3,
            padding: { top: 16, bottom: 16 },
            smoothScrolling: true,
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            renderWhitespace: "selection",
            bracketPairColorization: { enabled: true },
            guides: {
                bracketPairs: true,
                indentation: true,
            },
        });

        // Focus editor
        editor.focus();
    }, []);

    // Handle content change
    const handleChange = useCallback(
        (value: string | undefined) => {
            onChange?.(value);
        },
        [onChange]
    );

    return (
        <div className={cn("relative h-full w-full", className)}>
            <MonacoEditor
                height="100%"
                language={language}
                value={content}
                theme={monacoTheme}
                beforeMount={defineCustomTheme}
                onMount={handleEditorMount}
                onChange={handleChange}
                options={{
                    readOnly,
                    domReadOnly: readOnly, // Prevent any DOM-level editing
                    minimap: {
                        enabled: true,
                        scale: 1,
                        showSlider: "mouseover",
                    },
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                    automaticLayout: true,
                    tabSize: 2,
                    insertSpaces: true,
                    formatOnPaste: false,
                    formatOnType: false,
                    folding: true,
                    foldingHighlight: true,
                    showFoldingControls: "mouseover",
                    lineNumbers: "on",
                    glyphMargin: false,
                    renderLineHighlight: "line",
                    renderLineHighlightOnlyWhenFocus: false,
                    scrollbar: {
                        vertical: "visible",
                        horizontal: "visible",
                        verticalScrollbarSize: 10,
                        horizontalScrollbarSize: 10,
                        useShadows: false,
                    },
                    overviewRulerBorder: false,
                    hideCursorInOverviewRuler: true,
                    contextmenu: !readOnly, // Only show context menu if editable
                    mouseWheelZoom: true,
                    // Disable all editing suggestions in read-only mode
                    quickSuggestions: !readOnly,
                    suggestOnTriggerCharacters: !readOnly,
                    acceptSuggestionOnEnter: readOnly ? "off" : "on",
                    tabCompletion: readOnly ? "off" : "on",
                    parameterHints: { enabled: !readOnly },
                    hover: { enabled: true, delay: 300 },
                    // Disable validation decorations (red underlines)
                    renderValidationDecorations: "off",
                }}
                loading={<EditorLoadingState />}
            />

            {/* File name indicator */}
            {fileName && isEditorReady && (
                <div className="absolute top-2 right-4 px-2 py-1 rounded bg-background/80 backdrop-blur-sm border border-border/50 text-xs text-muted-foreground">
                    {fileName}
                </div>
            )}
        </div>
    );
}
