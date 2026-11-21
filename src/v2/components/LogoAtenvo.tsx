/* A marca do sistema é a do REVIZA CRM (21/11) — ver LogoReviza.tsx.
   O componente segue chamado LogoAtenvo para não mexer nos imports das telas. */
import { IconeReviza } from './LogoReviza';

export function LogoAtenvo({ className }: { className?: string }) {
  return <IconeReviza className={className} />;
}
