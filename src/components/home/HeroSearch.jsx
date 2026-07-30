import React, { useState } from 'react';
import { Search, MapPin, CalendarDays, Grid, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/lib/useTranslation';

const quickSearches = ['Home Cleaning', 'AC Service', 'Plumbing', 'Pest Control'];

export function HeroSearch() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('Kuala Lumpur');

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (query.trim()) params.append('q', query.trim());
    if (date) params.append('date', date);
    if (location.trim()) params.append('loc', location.trim());
    
    navigate(`/explore?${params.toString()}`);
  };

  return (
    <div className="w-full max-w-5xl rounded-lg border border-white/80 bg-surface p-2 shadow-float">
      <div className="grid gap-2 lg:grid-cols-[1.15fr_0.75fr_0.9fr_auto]">
        <div className="flex h-14 items-center gap-3 rounded-lg bg-raised px-3 transition-colors focus-within:bg-surface focus-within:ring-2 focus-within:ring-brand/20">
          <Grid className="h-5 w-5 shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            <label className="mb-0.5 block truncate text-[10px] font-bold uppercase tracking-widest text-ink-secondary">{t('Select Service')}</label>
            <input
              type="text"
              placeholder={t('Search cleaning, AC, plumber...')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full truncate border-none bg-transparent p-0 text-sm font-semibold text-ink outline-none placeholder:text-ink-tertiary focus:ring-0"
            />
          </div>
          <ChevronDown className="hidden h-4 w-4 shrink-0 text-ink-tertiary sm:block" />
        </div>

        <div className="flex h-14 items-center gap-3 rounded-lg bg-raised px-3 transition-colors focus-within:bg-surface focus-within:ring-2 focus-within:ring-brand/20">
          <CalendarDays className="h-5 w-5 shrink-0 text-blue-600" />
          <div className="min-w-0 flex-1">
            <label className="mb-0.5 block truncate text-[10px] font-bold uppercase tracking-widest text-ink-secondary">{t('Date')}</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full truncate border-none bg-transparent p-0 text-sm font-semibold text-ink outline-none focus:ring-0"
              style={{ colorScheme: 'light' }}
            />
          </div>
          <ChevronDown className="hidden h-4 w-4 shrink-0 text-ink-tertiary sm:block" />
        </div>

        <div className="flex h-14 items-center gap-3 rounded-lg bg-raised px-3 transition-colors focus-within:bg-surface focus-within:ring-2 focus-within:ring-brand/20">
          <MapPin className="h-5 w-5 shrink-0 text-success" />
          <div className="min-w-0 flex-1">
            <label className="mb-0.5 block truncate text-[10px] font-bold uppercase tracking-widest text-ink-secondary">{t('Location')}</label>
            <input
              type="text"
              placeholder={t('Your location')}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full truncate border-none bg-transparent p-0 text-sm font-semibold text-ink outline-none placeholder:text-ink-tertiary focus:ring-0"
            />
          </div>
          <ChevronDown className="hidden h-4 w-4 shrink-0 text-ink-tertiary sm:block" />
        </div>

        <Button
          variant="primary"
          className="h-14 w-full rounded-lg bg-brand px-6 font-bold text-white shadow-md shadow-brand/20 transition-transform hover:bg-brand/90 active:scale-95 lg:w-auto"
          onClick={handleSearch}
        >
          <Search className="mr-2 h-4 w-4" />
          {t('Search')}
        </Button>
      </div>

      <div className="mt-2 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
        {quickSearches.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              setQuery(item);
              navigate(`/explore?q=${encodeURIComponent(item)}&loc=${encodeURIComponent(location)}`);
            }}
            className="shrink-0 rounded-full bg-brand-tint px-3 py-1.5 text-[11px] font-bold text-brand transition-colors hover:bg-brand hover:text-white"
          >
            {t(item)}
          </button>
        ))}
      </div>
    </div>
  );
}
