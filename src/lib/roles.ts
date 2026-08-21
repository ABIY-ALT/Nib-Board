export interface PermissionAction {
  key: string;
  label: string;
  description: string;
  category: 'Visibility' | 'Registration & Routing' | 'Execution & Reporting' | 'Administration';
}

export const ALL_PERMISSION_ACTIONS: PermissionAction[] = [
  {
    key: 'see_all',
    label: 'See all Board matters',
    description: 'Bank-wide institutional visibility across all directorates and business areas.',
    category: 'Visibility',
  },
  {
    key: 'register_matter',
    label: 'Register Board matter',
    description: 'Enter new Board decisions, directives, and resolutions into the system.',
    category: 'Registration & Routing',
  },
  {
    key: 'route_matter',
    label: 'Route / Forward / Assign',
    description: 'Forward matters and assign operational ownership down the hierarchy.',
    category: 'Registration & Routing',
  },
  {
    key: 'accept_ownership',
    label: 'Accept matter ownership',
    description: 'Acknowledge and accept incoming matters routed to the user.',
    category: 'Registration & Routing',
  },
  {
    key: 'request_clarification',
    label: 'Issue Direction / Clarification',
    description: 'Issue official guidance or raise clarification questions on active matters.',
    category: 'Execution & Reporting',
  },
  {
    key: 'reply_clarification',
    label: 'Answer Clarifications',
    description: 'Provide formal responses to clarification requests directed to the user.',
    category: 'Execution & Reporting',
  },
  {
    key: 'attach_document',
    label: 'Attach Board papers & Evidence',
    description: 'Upload signed minutes, supporting documents, or execution proof.',
    category: 'Execution & Reporting',
  },
  {
    key: 'submit_report',
    label: 'Submit Implementation Report',
    description: 'Formally submit the Director Implementation Report with evidence.',
    category: 'Execution & Reporting',
  },
  {
    key: 'confirm_completion',
    label: 'Review & Confirm Completion',
    description: 'Authorize and confirm completed implementation reports.',
    category: 'Execution & Reporting',
  },
  {
    key: 'close_matter',
    label: 'Formally Close Matter',
    description: 'Formally close matters after report submission and confirmation.',
    category: 'Execution & Reporting',
  },
  {
    key: 'view_analytics',
    label: 'Executive Analytics & Scorecards',
    description: 'Access institutional compliance scorecards, SLA aging, and decision analytics.',
    category: 'Visibility',
  },
  {
    key: 'view_audit_trail',
    label: 'Global Institutional Audit Trail',
    description: 'Access the bank-wide immutable audit trail of all governance activities.',
    category: 'Visibility',
  },
  {
    key: 'administer_users',
    label: 'Administer officer accounts',
    description: 'Provision users, assign roles, reset credentials, and manage access.',
    category: 'Administration',
  },
  {
    key: 'configure_settings',
    label: 'Governance Settings & Classifications',
    description: 'Configure matter types, classifications, and custom role permissions.',
    category: 'Administration',
  },
];

export interface AppRole {
  id: string;
  roleKey: string;
  label: string;
  description: string;
  isSystem: boolean;
  permissions: string[];
}

export const DEFAULT_SYSTEM_ROLES: Omit<AppRole, 'id'>[] = [
  {
    roleKey: 'BOARD_MEMBER',
    label: 'Board Member',
    description: 'Member of the Board of Directors with bank-wide oversight and direction authority.',
    isSystem: true,
    permissions: [
      'see_all',
      'request_clarification',
      'reply_clarification',
      'attach_document',
      'view_analytics',
      'view_audit_trail',
    ],
  },
  {
    roleKey: 'BOARD_SECRETARIAT',
    label: 'Board Secretariat',
    description: 'Board Governance Secretariat responsible for registering and overseeing all Board matters.',
    isSystem: true,
    permissions: [
      'see_all',
      'register_matter',
      'route_matter',
      'accept_ownership',
      'request_clarification',
      'reply_clarification',
      'attach_document',
      'confirm_completion',
      'close_matter',
      'view_analytics',
      'view_audit_trail',
      'administer_users',
      'configure_settings',
    ],
  },
  {
    roleKey: 'CEO',
    label: 'Chief Executive Officer',
    description: 'Executive leadership responsible for reviewing Board directions and routing to Chiefs.',
    isSystem: true,
    permissions: [
      'see_all',
      'route_matter',
      'accept_ownership',
      'request_clarification',
      'reply_clarification',
      'attach_document',
      'confirm_completion',
      'close_matter',
      'view_analytics',
    ],
  },
  {
    roleKey: 'CEO_SECRETARIAT',
    label: 'CEO Secretariat / Executive Office',
    description: 'Executive Office & Secretariat to the CEO managing Board matters, reviews, assignments, and coordination on behalf of executive leadership.',
    isSystem: true,
    permissions: [
      'see_all',
      'route_matter',
      'accept_ownership',
      'request_clarification',
      'reply_clarification',
      'attach_document',
      'submit_report',
      'confirm_completion',
      'view_analytics',
    ],
  },
  {
    roleKey: 'CHIEF',
    label: 'Chief Officer',
    description: 'Executive head of a Business Area overseeing directorates and assigning matters.',
    isSystem: true,
    permissions: [
      'route_matter',
      'accept_ownership',
      'request_clarification',
      'reply_clarification',
      'attach_document',
      'confirm_completion',
      'view_analytics',
    ],
  },
  {
    roleKey: 'DEPUTY_CHIEF',
    label: 'Deputy Chief',
    description: 'Deputy executive assisting in departmental coordination and operational oversight.',
    isSystem: true,
    permissions: [
      'route_matter',
      'accept_ownership',
      'request_clarification',
      'reply_clarification',
      'attach_document',
      'confirm_completion',
    ],
  },
  {
    roleKey: 'DIRECTOR',
    label: 'Director',
    description: 'Final operational execution level responsible for implementing directives and reporting.',
    isSystem: true,
    permissions: [
      'accept_ownership',
      'request_clarification',
      'reply_clarification',
      'attach_document',
      'submit_report',
    ],
  },
  {
    roleKey: 'ADMIN',
    label: 'Administrator',
    description: 'System Administrator with full access to configure settings and manage accounts.',
    isSystem: true,
    permissions: [
      'see_all',
      'register_matter',
      'route_matter',
      'accept_ownership',
      'request_clarification',
      'reply_clarification',
      'attach_document',
      'confirm_completion',
      'close_matter',
      'administer_users',
      'configure_settings',
    ],
  },
];
