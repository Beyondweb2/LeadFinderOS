import { useState, useCallback, useRef } from 'react';

const INITIAL_MESSAGE_TEMPLATES = [
  "Hi is this {{business_name}}?",
  "Hey is this {{business_name}}?",
  "Hi just checking is this {{business_name}}",
  "Hello is this the right number for {{business_name}}?",
  "Hi am I speaking with {{business_name}}?",
  "Hi this {{business_name}}?",
];

const AUTO_KEY = 'leadfinder_auto_rotate';
const INDEX_KEY = 'leadfinder_auto_rotate_index';

function getStoredAuto(): boolean {
  const v = sessionStorage.getItem(AUTO_KEY);
  return v === null ? true : v === '1';
}

function getStoredIndex(): number {
  const v = sessionStorage.getItem(INDEX_KEY);
  return v ? parseInt(v, 10) % INITIAL_MESSAGE_TEMPLATES.length : 0;
}

export function useAutoRotateTemplate() {
  const [autoOn, setAutoOn] = useState(getStoredAuto);
  const indexRef = useRef(getStoredIndex());

  const toggleAuto = useCallback((on: boolean) => {
    setAutoOn(on);
    sessionStorage.setItem(AUTO_KEY, on ? '1' : '0');
  }, []);

  /** Call when the dialog opens. Returns the template to use. */
  const getNextTemplate = useCallback((currentTemplate: string): string => {
    if (!autoOn) return currentTemplate;
    const tpl = INITIAL_MESSAGE_TEMPLATES[indexRef.current];
    const nextIdx = (indexRef.current + 1) % INITIAL_MESSAGE_TEMPLATES.length;
    indexRef.current = nextIdx;
    sessionStorage.setItem(INDEX_KEY, String(nextIdx));
    return tpl;
  }, [autoOn]);

  return { autoOn, toggleAuto, getNextTemplate, templates: INITIAL_MESSAGE_TEMPLATES };
}
