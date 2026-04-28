import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from '../api';

export function ConnectionBadge() {
  const { data, isError } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 10_000,
    retry: false,
  });

  const connected = !isError && data?.temporal?.connected;

  return (
    <div className="flex items-center gap-1.5 text-sm text-gray-500">
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          connected ? 'bg-green-500' : 'bg-red-400'
        }`}
      />
      <span>{connected ? 'Connected' : 'Disconnected'}</span>
    </div>
  );
}
