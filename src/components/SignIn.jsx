import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorMessage, loginErrorMessage } from '../lib/errors.js';
import { login, sessionKey } from '../lib/services/auth.js';
import Field from './Field.jsx';

export default function SignIn({ apiError, onRetry }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const mutation = useMutation({
    mutationFn: login,
    onSuccess: (session) => queryClient.setQueryData(sessionKey, session),
  });

  return (
    <div className="panel auth-panel">
      <h1>GOSSA owner sign in</h1>
      <p className="hint">
        Sign in with the owner email and password created during setup. Your browser password manager can make
        future sign-ins faster.
      </p>
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
        <div className="password-field">
          <Field
            label="Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={mutation.isPending}
          />
          <button
            type="button"
            className="ghost password-toggle"
            aria-pressed={showPassword}
            onClick={() => setShowPassword((visible) => !visible)}
            disabled={mutation.isPending}
          >
            {showPassword ? 'Hide password' : 'Show password'}
          </button>
        </div>
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
