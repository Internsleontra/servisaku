import { Moon, Sun, MonitorSmartphone } from "lucide-react"
import { useTheme } from "./ThemeProvider"
import { useTranslation } from '@/lib/useTranslation';

export default function ThemeToggle() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme()

  const options = [
    { id: 'light', icon: Sun, label: 'Light' },
    { id: 'dark', icon: Moon, label: 'Dark' },
    { id: 'system', icon: MonitorSmartphone, label: 'System' },
  ]

  return (
    <div className="flex bg-raised rounded-xl p-1 w-full">
      {options.map(opt => {
        const Icon = opt.icon;
        const active = theme === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => setTheme(opt.id)}
            className={`flex-1 flex flex-col items-center justify-center py-2.5 rounded-lg transition-all text-xs font-medium gap-1.5 ${
              active ? 'bg-surface shadow-e1 text-brand' : 'text-ink-secondary hover:text-ink'
            }`}
          >
            <Icon className="h-4 w-4" />
            {t(opt.label)}
          </button>
        )
      })}
    </div>
  )
}
