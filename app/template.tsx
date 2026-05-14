/**
 * Root template — wraps every page with a quick fade-in animation.
 *
 * Next.js auto-remounts templates on navigation (unlike layouts), so the
 * CSS `pageEnter` keyframe fires on every route change. ~220ms — fast
 * enough to feel snappy, smooth enough to register as a transition.
 *
 * See: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/template.md
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
