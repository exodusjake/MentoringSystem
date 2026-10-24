import { useLayoutEffect } from 'react';

// Adds a <style> once per id and keeps it (the vanilla scripts injected their CSS once and never removed it).
export function injectStyle(id, css) {
    if (document.getElementById(id)) return;
    const st = document.createElement('style');
    st.id = id;
    st.textContent = css;
    document.head.appendChild(st);
}
export function useStyle(id, css) {
    useLayoutEffect(() => { injectStyle(id, css); }, [id, css]);
}
