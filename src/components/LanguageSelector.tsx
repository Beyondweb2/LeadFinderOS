import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Globe } from 'lucide-react';
import { LANGUAGE_OPTIONS, type SupportedLanguage } from '@/hooks/useLanguage';
import { LANG_STORAGE_KEY } from '@/i18n';

interface LanguageSelectorProps {
  value: SupportedLanguage;
  onChange: (lang: SupportedLanguage) => void;
  label?: string;
  compact?: boolean;
}

export function LanguageSelector({ value, onChange, label, compact }: LanguageSelectorProps) {
  const { t } = useTranslation();

  return (
    <div className={compact ? '' : 'space-y-2'}>
      {label !== undefined ? (
        label ? <Label className="text-xs font-medium text-foreground/80">{label}</Label> : null
      ) : (
        <Label className="text-xs font-medium text-foreground/80 flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5" />
          {t('common.language')}
        </Label>
      )}
      <Select value={value} onValueChange={(v) => onChange(v as SupportedLanguage)}>
        <SelectTrigger className="w-full h-9 sm:h-10 bg-input border-border text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LANGUAGE_OPTIONS.map((lang) => (
            <SelectItem key={lang.value} value={lang.value}>
              <span className="flex items-center gap-2">
                <span>{lang.nativeLabel}</span>
                <span className="text-muted-foreground text-xs">({lang.label})</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
