export type OrgRole = 'admin' | 'gestor' | 'atendente';

export interface Organization {
  id: string;
  name: string;
  /** identificador curto (slug) do tenant */
  slug: string;
  /** papel do usuário atual nesta organização */
  role: OrgRole;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}
