import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { LogOut, User, Crown, Key, Loader2, Camera, Globe } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAvatar } from '@/hooks/useAvatar';
import { useSubscription } from '@/hooks/useSubscription';
import { useLanguage, LANGUAGE_OPTIONS } from '@/hooks/useLanguage';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export function UserMenu() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { subscriptionEnd, isAdmin, isPaidSubscriber, isStripeTrialing } = useSubscription();
  const { uploadAvatar, isUploading } = useAvatar();
  const { currentLanguage, changeLanguage } = useLanguage();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: t('userMenu.fileTooLarge'), description: t('userMenu.maxSize'), variant: 'destructive' });
      return;
    }
    try {
      await uploadAvatar(file);
    } catch {
      toast({ title: t('userMenu.uploadFailed'), variant: 'destructive' });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSignOut = async () => { await signOut(); };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast({ title: t('userMenu.passwordTooShort'), description: t('userMenu.passwordMinChars'), variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: t('userMenu.passwordsDontMatch'), description: t('userMenu.passwordsMustMatch'), variant: 'destructive' });
      return;
    }
    setIsChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setShowPasswordDialog(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      toast({ title: t('common.error'), description: error.message || 'Failed to update password', variant: 'destructive' });
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (!user) return null;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="rounded-full relative">
            <User className="h-4 w-4" />
            {isPaidSubscriber && <Crown className="h-3 w-3 text-primary absolute -top-1 -right-1" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{t('userMenu.account')}</p>
              <p className="text-xs leading-none text-muted-foreground truncate">{user.email}</p>
              {isPaidSubscriber && subscriptionEnd && (
                <p className="text-xs text-primary font-medium">{t('userMenu.proRenews', { date: formatDate(subscriptionEnd) })}</p>
              )}
              {isStripeTrialing && subscriptionEnd && (
                <p className="text-xs text-amber-500 font-medium">{t('userMenu.proTrialEnds', { date: formatDate(subscriptionEnd) })}</p>
              )}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className="cursor-pointer" disabled={isUploading}>
            <Camera className="mr-2 h-4 w-4" />
            {isUploading ? t('userMenu.uploading') : t('userMenu.changeProfilePicture')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowPasswordDialog(true)} className="cursor-pointer">
            <Key className="mr-2 h-4 w-4" />
            {t('userMenu.changePassword')}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer">
              <Globe className="mr-2 h-4 w-4" />
              {t('common.language')}
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                {LANGUAGE_OPTIONS.map((lang) => (
                  <DropdownMenuItem
                    key={lang.value}
                    onClick={() => changeLanguage(lang.value)}
                    className={`cursor-pointer ${currentLanguage === lang.value ? 'bg-accent' : ''}`}
                  >
                    {lang.nativeLabel}
                    <span className="ml-auto text-xs text-muted-foreground">{lang.label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} className="text-destructive cursor-pointer">
            <LogOut className="mr-2 h-4 w-4" />
            {t('common.signOut')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('userMenu.changePassword')}</DialogTitle>
            <DialogDescription>{t('userMenu.enterNewPassword')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">{t('userMenu.newPassword')}</Label>
              <Input id="new-password" type="password" placeholder="••••••••" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={isChangingPassword} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">{t('userMenu.confirmPassword')}</Label>
              <Input id="confirm-password" type="password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={isChangingPassword} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPasswordDialog(false)} disabled={isChangingPassword}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleChangePassword} disabled={isChangingPassword || !newPassword || !confirmPassword}>
              {isChangingPassword ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('userMenu.updating')}</>) : t('userMenu.updatePassword')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
