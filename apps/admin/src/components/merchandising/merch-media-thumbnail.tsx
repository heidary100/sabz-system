import { useEffect, useState } from 'react'
import { ImageOff } from 'lucide-react'
import clsx from 'clsx'
import { getMerchMediaThumbnail } from '../../services/merchandising'

/**
 * Authenticated thumbnail loader. Merchandising media is private until the
 * current homepage publication makes it eligible, so this never uses the public
 * storefront URL.
 */
export function MerchMediaThumbnail({
  mediaId,
  alt,
  className,
}: {
  mediaId: string
  alt: string
  className?: string
}) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    setState('loading')
    setUrl(null)

    getMerchMediaThumbnail(mediaId)
      .then((blob) => {
        if (cancelled) {
          return
        }
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
        setState('ready')
      })
      .catch(() => {
        if (!cancelled) {
          setState('error')
        }
      })

    return () => {
      cancelled = true
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [mediaId])

  if (state === 'ready' && url) {
    return (
      <img
        src={url}
        alt={alt}
        className={clsx('size-full object-cover', className)}
      />
    )
  }

  if (state === 'error') {
    return (
      <div
        className={clsx(
          'flex size-full flex-col items-center justify-center gap-2 text-muted',
          className,
        )}
      >
        <ImageOff className="size-7" aria-hidden="true" />
        <span className="text-xs">پیش‌نمایش در دسترس نیست</span>
      </div>
    )
  }

  return (
    <div
      role="status"
      aria-label="در حال بارگذاری پیش‌نمایش"
      className={clsx(
        'flex size-full items-center justify-center bg-surface-strong',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="size-6 animate-spin rounded-full border-2 border-hunter-800 border-t-primary motion-reduce:animate-none"
      />
    </div>
  )
}
