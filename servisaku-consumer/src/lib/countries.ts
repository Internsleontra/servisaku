export interface Country { code: string; name: string; dial: string; flag: string }

// Malaysia first (default), then common SEA + others. Searchable in the picker.
export const COUNTRIES: Country[] = [
  { code: 'MY', name: 'Malaysia', dial: '+60', flag: '🇲🇾' },
  { code: 'SG', name: 'Singapore', dial: '+65', flag: '🇸🇬' },
  { code: 'ID', name: 'Indonesia', dial: '+62', flag: '🇮🇩' },
  { code: 'TH', name: 'Thailand', dial: '+66', flag: '🇹🇭' },
  { code: 'IN', name: 'India', dial: '+91', flag: '🇮🇳' },
  { code: 'PH', name: 'Philippines', dial: '+63', flag: '🇵🇭' },
  { code: 'VN', name: 'Vietnam', dial: '+84', flag: '🇻🇳' },
  { code: 'BN', name: 'Brunei', dial: '+673', flag: '🇧🇳' },
  { code: 'AU', name: 'Australia', dial: '+61', flag: '🇦🇺' },
  { code: 'GB', name: 'United Kingdom', dial: '+44', flag: '🇬🇧' },
  { code: 'US', name: 'United States', dial: '+1', flag: '🇺🇸' },
  { code: 'AE', name: 'UAE', dial: '+971', flag: '🇦🇪' },
];

export const DEFAULT_COUNTRY = COUNTRIES[0];

// Strip spaces/dashes and a single leading zero from a local number.
export function cleanLocalNumber(raw: string): string {
  return raw.replace(/[^0-9]/g, '').replace(/^0+/, '');
}
