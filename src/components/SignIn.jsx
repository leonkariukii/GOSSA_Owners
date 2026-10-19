import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorMessage, loginErrorMessage } from '../lib/errors.js';
import { login, sessionKey } from '../lib/services/auth.js';
import Field from './Field.jsx';

export default function SignIn({ apiError, onRetry }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const mutation = useMutation({
    mutationFn: login,
    onSuccess: (session) => queryClient.setQueryData(sessionKey, session),
  });

  return (
    <div className="panel auth-panel">
      <h1>GOSSA owner sign in</h1>
      {apiError ? (
        <div className="notice notice-error" role="alert">
          <p>Sign-in requires the server. {errorMessage(apiError)}</p>
          {onRetry ? (
            <button type="button" className="ghost" onClick={onRetry}>
              Retry connection
            </button>
          ) : null}
        </div>
      ) : null}
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate({ email: email.trim(), password });
        }}
      >
        <Field
          label="Email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={mutation.isPending}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={mutation.isPending}
        />
        {mutation.error ? (
          <p className="notice notice-error" role="alert">
            {loginErrorMessage(mutation.error)}
          </p>
        ) : null}
        <button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
