// The workspace skeleton is mounted per section, never above a `[param]`
// segment: a Suspense boundary above a lookup-decided route makes its
// `notFound()` answer HTTP 200. See WorkspaceLoadingSkeleton.
export { default } from '@/components/WorkspaceLoadingSkeleton';
