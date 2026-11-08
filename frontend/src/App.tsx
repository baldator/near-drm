import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { ConnectButton } from './components/ConnectButton';
import { LandingPage } from './pages/LandingPage';
import { DocumentationPage } from './pages/DocumentationPage';
import { MintPage } from './pages/Mint';
import { GatedPage } from './pages/Gated';
import { HistoryPage } from './pages/History';
import { TechnicalDocumentationPage } from './pages/TechnicalDocumentationPage';

export function App() {
  return (
    <Router>
      <div className="app">
        <header className="app-header">
          <Link to="/" className="brand">
            NEAR DRM — NFTs That Do Something
          </Link>
          <nav className="header-nav">
            <Link to="/" className="nav-link">Home</Link>
            <Link to="/docs" className="nav-link">Docs</Link>
            <Link to="/tech-docs" className="nav-link">Technical Docs</Link>
            <Link to="/mint" className="nav-link">Mint</Link>
          </nav>
          <ConnectButton onConnected={() => {}} />
        </header>

        <main className="app-main">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/docs" element={<DocumentationPage />} />
            <Route path="/mint" element={<MintPage />} />
            <Route path="/gated/:tokenId" element={<GatedPage />} />
            <Route path="/history/:tokenId" element={<HistoryPage />} />
            <Route path="/tech-docs" element={<TechnicalDocumentationPage />} />
          </Routes>
        </main>

        <footer className="app-footer">
          <p>
            Built for NEAR HACKATHON 2026 &bull; Track: NFTs That Do Something (id: nfts)
          </p>
          <p>
            Powered by NEP-171 NFTs, NEP-177 Metadata, NEP-178 Approvals, and NEP-171 Events
          </p>
        </footer>
      </div>
    </Router>
  );
}