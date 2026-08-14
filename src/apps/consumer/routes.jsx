import { Route, Routes } from 'react-router-dom';
import { lazy } from 'react';
import ConsumerLayout from './ConsumerLayout';
import ProtectedRoute from '@/components/ProtectedRoute';
import FeatureRoute from '@/components/FeatureRoute';
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
// Consumer surfaces for the refund, claim, dispute, support and legal backends.
const Refunds = lazy(() => import('@/pages/Refunds'));
const DamageClaims = lazy(() => import('@/pages/DamageClaims'));
const Disputes = lazy(() => import('@/pages/Disputes'));
const SupportTickets = lazy(() => import('@/pages/SupportTickets'));
const Legal = lazy(() => import('@/pages/Legal'));
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
        {/* Feature-flagged: these render mock data and have no backend yet, so
            they resolve to 404 unless explicitly enabled. See src/lib/features.js
            and the Account audit in docs/migration-status-report.md. */}
        <Route path="/wallet" element={<FeatureRoute flag="wallet"><ProtectedRoute><Wallet /></ProtectedRoute></FeatureRoute>} />
        <Route path="/payments" element={<FeatureRoute flag="paymentMethods"><ProtectedRoute><PaymentMethods /></ProtectedRoute></FeatureRoute>} />
        <Route path="/membership" element={<FeatureRoute flag="rewards"><ProtectedRoute><Membership /></ProtectedRoute></FeatureRoute>} />
        <Route path="/loyalty" element={<FeatureRoute flag="rewards"><ProtectedRoute><Loyalty /></ProtectedRoute></FeatureRoute>} />
        <Route path="/offers" element={<FeatureRoute flag="rewards"><ProtectedRoute><Offers /></ProtectedRoute></FeatureRoute>} />
        <Route path="/wishlist" element={<FeatureRoute flag="wishlist"><ProtectedRoute><Wishlist /></ProtectedRoute></FeatureRoute>} />
        <Route path="/reviews" element={<FeatureRoute flag="myReviews"><ProtectedRoute><Reviews /></ProtectedRoute></FeatureRoute>} />
        <Route path="/notification-settings" element={<ProtectedRoute><NotificationSettings /></ProtectedRoute>} />

        {/* Marketing / info */}
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/business" element={<ForBusiness />} />
        <Route path="/promos" element={<Promotions />} />
        <Route path="/help" element={<Help />} />
        <Route path="/legal" element={<Legal />} />
        <Route path="/refunds" element={<ProtectedRoute><Refunds /></ProtectedRoute>} />
        <Route path="/damage-claims" element={<ProtectedRoute><DamageClaims /></ProtectedRoute>} />
        <Route path="/disputes" element={<ProtectedRoute><Disputes /></ProtectedRoute>} />
        <Route path="/support" element={<ProtectedRoute><SupportTickets /></ProtectedRoute>} />
        <Route path="/architecture" element={<Architecture />} />

        <Route path="/404" element={<PageNotFound />} />
        <Route path="*" element={<PageNotFound />} />
      </Route>
    </Routes>
  );
}
