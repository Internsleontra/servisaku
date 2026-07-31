import { Navigate, Route, Routes } from 'react-router-dom';
import { lazy } from 'react';
import PartnerLayout from './PartnerLayout';
import ProtectedRoute from '@/components/ProtectedRoute';
import PartnerOnly from './PartnerOnly';
import PageNotFound from '@/lib/PageNotFound';

const PartnerDashboard = lazy(() => import('@/pages/PartnerDashboard'));
const PartnerCalendar = lazy(() => import('@/pages/PartnerCalendar'));
const PartnerEarnings = lazy(() => import('@/pages/PartnerEarnings'));
const PartnerWallet = lazy(() => import('@/pages/PartnerWallet'));
const PartnerJobScreen = lazy(() => import('@/pages/PartnerJobScreen'));
const PartnerOnboarding = lazy(() => import('@/pages/PartnerOnboarding'));
const PartnerAvailability = lazy(() => import('@/pages/PartnerAvailability'));
const PartnerVerification = lazy(() => import('@/pages/PartnerVerification'));
const PartnerAnalytics = lazy(() => import('@/pages/PartnerAnalytics'));
const PartnerTraining = lazy(() => import('@/pages/PartnerTraining'));
const PartnerTrainingCourse = lazy(() => import('@/pages/PartnerTrainingCourse'));
const PartnerReviews = lazy(() => import('@/pages/PartnerReviews'));
const PartnerSupport = lazy(() => import('@/pages/PartnerSupport'));
const PartnerInventory = lazy(() => import('@/pages/PartnerInventory'));
const PartnerSettings = lazy(() => import('@/pages/PartnerSettings'));

const LiveTracking = lazy(() => import('@/pages/LiveTracking'));
const ChatScreen = lazy(() => import('@/pages/ChatScreen'));
const NotificationCenter = lazy(() => import('@/pages/NotificationCenter'));
const Profile = lazy(() => import('@/pages/Profile'));
const ConsumerProfile = lazy(() => import('@/pages/ConsumerProfile'));
const ProfileSetup = lazy(() => import('@/pages/ProfileSetup'));
const OTPLogin = lazy(() => import('@/pages/OTPLogin'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));

export default function PartnerRoutes() {
  return (
    <Routes>
      <Route element={<PartnerLayout />}>
        {/* Partner home */}
        <Route path="/" element={<Navigate to="/partner" replace />} />
        <Route path="/partner" element={<ProtectedRoute><PartnerOnly><PartnerDashboard /></PartnerOnly></ProtectedRoute>} />
        <Route path="/partner/calendar" element={<ProtectedRoute><PartnerOnly><PartnerCalendar /></PartnerOnly></ProtectedRoute>} />
        <Route path="/partner/earnings" element={<ProtectedRoute><PartnerOnly><PartnerEarnings /></PartnerOnly></ProtectedRoute>} />
        <Route path="/partner/wallet" element={<ProtectedRoute><PartnerOnly><PartnerWallet /></PartnerOnly></ProtectedRoute>} />
        <Route path="/partner/job/:bookingId" element={<ProtectedRoute><PartnerOnly><PartnerJobScreen /></PartnerOnly></ProtectedRoute>} />
        <Route path="/partner/onboarding" element={<ProtectedRoute><PartnerOnboarding /></ProtectedRoute>} />
        <Route path="/partner/availability" element={<ProtectedRoute><PartnerOnly><PartnerAvailability /></PartnerOnly></ProtectedRoute>} />
        <Route path="/partner/verification" element={<ProtectedRoute><PartnerOnly><PartnerVerification /></PartnerOnly></ProtectedRoute>} />
        <Route path="/partner/analytics" element={<ProtectedRoute><PartnerOnly><PartnerAnalytics /></PartnerOnly></ProtectedRoute>} />
        <Route path="/partner/training" element={<ProtectedRoute><PartnerOnly><PartnerTraining /></PartnerOnly></ProtectedRoute>} />
        <Route path="/partner/training/:courseId" element={<ProtectedRoute><PartnerOnly><PartnerTrainingCourse /></PartnerOnly></ProtectedRoute>} />
        <Route path="/partner/reviews" element={<ProtectedRoute><PartnerOnly><PartnerReviews /></PartnerOnly></ProtectedRoute>} />
        <Route path="/partner/support" element={<ProtectedRoute><PartnerOnly><PartnerSupport /></PartnerOnly></ProtectedRoute>} />
        <Route path="/partner/inventory" element={<ProtectedRoute><PartnerOnly><PartnerInventory /></PartnerOnly></ProtectedRoute>} />
        <Route path="/partner/settings" element={<ProtectedRoute><PartnerOnly><PartnerSettings /></PartnerOnly></ProtectedRoute>} />

        {/* Shared job surfaces */}
        <Route path="/tracking/:bookingId" element={<ProtectedRoute><LiveTracking /></ProtectedRoute>} />
        <Route path="/chat/:bookingId" element={<ProtectedRoute><ChatScreen /></ProtectedRoute>} />

        {/* Account */}
        <Route path="/notifications" element={<ProtectedRoute><NotificationCenter /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/profile/edit" element={<ProtectedRoute><ConsumerProfile /></ProtectedRoute>} />
        <Route path="/profile/setup" element={<ProtectedRoute><ProfileSetup /></ProtectedRoute>} />
        <Route path="/otp-login" element={<OTPLogin />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route path="*" element={<PageNotFound />} />
      </Route>
    </Routes>
  );
}
