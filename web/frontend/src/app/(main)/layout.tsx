import Sidebar from '@/components/layout/Sidebar';
import Topbar from '@/components/layout/Topbar';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
        <footer className="shrink-0 border-t border-gray-200 bg-white px-6 py-2.5 text-xs text-gray-400 text-center">
          DentAI © 2026 - Hệ thống AI hỗ trợ chẩn đoán viêm lợi
        </footer>
      </div>
    </div>
  );
}
