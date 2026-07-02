import { Navigate, Route, Routes } from 'react-router-dom';
import { lazy } from 'react';
import PartnerLayout from './PartnerLayout';
import ProtectedRoute from '@/components/ProtectedRoute';
import PageNotFound from '@/lib/PageNotFound';

const PartnerDashboard = lazy(() => import('@/pages/PartnerDashboard'));
const PartnerCalendar = lazy(() => import('@/pages/PartnerCalendar'));
const PartnerEarnings = lazy(() => import('@/pages/PartnerEarnings'));
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

const LiveTracking = lazy(() => import('@/pages/LiveTracking'));
const ChatScreen = lazy(() => import('@/pages/ChatScreen'));
const NotificationCenter = lazy(() => import('@/pages/NotificationCenter'));
const Profile = lazy(() => import('@/pages/Profile'));
const ConsumerProfile = lazy(() => import('@/pages/ConsumerProfile'));
const ProfileSetup = lazy(() => import('@/pages/ProfileSetup'));
const OTPLogin = lazy(() => import('@/pages/OTPLogin'));

const AdminDashboard = lazy(() => import('@/pages/AdminDashboard'));
const AdminUsers = lazy(() => import('@/pages/AdminUsers'));
const AdminBookings = lazy(() => import('@/pages/AdminBookings'));
const AdminFinance = lazy(() => import('@/pages/AdminFinance'));
const AdminCommunications = lazy(() => import('@/pages/AdminCommunications'));
const AdminQualityCenter = lazy(() => import('@/pages/AdminQualityCenter'));
const AdminAnalytics = lazy(() => import('@/pages/AdminAnalytics'));
const AdminOperations = lazy(() => import('@/pages/AdminOperations'));

const adminRoles = ['admin', 'super_admin'];

export default function PartnerRoutes() {
  return (
    <Routes>
      <Route element={<PartnerLayout />}>
        {/* Partner home */}
        <Route path="/" element={<Navigate to="/partner" replace />} />
        <Route path="/partner" element={<ProtectedRoute><PartnerDashboard /></ProtectedRoute>} />
        <Route path="/partner/calendar" element={<ProtectedRoute><PartnerCalendar /></ProtectedRoute>} />
        <Route path="/partner/earnings" element={<ProtectedRoute><PartnerEarnings /></ProtectedRoute>} />
        <Route path="/partner/job/:bookingId" element={<ProtectedRoute><PartnerJobScreen /></ProtectedRoute>} />
        <Route path="/partner/onboarding" element={<ProtectedRoute><PartnerOnboarding /></ProtectedRoute>} />
        <Route path="/partner/availability" element={<ProtectedRoute><PartnerAvailability /></ProtectedRoute>} />
        <Route path="/partner/verification" element={<ProtectedRoute><PartnerVerification /></ProtectedRoute>} />
        <Route path="/partner/analytics" element={<ProtectedRoute><PartnerAnalytics /></ProtectedRoute>} />
        <Route path="/partner/training" element={<ProtectedRoute><PartnerTraining /></ProtectedRoute>} />
        <Route path="/partner/training/:courseId" element={<ProtectedRoute><PartnerTrainingCourse /></ProtectedRoute>} />
        <Route path="/partner/reviews" element={<ProtectedRoute><PartnerReviews /></ProtectedRoute>} />
        <Route path="/partner/support" element={<ProtectedRoute><PartnerSupport /></ProtectedRoute>} />
        <Route path="/partner/inventory" element={<ProtectedRoute><PartnerInventory /></ProtectedRoute>} />

        {/* Shared job surfaces */}
        <Route path="/tracking/:bookingId" element={<ProtectedRoute><LiveTracking /></ProtectedRoute>} />
        <Route path="/chat/:bookingId" element={<ProtectedRoute><ChatScreen /></ProtectedRoute>} />

        {/* Account */}
        <Route path="/notifications" element={<ProtectedRoute><NotificationCenter /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/profile/edit" element={<ProtectedRoute><ConsumerProfile /></ProtectedRoute>} />
        <Route path="/profile/setup" element={<ProtectedRoute><ProfileSetup /></ProtectedRoute>} />
        <Route path="/otp-login" element={<OTPLogin />} />

        {/* Admin / ops console (role-gated) */}
        <Route path="/admin" element={<ProtectedRoute roles={adminRoles}><AdminDashboard /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute roles={adminRoles}><AdminUsers /></ProtectedRoute>} />
        <Route path="/admin/bookings" element={<ProtectedRoute roles={adminRoles}><AdminBookings /></ProtectedRoute>} />
        <Route path="/admin/finance" element={<ProtectedRoute roles={adminRoles}><AdminFinance /></ProtectedRoute>} />
        <Route path="/admin/communications" element={<ProtectedRoute roles={adminRoles}><AdminCommunications /></ProtectedRoute>} />
        <Route path="/admin/quality" element={<ProtectedRoute roles={adminRoles}><AdminQualityCenter /></ProtectedRoute>} />
        <Route path="/admin/analytics" element={<ProtectedRoute roles={adminRoles}><AdminAnalytics /></ProtectedRoute>} />
        <Route path="/admin/operations" element={<ProtectedRoute roles={adminRoles}><AdminOperations /></ProtectedRoute>} />

        <Route path="*" element={<PageNotFound />} />
      </Route>
    </Routes>
  );
}
