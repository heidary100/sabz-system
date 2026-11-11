import { forwardRef } from 'react'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  TouchTarget,
  buttonClassName,
  type ButtonStyleOptions,
} from '../catalyst/button'

type LinkButtonProps = ButtonStyleOptions &
  Omit<ComponentPropsWithoutRef<typeof Link>, 'className'> & {
    children: ReactNode
  }

/**
 * A single interactive link styled with the Catalyst button classes. It uses
 * React Router navigation, so it must not be nested inside another link or
 * button. Disabled link states are intentionally not supported; callers should
 * render plain text or omit the action instead of faking a disabled link.
 */
export const LinkButton = forwardRef<HTMLAnchorElement, LinkButtonProps>(
  function LinkButton(
    { color, outline, plain, className, children, ...props },
    ref,
  ) {
    return (
      <Link
        {...props}
        ref={ref}
        className={buttonClassName({
          color,
          outline,
          plain,
          // Catalyst's Button focus styling depends on Headless UI's
          // `data-focus` state. A router Link never receives it, so restore a
          // token-based keyboard outline explicitly for links.
          className: [
            className,
            'focus-ring',
            'focus-visible:outline-2!',
            'focus-visible:outline-offset-2!',
            'focus-visible:outline-solid!',
            'focus-visible:outline-(--color-focus-ring)!',
          ]
            .filter(Boolean)
            .join(' '),
        })}
      >
        <TouchTarget>{children}</TouchTarget>
      </Link>
    )
  },
)
