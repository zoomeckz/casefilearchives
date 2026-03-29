import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import { Icons } from '@/lib/icons';

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  glossaryTerms?: string[];
  onMarkGlossary?: () => void;
}

const ToolbarButton: React.FC<{
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}> = ({ onClick, active, disabled, title, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`p-2 rounded transition-colors ${
      active
        ? 'bg-primary/30 text-primary'
        : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
    } disabled:opacity-30 disabled:cursor-not-allowed`}
  >
    {children}
  </button>
);

const Toolbar: React.FC<{ editor: any; onMarkGlossary?: () => void }> = ({ editor, onMarkGlossary }) => {
  if (!editor) return null;

  const addImage = () => {
    const url = window.prompt('Enter image URL:');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  const addLink = () => {
    const url = window.prompt('Enter URL:');
    if (url) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 p-2 border-b border-border bg-card/50">
      {/* Text formatting */}
      <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
        <span className="font-bold text-sm">B</span>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
        <span className="italic text-sm">I</span>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
        <span className="underline text-sm">U</span>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
        <span className="line-through text-sm">S</span>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive('highlight')} title="Highlight">
        <span className="text-sm bg-yellow-300/50 px-0.5">H</span>
      </ToolbarButton>

      <div className="w-px h-6 bg-border mx-1" />

      {/* Headings */}
      <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Heading 1">
        <span className="text-sm font-bold">H1</span>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2">
        <span className="text-sm font-bold">H2</span>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Heading 3">
        <span className="text-sm font-bold">H3</span>
      </ToolbarButton>

      <div className="w-px h-6 bg-border mx-1" />

      {/* Lists */}
      <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet List">
        <span className="text-sm">• List</span>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered List">
        <span className="text-sm">1. List</span>
      </ToolbarButton>

      <div className="w-px h-6 bg-border mx-1" />

      {/* Alignment */}
      <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align Left">
        <span className="text-xs">≡ L</span>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Align Center">
        <span className="text-xs">≡ C</span>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align Right">
        <span className="text-xs">≡ R</span>
      </ToolbarButton>

      <div className="w-px h-6 bg-border mx-1" />

      {/* Block elements */}
      <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Blockquote">
        <span className="text-sm">"</span>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="Code Block">
        <span className="text-sm font-mono">{'<>'}</span>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal Rule">
        <span className="text-sm">—</span>
      </ToolbarButton>

      <div className="w-px h-6 bg-border mx-1" />

      {/* Media */}
      <ToolbarButton onClick={addLink} active={editor.isActive('link')} title="Add Link">
        <span className="text-sm">🔗</span>
      </ToolbarButton>
      {editor.isActive('link') && (
        <ToolbarButton onClick={() => editor.chain().focus().unsetLink().run()} title="Remove Link">
          <span className="text-sm text-destructive">✕🔗</span>
        </ToolbarButton>
      )}
      <ToolbarButton onClick={addImage} title="Add Image">
        <span className="text-sm">🖼</span>
      </ToolbarButton>

      <div className="w-px h-6 bg-border mx-1" />

      {/* Glossary */}
      {onMarkGlossary && (
        <ToolbarButton onClick={onMarkGlossary} title="Mark Glossary Terms">
          <span className="text-sm text-primary">📖 Glossary</span>
        </ToolbarButton>
      )}

      <div className="flex-1" />

      {/* Undo/Redo */}
      <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo">
        <span className="text-sm">↩</span>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo">
        <span className="text-sm">↪</span>
      </ToolbarButton>
    </div>
  );
};

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  content,
  onChange,
  glossaryTerms = [],
  onMarkGlossary,
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Highlight,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image.configure({ inline: false }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: 'Start writing your chapter...' }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none p-6 min-h-[500px] focus:outline-none text-foreground',
      },
    },
  });

  // Sync editor content when the content prop changes externally (e.g. draft loaded async)
  React.useEffect(() => {
    if (editor && content && editor.getHTML() !== content) {
      editor.commands.setContent(content);
    }
  }, [editor, content]);

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card/30">
      <Toolbar editor={editor} onMarkGlossary={onMarkGlossary} />
      <EditorContent editor={editor} />
    </div>
  );
};

export default RichTextEditor;
