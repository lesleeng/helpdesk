import type { Role } from '../types'

export function homePath(role?: Role): string {
  if (role === 'admin') return '/admin/dashboard'
  if (role === 'tech') return '/tickets/assigned'
  return '/tickets'
}
