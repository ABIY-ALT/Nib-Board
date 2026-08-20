'use client';

import React, { Suspense, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth, useAuthenticatedUser } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopHeader } from '@/components/layout/TopHeader';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { MattersView, EscalatedView } from '@/components/governance/MattersView';
import { OverviewView, SlaView } from '@/components/monitoring/MonitoringViews';
import { UsersView, SettingsView, AuditTrailView } from '@/components/admin/AdminViews';
import { MatterDetail } from '@/components/MatterDetail';
import { ReportsView } from '@/components/ReportsView';
import { LoginPage } from '@/components/LoginPage';
import { ChangePasswordPage } from '@/components/ChangePasswordPage';
import { RegisterMatterModal } from '@/components/RegisterMatterModal';
import { RouteMatterModal } from '@/components/RouteMatterModal';
import { DirectorReportModal } from '@/components/DirectorReportModal';
import { ConfirmCompletionModal } from '@/components/ConfirmCompletionModal';
import { CloseMatterModal } from '@/components/CloseMatterModal';
import { ClarificationModal } from '@/components/ClarificationModal';
import { UploadDocumentModal } from '@/components/UploadDocumentModal';
import { BODMatter, ClarificationThread } from '@/lib/types';
import { ViewId, canSeeView } from '@/lib/navigation';
import { navCounts } from '@/lib/matters';

