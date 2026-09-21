import { useState } from 'react';
import { ClipboardList, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { parseQuestionPaste, pasteLineCount } from '@/lib/questionPaste';

export const addAuditQuestion = (questions: string[]) => [...questions, ''];
export const editAuditQuestion = (questions: string[], index: number, value: string) => questions.map((question, i) => i === index ? value : question);
export const removeAuditQuestion = (questions: string[], index: number) => questions.filter((_, i) => i !== index);
export const cleanAuditQuestions = (questions: readonly string[]) => {
  const seen = new Set<string>();
  return questions.map((question) => question.trim()).filter((question) => {
    const key = question.toLocaleLowerCase();
    if (!question || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
export function applyAuditQuestionPaste(current: readonly string[], pasted: string, mode: 'replace' | 'append'): string[] {
  const parsed = parseQuestionPaste(pasted);
  return mode === 'replace' ? parsed : cleanAuditQuestions([...current, ...parsed]);
}

/* ⛔ SELECTION IS OPT-IN AND LIVES IN THE PARENT. A discovery audit lets the operator pick which
   of the generated questions to run (1..80 of them), and the obvious shortcut — delete the ones you
   do not want — loses them for good, so re-picking means regenerating the lot. So the checkbox
   column appears only when the parent passes `selected`; every other caller renders exactly the
   editor it rendered before, with no checkbox and no selection state to get out of step.
   The index is the identity: two questions can be edited into the same string mid-edit, and a
   selection keyed on text would silently merge them. */
export function AuditQuestionEditor({ questions, onChange, disabled = false, busy = false, selected, onToggle }: {
  questions: string[];
  onChange: (questions: string[]) => void;
  disabled?: boolean;
  busy?: boolean;
  /** Indexes of the questions that will actually be run. Omit for no selection column. */
  selected?: ReadonlySet<number>;
  onToggle?: (index: number, next: boolean) => void;
}) {
  const selectable = !!selected && !!onToggle;
  const [paste, setPaste] = useState('');
  const parsed = parseQuestionPaste(paste);
  const apply = (mode: 'replace' | 'append') => {
    if (!parsed.length) return;
    onChange(applyAuditQuestionPaste(questions, paste, mode));
    setPaste('');
  };
  return <div className="space-y-3">
    <div className="space-y-2">
      {questions.map((question, index) => <div key={index} className="flex items-center gap-2">
        {selectable && <input
          type="checkbox"
          className="h-4 w-4 shrink-0 accent-primary"
          aria-label={`Include question ${index + 1}`}
          checked={selected!.has(index)}
          disabled={disabled || busy}
          onChange={(event) => onToggle!(index, event.target.checked)}
        />}
        <Input aria-label={`Question ${index + 1}`} value={question} disabled={disabled || busy} onChange={(event) => onChange(editAuditQuestion(questions, index, event.target.value))}/>
        {!disabled && <Button type="button" variant="ghost" size="icon" disabled={busy} onClick={() => onChange(removeAuditQuestion(questions, index))} title="Remove question"><Trash2 className="h-4 w-4"/></Button>}
      </div>)}
      {!disabled && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onChange(addAuditQuestion(questions))}><Plus className="mr-1 h-4 w-4"/>Add question</Button>}
    </div>
    {!disabled && <div className="rounded-md border border-primary/20 p-3">
      <Label className="flex items-center gap-1 text-xs font-medium"><ClipboardList className="h-3.5 w-3.5"/>Paste questions</Label>
      <Textarea className="mt-2 text-sm" rows={4} value={paste} disabled={busy} onChange={(event) => setPaste(event.target.value)} placeholder="One customer question per line"/>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="secondary" disabled={busy || !parsed.length} onClick={() => apply('replace')}>Replace all ({parsed.length})</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy || !parsed.length} onClick={() => apply('append')}>Add to list ({parsed.length})</Button>
        {paste.trim() && <span className="text-[11px] text-muted-foreground">{parsed.length} clean from {pasteLineCount(paste)} lines</span>}
      </div>
    </div>}
  </div>;
}
