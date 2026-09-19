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

export function AuditQuestionEditor({ questions, onChange, disabled = false, busy = false }: {
  questions: string[];
  onChange: (questions: string[]) => void;
  disabled?: boolean;
  busy?: boolean;
}) {
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
