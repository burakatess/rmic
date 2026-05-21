import { render, screen, fireEvent } from '@testing-library/react';
import Login from '@/app/login/page';
import '@testing-library/jest-dom';

// Mock the Next.js router
jest.mock('next/navigation', () => ({
    useRouter() {
        return {
            push: jest.fn(),
            replace: jest.fn(),
            prefetch: jest.fn(),
        };
    },
}));

describe('Login Page', () => {
    it('renders the login form', () => {
        render(<Login />);

        // Check if the title is rendered
        expect(screen.getByText('Risk Yönetimi ve İç Kontrol Platformu')).toBeInTheDocument();

        // Check for email and password inputs
        expect(screen.getByPlaceholderText('ornek@sirket.com')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();

        // Check for the login button
        expect(screen.getByRole('button', { name: /Giriş Yap/i })).toBeInTheDocument();
    });

    it('allows user to type credentials', () => {
        render(<Login />);

        const emailInput = screen.getByPlaceholderText('ornek@sirket.com');
        const passwordInput = screen.getByPlaceholderText('••••••••');

        fireEvent.change(emailInput, { target: { value: 'admin@grc.com' } });
        fireEvent.change(passwordInput, { target: { value: 'password123' } });

        expect(emailInput).toHaveValue('admin@grc.com');
        expect(passwordInput).toHaveValue('password123');
    });
});
