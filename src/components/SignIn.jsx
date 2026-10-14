import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { loginErrorMessage } from '../lib/errors.js';
import { login, sessionKey } from '../lib/services/auth.js';
import Field from './Field.jsx';

export default function SignIn() {
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
