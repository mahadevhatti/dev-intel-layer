import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { GraphViewer } from './components/GraphViewer';
import { RuleManager } from './components/RuleManager';
import { ManifestStatus } from './components/ManifestStatus';
import { ContextInspector } from './components/ContextInspector';
import { BranchSelector } from './components/BranchSelector';
import { ConflictResolver } from './components/ConflictResolver';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="repos/:repoId">
          <Route index element={<Navigate to="graph" replace />} />
          <Route path="graph" element={<GraphViewer />} />
          <Route path="rules" element={<RuleManager />} />
          <Route path="manifest" element={<ManifestStatus />} />
          <Route path="context" element={<ContextInspector />} />
          <Route path="branches" element={<BranchSelector />} />
          <Route path="conflicts" element={<ConflictResolver />} />
        </Route>
      </Route>
    </Routes>
  );
}
