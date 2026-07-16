import { HashRouter, Route, Routes } from 'react-router-dom';
import { ConsoleFrame } from './components/ConsoleFrame';
import { BottomNav } from './components/BottomNav';
import { VaultScreen } from './screens/VaultScreen';
import { PlaceholderScreen } from './screens/PlaceholderScreen';

function App() {
  return (
    <HashRouter>
      <ConsoleFrame
        header={<h1 className="font-retro text-sm text-cyan-300">Co-Dex</h1>}
        nav={<BottomNav />}
      >
        <Routes>
          <Route path="/" element={<VaultScreen />} />
          <Route
            path="/map"
            element={<PlaceholderScreen title="Map Guide" note="Coming soon" />}
          />
          <Route
            path="/team"
            element={<PlaceholderScreen title="Team Builder" note="Coming soon" />}
          />
          <Route
            path="/collection"
            element={<PlaceholderScreen title="Game Collection" note="Coming soon" />}
          />
        </Routes>
      </ConsoleFrame>
    </HashRouter>
  );
}

export default App;
