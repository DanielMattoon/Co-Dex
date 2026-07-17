import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { ConsoleFrame } from './components/ConsoleFrame';
import { BottomNav } from './components/BottomNav';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MapScreen } from './components/MapScreen';
import { LinkCable } from './components/LinkCable';
import { CollectionShelf } from './components/CollectionShelf';
import { VaultScreen } from './screens/VaultScreen';
import { TeamScreen } from './screens/TeamScreen';
import { BackupScreen } from './screens/BackupScreen';
import { ProfileScreen } from './screens/ProfileScreen';

function AppHeader() {
  return (
    <div className="flex items-center justify-between">
      <h1 className="font-retro text-sm text-cyan-300">Co-Dex</h1>
      <NavLink
        to="/backup"
        className="text-base text-slate-400 hover:text-slate-200"
        aria-label="Backup & settings"
      >
        ⚙
      </NavLink>
    </div>
  );
}

function RoutedContent() {
  // Keyed by path so navigating away from a crashed screen and back gives
  // it a fresh mount instead of staying stuck on the error fallback.
  const location = useLocation();
  return (
    <ErrorBoundary key={location.pathname}>
      <Routes>
        <Route path="/" element={<VaultScreen />} />
        <Route path="/map" element={<MapScreen />} />
        <Route path="/team" element={<TeamScreen />} />
        <Route path="/collection" element={<CollectionShelf />} />
        <Route path="/link" element={<LinkCable />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/backup" element={<BackupScreen />} />
      </Routes>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <HashRouter>
      <ConsoleFrame header={<AppHeader />} nav={<BottomNav />}>
        <RoutedContent />
      </ConsoleFrame>
    </HashRouter>
  );
}

export default App;
