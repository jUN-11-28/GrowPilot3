export default function Loading() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="h-8 w-56 animate-pulse rounded-md bg-line" />
      <div className="h-4 w-80 animate-pulse rounded-md bg-line" />
      <div className="space-y-px overflow-hidden rounded-xl border border-line bg-line">
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-20 animate-pulse bg-surface" />
        ))}
      </div>
    </div>
  );
}
