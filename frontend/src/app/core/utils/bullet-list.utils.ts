export function appendBulletSnippet(current: string, snippet: string): string {
  const cleanSnippet = snippet.replace(/^[•*-]\s*/, '').trim();
  const bulletText = `• ${cleanSnippet}`;
  const trimmed = current.trim();
  return trimmed ? `${trimmed}\n${bulletText}` : bulletText;
}

export function handleBulletTextareaKeyDown(event: KeyboardEvent, updateValue: (newVal: string) => void): void {
  if (event.key !== 'Enter') return;
  const textarea = event.target as HTMLTextAreaElement;
  if (!textarea) return;
  const { selectionStart, selectionEnd, value } = textarea;
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const currentLine = value.substring(lineStart, selectionStart);
  if (currentLine.startsWith('• ') || currentLine.startsWith('- ')) {
    event.preventDefault();
    if (currentLine.trim() === '•' || currentLine.trim() === '-') {
      const newValue = value.substring(0, lineStart) + value.substring(selectionEnd);
      updateValue(newValue);
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = lineStart;
      }, 0);
      return;
    }
    const insert = '\n• ';
    const newValue = value.substring(0, selectionStart) + insert + value.substring(selectionEnd);
    updateValue(newValue);
    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = selectionStart + insert.length;
    }, 0);
  }
}

