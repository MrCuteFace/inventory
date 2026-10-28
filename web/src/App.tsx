import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './Layout'
import { AddSignatureModal, EditModal, HandoverModal } from './modals/AssetModals'
import { AddCategoryModal, AddSubCategoryModal } from './modals/CatalogModals'
import { IntakeModal } from './modals/IntakeModal'
import { ScrapModal } from './modals/ScrapModal'
import { Category } from './pages/Category'
import { Disposals } from './pages/Disposals'
import { Employees } from './pages/Employees'
import { Home } from './pages/Home'
import { Invoices } from './pages/Invoices'
import { ChangePassword, Login } from './pages/Login'
import { Mail } from './pages/Mail'
import { Users } from './pages/Users'
import { AuthProvider, DataProvider, useAuth, useData } from './state'
import { Loading } from './ui/Bits'
import { IconSprite } from './ui/Icon'
import { ToastProvider } from './ui/Toast'

function ModalHost() {
  const { modal, close } = useData()
  if (!modal) return null
  // key: פתיחה של אותו סוג חלון לפריט אחר מתחילה מצב נקי
  switch (modal.kind) {
    case 'intake': return <IntakeModal key="intake" subId={modal.subId} onClose={close} />
    case 'scrap': return <ScrapModal key={`s${modal.assetId}`} assetId={modal.assetId} subId={modal.subId} onClose={close} />
    case 'edit': return <EditModal key={`e${modal.assetId}`} assetId={modal.assetId} onClose={close} />
    case 'addsig': return <AddSignatureModal key={`a${modal.assetId}`} assetId={modal.assetId} onClose={close} />
    case 'form': return <HandoverModal key={`f${modal.assetId}`} assetId={modal.assetId} onClose={close} />
    case 'addcat': return <AddCategoryModal onClose={close} />
    case 'addsub': return <AddSubCategoryModal key={`c${modal.categoryId}`} categoryId={modal.categoryId} onClose={close} />
  }
}

function Shell() {
  const { me, loading } = useAuth()
  if (loading) return <Loading />
  if (!me) return <Login />
  if (me.mustChangePassword) return <ChangePassword forced />
  return (
    <DataProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/c/:id" element={<Category />} />
          <Route path="/disposals" element={<Disposals />} />
          <Route path="/employees" element={<Employees />} />
          {me.isAdmin && <Route path="/users" element={<Users />} />}
          {me.isAdmin && <Route path="/invoices" element={<Invoices />} />}
          {me.isAdmin && <Route path="/mail" element={<Mail />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
      <ModalHost />
    </DataProvider>
  )
}

// The static demo is served from a sub-path with no server rewrites, so it routes on the hash.
const Router = import.meta.env.VITE_DEMO ? HashRouter : BrowserRouter

export default function App() {
  return (
    <Router>
      <IconSprite />
      <ToastProvider>
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </ToastProvider>
    </Router>
  )
}
