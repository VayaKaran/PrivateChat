import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SetupView } from '../src/views/SetupView.js';

// Mock contexts to isolate UI logic
vi.mock('../src/context/AuthContext.js', () => ({
  useAuth: () => ({
    setAuthSession: vi.fn(),
  }),
}));

vi.mock('../src/context/CryptoContext.js', () => ({
  useCrypto: () => ({
    createKeyBundle: vi.fn(),
    storeAndUnlockKeys: vi.fn(),
  }),
}));

describe('SetupView - Show/Hide Password Toggles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders password fields masked by default with appropriate accessibility attributes', () => {
    render(<SetupView />);

    const masterInput = screen.getByLabelText(/^Master Password/i) as HTMLInputElement;
    const confirmInput = screen.getByLabelText(/^Confirm Password/i) as HTMLInputElement;

    // Both fields must be masked by default
    expect(masterInput.type).toBe('password');
    expect(confirmInput.type).toBe('password');

    // Both toggle buttons exist with correct accessible labels and type="button"
    const masterToggle = screen.getByRole('button', { name: 'Show master password' });
    const confirmToggle = screen.getByRole('button', { name: 'Show confirmation password' });

    expect(masterToggle).toBeInTheDocument();
    expect(confirmToggle).toBeInTheDocument();
    expect(masterToggle).toHaveAttribute('type', 'button');
    expect(confirmToggle).toHaveAttribute('type', 'button');
    expect(masterToggle).toHaveAttribute('aria-pressed', 'false');
    expect(confirmToggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('independently toggles Master Password visibility while preserving input value and Confirm Password state', () => {
    render(<SetupView />);

    const masterInput = screen.getByLabelText(/^Master Password/i) as HTMLInputElement;
    const confirmInput = screen.getByLabelText(/^Confirm Password/i) as HTMLInputElement;

    // Type into both fields
    fireEvent.change(masterInput, { target: { value: 'SuperSecret123!' } });
    fireEvent.change(confirmInput, { target: { value: 'SuperSecret123!' } });

    expect(masterInput.value).toBe('SuperSecret123!');
    expect(confirmInput.value).toBe('SuperSecret123!');

    const masterToggle = screen.getByRole('button', { name: 'Show master password' });

    // Toggle master password visibility ON
    fireEvent.click(masterToggle);

    expect(masterInput.type).toBe('text');
    expect(masterInput.value).toBe('SuperSecret123!'); // Preserves value
    expect(confirmInput.type).toBe('password'); // Confirm remains masked independently
    expect(screen.getByRole('button', { name: 'Hide master password' })).toBeInTheDocument();

    // Toggle master password visibility OFF
    const hideMasterToggle = screen.getByRole('button', { name: 'Hide master password' });
    fireEvent.click(hideMasterToggle);

    expect(masterInput.type).toBe('password');
    expect(masterInput.value).toBe('SuperSecret123!');
    expect(confirmInput.type).toBe('password');
    expect(screen.getByRole('button', { name: 'Show master password' })).toBeInTheDocument();
  });

  it('independently toggles Confirm Password visibility without modifying Master Password', () => {
    render(<SetupView />);

    const masterInput = screen.getByLabelText(/^Master Password/i) as HTMLInputElement;
    const confirmInput = screen.getByLabelText(/^Confirm Password/i) as HTMLInputElement;

    fireEvent.change(masterInput, { target: { value: 'MasterPass987$' } });
    fireEvent.change(confirmInput, { target: { value: 'ConfirmPass987$' } });

    const confirmToggle = screen.getByRole('button', { name: 'Show confirmation password' });

    // Toggle confirm password visibility ON
    fireEvent.click(confirmToggle);

    expect(confirmInput.type).toBe('text');
    expect(confirmInput.value).toBe('ConfirmPass987$');
    expect(masterInput.type).toBe('password'); // Master remains masked
    expect(screen.getByRole('button', { name: 'Hide confirmation password' })).toBeInTheDocument();

    // Toggle confirm password visibility OFF
    const hideConfirmToggle = screen.getByRole('button', { name: 'Hide confirmation password' });
    fireEvent.click(hideConfirmToggle);

    expect(confirmInput.type).toBe('password');
    expect(confirmInput.value).toBe('ConfirmPass987$');
    expect(masterInput.type).toBe('password');
  });

  it('allows both passwords to be visible simultaneously when both toggles are clicked', () => {
    render(<SetupView />);

    const masterInput = screen.getByLabelText(/^Master Password/i) as HTMLInputElement;
    const confirmInput = screen.getByLabelText(/^Confirm Password/i) as HTMLInputElement;

    fireEvent.change(masterInput, { target: { value: 'PasswordA' } });
    fireEvent.change(confirmInput, { target: { value: 'PasswordB' } });

    const masterToggle = screen.getByRole('button', { name: 'Show master password' });
    const confirmToggle = screen.getByRole('button', { name: 'Show confirmation password' });

    fireEvent.click(masterToggle);
    fireEvent.click(confirmToggle);

    expect(masterInput.type).toBe('text');
    expect(confirmInput.type).toBe('text');
    expect(masterInput.value).toBe('PasswordA');
    expect(confirmInput.value).toBe('PasswordB');
  });

  it('preserves password mismatch validation when submitting mismatched passwords', async () => {
    render(<SetupView />);

    const masterInput = screen.getByLabelText(/^Master Password/i);
    const confirmInput = screen.getByLabelText(/^Confirm Password/i);
    const submitBtn = screen.getByRole('button', { name: /Initialize Application/i });

    fireEvent.change(masterInput, { target: { value: 'Password12345!' } });
    fireEvent.change(confirmInput, { target: { value: 'MismatchPassword!' } });

    fireEvent.submit(submitBtn.closest('form')!);

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
  });

  it('preserves minimum length validation when password is too short', async () => {
    render(<SetupView />);

    const masterInput = screen.getByLabelText(/^Master Password/i);
    const confirmInput = screen.getByLabelText(/^Confirm Password/i);
    const submitBtn = screen.getByRole('button', { name: /Initialize Application/i });

    fireEvent.change(masterInput, { target: { value: 'short' } });
    fireEvent.change(confirmInput, { target: { value: 'short' } });

    fireEvent.submit(submitBtn.closest('form')!);

    expect(await screen.findByText('Password must be at least 10 characters long.')).toBeInTheDocument();
  });
});
