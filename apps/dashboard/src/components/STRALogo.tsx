import clsx from 'clsx';

type LogoSize = 'sm' | 'md' | 'lg' | 'xl';

interface STRALogoProps {
  size?: LogoSize;
  glow?: boolean;
  className?: string;
}

const sizeConfig: Record<LogoSize, { box: string; text: string }> = {
  sm: { box: 'w-10 h-10', text: 'text-base' },
  md: { box: 'w-20 h-20', text: 'text-2xl' },
  lg: { box: 'w-24 h-24', text: 'text-3xl' },
  xl: { box: 'w-28 h-28', text: 'text-4xl' },
};

const letters = [
  ['S', 'text-cyan-300'],
  ['T', 'text-blue-400'],
  ['R', 'text-indigo-400'],
  ['A', 'text-violet-400'],
] as const;

export function STRALogo({ size = 'md', glow = false, className }: STRALogoProps) {
  const cfg = sizeConfig[size];

  return (
    <div
      role="img"
      aria-label="STRA"
      className={clsx(cfg.box, 'relative flex items-center justify-center', glow && 'group', className)}
    >
      <span className={clsx('font-bold tracking-tight', cfg.text)}>
        {letters.map(([letter, color]) => <span key={letter} className={color}>{letter}</span>)}
      </span>

      {glow && (
        <div className="absolute inset-0 bg-[rgb(0,255,255)] opacity-0 blur-xl transition-opacity group-hover:opacity-10" />
      )}
    </div>
  );
}
