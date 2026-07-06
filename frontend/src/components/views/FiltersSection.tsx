import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { useAccountsStore } from '../../stores/accountsStore'
import { useLabelsStore } from '../../stores/labelsStore'
import { toast } from '../../stores/toastStore'
import type { FilterActions, FilterCondition, FilterRule } from '../../types'

const FIELD_LABELS: Record<FilterCondition['field'], string> = {
  from: 'From',
  to: 'To/Cc',
  subject: 'Subject',
  body: 'Body',
}

const OP_LABELS: Record<FilterCondition['op'], string> = {
  contains: 'contains',
  not_contains: "doesn't contain",
  equals: 'is exactly',
}

const EMPTY_CONDITION: FilterCondition = { field: 'from', op: 'contains', value: '' }
const EMPTY_ACTIONS: FilterActions = {
  move_to: null,
  label_id: null,
  mark_read: false,
  star: false,
}

interface EditorState {
  id?: string
  name: string
  account_id: string | null
  match_type: 'all' | 'any'
  conditions: FilterCondition[]
  actions: FilterActions
  enabled: boolean
}

function describe(rule: FilterRule, labelName?: string): string {
  const conds = rule.conditions
    .map((c) => `${FIELD_LABELS[c.field]} ${OP_LABELS[c.op]} “${c.value}”`)
    .join(rule.match_type === 'all' ? ' and ' : ' or ')
  const acts: string[] = []
  if (rule.actions.move_to) acts.push(`move to ${rule.actions.move_to}`)
  if (rule.actions.label_id) acts.push(`label “${labelName ?? 'label'}”`)
  if (rule.actions.mark_read) acts.push('mark read')
  if (rule.actions.star) acts.push('star')
  return `If ${conds} → ${acts.join(', ')}`
}

