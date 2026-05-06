export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 border-b border-cream-200 pb-5 sm:mb-8 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div>
        <h1 className="gold-underline text-2xl font-semibold tracking-tight text-navy-900">
          {title}
        </h1>
        {description && (
          <p className="mt-3 text-sm text-navy-600">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
