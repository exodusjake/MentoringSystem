import { useEffect } from 'react';

// Rich-text helpers shared by the announcement/comment editors (formatDoc / updateToolbarState in the
// announcement scripts): document.execCommand on a focused contenteditable.
export function formatDoc(command) {
  document.execCommand(command, false, null);
  updateToolbarState();
}

export function updateToolbarState() {
  const CMDS = ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList'];
  CMDS.forEach(cmd => {
    const active = document.queryCommandState(cmd);
    document.querySelectorAll(`[data-cmd="${cmd}"]`).forEach(btn => {
      btn.classList.toggle('fmt-active', active);
    });
  });
}

// Keeps the toolbar buttons highlighted for the current selection while a contenteditable has focus.
export function useToolbarState() {
  useEffect(() => {
    const onSel = () => {
      const focused = document.activeElement;
      if (focused && focused.isContentEditable) updateToolbarState();
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);
}

// Format button that doesn't steal the editor's focus (onmousedown="event.preventDefault();formatDoc(cmd)").
export const fmtMouseDown = cmd => e => { e.preventDefault(); formatDoc(cmd); };
