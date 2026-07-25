import { Routes, Route } from 'react-router-dom'
import { PublicLayout } from '@/components/PublicLayout'
import Landing from '@/pages/Landing'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import Verify from '@/pages/Verify'
import Contest from '@/pages/Contest'
import Board from '@/pages/Board'
import ContestantProfile from '@/pages/ContestantProfile'
import Join from '@/pages/Join'
import Me from '@/pages/Me'
import Opportunities from '@/pages/Opportunities'
import SubscribeSuccess from '@/pages/SubscribeSuccess'
import AdminLayout from '@/pages/admin/AdminLayout'
import AdminOverview from '@/pages/admin/Overview'
import AdminPartnerInquiries from '@/pages/admin/PartnerInquiries'
import AdminReports from '@/pages/admin/Reports'
import PaymentReviews from '@/pages/admin/PaymentReviews'
import AdminIncome from '@/pages/admin/Income'
import AdminUsers from '@/pages/admin/Users'

import AdminContests from '@/pages/admin/Contests'
import AdminAuditLog from '@/pages/admin/AuditLog'
import AdminEmailDomains from '@/pages/admin/EmailDomains'
import AdminPayouts from '@/pages/admin/Payouts'
import UserDetail from '@/pages/admin/UserDetail'
import ContestDetail from '@/pages/admin/ContestDetail'
import ContestantVoters from '@/pages/admin/ContestantVoters'

function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/opportunities" element={<Opportunities />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify" element={<Verify />} />
        <Route path="/contest/:joinCode" element={<Contest />} />

        <Route path="/contest/:joinCode/board" element={<Board />} />
        <Route path="/c/:contestantId" element={<ContestantProfile />} />
        <Route path="/join/:joinCode" element={<Join />} />
        <Route path="/me" element={<Me />} />
        <Route path="/subscribe/success" element={<SubscribeSuccess />} />
      </Route>
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminOverview />} />
        <Route path="partner-inquiries" element={<AdminPartnerInquiries />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="income" element={<AdminIncome />} />
        <Route path="payment-reviews" element={<PaymentReviews />} />
        <Route path="users" element={<AdminUsers />} />


        <Route path="users/:userId" element={<UserDetail />} />
        <Route path="contests" element={<AdminContests />} />
        <Route path="contests/:contestId" element={<ContestDetail />} />
        <Route path="contestants/:contestantId/voters" element={<ContestantVoters />} />
        <Route path="payouts" element={<AdminPayouts />} />
        <Route path="email-domains" element={<AdminEmailDomains />} />
        <Route path="audit-log" element={<AdminAuditLog />} />
      </Route>
    </Routes>
  )
}


export default App
