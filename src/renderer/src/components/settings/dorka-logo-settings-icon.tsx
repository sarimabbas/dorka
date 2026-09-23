import { createElement } from 'react'
import type { LucideProps } from 'lucide-react'
import logo from '../../../../../resources/app-icons/dorka-geek-app-icon.png'
import { cn } from '@/lib/utils'

export function DorkaLogoSettingsIcon({ className }: LucideProps): React.JSX.Element {
  return createElement('img', {
    src: logo,
    alt: '',
    'aria-hidden': true,
    className: cn('rounded-sm object-cover', className)
  })
}
