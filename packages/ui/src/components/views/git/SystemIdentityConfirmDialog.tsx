import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n';

type SystemIdentityConfirmDialogProps = {
  /** The identity waiting to be applied, or null when nothing is pending. */
  identityName: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * The one thing choosing an identity cannot decide on its own.
 *
 * A System Git identity says "use whatever this machine holds", and
 * OpenChamber cannot tell whose credentials those are. That is an authority
 * decision, so it is asked before anything is written rather than reported
 * afterwards — picking a name from a menu is not the same as saying it.
 */
export const SystemIdentityConfirmDialog: React.FC<SystemIdentityConfirmDialogProps> = ({
  identityName,
  onConfirm,
  onCancel,
}) => {
  const { t } = useI18n();
  return (
    <Dialog open={identityName !== null} onOpenChange={(open) => { if (!open) onCancel(); }}>
      {identityName !== null ? (
        <DialogContent className="min-w-0">
          <DialogHeader>
            <DialogTitle>{t('gitView.identity.systemConfirmTitle', { name: identityName })}</DialogTitle>
            <DialogDescription>{t('settings.sourceControl.transport.unverifiedConfirmation')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={onCancel}>{t('gitView.common.cancel')}</Button>
            <Button size="sm" onClick={onConfirm}>{t('gitView.identity.systemConfirmAction')}</Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
};
