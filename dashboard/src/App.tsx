import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import Layout from './components/layout/Layout';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CampaignsPage from './pages/CampaignsPage';
import CampaignDetailPage from './pages/CampaignDetailPage';
import ActorsPage from './pages/ActorsPage';
import ActorDetailPage from './pages/ActorDetailPage';
import DataExplorerPage from './pages/DataExplorerPage';
import RunsPage from './pages/RunsPage';
import RunDetailPage from './pages/RunDetailPage';
import MonitoringPage from './pages/MonitoringPage';
import IntegrationsPage from './pages/IntegrationsPage';
import ApiDocsPage from './pages/ApiDocsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import TemplatesLibraryPage from './pages/TemplatesLibraryPage';
import WebhookHistoryPage from './pages/WebhookHistoryPage';
import TeamPage from './pages/TeamPage';
import HelpPage from './pages/HelpPage';
import BillingPage from './pages/BillingPage';
import SettingsPage from './pages/SettingsPage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />

      <Route path="/" element={
        <PrivateRoute>
          <Layout />
        </PrivateRoute>
      }>
        <Route path="dashboard"          element={<DashboardPage />} />
        <Route path="campaigns"          element={<CampaignsPage />} />
        <Route path="campaigns/:id"      element={<CampaignDetailPage />} />
        <Route path="actors"             element={<ActorsPage />} />
        <Route path="actors/:id"         element={<ActorDetailPage />} />
        <Route path="runs"               element={<RunsPage />} />
        <Route path="runs/:id"           element={<RunDetailPage />} />
        <Route path="data-explorer"      element={<DataExplorerPage />} />
        <Route path="monitoring"         element={<MonitoringPage />} />
        <Route path="integrations"       element={<IntegrationsPage />} />
        <Route path="api-docs"           element={<ApiDocsPage />} />
        <Route path="analytics"          element={<AnalyticsPage />} />
        <Route path="templates"          element={<TemplatesLibraryPage />} />
        <Route path="webhook-history"    element={<WebhookHistoryPage />} />
        <Route path="team"               element={<TeamPage />} />
        <Route path="help"               element={<HelpPage />} />
        <Route path="billing"            element={<BillingPage />} />
        <Route path="settings"           element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
