import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './features/auth/AuthContext';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { DocumentDetailPage } from './pages/DocumentDetailPage';
import './styles.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Không tìm thấy phần tử root để khởi tạo ứng dụng.');
}

createRoot(root).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <ProtectedRoute fallback={<LoginPage />}>
          <Routes>
            <Route path="/" element={<App />} />
            <Route path="/documents/:documentId" element={<DocumentDetailPage />} />
          </Routes>
        </ProtectedRoute>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
