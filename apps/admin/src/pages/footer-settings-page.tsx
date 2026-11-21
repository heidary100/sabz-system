import { useEffect, useState } from 'react'
import { Eye, Plus, Save, Trash2 } from 'lucide-react'
import type { FooterLink, FooterSettings } from '@sabz/types'
import {
  EMPTY_FOOTER_SETTINGS,
  getFooterSettings,
  updateFooterSettings,
} from '../services/settings'
import { translateApiError } from '../lib/error-messages'
import { Button } from '../components/catalyst/button'
import { Input } from '../components/catalyst/input'
import { Textarea } from '../components/catalyst/textarea'
import { Field, Label } from '../components/catalyst/fieldset'
import { ErrorState } from '../components/ui/error-state'
import { InlineError } from '../components/ui/inline-error'
import { Loading } from '../components/ui/loading'
import { PageHeader } from '../components/ui/page-header'

const URL_PATTERN = /^(?:\/[^\s]*|https:\/\/[^\s]+)$/i

/**
 * Storefront footer editor (SS-900). Every value is validated; an empty row is
 * omitted rather than rendered as invented contact/legal content. Versioned
 * writes prevent two operators from silently overwriting each other.
 */
export function FooterSettingsPage() {
  const [settings, setSettings] = useState<FooterSettings>(EMPTY_FOOTER_SETTINGS)
  const [version, setVersion] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setLoadError(null)
    try {
      const response = await getFooterSettings()
      setSettings(response.value ?? EMPTY_FOOTER_SETTINGS)
      setVersion(response.version)
      setUpdatedAt(response.updatedAt)
    } catch (loadFailure) {
      setLoadError(loadFailure)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  function patch(next: Partial<FooterSettings>) {
    setSettings((current) => ({ ...current, ...next }))
    setNotice(null)
    setError(null)
  }

  function patchLink(
    group: 'socials' | 'legalLinks',
    index: number,
    next: Partial<FooterLink>,
  ) {
    setSettings((current) => ({
      ...current,
      [group]: current[group].map((link, linkIndex) =>
        linkIndex === index ? { ...link, ...next } : link,
      ),
    }))
    setNotice(null)
  }

  async function save() {
    setError(null)
    setNotice(null)
    for (const link of [...settings.socials, ...settings.legalLinks]) {
      if (!URL_PATTERN.test(link.href.trim())) {
        setError(`نشانی «${link.label || 'پیوند'}» باید نسبی (با /) یا https باشد.`)
        return
      }
    }
    for (const column of settings.columns) {
      for (const link of column.links) {
        if (!URL_PATTERN.test(link.href.trim())) {
          setError(`نشانی در ستون «${column.title}» معتبر نیست.`)
          return
        }
      }
    }
    setSaving(true)
    try {
      const response = await updateFooterSettings({
        value: settings,
        version,
      })
      setSettings(response.value ?? EMPTY_FOOTER_SETTINGS)
      setVersion(response.version)
      setUpdatedAt(response.updatedAt)
      setNotice('تنظیمات پاورقی ذخیره شد.')
    } catch (saveError) {
      setError(translateApiError(saveError))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <Loading label="در حال بارگذاری پاورقی…" />
  }
  if (loadError) {
    return <ErrorState message={translateApiError(loadError)} onRetry={() => void load()} />
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="پاورقی فروشگاه"
        subtitle="متن، ستون‌های پیوند، اطلاعات تماس و شبکه‌های اجتماعی. فقط اطلاعات واقعی را وارد کنید؛ فیلد خالی نمایش داده نمی‌شود."
        actions={
          <Button color="primary" onClick={() => void save()} disabled={saving}>
            <Save className="size-4" aria-hidden="true" />
            {saving ? 'در حال ذخیره…' : 'ذخیره پاورقی'}
          </Button>
        }
      />

      {error && <InlineError message={error} />}
      {notice && (
        <p className="rounded-control bg-success/10 px-3 py-2 text-sm text-success" role="status">
          {notice}
          {updatedAt
            ? ` — آخرین ذخیره: ${new Intl.DateTimeFormat('fa-IR', {
                calendar: 'persian',
                timeZone: 'Asia/Tehran',
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(updatedAt))}`
            : ''}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-5">
          <section className="rounded-card border border-border bg-surface p-5">
            <h2 className="text-sm font-bold text-foreground">متن اصلی</h2>
            <div className="mt-4 space-y-4">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(event) => patch({ enabled: event.target.checked })}
                  className="size-4 accent-primary"
                />
                نمایش پاورقی در فروشگاه
              </label>
              <Field>
                <Label htmlFor="footer-blurb">معرفی کوتاه برند</Label>
                <Textarea
                  id="footer-blurb"
                  rows={3}
                  value={settings.blurb ?? ''}
                  maxLength={1000}
                  onChange={(event) => patch({ blurb: event.target.value || null })}
                />
              </Field>
              <Field>
                <Label htmlFor="footer-copyright">متن حق نشر</Label>
                <Input
                  id="footer-copyright"
                  value={settings.copyright ?? ''}
                  maxLength={300}
                  onChange={(event) => patch({ copyright: event.target.value || null })}
                />
              </Field>
            </div>
          </section>

          <section className="rounded-card border border-border bg-surface p-5">
            <h2 className="text-sm font-bold text-foreground">اطلاعات تماس</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field>
                <Label htmlFor="footer-phone">تلفن</Label>
                <Input
                  id="footer-phone"
                  value={settings.contact.phone ?? ''}
                  onChange={(event) =>
                    patch({
                      contact: { ...settings.contact, phone: event.target.value || null },
                    })
                  }
                />
              </Field>
              <Field>
                <Label htmlFor="footer-email">ایمیل</Label>
                <Input
                  id="footer-email"
                  dir="ltr"
                  value={settings.contact.email ?? ''}
                  onChange={(event) =>
                    patch({
                      contact: { ...settings.contact, email: event.target.value || null },
                    })
                  }
                />
              </Field>
              <Field>
                <Label htmlFor="footer-hours">ساعات کاری</Label>
                <Input
                  id="footer-hours"
                  value={settings.contact.hours ?? ''}
                  onChange={(event) =>
                    patch({
                      contact: { ...settings.contact, hours: event.target.value || null },
                    })
                  }
                />
              </Field>
              <Field>
                <Label htmlFor="footer-address">نشانی</Label>
                <Input
                  id="footer-address"
                  value={settings.contact.address ?? ''}
                  onChange={(event) =>
                    patch({
                      contact: { ...settings.contact, address: event.target.value || null },
                    })
                  }
                />
              </Field>
            </div>
          </section>

          <section className="rounded-card border border-border bg-surface p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-foreground">ستون‌های پیوند</h2>
              <Button
                outline
                onClick={() =>
                  patch({ columns: [...settings.columns, { title: '', links: [] }] })
                }
              >
                <Plus className="size-4" aria-hidden="true" />
                ستون
              </Button>
            </div>
            <div className="mt-4 space-y-4">
              {settings.columns.map((column, columnIndex) => (
                <div key={columnIndex} className="rounded-control border border-border p-3">
                  <div className="flex items-end gap-2">
                    <Field className="flex-1">
                      <Label htmlFor={`column-title-${columnIndex}`}>عنوان ستون</Label>
                      <Input
                        id={`column-title-${columnIndex}`}
                        value={column.title}
                        onChange={(event) =>
                          patch({
                            columns: settings.columns.map((row, index) =>
                              index === columnIndex
                                ? { ...row, title: event.target.value }
                                : row,
                            ),
                          })
                        }
                      />
                    </Field>
                    <Button
                      outline
                      onClick={() =>
                        patch({
                          columns: settings.columns.filter((_, index) => index !== columnIndex),
                        })
                      }
                      aria-label="حذف ستون"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {column.links.map((link, linkIndex) => (
                      <LinkRow
                        key={linkIndex}
                        link={link}
                        onChange={(next) =>
                          patch({
                            columns: settings.columns.map((row, index) =>
                              index === columnIndex
                                ? {
                                    ...row,
                                    links: row.links.map((entry, entryIndex) =>
                                      entryIndex === linkIndex ? { ...entry, ...next } : entry,
                                    ),
                                  }
                                : row,
                            ),
                          })
                        }
                        onRemove={() =>
                          patch({
                            columns: settings.columns.map((row, index) =>
                              index === columnIndex
                                ? {
                                    ...row,
                                    links: row.links.filter((_, entryIndex) => entryIndex !== linkIndex),
                                  }
                                : row,
                            ),
                          })
                        }
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        patch({
                          columns: settings.columns.map((row, index) =>
                            index === columnIndex
                              ? { ...row, links: [...row.links, { label: '', href: '' }] }
                              : row,
                          ),
                        })
                      }
                      className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    >
                      <Plus className="size-3.5" aria-hidden="true" />
                      افزودن پیوند
                    </button>
                  </div>
                </div>
              ))}
              {settings.columns.length === 0 && (
                <p className="text-sm text-muted">ستونی تعریف نشده است.</p>
              )}
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            {(['socials', 'legalLinks'] as const).map((group) => (
              <section key={group} className="rounded-card border border-border bg-surface p-5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-foreground">
                    {group === 'socials' ? 'شبکه‌های اجتماعی' : 'پیوندهای قانونی'}
                  </h2>
                  <Button
                    outline
                    onClick={() =>
                      patch({ [group]: [...settings[group], { label: '', href: '' }] })
                    }
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    افزودن
                  </Button>
                </div>
                <div className="mt-3 space-y-2">
                  {settings[group].map((link, index) => (
                    <LinkRow
                      key={index}
                      link={link}
                      onChange={(next) => patchLink(group, index, next)}
                      onRemove={() =>
                        patch({ [group]: settings[group].filter((_, row) => row !== index) })
                      }
                    />
                  ))}
                  {settings[group].length === 0 && (
                    <p className="text-xs text-muted">موردی تعریف نشده است.</p>
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>

        <aside className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Eye className="size-4 text-primary" aria-hidden="true" />
            پیش‌نمایش
          </div>
          <div className="overflow-hidden rounded-card border-t-2 border-t-[#45c57a] bg-[#0b1510] p-5 text-[#f1f6f2]">
            <p className="flex items-center gap-2 text-base font-bold">
              <img src="/brand/logo-64.png" alt="" width={24} height={24} className="object-contain" />
              سبز سیستم
            </p>
            {settings.blurb && (
              <p className="mt-2 text-xs leading-6 text-white/70">{settings.blurb}</p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
              {settings.columns.map((column, index) => (
                <div key={index}>
                  <p className="font-semibold">{column.title || 'بدون عنوان'}</p>
                  <ul className="mt-1 space-y-1 text-white/70">
                    {column.links.map((link, linkIndex) => (
                      <li key={linkIndex}>{link.label || '—'}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {settings.contact.phone && (
              <p className="mt-4 text-xs text-white/70" dir="ltr">
                {settings.contact.phone}
              </p>
            )}
            <p className="mt-4 border-t border-white/10 pt-3 text-[10px] text-white/50">
              {settings.copyright ?? 'حق نشر تنظیم نشده است.'}
            </p>
          </div>
          <p className="text-[11px] leading-5 text-muted">
            پیش‌نمایش تقریبی است؛ چیدمان نهایی از توکن‌های طراحی فروشگاه استفاده می‌کند.
          </p>
          <div className="rounded-card border border-border bg-surface p-3 text-[11px] text-muted">
            نسخه تنظیمات: {version}
          </div>
        </aside>
      </div>
    </div>
  )
}

function LinkRow({
  link,
  onChange,
  onRemove,
}: {
  link: FooterLink
  onChange: (next: Partial<FooterLink>) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-end gap-2">
      <Field className="min-w-0 flex-1">
        <Label className="sr-only">برچسب</Label>
        <Input
          value={link.label}
          placeholder="برچسب"
          onChange={(event) => onChange({ label: event.target.value })}
        />
      </Field>
      <Field className="min-w-0 flex-[2]">
        <Label className="sr-only">نشانی</Label>
        <Input
          dir="ltr"
          value={link.href}
          placeholder="/about یا https://…"
          onChange={(event) => onChange({ href: event.target.value })}
        />
      </Field>
      <Button outline onClick={onRemove} aria-label="حذف پیوند">
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
    </div>
  )
}
