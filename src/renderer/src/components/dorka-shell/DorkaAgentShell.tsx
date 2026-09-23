import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Computer, Menu, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { CapabilityCard, JobCard, ProgressCard } from './dorka-conversation-cards'
import { AGENTS, type Agent } from './dorka-shell-fixtures'
import './dorka-shell.css'

type SentMessage = { id: number; body: string }

function AgentMark({ agent, size = 'md' }: { agent: Agent; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-[42%] font-semibold text-white shadow-xs',
        size === 'sm' && 'size-8 text-xs',
        size === 'md' && 'size-10 text-sm',
        size === 'lg' && 'size-12 text-base'
      )}
      style={{ backgroundColor: `hsl(${agent.hue} 66% 42%)` }}
    >
      {agent.name.slice(0, 2).toUpperCase()}
      {agent.active ? (
        <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-sidebar bg-status-success" />
      ) : null}
    </span>
  )
}

function AgentRoster({
  agents,
  selectedId,
  query,
  onQueryChange,
  onCreate,
  onSelect
}: {
  agents: Agent[]
  selectedId: string
  query: string
  onQueryChange: (value: string) => void
  onCreate: () => void
  onSelect: (agent: Agent) => void
}) {
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const isMac = navigator.userAgent.includes('Mac')
      if ((isMac ? event.metaKey : event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border px-4 pt-5 pb-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-[-0.02em]">Dorka</h1>
            <p className="text-xs text-muted-foreground">Your agent team</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onCreate} aria-label="Create agent">
            <Plus />
          </Button>
        </div>
        <label className="relative block">
          <span className="sr-only">Search agents</span>
          <Input
            ref={searchRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search agents"
          />
        </label>
      </div>
      <nav aria-label="Agents" className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto p-2">
        {agents.length > 0 ? (
          <ul className="space-y-1">
            {agents.map((agent) => (
              <li key={agent.id}>
                <button
                  type="button"
                  data-current={agent.id === selectedId ? 'true' : undefined}
                  onClick={() => onSelect(agent)}
                  className="group flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[current=true]:bg-sidebar-accent"
                >
                  <AgentMark agent={agent} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{agent.name}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {agent.time}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {agent.preview}
                      </span>
                      {agent.unread > 0 ? (
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-[10px] font-semibold text-sidebar-primary-foreground">
                          {agent.unread}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">No agents found.</p>
        )}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <Button variant="outline" className="w-full justify-start" onClick={onCreate}>
          <Plus /> Create agent
        </Button>
      </div>
    </aside>
  )
}

function Conversation({
  agent,
  onOpenInspector,
  onOpenRoster
}: {
  agent: Agent
  onOpenInspector: () => void
  onOpenRoster: () => void
}) {
  const [draft, setDraft] = useState('')
  const [sentMessages, setSentMessages] = useState<SentMessage[]>([])
  const [accepted, setAccepted] = useState(false)
  const [approved, setApproved] = useState(false)

  const send = (): void => {
    const body = draft.trim()
    if (!body) {
      return
    }
    setSentMessages((current) => [...current, { id: Date.now(), body }])
    setDraft('')
  }

  return (
    <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4 sm:px-6">
        <span className="dorka-mobile-only">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onOpenRoster}
            aria-label="Open agent roster"
          >
            <Menu />
          </Button>
        </span>
        <button
          type="button"
          onClick={onOpenInspector}
          className="flex min-w-0 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <AgentMark agent={agent} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{agent.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{agent.role}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={onOpenInspector}
          className="ml-auto inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1.5 text-xs font-medium outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Computer className="size-3.5" /> Computer
        </button>
      </header>

      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8 sm:px-10 sm:py-12">
          <div className="flex items-start gap-3">
            <AgentMark agent={agent} size="sm" />
            <div className="max-w-[42rem]">
              <p className="text-sm leading-7">
                I reviewed the release work. The code looks stable, but the notes and final mobile
                check still need an owner. I can take both.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">Today, 10:42</p>
            </div>
          </div>
          <JobCard accepted={accepted} onAccept={() => setAccepted(true)} />
          {accepted ? <ProgressCard /> : null}
          <CapabilityCard approved={approved} onApprove={() => setApproved(true)} />
          {sentMessages.map((message) => (
            <div
              key={message.id}
              className="ml-auto max-w-[85%] rounded-xl bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground"
            >
              {message.body}
            </div>
          ))}
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-background px-4 py-4 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <label htmlFor="dorka-message" className="sr-only">
            Message {agent.name}
          </label>
          <div className="flex items-end gap-2">
            <Textarea
              id="dorka-message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  send()
                }
              }}
              placeholder={`Message ${agent.name}`}
              className="min-h-14 resize-none"
            />
            <Button
              size="icon-sm"
              onClick={send}
              disabled={!draft.trim()}
              aria-label="Send message"
            >
              <ArrowUp />
            </Button>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Enter to send · Shift+Enter for a new line
          </p>
        </div>
      </div>
    </main>
  )
}

function AgentInspector({
  agent,
  open,
  onOpenChange
}: {
  agent: Agent
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[min(90vw,380px)] sm:max-w-[380px]">
        <div className="border-b border-border p-2">
          <SheetHeader>
            <div className="mb-3">
              <AgentMark agent={agent} size="lg" />
            </div>
            <SheetTitle>{agent.name}</SheetTitle>
            <SheetDescription>{agent.role}</SheetDescription>
          </SheetHeader>
        </div>
        <div className="space-y-6 p-6">
          <section>
            <h3 className="text-sm font-semibold">Placement</h3>
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Computer className="size-4" /> Computer · Local workspace
            </p>
          </section>
          <section>
            <h3 className="text-sm font-semibold">Working style</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Keeps release work moving, asks before writing, and reports blockers early.
            </p>
          </section>
          <section>
            <h3 className="text-sm font-semibold">Capabilities</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="secondary">Read files</Badge>
              <Badge variant="secondary">Run checks</Badge>
              <Badge variant="secondary">Draft changes</Badge>
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function DorkaAgentShell(): React.JSX.Element {
  const [agents, setAgents] = useState(AGENTS)
  const [selectedId, setSelectedId] = useState(AGENTS[0].id)
  const [query, setQuery] = useState('')
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [rosterOpen, setRosterOpen] = useState(false)
  const selectedAgent = agents.find((agent) => agent.id === selectedId) ?? agents[0]
  const visibleAgents = agents.filter((agent) =>
    `${agent.name} ${agent.role}`.toLowerCase().includes(query.toLowerCase())
  )

  const createAgent = (): void => {
    const number = agents.length + 1
    const agent: Agent = {
      id: `agent-${number}`,
      name: `Agent ${number}`,
      role: 'New teammate',
      preview: 'Ready for a first job.',
      time: 'now',
      unread: 0,
      hue: (number * 67) % 360,
      active: true
    }
    setAgents((current) => [...current, agent])
    setSelectedId(agent.id)
    setQuery('')
    setRosterOpen(false)
  }

  const selectAgent = (agent: Agent): void => {
    setSelectedId(agent.id)
    setRosterOpen(false)
  }

  return (
    <div className="flex h-screen min-h-0 overflow-hidden bg-background font-sans text-foreground">
      <div className="dorka-roster-desktop dark w-80 shrink-0 border-r border-sidebar-border">
        <AgentRoster
          agents={visibleAgents}
          selectedId={selectedId}
          query={query}
          onQueryChange={setQuery}
          onCreate={createAgent}
          onSelect={selectAgent}
        />
      </div>
      <Conversation
        agent={selectedAgent}
        onOpenInspector={() => setInspectorOpen(true)}
        onOpenRoster={() => setRosterOpen(true)}
      />
      <AgentInspector agent={selectedAgent} open={inspectorOpen} onOpenChange={setInspectorOpen} />
      <Sheet open={rosterOpen} onOpenChange={setRosterOpen}>
        <SheetContent side="left" showCloseButton={false} className="dark w-[min(88vw,320px)]">
          <SheetTitle className="sr-only">Agent roster</SheetTitle>
          <SheetDescription className="sr-only">Choose an agent conversation</SheetDescription>
          <AgentRoster
            agents={visibleAgents}
            selectedId={selectedId}
            query={query}
            onQueryChange={setQuery}
            onCreate={createAgent}
            onSelect={selectAgent}
          />
        </SheetContent>
      </Sheet>
    </div>
  )
}
