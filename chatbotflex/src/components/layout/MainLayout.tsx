'use client';

import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  MessageCircle, 
  Users, 
  Bot, 
  Settings, 
  LogOut,
  Shield,
  Menu,
  X
} from 'lucide-react';
import { useState } from 'react';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const { isAdmin, userRole } = usePermissions();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, show: true },
    { name: 'Conversas', href: '/chats', icon: MessageCircle, show: true },
    { name: 'Usuários', href: '/users', icon: Users, show: isAdmin },
    { name: 'Bot Flows', href: '/bot-flows', icon: Bot, show: isAdmin },
    { name: 'Configurações', href: '/settings', icon: Settings, show: isAdmin },
  ];

  const isActive = (href: string) => pathname === href;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-gray-600 bg-opacity-75 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200">
            <div className="flex items-center">
              <div className="h-8 w-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm font-bold">CB</span>
              </div>
              <span className="ml-2 text-xl font-semibold text-gray-900">CharBotFlex</span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-gray-500 hover:text-gray-700"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {navigation.map((item) => 
              item.show ? (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                    isActive(item.href)
                      ? 'bg-indigo-50 text-indigo-600'
                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <item.icon className={`mr-3 h-5 w-5 ${isActive(item.href) ? 'text-indigo-600' : 'text-gray-400'}`} />
                  {item.name}
                </Link>
              ) : null
            )}
          </nav>

          {/* User Info */}
          <div className="border-t border-gray-200 p-4">
            <div className="flex items-center mb-3">
              <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                <span className="text-indigo-600 font-semibold text-sm">
                  {user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U'}
                </span>
              </div>
              <div className="ml-3 flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user?.displayName || user?.email}
                </p>
                <p className="text-xs text-gray-500 flex items-center">
                  {isAdmin && <Shield className="h-3 w-3 mr-1" />}
                  {userRole === 'admin' ? 'Administrador' : 'Operador'}
                </p>
              </div>
            </div>
            <button
              onClick={signOut}
              className="w-full flex items-center justify-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Mobile header */}
        <div className="lg:hidden sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-500 hover:text-gray-700"
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>

        {/* Page content */}
        <main>
          {children}
        </main>
      </div>
    </div>
  );
}
