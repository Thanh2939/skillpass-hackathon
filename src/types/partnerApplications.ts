export type PartnerApplicationStatus = 'pending' | 'provisioning' | 'account_created' | 'rejected';

export interface PartnerApplicationInput {
  name: string;
  org_type: 'school' | 'company';
  tax_code: string;
  contact_person: string;
  phone: string;
  email: string;
  password: string;
}

export interface PartnerApplication extends PartnerApplicationInput {
  id: string;
  status: PartnerApplicationStatus;
  created_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  organization_id?: string | null;
  user_id?: string | null;
  rejection_reason?: string | null;
}

/** Display to the reviewing admin once; never persist this response in app storage. */
export interface ProvisionedPartnerAccount {
  userId: string;
  organizationId: string;
  email: string;
  /** One-time link the partner opens to choose their own password (24h). */
  setupUrl?: string;
  setupExpiresAt?: string;
}
