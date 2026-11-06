import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import Shell from './components/Shell.jsx';
import SignIn from './components/SignIn.jsx';
import { ErrorState, LoadingState } from './components/States.jsx';
import { createQueryClient } from './lib/queryClient.js';
import { me, sessionKey } from './lib/services/auth.js';

function AuthGate() {
  const session = useQuery({ queryKey: sessionKey, queryFn: me, staleTime: Infinity });

  if (session.data === undefined) {
    if (session.isPending) {
      return (
        <div className="page-shell">
          <LoadingState label="Loading GOSSA…" />
        </div>
      );
    }
    return (
      <div className="page-shell">
        <ErrorState
          title="Could not reach GOSSA"
          error={session.error}
          onRetry={() => session.refetch()}
        />
      </div>
    );
  }
  if (session.data === null) return <SignIn />;
  return <Shell session={session.data} />;
}

export default function App() {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate />
    </QueryClientProvider>
  );
}
