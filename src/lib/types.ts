export type Role =
  | 'BOARD_SECRETARIAT'
  | 'BOARD_MEMBER'
  | 'CEO'
  | 'CEO_SECRETARIAT'
  | 'CHIEF'
  | 'DEPUTY_CHIEF'
  | 'DIRECTOR'
  | 'ADMIN';

export type MatterType =
  | 'Decision'
  | 'Directive'
  | 'Resolution'
  | 'Instruction'
  | 'Policy / Rule'
  | 'Other Board Direction';

export type Priority = 'Urgent' | 'High' | 'Medium' | 'Low';

export type MatterStatus =
  | 'Received'
  | 'Under Review'
  | 'Assigned'
  | 'In Progress'
  | 'Clarification Required'
  | 'Implementation Submitted'
  | 'Under Review / Confirmation'
  | 'Closed';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string;
  businessArea: string;
  department?: string;
  avatar?: string;
  phone?: string;
}

export type DocumentCategory = 'ORIGINAL_BOARD_DOC' | 'RESOLUTION' | 'SUPPORTING' | 'IMPLEMENTATION_EVIDENCE' | 'COMPLETION_REPORT';

export interface Document {
  id: string;
  name: string;
  category: DocumentCategory;
  fileType: string;
  fileSize: string;
  uploadedBy: string;
  uploadedByRole: Role;
  uploadedAt: string;
  description?: string;
  /** SHA-256 of the stored bytes. Absent on metadata-only rows registered before file upload. */
  sha256?: string;
  byteSize?: number;
  /**
   * Whether there is a file behind this entry to download.
   *
   * Optional because the shipped demonstration fixture records documents that
   * were never uploaded — they are metadata describing papers that exist on
   * paper. The API always sets it explicitly.
   */
  hasFile?: boolean;
}

export interface AuditLogEntry {
  id: string;
  matterId: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: Role;
  userTitle: string;
  action:
    | 'Matter Created'
    | 'Matter Received'
    | 'Matter Viewed'
    | 'Matter Accepted'
    | 'Matter Assigned'
    | 'Matter Forwarded'
    | 'Clarification Requested'
    | 'Clarification Provided'
    | 'Deadline Changed'
    | 'Owner Changed'
    | 'Progress Updated'
    | 'Status Changed'
    | 'Implementation Submitted'
    | 'Completion Reviewed'
    | 'Completion Confirmed'
    | 'Matter Closed';
  previousOwner?: {
    id: string;
    name: string;
    role: Role;
    title: string;
  };
  newOwner?: {
    id: string;
    name: string;
    role: Role;
    title: string;
  };
  previousStatus?: MatterStatus;
  newStatus?: MatterStatus;
  comment?: string;
  supportingDocName?: string;
  details?: Record<string, any>;
}

export interface ImplementationReport {
  id: string;
  submittedBy: string;
  directorName: string;
  directorTitle: string;
  submissionDate: string;
  actionTaken: string;
  whatWasImplemented: string;
  implementationDate: string;
  responsibleArea: string;
  resultOutcome: string;
  currentCondition: string;
  remainingIssues: string;
  reasonForPartialNonImplementation?: string;
  evidenceDocuments: Document[];
  comments: string;
  completionDate: string;
  completionStatus: 'Completed' | 'Partially Completed' | 'Ongoing Monitoring';
  reviewedBy?: string;
  reviewerRole?: Role;
  reviewerTitle?: string;
  reviewDate?: string;
  reviewNotes?: string;
  reviewDecision?: 'Approved' | 'Revision Requested';
}

export interface WorkflowNode {
  id: string;
  level: 'BOARD_SECRETARIAT' | 'CEO' | 'CEO_SECRETARIAT' | 'CHIEF' | 'DEPUTY_CHIEF' | 'DIRECTOR' | 'REVIEW_CONFIRMATION' | 'CLOSED';
  label: string;
  userId: string;
  userName: string;
  userTitle: string;
  role: Role;
  businessArea: string;
  assignedAt: string;
  actedAt?: string;
  actionTaken?: string;
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'SKIPPED';
  comment?: string;
}

export interface ClarificationThread {
  id: string;
  requestedBy: string;
  requesterName: string;
  requesterRole: Role;
  requesterTitle: string;
  requestedTo: string;
  recipientName: string;
  recipientRole: Role;
  requestedAt: string;
  question: string;
  status: 'OPEN' | 'RESOLVED';
  resolvedAt?: string;
  response?: string;
  responseBy?: string;
  responseByName?: string;
}

export interface BODMatter {
  id: string; // e.g. BOD-2026-001
  resolutionNumber: string; // e.g. NIB/BOD/RES/2026/042
  matterType: MatterType;
  title: string;
  description: string;
  boardMeetingDate: string;
  boardDecisionDate: string;
  effectiveDate: string;
  priority: Priority;
  deadline: string;
  businessArea: string;
  
  // Organization routing pointers
  responsibleChiefId?: string;
  responsibleChiefName?: string;
  responsibleChiefTitle?: string;
  
  responsibleDeputyChiefId?: string;
  responsibleDeputyChiefName?: string;
  responsibleDeputyChiefTitle?: string;
  
  responsibleDirectorId?: string;
  responsibleDirectorName?: string;
  responsibleDirectorTitle?: string;
  
  currentOwnerId: string;
  currentOwnerName: string;
  currentOwnerRole: Role;
  currentOwnerTitle: string;
  
  accountableExecutiveId?: string;
  accountableExecutiveName?: string;
  accountableExecutiveTitle?: string;
  
  // Tracking
  status: MatterStatus;
  progress: number; // 0 to 100
  currentStage: string;
  daysRemaining: number;
  isOverdue: boolean;
  lastAction: string;
  lastActionDate: string;
  lastActionUserId: string;
  lastActionUserName: string;
  nextRequiredAction: string;
  nextActionRole: Role;
  overallStatus: string;
  
  // Content & Audit
  documents: Document[];
  implementationReport?: ImplementationReport;
  routingPath: WorkflowNode[];
  clarifications: ClarificationThread[];
  createdAt: string;
  createdBy: string;
  createdByName: string;
  updatedAt: string;
  closedAt?: string;
  closedBy?: string;
  closedByName?: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  matterId: string;
  matterTitle: string;
  title: string;
  message: string;
  type: 'ASSIGNMENT' | 'FORWARD' | 'CLARIFICATION' | 'DEADLINE_APPROACHING' | 'OVERDUE' | 'IMPLEMENTATION_SUBMITTED' | 'COMPLETION_CONFIRMED' | 'STATUS_CHANGE';
  timestamp: string;
  isRead: boolean;
  actionUrl?: string;
}

export interface DashboardMetrics {
  totalMatters: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  byBusinessArea: Record<string, number>;
  overdueCount: number;
  dueSoonCount: number;
  myActionRequiredCount: number;
  myOwnedCount: number;
  inProgressCount: number;
  implementationSubmittedCount: number;
  closedCount: number;
  awaitingCeoCount: number;
  awaitingChiefCount: number;
  awaitingDirectorCount: number;
}
