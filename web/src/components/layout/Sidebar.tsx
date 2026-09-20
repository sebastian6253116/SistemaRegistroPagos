import { NavLink } from 'react-router-dom';
import { BRAND_ICON, NAV_SECTIONS } from './nav-items';
import { usePermiso } from '@/hooks/usePermiso';
import { cn } from '@/lib/utils';

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { tieneAlguno } = usePermiso();
  const Icon = BRAND_ICON;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 border-b px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">Gestión de Cobros</p>
          <p className="text-xs text-muted-foreground">Control en USD</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter(
            (item) => item.permisos.length === 0 || tieneAlguno(...item.permisos),
          );
          if (items.length === 0) return null;
          return (
            <div key={section.titulo}>
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {section.titulo}
              </p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const ItemIcon = item.icon;
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.end}
                        onClick={onNavigate}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                            isActive
                              ? 'bg-primary/10 text-primary'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                          )
                        }
                      >
                        <ItemIcon className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="truncate">{item.label}</span>
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </div>
  );
}
