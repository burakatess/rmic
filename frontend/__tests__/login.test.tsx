import { render, screen, fireEvent } from '@testing-library/react';
import Login from '@/app/login/page';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { ToastProvider } from '@/components/ui/Toast';
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
    usePathname() {
        return '/login';
    },
}));

function renderLogin() {
    return render(
        <AuthProvider>
            <ToastProvider>
                <Login />
            </ToastProvider>
        </AuthProvider>,
    );
}

describe('Login Page', () => {
    beforeEach(() => localStorage.clear());

    it('renders the login form', async () => {
        renderLogin();

        expect(await screen.findByText('RMIC')).toBeInTheDocument();

        // Check for email and password inputs
        expect(screen.getByPlaceholderText('ornek@sirket.com')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();

        // Check for the login button
        expect(screen.getByRole('button', { name: /Giriş Yap/i })).toBeInTheDocument();
    });

    it('allows user to type credentials', async () => {
        renderLogin();

        const emailInput = await screen.findByPlaceholderText('ornek@sirket.com');
        const passwordInput = screen.getByPlaceholderText('••••••••');

        fireEvent.change(emailInput, { target: { value: 'admin@grc.com' } });
        fireEvent.change(passwordInput, { target: { value: 'password123' } });

        expect(emailInput).toHaveValue('admin@grc.com');
        expect(passwordInput).toHaveValue('password123');
    });
});
