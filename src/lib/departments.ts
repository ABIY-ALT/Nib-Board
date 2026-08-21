export interface DepartmentItem {
  id: string;
  name: string;
  code?: string | null;
  businessArea: string;
  directorId?: string | null;
  director?: {
    id: string;
    name: string;
    email: string;
    title: string;
  } | null;
  isActive: boolean;
  officersCount?: number;
  activeMattersCount?: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export const INITIAL_DEPARTMENTS: Array<{
  id: string;
  name: string;
  code: string;
  businessArea: string;
  directorUserEmail?: string;
}> = [
  {
    id: 'dept_branch_ops',
    name: 'Branch Operations Directorate',
    code: 'BOD',
    businessArea: 'Banking Operations',
    directorUserEmail: 'solomon.mengistu@nibbank.com.et',
  },
  {
    id: 'dept_credit_appr',
    name: 'Credit Appraisal Directorate',
    code: 'CAD',
    businessArea: 'Retail Banking',
    directorUserEmail: 'tigist.abebe@nibbank.com.et',
  },
  {
    id: 'dept_compliance',
    name: 'Compliance Directorate',
    code: 'COMP',
    businessArea: 'Risk & Compliance',
    directorUserEmail: 'daniel.kebede@nibbank.com.et',
  },
  {
    id: 'dept_it_sec',
    name: 'IT Security Directorate',
    code: 'ITSD',
    businessArea: 'Information Technology',
    directorUserEmail: 'meron.tesfaye@nibbank.com.et',
  },
  {
    id: 'dept_qa_cust',
    name: 'Quality Assurance Directorate',
    code: 'QAD',
    businessArea: 'Banking Operations',
    directorUserEmail: 'berhanu.kassaye@nibbank.com.et',
  },
  {
    id: 'dept_digital_bank',
    name: 'Digital Banking & Payments Directorate',
    code: 'DBPD',
    businessArea: 'Information Technology',
  },
  {
    id: 'dept_hr_admin',
    name: 'Human Capital Development Directorate',
    code: 'HCDD',
    businessArea: 'Human Capital & Administration',
  },
  {
    id: 'dept_finance_plan',
    name: 'Finance & Accounts Directorate',
    code: 'FAD',
    businessArea: 'Finance & Accounts',
  },
  {
    id: 'dept_strategic_plan',
    name: 'Strategic Planning Directorate',
    code: 'SPD',
    businessArea: 'Strategic Planning & Business Development',
  },
];
