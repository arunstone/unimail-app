import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../../api/client'
import { truncate } from '../../lib/utils'
import { useTabsStore } from '../../stores/tabsStore'
import { toast } from '../../stores/toastStore'
import type { CalendarEvent, TaskItem } from '../../types'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** local calendar day an event belongs to (all-day events are stored at
 * UTC midnight, so those use the UTC date to avoid timezone drift) */
function eventDayKey(event: CalendarEvent): string {
  const d = new Date(event.starts_at)
  return event.all_day
    ? event.starts_at.slice(0, 10)
    : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function dayKeyOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function timeLabel(event: CalendarEvent): string {
  if (event.all_day) return 'all day'
  const t = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return event.ends_at ? `${t(event.starts_at)} – ${t(event.ends_at)}` : t(event.starts_at)
}

interface ModalState {
  event: CalendarEvent | null // null = creating
  dayKey: string
}

function EventModal({ state, onClose, onSaved }: {
  state: ModalState
  onClose: () => void
  onSaved: () => void
}) {
  const { openTab } = useTabsStore()
  const ev = state.event
  const [title, setTitle] = useState(ev?.title ?? '')
  const [allDay, setAllDay] = useState(ev?.all_day ?? false)
  const [start, setStart] = useState(
    ev ? (ev.all_day ? ev.starts_at.slice(0, 10) : toLocalInput(ev.starts_at)) : `${state.dayKey}T09:00`,
  )
  const [end, setEnd] = useState(
    ev?.ends_at && !ev.all_day ? toLocalInput(ev.ends_at) : '',
  )
  const [location, setLocation] = useState(ev?.location ?? '')
  const [description, setDescription] = useState(ev?.description ?? '')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!title.trim()) return
    setBusy(true)
    try {
      const payload = {
        title: title.trim(),
        location,
        description,
        all_day: allDay,
        starts_at: allDay
          ? `${start.slice(0, 10)}T00:00:00Z`
          : new Date(start).toISOString(),
        ends_at: !allDay && end ? new Date(end).toISOString() : null,
      }
      if (ev) await api.patch(`/api/calendar/events/${ev.id}`, payload)
      else await api.post('/api/calendar/events', payload)
      toast.success(ev ? 'Event updated' : 'Event added')
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save event')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!ev) return
    setBusy(true)
    try {
      await api.delete(`/api/calendar/events/${ev.id}`)
      toast.success('Event deleted')
      onSaved()
    } catch {
      toast.error('Could not delete event')
      setBusy(false)
    }
  }

  const inputCls =
    'input-base w-full rounded-lg border border-divider bg-app px-3 py-2 text-body text-primary outline-none focus:border-accent'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-divider bg-panel p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-subhead font-bold text-primary">
            {ev ? (ev.source === 'invite' ? '📨 Invitation' : 'Edit event') : 'New event'}
          </h2>
          <button onClick={onClose} className="rounded px-2 text-muted hover:text-primary">✕</button>
        </div>

        {ev?.source === 'invite' && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-caption">
            {ev.organizer && (
              <span className="rounded-full border border-divider px-2.5 py-1 text-muted">
                from {truncate(ev.organizer, 30)}
              </span>
            )}
            <span
              className={`rounded-full px-2.5 py-1 font-medium ${
                ev.status === 'cancelled'
                  ? 'bg-red-500/15 text-red-400'
                  : ev.status === 'tentative'
                    ? 'bg-yellow-500/15 text-yellow-400'
                    : 'bg-green-500/15 text-green-400'
              }`}
            >
              {ev.status}
            </span>
            {ev.email_id && (
              <button
                className="rounded-full border border-divider px-2.5 py-1 text-accent hover:border-accent"
                onClick={() => {
                  openTab({
                    kind: 'email',
                    key: `email:${ev.email_id}`,
                    title: truncate(ev.title || '(no subject)', 30),
                    location: { view: 'email', emailId: ev.email_id!, subject: ev.title },
                    crumbPrefix: [{ label: 'Calendar', loc: { view: 'calendar' } }],
                  })
                  onClose()
                }}
              >
                ✉ Open email
              </button>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          <input className={inputCls} placeholder="Title" value={title}
                 onChange={(e) => setTitle(e.target.value)} autoFocus />
          <label className="flex items-center gap-2 text-body text-muted">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            All day
          </label>
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <input
              type={allDay ? 'date' : 'datetime-local'}
              className={inputCls}
              value={allDay ? start.slice(0, 10) : start}
              onChange={(e) => setStart(e.target.value)}
            />
            {!allDay && (
              <input type="datetime-local" className={inputCls} value={end}
                     onChange={(e) => setEnd(e.target.value)} title="End (optional)" />
            )}
          </div>
          <input className={inputCls} placeholder="Location (optional)" value={location}
                 onChange={(e) => setLocation(e.target.value)} />
          <textarea className={`${inputCls} resize-none`} rows={3} placeholder="Description (optional)"
                    value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="mt-4 flex items-center justify-between">
          {ev ? (
            <button
              onClick={() => void remove()}
              disabled={busy}
              className="rounded-lg border border-divider px-3 py-1.5 text-caption text-muted transition-colors hover:border-red-400 hover:text-red-400"
            >
              🗑 Delete
            </button>
          ) : <span />}
          <button className="btn-primary px-4 py-2" disabled={busy || !title.trim()}
                  onClick={() => void save()}>
            {busy ? '…' : ev ? 'Save' : 'Add event'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TasksPanel() {
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [draft, setDraft] = useState('')

  const load = useCallback(() => {
    api.get<TaskItem[]>('/api/calendar/tasks').then(setTasks).catch(() => undefined)
  }, [])
  useEffect(load, [load])

  const add = async () => {
    const title = draft.trim()
    if (!title) return
    setDraft('')
    try {
      await api.post('/api/calendar/tasks', { title })
      load()
    } catch {
      toast.error('Could not add task')
    }
  }

  const toggle = async (task: TaskItem) => {
    try {
      await api.patch(`/api/calendar/tasks/${task.id}`, { done: !task.done })
      load()
    } catch {
      toast.error('Could not update task')
    }
  }

  const remove = async (task: TaskItem) => {
    try {
      await api.delete(`/api/calendar/tasks/${task.id}`)
      load()
    } catch {
      toast.error('Could not delete task')
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void add()}
          placeholder="Add a task…"
          className="min-w-0 flex-1 rounded-lg border border-divider bg-app px-3 py-1.5 text-body text-primary outline-none placeholder:text-muted focus:border-accent"
        />
        <button onClick={() => void add()} disabled={!draft.trim()}
                className="btn-primary px-3 py-1.5 text-body">＋</button>
      </div>
      {tasks.length === 0 && (
        <div className="py-2 text-caption text-muted">Nothing to do 🎉</div>
      )}
      {tasks.map((task) => (
        <div key={task.id} className="group flex items-center gap-2.5">
          <button
            onClick={() => void toggle(task)}
            className={`flex shrink-0 items-center justify-center rounded border text-[10px] transition-colors ${
              task.done ? 'border-accent bg-accent text-white' : 'border-divider hover:border-accent'
            }`}
            style={{ width: 18, height: 18 }}
          >
            {task.done ? '✓' : ''}
          </button>
          <span className={`min-w-0 flex-1 truncate text-body ${task.done ? 'text-muted line-through' : 'text-primary'}`}>
            {task.title}
          </span>
          <button onClick={() => void remove(task)}
                  className="text-caption text-muted opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100">
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

export default function CalendarView() {
  const today = new Date()
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selectedDay, setSelectedDay] = useState<string>(dayKeyOf(today))
  const [modal, setModal] = useState<ModalState | null>(null)

  // Monday-first 6-week grid covering the cursor month
  const gridDays = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const lead = (first.getDay() + 6) % 7
    const start = new Date(first)
    start.setDate(first.getDate() - lead)
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [cursor])

  const load = useCallback(() => {
    const start = new Date(gridDays[0])
    const end = new Date(gridDays[41])
    end.setDate(end.getDate() + 1)
    api
      .get<CalendarEvent[]>(
        `/api/calendar/events?start=${start.toISOString()}&end=${end.toISOString()}`,
      )
      .then(setEvents)
      .catch(() => toast.error('Could not load calendar'))
  }, [gridDays])
  useEffect(load, [load])

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const ev of events) {
      const key = eventDayKey(ev)
      map.set(key, [...(map.get(key) ?? []), ev])
    }
    return map
  }, [events])

  const upcoming = useMemo(() => {
    const now = Date.now()
    return events
      .filter((e) => e.status !== 'cancelled' && new Date(e.ends_at ?? e.starts_at).getTime() >= now)
      .slice(0, 8)
  }, [events])

  const monthTitle = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const todayKey = dayKeyOf(today)
  const selectedEvents = byDay.get(selectedDay) ?? []

  const chipCls = (ev: CalendarEvent) =>
    `w-full truncate rounded px-1 py-px text-left text-[11px] leading-4 transition-colors ${
      ev.status === 'cancelled'
        ? 'bg-surface text-muted line-through'
        : ev.source === 'invite'
          ? 'bg-accent2/20 text-primary hover:bg-accent2/35'
          : 'bg-accent/20 text-primary hover:bg-accent/35'
    }`

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 xl:flex-row xl:overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-head font-bold text-primary">📅 {monthTitle}</h1>
          <button className="rounded-lg border border-divider px-2.5 py-1 text-body text-muted hover:border-accent hover:text-primary"
                  onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
            ◀
          </button>
          <button className="rounded-lg border border-divider px-2.5 py-1 text-body text-muted hover:border-accent hover:text-primary"
                  onClick={() => { setCursor(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDay(todayKey) }}>
            Today
          </button>
          <button className="rounded-lg border border-divider px-2.5 py-1 text-body text-muted hover:border-accent hover:text-primary"
                  onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
            ▶
          </button>
          <button className="btn-primary px-3 py-1.5 text-body"
                  onClick={() => setModal({ event: null, dayKey: selectedDay })}>
            ＋ New event
          </button>
        </div>

        <div className="grid grid-cols-7 gap-px">
          {WEEKDAYS.map((d) => (
            <div key={d} className="pb-1 text-center text-caption font-bold uppercase tracking-wider text-muted">
              {d}
            </div>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-7 gap-px overflow-hidden rounded-xl border border-divider bg-divider">
          {gridDays.map((d) => {
            const key = dayKeyOf(d)
            const inMonth = d.getMonth() === cursor.getMonth()
            const dayEvents = byDay.get(key) ?? []
            return (
              <div
                key={key}
                onClick={() => setSelectedDay(key)}
                className={`flex min-h-[72px] cursor-pointer flex-col gap-0.5 p-1 transition-colors ${
                  inMonth ? 'bg-middle' : 'bg-panel'
                } ${selectedDay === key ? 'ring-1 ring-inset ring-accent' : ''} hover:bg-surface`}
              >
                <span
                  className={`self-start rounded-full px-1.5 text-caption leading-5 ${
                    key === todayKey
                      ? 'bg-accent font-bold text-white'
                      : inMonth ? 'text-primary' : 'text-muted'
                  }`}
                >
                  {d.getDate()}
                </span>
                {dayEvents.slice(0, 3).map((ev) => (
                  <button
                    key={ev.id}
                    className={chipCls(ev)}
                    onClick={(e) => { e.stopPropagation(); setModal({ event: ev, dayKey: key }) }}
                    title={`${ev.title} · ${timeLabel(ev)}`}
                  >
                    {ev.source === 'invite' ? '📨 ' : ''}{ev.title || '(untitled)'}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <span className="px-1 text-[10px] text-muted">+{dayEvents.length - 3} more</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex w-full shrink-0 flex-col gap-4 xl:w-80 xl:overflow-y-auto">
        <section className="rounded-xl border border-divider bg-panel p-4 shadow-card">
          <h2 className="mb-2 text-body font-bold text-primary">
            {new Date(`${selectedDay}T12:00:00`).toLocaleDateString(undefined, {
              weekday: 'long', month: 'long', day: 'numeric',
            })}
          </h2>
          {selectedEvents.length === 0 ? (
            <div className="text-caption text-muted">
              No events —{' '}
              <button className="text-accent hover:underline"
                      onClick={() => setModal({ event: null, dayKey: selectedDay })}>
                add one
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {selectedEvents.map((ev) => (
                <button key={ev.id} onClick={() => setModal({ event: ev, dayKey: selectedDay })}
                        className="rounded-lg border border-divider bg-app px-3 py-2 text-left transition-colors hover:border-accent">
                  <div className={`truncate text-body font-medium ${ev.status === 'cancelled' ? 'text-muted line-through' : 'text-primary'}`}>
                    {ev.source === 'invite' ? '📨 ' : ''}{ev.title || '(untitled)'}
                  </div>
                  <div className="font-mono text-caption text-muted">
                    {timeLabel(ev)}{ev.location ? ` · ${truncate(ev.location, 24)}` : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-divider bg-panel p-4 shadow-card">
          <h2 className="mb-2 text-body font-bold text-primary">Upcoming</h2>
          {upcoming.length === 0 ? (
            <div className="text-caption text-muted">Nothing scheduled.</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {upcoming.map((ev) => (
                <button key={ev.id}
                        onClick={() => setModal({ event: ev, dayKey: eventDayKey(ev) })}
                        className="flex items-baseline gap-2 rounded px-1 py-0.5 text-left hover:bg-surface">
                  <span className="shrink-0 font-mono text-caption text-muted">
                    {new Date(ev.starts_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                  <span className="truncate text-body text-primary">
                    {ev.source === 'invite' ? '📨 ' : ''}{ev.title || '(untitled)'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-divider bg-panel p-4 shadow-card">
          <h2 className="mb-2 text-body font-bold text-primary">✔ Tasks</h2>
          <TasksPanel />
        </section>
      </div>

      {modal && (
        <EventModal
          state={modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}
    </div>
  )
}
