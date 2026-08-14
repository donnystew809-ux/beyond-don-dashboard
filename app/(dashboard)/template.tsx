/**
 * Dashboard page-transition wrapper. Sits INSIDE the dashboard layout, so
 * on navigation only the page content fades/slides in — the shell (header,
 * sidebar, bottom nav) never re-animates and stays rock-solid.
 *
 * Next.js remounts templates on navigation (unlike layouts), which is what
 * re-triggers the CSS `pageEnter` keyframe per route change.
 */
export default function DashboardTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="page-enter">{children}</div>;
}
