import { II_PATH } from "@/lib/early-art";

/** "$ii" with our ii mark (a stick and a dot), never the font's i. */
export function Ticker({ className }: { className?: string }) {
  return (
    <span role="img" aria-label="$ii" className={`whitespace-nowrap ${className ?? ""}`}>
      $
      <svg viewBox="0 0 16 25" className="ml-[0.06em] inline-block h-[0.74em] w-[0.4736em] align-baseline" shapeRendering="crispEdges" aria-hidden>
        <path d={II_PATH} fill="currentColor" />
      </svg>
    </span>
  );
}