export default function FiltersSection() {
  const [rules, setRules] = useState<FilterRule[] | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState<string | null>(null)
  const accounts = useAccountsStore((s) => s.accounts)
  const labels = useLabelsStore((s) => s.labels)

  const load = () => api.get<FilterRule[]>('/api/filters').then(setRules)

  useEffect(() => {
    void load().catch(() => toast.error('Could not load filters'))
  }, [])

  const startNew = () =>
    setEditor({
      name: '',
      account_id: null,
      match_type: 'all',
      conditions: [{ ...EMPTY_CONDITION }],
      actions: { ...EMPTY_ACTIONS },
      enabled: true,
    })

  const startEdit = (rule: FilterRule) =>
    setEditor({
      id: rule.id,
      name: rule.name,
      account_id: rule.account_id,
      match_type: rule.match_type,
      conditions: rule.conditions.map((c) => ({ ...c })),
      actions: { ...rule.actions },
      enabled: rule.enabled,
    })

  const save = async () => {
    if (!editor) return
    setSaving(true)
    try {
      const payload = { ...editor, id: undefined }
      if (editor.id) await api.put(`/api/filters/${editor.id}`, payload)
      else await api.post('/api/filters', payload)
      toast.success('Filter saved')
      setEditor(null)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save filter')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (rule: FilterRule) => {
    if (!window.confirm(`Delete filter “${rule.name}”?`)) return
    try {
      await api.delete(`/api/filters/${rule.id}`)
      await load()
    } catch {
      toast.error('Could not delete filter')
    }
  }

  const toggle = async (rule: FilterRule) => {
    try {
      await api.put(`/api/filters/${rule.id}`, { ...rule, enabled: !rule.enabled })
      await load()
    } catch {
      toast.error('Could not update filter')
    }
  }

  const runNow = async (rule: FilterRule) => {
    setRunning(rule.id)
    try {
      const res = await api.post<{ matched: number; scanned: number }>(
        `/api/filters/${rule.id}/run`,
      )
      toast.success(`Matched ${res.matched} of ${res.scanned} recent inbox emails`)
    } catch {
      toast.error('Could not run filter')
    } finally {
      setRunning(null)
    }
  }

  const select =
    'rounded-md border border-divider bg-app px-2 py-1.5 text-body text-primary outline-none focus:border-accent'
  const smallBtn =
    'rounded border border-divider px-2.5 py-1 text-caption text-muted transition-colors hover:border-accent hover:text-primary'

  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-muted">
        Filters run automatically on new incoming mail: match conditions, then move,
        label, mark read or star the message.
      </p>

      {rules === null ? (
        <div className="text-body text-muted">Loading…</div>
      ) : rules.length === 0 && !editor ? (
        <div className="text-body text-muted">No filters yet.</div>
      ) : (
        rules.map((rule) => (
          <div key={rule.id} className="rounded-lg border border-divider bg-app p-3">
            <div className="flex items-center gap-2">
              <span
                className={`text-body font-medium ${rule.enabled ? 'text-primary' : 'text-muted line-through'}`}
              >
                {rule.name}
              </span>
              {rule.account_id && (
                <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-caption text-muted">
                  {accounts.find((a) => a.id === rule.account_id)?.email_address ?? 'account'}
                </span>
              )}
              <span className="flex-1" />
              <button className={smallBtn} disabled={running === rule.id} onClick={() => void runNow(rule)}>
                {running === rule.id ? '…' : '▶ Run now'}
              </button>
              <button className={smallBtn} onClick={() => void toggle(rule)}>
                {rule.enabled ? 'Disable' : 'Enable'}
              </button>
              <button className={smallBtn} onClick={() => startEdit(rule)}>
                ✎
              </button>
              <button
                className={`${smallBtn} hover:border-red-400 hover:text-red-400`}
                onClick={() => void remove(rule)}
              >
                🗑
              </button>
            </div>
            <div className="mt-1 text-caption text-muted">
              {describe(rule, labels.find((l) => l.id === rule.actions.label_id)?.name)}
            </div>
          </div>
        ))
      )}

      {editor ? (
        <div className="flex flex-col gap-3 rounded-lg border border-accent/40 bg-app p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input-base max-w-52 px-2 py-1.5"
              placeholder="Filter name"
              value={editor.name}
              onChange={(e) => setEditor({ ...editor, name: e.target.value })}
            />
            <select
              className={select}
              value={editor.account_id ?? ''}
              onChange={(e) => setEditor({ ...editor, account_id: e.target.value || null })}
            >
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.email_address}
                </option>
              ))}
            </select>
            <select
              className={select}
              value={editor.match_type}
              onChange={(e) =>
                setEditor({ ...editor, match_type: e.target.value as 'all' | 'any' })
              }
            >
              <option value="all">Match all conditions</option>
              <option value="any">Match any condition</option>
            </select>
          </div>

          {editor.conditions.map((cond, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select
                className={select}
                value={cond.field}
                onChange={(e) => {
                  const conditions = [...editor.conditions]
                  conditions[i] = { ...cond, field: e.target.value as FilterCondition['field'] }
                  setEditor({ ...editor, conditions })
                }}
              >
                {Object.entries(FIELD_LABELS).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                className={select}
                value={cond.op}
                onChange={(e) => {
                  const conditions = [...editor.conditions]
                  conditions[i] = { ...cond, op: e.target.value as FilterCondition['op'] }
                  setEditor({ ...editor, conditions })
                }}
              >
                {Object.entries(OP_LABELS).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                className="input-base min-w-32 flex-1 px-2 py-1.5"
                placeholder="Text to match"
                value={cond.value}
                onChange={(e) => {
                  const conditions = [...editor.conditions]
                  conditions[i] = { ...cond, value: e.target.value }
                  setEditor({ ...editor, conditions })
                }}
              />
              {editor.conditions.length > 1 && (
                <button
                  className="text-muted hover:text-red-400"
                  onClick={() =>
                    setEditor({
                      ...editor,
                      conditions: editor.conditions.filter((_, j) => j !== i),
                    })
                  }
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            className="self-start text-caption text-accent hover:underline"
            onClick={() =>
              setEditor({ ...editor, conditions: [...editor.conditions, { ...EMPTY_CONDITION }] })
            }
          >
            + Add condition
          </button>

          <div className="flex flex-wrap items-center gap-3 border-t border-divider pt-3">
            <span className="text-caption font-bold uppercase tracking-wide text-muted">Then</span>
            <select
              className={select}
              value={editor.actions.move_to ?? ''}
              onChange={(e) =>
                setEditor({
                  ...editor,
                  actions: {
                    ...editor.actions,
                    move_to: (e.target.value || null) as FilterActions['move_to'],
                  },
                })
              }
            >
              <option value="">Don't move</option>
              <option value="trash">Move to Trash</option>
              <option value="spam">Move to Spam</option>
              <option value="archive">Archive</option>
            </select>
            {labels.length > 0 && (
              <select
                className={select}
                value={editor.actions.label_id ?? ''}
                onChange={(e) =>
                  setEditor({
                    ...editor,
                    actions: { ...editor.actions, label_id: e.target.value || null },
                  })
                }
              >
                <option value="">No label</option>
                {labels.map((l) => (
                  <option key={l.id} value={l.id}>
                    Label: {l.name}
                  </option>
                ))}
              </select>
            )}
            <label className="flex items-center gap-1.5 text-body text-primary">
              <input
                type="checkbox"
                checked={editor.actions.mark_read}
                onChange={(e) =>
                  setEditor({
                    ...editor,
                    actions: { ...editor.actions, mark_read: e.target.checked },
                  })
                }
              />
              Mark read
            </label>
            <label className="flex items-center gap-1.5 text-body text-primary">
              <input
                type="checkbox"
                checked={editor.actions.star}
                onChange={(e) =>
                  setEditor({ ...editor, actions: { ...editor.actions, star: e.target.checked } })
                }
              />
              Star
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <button
              className="rounded-lg px-3 py-1.5 text-body text-muted hover:text-primary"
              onClick={() => setEditor(null)}
            >
              Cancel
            </button>
            <button className="btn-primary px-4 py-1.5" disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save filter'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={startNew}
          className="self-start rounded-lg border border-dashed border-divider px-3 py-2 text-body text-muted transition-colors hover:border-accent hover:text-accent"
        >
          + New filter
        </button>
      )}
    </div>
  )
}
