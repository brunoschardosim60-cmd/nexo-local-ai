import { NexoMark } from '@/components/nexo-mark';
export type OrbState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'working'
  | 'error';
export function NexoOrb({
  state = 'idle',
  className = '',
}: {
  state?: OrbState;
  className?: string;
}) {
  return (
    <div
      className={`nexo-orb nexo-orb-${state} ${className}`}
      aria-hidden="true"
    >
      <span className="nexo-orb-core">
        <NexoMark className="size-[48%]" />
      </span>
      <i />
      <b />
    </div>
  );
}
