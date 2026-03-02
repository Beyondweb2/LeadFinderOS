import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLanguage, LANGUAGE_OPTIONS, type SupportedLanguage } from '@/hooks/useLanguage';
import { Globe } from 'lucide-react';

interface LanguageSelectionModalProps {
  open: boolean;
  onComplete: () => void;
}

export function LanguageSelectionModal({ open, onComplete }: LanguageSelectionModalProps) {
  const { changeLanguage } = useLanguage();
  const { t } = useTranslation();
  const [selected, setSelected] = useState<SupportedLanguage | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleContinue = async () => {
    if (!selected) return;
    setIsSaving(true);
    await changeLanguage(selected);
    setIsSaving(false);
    onComplete();
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent hideClose className="max-w-sm mx-auto p-0 overflow-hidden border-border/50 bg-card">
        <div className="p-6 space-y-5">
          <div className="text-center space-y-2">
            <div className="flex justify-center">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Globe className="h-6 w-6 text-primary" />
              </div>
            </div>
            <h2 className="text-lg font-bold text-foreground">{t('languageModal.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('languageModal.subtitle')}</p>
          </div>

          <div className="space-y-2">
            {LANGUAGE_OPTIONS.map((lang) => (
              <button
                key={lang.value}
                onClick={() => setSelected(lang.value)}
                className={cn(
                  'w-full flex items-center justify-between p-3.5 rounded-xl border transition-all text-left',
                  selected === lang.value
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    : 'border-border hover:border-primary/40 bg-background/50'
                )}
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">{lang.nativeLabel}</p>
                  <p className="text-xs text-muted-foreground">{lang.label}</p>
                </div>
                {selected === lang.value && (
                  <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                    <svg className="h-3 w-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>

          <Button
            className="w-full"
            size="lg"
            disabled={!selected || isSaving}
            onClick={handleContinue}
          >
            {isSaving ? t('common.loading') : t('languageModal.continue')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
