import React from 'react';
import {
  BrowserRouter as Router,
  NavLink,
  Route,
  Routes,
  Link,
  useLocation,
} from 'react-router-dom';
import { ConnectButton } from './components/ConnectButton';
import { EncryptionKeyPrompt } from './components/EncryptionKeyPrompt';
import { LandingPage } from './pages/LandingPage';
import { DocumentationPage } from './pages/DocumentationPage';
import { UseCasesPage } from './pages/UseCases';
import { MintPage } from './pages/Mint';
import { GatedPage } from './pages/Gated';
import { HistoryPage } from './pages/History';
import { MyTokensPage } from './pages/MyTokens';
import { TechnicalDocumentationPage } from './pages/TechnicalDocumentationPage';

const WIDE_ROUTES = ['/docs', '/use-cases', '/tech-docs'];

const navClass = ({ isActive }: { isActive: boolean }) =>
  `nav-link${isActive ? ' is-active' : ''}`;

function AppShell() {
  const location = useLocation();
  const isWide = WIDE_ROUTES.includes(location.pathname);

  return (
    <div className="app">
      <header className="app-header">
        <Link to="/" className="brand">
          NEAR DRM — NFTs That Do Something
        </Link>
        <nav className="header-nav">
          <NavLink to="/" end className={navClass}>
            Home
          </NavLink>
          <NavLink to="/docs" className={navClass}>
            Docs
          </NavLink>
          <NavLink to="/use-cases" className={navClass}>
            Use Cases
          </NavLink>
          <NavLink to="/tech-docs" className={navClass}>
            Technical Docs
          </NavLink>
          <NavLink to="/mint" className={navClass}>
            Mint
          </NavLink>
          <NavLink to="/my-tokens" className={navClass}>
            My Tokens
          </NavLink>
        </nav>
        <ConnectButton onConnected={() => {}} />
      </header>

      <main className={`app-main${isWide ? ' app-main-wide' : ''}`}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/use-cases" element={<UseCasesPage />} />
          <Route path="/docs" element={<DocumentationPage />} />
          <Route path="/mint" element={<MintPage />} />
          <Route path="/my-tokens" element={<MyTokensPage />} />
          <Route path="/gated/:tokenId" element={<GatedPage />} />
          <Route path="/history/:tokenId" element={<HistoryPage />} />
          <Route path="/tech-docs" element={<TechnicalDocumentationPage />} />
        </Routes>
      </main>

      <EncryptionKeyPrompt />

      <footer className="app-footer">
        <p>
          Built for NEAR HACKATHON 2026 &bull; Track: NFTs That Do Something
          (id: nfts)
        </p>
        <p>
          Powered by NEP-171 NFTs, NEP-177 Metadata, NEP-178 Approvals, and
          NEP-171 Events
        </p>
      </footer>
    </div>
  );
}

export function App() {
  return (
    <Router>
      <AppShell />
    </Router>
  );
}
