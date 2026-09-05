import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  AlertActions,
  AlertBody,
  AlertDescription,
  AlertTitle,
} from '../../catalyst/alert'
import { Button } from '../../catalyst/button'
import { ErrorMessage, Field, Label } from '../../catalyst/fieldset'
import { Input } from '../../catalyst/input'
import { Text } from '../../catalyst/text'
import { translateApiError } from '../../../lib/error-messages'
import {
  importDescriptionImageFromUrl,
  uploadDescriptionImage,
} from '../../../services/media'

type Tab = 'upload' | 'url'

function TabButton({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return active ? (
    <Button color="primary" onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  ) : (
    <Button outline onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  )
}

/**
 * Insert image into the description: either upload a local image or import an
 * external URL. Both paths land in controlled (watermarked) storage — external
 * URLs are imported server-side, never referenced directly.
 */
export function ImageInsertDialog({
  open,
  productId,
  onClose,
  onInsert,
}: {
  open: boolean
  productId: string
  onClose: () => void
  onInsert: (url: string) => void
}) {
  const [tab, setTab] = useState<Tab>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [percent, setPercent] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTab('upload')
      setFile(null)
      setUrl('')
      setPercent(0)
      setBusy(false)
      setError(null)
    }
  }, [open])

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    setFile(event.target.files?.[0] ?? null)
    setError(null)
  }

  const uploadLocal = async (): Promise<void> => {
    if (!file) {
      setError('فایلی انتخاب نشده است.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await uploadDescriptionImage(
        productId,
        file,
        (value) => setPercent(value),
      )
      onInsert(result.url)
    } catch (uploadError) {
      setError(translateApiError(uploadError))
    } finally {
      setBusy(false)
    }
  }

  const importUrl = async (): Promise<void> => {
    if (!url.trim()) {
      setError('آدرس تصویر را وارد کنید.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await importDescriptionImageFromUrl(productId, url.trim())
      onInsert(result.url)
    } catch (importError) {
      setError(translateApiError(importError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Alert open={open} onClose={busy ? () => undefined : onClose} size="lg">
      <AlertTitle>افزودن تصویر</AlertTitle>
      <AlertDescription>
        تصویر بارگذاری یا از یک آدرس وارد میشود؛ تصویر واردشده در فضای امن محصول ذخیره و
        واترمارک میشود.
      </AlertDescription>
      <AlertBody>
        <div className="flex items-center gap-2">
          <TabButton active={tab === 'upload'} onClick={() => setTab('upload')} disabled={busy}>
            بارگذاری از رایانه
          </TabButton>
          <TabButton active={tab === 'url'} onClick={() => setTab('url')} disabled={busy}>
            وارد کردن با آدرس (URL)
          </TabButton>
        </div>

        <div className="mt-5 space-y-4">
          {tab === 'upload' ? (
            <Field>
              <Label>فایل تصویر</Label>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                disabled={busy}
                className="block w-full rounded-lg border border-zinc-950/10 bg-transparent px-3 py-2 text-sm/6 text-foreground data-disabled:opacity-50 dark:border-white/15 dark:text-white"
              />
              <Text className="text-xs text-muted">
                JPG، PNG یا WEBP با حداکثر ۵ مگابایت. پس از بارگذاری، تصویر در سرور پردازش و
                واترمارک میشود.
              </Text>
              {busy && percent > 0 && (
                <Text className="text-xs text-primary" dir="ltr">
                  در حال بارگذاری… {percent}٪
                </Text>
              )}
            </Field>
          ) : (
            <Field>
              <Label>آدرس تصویر</Label>
              <Input
                dir="ltr"
                value={url}
                placeholder="https://example.com/image.jpg"
                onChange={(event) => setUrl(event.target.value)}
                disabled={busy}
              />
              <Text className="text-xs text-muted">
                تصویر از آدرس وارد و در فضای امن محصول ذخیره میشود؛ فقط https معتبر است.
              </Text>
            </Field>
          )}
          {error && <ErrorMessage>{error}</ErrorMessage>}
        </div>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={busy}>
          انصراف
        </Button>
        <Button
          color="primary"
          onClick={() => void (tab === 'upload' ? uploadLocal() : importUrl())}
          disabled={busy || (tab === 'upload' ? !file : !url.trim())}
        >
          {busy ? (tab === 'upload' ? 'در حال بارگذاری…' : 'در حال وارد کردن…') : 'درج تصویر'}
        </Button>
      </AlertActions>
    </Alert>
  )
}