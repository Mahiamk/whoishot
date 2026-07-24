export interface AdminMetrics {
  users_total: number
  users_by_gender: Record<string, number>
  active_contests: number
  contestants_by_gender: Record<string, number>
  ratings_total: number
  open_reports: number
}

export type ContestantStatus = 'active' | 'reported' | 'removed'
export type ReportStatus = 'open' | 'resolved'

export interface AdminReportContestant {
  id: number
  name: string
  photo_url: string | null
  status: ContestantStatus
  contest_id: number
  user_id: number
}

export type InfoRequestStatus = 'pending' | 'responded' | 'expired' | 'closed'

export interface AdminInfoRequestItem {
  id: number
  report_id: number
  target_user_id: number
  admin_id: number
  message: string
  status: InfoRequestStatus
  user_response: string | null
  deadline_at: string
  created_at: string
  responded_at: string | null
}

export interface AdminReportItem {
  id: number
  reason: string
  reporter_email: string | null
  status: ReportStatus
  contestant: AdminReportContestant
  info_request: AdminInfoRequestItem | null
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  per_page: number
}

export type ResolveAction =
  | 'dismiss'
  | 'hide_contestant'
  | 'delete_photo'
  | 'remove_contestant'
  | 'ban_user'

export interface AdminUserItem {
  id: number
  email: string
  display_name: string
  gender: 'F' | 'M'
  role: 'user' | 'admin'
  is_banned: boolean
  created_at: string
}

export interface AdminContestItem {
  id: number
  join_code: string
  title: string
  description: string | null
  creator_id: number
  is_active: boolean
  is_showcase_public: boolean
  contestant_count: number
  rating_count: number
  open_report_count: number
}

export interface AdminAuditLogItem {
  id: number
  admin_id: number
  admin_email: string
  action: string
  target_type: string
  target_id: number
  detail: Record<string, unknown> | null
  created_at: string
}

export type DomainKind = 'allow' | 'deny'

export interface EmailDomainItem {
  id: number
  domain: string
  kind: DomainKind
  note: string | null
  added_by: number | null
  added_by_email: string | null
  created_at: string
}

export interface AdminDomainRequestItem {
  id: number
  requested_domain: string
  reporter_email: string | null
  reason: string
  status: ReportStatus
}

// --- admin detail views ---

export type ContestStatus = 'active' | 'ended'

export interface AdminUserContestantEntry {
  contestant_id: number
  contest_id: number
  contest_title: string
  contest_join_code: string
  contest_status: ContestStatus
  name: string
  photo_url: string | null
  gender_category: 'F' | 'M'
  status: ContestantStatus
  avg_score: number | null
  vote_count: number
}

export interface AdminUserDetail extends AdminUserItem {
  is_verified: boolean
  legacy_email: boolean
  contestant_entries: AdminUserContestantEntry[]
}

export interface AdminVoterEntry {
  voter_id: number
  voter_email: string
  voter_display_name: string
  scores: Record<string, number>
  avg: number | null
}

export interface AdminContestantDetail {
  id: number
  user_id: number | null
  contest_id: number
  contest_title: string
  contest_join_code: string
  name: string
  gender_category: 'F' | 'M'
  photo_url: string | null
  age: number | null
  country: string | null
  hobbies: string | null
  fav_things: string | null
  relationship_status: string | null
  status: ContestantStatus
  is_demo: boolean
  criterion_averages: Record<string, number>
  vote_count: number
  avg_score: number | null
  voters: AdminVoterEntry[]
}

export type PayoutRowStatus = 'pending' | 'sent' | 'failed'
export type EntryPaymentStatus = 'pending' | 'paid' | 'refund_pending' | 'refunded'

export interface AdminPayoutItem {
  id: number
  contest_id: number
  contest_title: string
  contestant_id: number | null
  contestant_name: string | null
  user_email: string | null
  payment_handle: string | null
  rank: string
  amount_cents: number
  status: PayoutRowStatus
  created_at: string
  sent_at: string | null
  provider_ref: string | null
}

export interface AdminRefundItem {
  id: number
  contest_id: number
  contest_title: string
  user_email: string
  payment_handle: string | null
  amount_cents: number
  status: EntryPaymentStatus
  created_at: string
  provider_ref: string | null
}
