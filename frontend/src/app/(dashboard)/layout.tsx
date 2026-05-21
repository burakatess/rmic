import { Sidebar, Header } from '@/components/layout';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-gray-50">
            <Sidebar />
            <Header />
            <main className="ml-64 pt-16 min-h-screen">
                <div className="p-6 xl:p-8 2xl:p-10 w-full max-w-full">
                    {children}
                </div>
            </main>
        </div>
    );
}
