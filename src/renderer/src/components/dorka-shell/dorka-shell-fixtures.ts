export type Agent = {
  id: string
  name: string
  role: string
  preview: string
  time: string
  unread: number
  hue: number
  active: boolean
}

export const AGENTS: Agent[] = [
  {
    id: 'mara',
    name: 'Mara',
    role: 'Release coordinator',
    preview: 'The deployment checklist is ready.',
    time: '2m',
    unread: 2,
    hue: 16,
    active: true
  },
  {
    id: 'lin',
    name: 'Lin',
    role: 'Frontend engineer',
    preview: 'I found the focus regression.',
    time: '18m',
    unread: 0,
    hue: 208,
    active: true
  },
  {
    id: 'oskar',
    name: 'Oskar',
    role: 'Research agent',
    preview: 'Three sources support the change.',
    time: '1h',
    unread: 0,
    hue: 284,
    active: false
  },
  {
    id: 'nia',
    name: 'Nia',
    role: 'Quality engineer',
    preview: 'Mobile checks passed.',
    time: '3h',
    unread: 0,
    hue: 146,
    active: false
  }
]
