// components/ui/Avatar.tsx
// Colored initials avatar circle.

import { cn } from '@/lib/utils'

interface AvatarProps {
  initials: string
  color?: string          // hex background colour
  textColor?: string      // hex text colour
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeMap = {
  sm:  'w-7 h-7 text-[11px]',
  md:  'w-9 h-9 text-[13px]',
  lg:  'w-11 h-11 text-[15px]',
}

export function Avatar({ initials, color = '#3b63b8', textColor = '#fff', size = 'md', className }: AvatarProps) {
  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-bold flex-shrink-0',
        sizeMap[size],
        className
      )}
      style={{ background: color, color: textColor }}
    >
      {initials}
    </div>
  )
}