const Workspace: React.FC = () => {
  const { matters, isLoading, isAuthenticated, mustChangePassword } = useAuth();

  const [view, setView] = useState<ViewId>('dashboard');
  const [selected, setSelected] = useState<BODMatter | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

  const [registerOpen, setRegisterOpen] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [clarifyOpen, setClarifyOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [replyThread, setReplyThread] = useState<ClarificationThread | null>(null);

  // Hooks must run on every render, so the auth gates come after them.
  if (!isAuthenticated) return <Suspense><LoginPage /></Suspense>;
  if (mustChangePassword) return <ChangePasswordPage />;

  return (
    <SignedIn
      matters={matters}
      isLoading={isLoading}
      view={view}
      setView={setView}
      selected={selected}
      setSelected={setSelected}
      collapsed={collapsed}
      setCollapsed={setCollapsed}
      mobileNav={mobileNav}
      setMobileNav={setMobileNav}
      modals={{
        registerOpen, setRegisterOpen,
        routeOpen, setRouteOpen,
        reportOpen, setReportOpen,
        confirmOpen, setConfirmOpen,
        closeOpen, setCloseOpen,
        clarifyOpen, setClarifyOpen,
        uploadOpen, setUploadOpen,
        replyThread, setReplyThread,
      }}
    />
  );
};

interface SignedInProps {
  matters: BODMatter[];
  isLoading: boolean;
  view: ViewId;
  setView: (v: ViewId) => void;
  selected: BODMatter | null;
  setSelected: (m: BODMatter | null) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  mobileNav: boolean;
  setMobileNav: (v: boolean) => void;
  modals: any;
}

/**
 * The signed-in application frame.
 *
 * Split out so the workspace's hooks all run before authentication is decided —
 * returning the login page from inside a component that had already declared
 * hooks would change hook order between renders.
 */
const SignedIn: React.FC<SignedInProps> = ({
  matters, isLoading, view, setView, selected, setSelected,
  collapsed, setCollapsed, mobileNav, setMobileNav, modals,
}) => {
  const user = useAuthenticatedUser();
  const counts = useMemo(() => navCounts(matters, user), [matters, user]);

  // Keep the selected matter in step with refreshed data after every action.
  const active = selected ? matters.find((m) => m.id === selected.id) ?? selected : null;

  const openMatter = (m: BODMatter) => {
    setSelected(m);
    setView('matter-detail');
  };

  const navigate = (v: ViewId) => {
    // Mirrors the API: a view the role cannot use falls back to the dashboard.
    setView(canSeeView(user.role, v) ? v : 'dashboard');
    if (v !== 'matter-detail') setSelected(null);
  };

  const body = () => {
    switch (view) {
      case 'dashboard':
        return <Dashboard onSelectMatter={openMatter} onNavigate={navigate} />;
      case 'decisions':
      case 'directives':
      case 'resolutions':
      case 'incoming':
      case 'my-tasks':
      case 'pending-actions':
      case 'overdue':
      case 'implementation':
        return (
          <MattersView
            view={view}
            onSelectMatter={openMatter}
            onRegister={() => modals.setRegisterOpen(true)}
          />
        );
      case 'escalated':
        return <EscalatedView onNavigateOverdue={() => navigate('overdue')} />;
      case 'overview':
        return <OverviewView />;
      case 'sla':
        return <SlaView onSelectMatter={openMatter} />;
      case 'audit':
        return <AuditTrailView onSelectMatter={openMatter} />;
      case 'reports':
        return <ReportsView onSelectMatter={openMatter} />;
      case 'users':
        return <UsersView />;
      case 'settings':
        return <SettingsView />;
      case 'matter-detail':
        return active ? (
          <MatterDetail
            matter={active}
            onBack={() => navigate('decisions')}
            onOpenRouteModal={() => modals.setRouteOpen(true)}
            onOpenDirectorReportModal={() => modals.setReportOpen(true)}
            onOpenClarificationModal={() => {
              modals.setReplyThread(null);
              modals.setClarifyOpen(true);
            }}
            onOpenConfirmModal={() => modals.setConfirmOpen(true)}
            onOpenCloseModal={() => modals.setCloseOpen(true)}
            onOpenUploadModal={() => modals.setUploadOpen(true)}
            onOpenClarificationReplyModal={(t: ClarificationThread) => {
              modals.setReplyThread(t);
              modals.setClarifyOpen(true);
            }}
          />
        ) : null;
      default:
        return <Dashboard onSelectMatter={openMatter} onNavigate={navigate} />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-app">
      <Sidebar
        role={user.role}
        active={view}
        onNavigate={navigate}
        counts={counts}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed(!collapsed)}
        mobileOpen={mobileNav}
        onCloseMobile={() => setMobileNav(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopHeader
          view={view}
          onOpenMobileNav={() => setMobileNav(true)}
          onSelectMatter={openMatter}
          onNavigate={navigate}
        />

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[100rem] mx-auto p-4 sm:p-6">
            {isLoading && matters.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-20 text-ink-3">
                <Loader2 className="w-4 h-4 animate-spin text-nib-gold-600" />
                <span className="text-[13px]">Loading Board governance records…</span>
              </div>
            ) : (
              body()
            )}
          </div>
        </main>
      </div>

      {/* Workflow modals — unchanged business logic */}
      <RegisterMatterModal
        isOpen={modals.registerOpen}
        onClose={() => modals.setRegisterOpen(false)}
        onSuccess={() => navigate('decisions')}
      />

      {active && (
        <>
          <RouteMatterModal
            isOpen={modals.routeOpen}
            onClose={() => modals.setRouteOpen(false)}
            matter={active}
            onSuccess={() => {}}
          />
          <DirectorReportModal
            isOpen={modals.reportOpen}
            onClose={() => modals.setReportOpen(false)}
            matter={active}
            onSuccess={() => {}}
          />
          <ConfirmCompletionModal
            isOpen={modals.confirmOpen}
            onClose={() => modals.setConfirmOpen(false)}
            matter={active}
            onSuccess={() => {}}
          />
          <CloseMatterModal
            isOpen={modals.closeOpen}
            onClose={() => modals.setCloseOpen(false)}
            matter={active}
            onSuccess={() => {}}
          />
          <ClarificationModal
            isOpen={modals.clarifyOpen}
            onClose={() => {
              modals.setClarifyOpen(false);
              modals.setReplyThread(null);
            }}
            matter={active}
            replyThread={modals.replyThread}
            onSuccess={() => {}}
          />
          <UploadDocumentModal
            isOpen={modals.uploadOpen}
            onClose={() => modals.setUploadOpen(false)}
            matter={active}
            onSuccess={() => {}}
          />
        </>
      )}
    </div>
  );
};

export const AppShell: React.FC = () => (
  <ThemeProvider>
    <AuthProvider>
      <Workspace />
    </AuthProvider>
  </ThemeProvider>
);
