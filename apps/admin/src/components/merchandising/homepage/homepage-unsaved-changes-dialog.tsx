import {
  Alert,
  AlertActions,
  AlertBody,
  AlertDescription,
  AlertTitle,
} from '../../catalyst/alert'
import { Button } from '../../catalyst/button'
import { UNSAVED_DRAFT_MESSAGE } from '../../../hooks/use-dirty-navigation-guard'

export function HomepageUnsavedChangesDialog({
  open,
  onStay,
  onLeave,
}: {
  open: boolean
  onStay: () => void
  onLeave: () => void
}) {
  return (
    <Alert open={open} onClose={onStay} size="md">
      <AlertTitle>تغییرات ذخیره‌نشده</AlertTitle>
      <AlertDescription>{UNSAVED_DRAFT_MESSAGE}</AlertDescription>
      <AlertBody>
        <p className="text-sm text-muted">
          با خروج، تغییرات این نشست از بین می‌رود. برای نگه‌داشتن آن‌ها در
          ویرایشگر بمانید و پیش‌نویس را ذخیره کنید.
        </p>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onStay}>
          ماندن در ویرایشگر
        </Button>
        <Button color="danger" onClick={onLeave}>
          خروج بدون ذخیره
        </Button>
      </AlertActions>
    </Alert>
  )
}
