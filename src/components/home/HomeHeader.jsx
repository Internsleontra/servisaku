import React from 'react';
import { ShoppingCart, MapPin, ChevronDown, Hexagon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function HomeHeader({ user, loading }) {
  return (
    <header className="w-full bg-surface border-b border-hairline py-4 px-6 md:px-12 flex items-center justify-between sticky top-0 z-50">
      
      {/* Left: Logo */}
      <Link to="/" className="flex items-center gap-2">
        <div className="text-brand">
          <Hexagon className="size-8 fill-brand text-brand" />
        </div>
        <span className="text-2xl font-bold tracking-tight text-ink">ServisAku</span>
      </Link>

      {/* Center: Navigation Links (hidden on mobile) */}
      <nav className="hidden md:flex items-center gap-8">
        <button className="flex items-center gap-1 font-semibold text-ink hover:text-brand transition-colors text-sm">
          Categories <ChevronDown className="size-4" />
        </button>
        <Link to="#" className="font-semibold text-ink hover:text-brand transition-colors text-sm">
          How It Works
        </Link>
        <Link to="/partner/onboarding" className="font-semibold text-ink hover:text-brand transition-colors text-sm">
          Become a Pro
        </Link>
        <Link to="#" className="font-semibold text-ink hover:text-brand transition-colors text-sm">
          Deals
        </Link>
      </nav>

      {/* Right: Actions */}
      <div className="flex items-center gap-6">
        <div className="hidden md:flex items-center gap-1.5 text-ink-secondary text-sm font-semibold hover:text-ink cursor-pointer">
          <MapPin className="size-4" />
          Kuala Lumpur
        </div>
        
        <button className="text-ink hover:text-brand transition-colors">
          <ShoppingCart className="size-5" />
        </button>

        <div className="hidden sm:flex items-center gap-3">
          {user ? (
            <Button variant="outline" className="rounded-full px-6 font-bold" onClick={() => window.location.href = '/profile/edit'}>
              Profile
            </Button>
          ) : (
            <>
              <Button variant="ghost" className="rounded-full px-6 font-bold hover:bg-raised" onClick={() => window.location.href = '/otp-login'}>
                Log In
              </Button>
              <Button variant="primary" className="rounded-full px-6 font-bold" onClick={() => window.location.href = '/otp-login'}>
                Sign Up
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
