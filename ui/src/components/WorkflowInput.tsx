import { useState } from 'react';

interface Props {
  onSubmit: (workflowId: string) => void;
  initial?: string;
}

export function WorkflowInput({ onSubmit, initial = '' }: Props) {
  const [value, setValue] = useState(initial);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Enter workflow ID…"
        className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        autoFocus
      />
      <button
        type="submit"
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        disabled={!value.trim()}
      >
        Load
      </button>
    </form>
  );
}
