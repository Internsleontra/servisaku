import { Route, Routes } from 'react-router-dom';
import { lazy } from 'react';
import ConsumerLayout from './ConsumerLayout';
import ProtectedRoute from '@/components/ProtectedRoute';
import PageNotFound from '@/lib/PageNotFound';

const Home = lazy(() => import('@/pages/Home'));
const Explore = lazy(() => import('@/pages/Explore'));
const Catalog = lazy(() => import('@/pages/Catalog'));
const CatalogCategory = lazy(() => import('@/pages/CatalogCategory'));
const ServiceBooking = lazy(() => import('@/pages/ServiceBooking'));
const BookingHistory = lazy(() => import('@/pages/BookingHistory'));
const BookingDetail = lazy(() => import('@/pages/BookingDetail'));
const BookingInvoice = lazy(() => import('@/pages/BookingInvoice'));
const PaymentCheckout = lazy(() => import('@/pages/PaymentCheckout'));
const PaymentReturn = lazy(() => import('@/pages/PaymentReturn'));
const LiveTracking = lazy(() => import('@/pages/LiveTracking'));
const ChatScreen = lazy(() => import('@/pages/ChatScreen'));
const ReviewFlow = lazy(() => import('@/pages/ReviewFlow'));
const NotificationCenter = lazy(() => import('@/pages/NotificationCenter'));
const Profile = lazy(() => import('@/pages/Profile'));
const ConsumerProfile = lazy(() => import('@/pages/ConsumerProfile'));
const ProfileSetup = lazy(() => import('@/pages/ProfileSetup'));
const OTPLogin = lazy(() => import('@/pages/OTPLogin'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const Wallet = lazy(() => import('@/pages/Wallet'));
const PaymentMethods = lazy(() => import('@/pages/PaymentMethods'));
const Membership = lazy(() => import('@/pages/Membership'));
const Loyalty = lazy(() => import('@/pages/Loyalty'));
const Offers = lazy(() => import('@/pages/Offers'));
const Wishlist = lazy(() => import('@/pages/Wishlist'));
const Reviews = lazy(() => import('@/pages/Reviews'));
const NotificationSettings = lazy(() => import('@/pages/NotificationSettings'));
const HowItWorks = lazy(() => import('@/pages/HowItWorks'));
const ForBusiness = lazy(() => import('@/pages/ForBusiness'));
const Promotions = lazy(() => import('@/pages/Promotions'));
const Help = lazy(() => import('@/pages/Help'));
const Architecture = lazy(() => import('@/pages/Architecture'));

export default function ConsumerRoutes() {
  return (
    <Routes>
      <Route element={<ConsumerLayout />}>
        {/* Browse & book */}
        <Route path="/" element={<Home />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/catalog/:slug" element={<CatalogCategory />} />
        <Route path="/book-service/:slug" element={<ServiceBooking />} />

        {/* Bookings & payment */}
        <Route path="/bookings" element={<ProtectedRoute><BookingHistory /></ProtectedRoute>} />
        <Route path="/booking/:bookingId" element={<ProtectedRoute><BookingDetail /></ProtectedRoute>} />
        <Route path="/booking/:bookingId/invoice" element={<BookingInvoice />} />
        <Route path="/payment" element={<PaymentCheckout />} />
        <Route path="/payment/return" element={<ProtectedRoute><PaymentReturn /></ProtectedRoute>} />
        <Route path="/tracking/:bookingId" element={<ProtectedRoute><LiveTracking /></ProtectedRoute>} />
        <Route path="/chat/:bookingId" element={<ProtectedRoute><ChatScreen /></ProtectedRoute>} />
        <Route path="/review/:bookingId" element={<ProtectedRoute><ReviewFlow /></ProtectedRoute>} />

        {/* Account */}
        <Route path="/notifications" element={<ProtectedRoute><NotificationCenter /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/profile/edit" element={<ProtectedRoute><ConsumerProfile /></ProtectedRoute>} />
        <Route path="/profile/setup" element={<ProtectedRoute><ProfileSetup /></ProtectedRoute>} />
        <Route path="/otp-login" element={<OTPLogin />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/wallet" element={<ProtectedRoute><Wallet /></ProtectedRoute>} />
        <Route path="/payments" element={<ProtectedRoute><PaymentMethods /></ProtectedRoute>} />
        <Route path="/membership" element={<ProtectedRoute><Membership /></ProtectedRoute>} />
        <Route path="/loyalty" element={<ProtectedRoute><Loyalty /></ProtectedRoute>} />
        <Route path="/offers" element={<ProtectedRoute><Offers /></ProtectedRoute>} />
        <Route path="/wishlist" element={<ProtectedRoute><Wishlist /></ProtectedRoute>} />
        <Route path="/reviews" element={<ProtectedRoute><Reviews /></ProtectedRoute>} />
        <Route path="/notification-settings" element={<ProtectedRoute><NotificationSettings /></ProtectedRoute>} />

        {/* Marketing / info */}
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/business" element={<ForBusiness />} />
        <Route path="/promos" element={<Promotions />} />
        <Route path="/help" element={<Help />} />
        <Route path="/architecture" element={<Architecture />} />

        <Route path="*" element={<PageNotFound />} />
      </Route>
    </Routes>
  );
}
