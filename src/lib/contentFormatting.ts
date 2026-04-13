import DOMPurify from 'dompurify';

const ZERO_WIDTH_CHARACTERS = /[\u200B-\u200D\uFEFF]/g;
const NON_BREAKING_SPACES = /\u00A0/g;
const FULL_WIDTH_ASTERISKS = /\uFF0A/g;
const FORMATTED_TEXT_PATTERN = /(\*\*[^*\n]+\*\*)|(\*(?!\s)[^*\n]+\*)|(\|\|.+?\|\|)|(!\[[^\]]*\]\([^)]+\))|(\[[^\]]+\]\([^)]+\))/;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function unwrapElement(element: Element) {
  const parent = element.parentNode;
  if (!parent) return;

  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }

  parent.removeChild(element);
}

function normalizeMarkdownDelimiters(value: string): string {
  return value
    .replace(/(^|[\s([{-])\*\*\s+([^*\n][^\n]*?\S)\s+\*\*(?=($|[\s)\]}.,!?;:]))/gm, '$1**$2**')
    .replace(/(^|[\s([{-])\*\s+([^*\n][^\n]*?\S)\s+\*(?=($|[\s)\]}.,!?;:]))/gm, '$1*$2*');
}

function formatInlineMarkdown(escapedText: string): string {
  return escapedText
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" class="max-w-full rounded-lg my-2" />')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline">$1</a>')
    .replace(/\|\|(.+?)\|\|/g, '<span class="spoiler-tag" onclick="this.classList.toggle(\'revealed\')" title="Click to reveal spoiler">$1</span>')
    .replace(/\*\*(?!\s)(.+?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s([{-])\*(?!\s)(.+?\S)\*(?=($|[\s)\]}.,!?;:]))/g, '$1<em>$2</em>');
}

function inlineRichTextFromPlainText(text: string): string {
  const normalized = normalizePlainTextFormatting(text);
  return formatInlineMarkdown(escapeHtml(normalized));
}

export function normalizePlainTextFormatting(value: string): string {
  return normalizeMarkdownDelimiters(
    value
      .replace(/\r\n?/g, '\n')
      .replace(/[\u2028\u2029]/g, '\n')
      .replace(ZERO_WIDTH_CHARACTERS, '')
      .replace(NON_BREAKING_SPACES, ' ')
      .replace(FULL_WIDTH_ASTERISKS, '*')
  );
}

export function renderFormattedContent(text: string): string {
  const normalized = normalizePlainTextFormatting(text);

  const html = normalized
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();

      if (!trimmed) return '';
      if (/^(?:\*\s*){3,}$/.test(trimmed)) {
        return '<span class="block text-center text-muted-foreground">⁕ ⁕ ⁕</span>';
      }

      if (/^>\s?/.test(trimmed)) {
        return `<span class="block border-l-2 border-primary/40 pl-3 text-muted-foreground italic text-sm">${inlineRichTextFromPlainText(trimmed.replace(/^>\s?/, ''))}</span>`;
      }

      return inlineRichTextFromPlainText(line);
    })
    .join('<br>');

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['strong', 'em', 'br', 'span', 'a', 'img'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'target', 'rel', 'title', 'onclick'],
  });
}

export function plainTextToRichHtml(text: string): string {
  const normalized = normalizePlainTextFormatting(text);
  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (!blocks.length) return '<p></p>';

  return blocks
    .map((block) => {
      const lines = block.split('\n');
      const trimmed = block.trim();

      if (/^(?:\*\s*){3,}$/.test(trimmed)) {
        return '<hr />';
      }

      if (lines.every((line) => /^>\s?/.test(line.trim()))) {
        const quoteHtml = lines
          .map((line) => inlineRichTextFromPlainText(line.replace(/^\s*>\s?/, '')))
          .join('<br>');

        return `<blockquote><p>${quoteHtml}</p></blockquote>`;
      }

      if (lines.every((line) => /^[-•]\s+/.test(line.trim()))) {
        return `<ul>${lines
          .map((line) => `<li>${inlineRichTextFromPlainText(line.replace(/^\s*[-•]\s+/, ''))}</li>`)
          .join('')}</ul>`;
      }

      if (lines.every((line) => /^\d+\.\s+/.test(line.trim()))) {
        return `<ol>${lines
          .map((line) => `<li>${inlineRichTextFromPlainText(line.replace(/^\s*\d+\.\s+/, ''))}</li>`)
          .join('')}</ol>`;
      }

      return `<p>${lines.map((line) => inlineRichTextFromPlainText(line)).join('<br>')}</p>`;
    })
    .join('');
}

function normalizeRichTextDocument(html: string): HTMLElement | null {
  if (typeof window === 'undefined' || !html.trim()) return null;

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const container = doc.body.firstElementChild as HTMLElement | null;

  if (!container) return null;

  container.querySelectorAll('font').forEach(unwrapElement);

  container.querySelectorAll<HTMLElement>('*').forEach((element) => {
    element.removeAttribute('style');
    element.removeAttribute('face');
    element.removeAttribute('size');
    element.removeAttribute('color');
    element.removeAttribute('dir');
  });

  const textNodes: Text[] = [];
  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let currentNode = walker.nextNode();

  while (currentNode) {
    textNodes.push(currentNode as Text);
    currentNode = walker.nextNode();
  }

  textNodes.forEach((node) => {
    const parent = node.parentElement;
    if (!parent || parent.closest('code, pre')) return;

    const originalText = node.textContent || '';
    const normalizedText = normalizePlainTextFormatting(originalText);
    const formattedHtml = formatInlineMarkdown(escapeHtml(normalizedText));

    if (formattedHtml === escapeHtml(normalizedText)) {
      if (normalizedText !== originalText) {
        node.textContent = normalizedText;
      }
      return;
    }

    const template = doc.createElement('template');
    template.innerHTML = formattedHtml;
    node.replaceWith(template.content.cloneNode(true));
  });

  return container;
}

export function normalizeRichTextHtml(html: string): string {
  const container = normalizeRichTextDocument(html);
  return container ? container.innerHTML : html;
}

export function sanitizeRichPasteHtml(html: string): string {
  const container = normalizeRichTextDocument(html);
  if (!container) return html;

  container.querySelectorAll<HTMLElement>('*').forEach((element) => {
    const isGlossarySpan = element.tagName === 'SPAN' && element.classList.contains('glossary-term') && element.hasAttribute('data-term');

    if (!isGlossarySpan && element.tagName !== 'A' && element.tagName !== 'IMG') {
      element.removeAttribute('class');
    }
  });

  container.querySelectorAll('span').forEach((span) => {
    const isGlossarySpan = span.classList.contains('glossary-term') && span.hasAttribute('data-term');
    if (!isGlossarySpan && span.attributes.length === 0) {
      unwrapElement(span);
    }
  });

  return container.innerHTML;
}

export function shouldNormalizeRichPaste(text: string, html: string): boolean {
  if (html.trim()) return true;
  return FORMATTED_TEXT_PATTERN.test(normalizePlainTextFormatting(text));
}