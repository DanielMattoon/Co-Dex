import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { ConsoleFrame } from './components/ConsoleFrame';
import { BottomNav } from './components/BottomNav';
import { MapScreen } from './components/MapScreen';
import { LinkCable } from './components/LinkCable';
import { VaultScreen } from './screens/VaultScreen';
import { TeamScreen } from './screens/TeamScreen';
import { PlaceholderScreen } from './screens/PlaceholderScreen';
import { BackupScreen } from './screens/BackupScreen';

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

function App() {
  return (
    <HashRouter>
      <ConsoleFrame header={<AppHeader />} nav={<BottomNav />}>
        <Routes>
          <Route path="/" element={<VaultScreen />} />
          <Route path="/map" element={<MapScreen />} />
          <Route path="/team" element={<TeamScreen />} />
          <Route
            path="/collection"
            element={<PlaceholderScreen title="Game Collection" note="Coming soon" />}
          />
          <Route path="/link" element={<LinkCable />} />
          <Route path="/backup" element={<BackupScreen />} />
        </Routes>
      </ConsoleFrame>
    </HashRouter>
  );
}

export default App;
