import { type ReactNode } from 'react';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Diálogo de confirmação próprio do Atenvo. Substitui window.confirm. */
export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', destructive = false, loading = false, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={() => { if (!loading) onCancel(); }} title={title} width={420} closeOnBackdrop={!loading}
      footer={<>
        <button className="atv-btn" disabled={loading} onClick={onCancel}>{cancelLabel}</button>
        <button className={'atv-btn ' + (destructive ? 'danger' : 'primary')} disabled={loading} onClick={onConfirm}>{loading ? 'Processando…' : confirmLabel}</button>
      </>}>
      <div className="atv-modal-msg">{message}</div>
    </Modal>
  );
}
