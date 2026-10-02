import React, { useState, useEffect } from 'react';
import { ShieldCheck, Lock, AlertCircle, Sparkles } from 'lucide-react';
import { AdminPortal } from './AdminPortal';
import { db, getShopUser, getShopMeta, saveShopMeta, type ShopUser, type ShopMeta } from '../lib/db/local';
import { AuthScreen } from '../screens/AuthScreen';
import { Button } from '../components/Button';

export const AdminApp: React.FC = () => {
  const [user, setUser] = useState<ShopUser | null>(null);
  const [shop, setShop] = useState<ShopMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if there is an existing logged in super admin
    const checkExistingAuth = async () => {
      const activeUser = await getShopUser();
      const activeShop = await getShopMeta();
      if (activeUser && activeUser.email === 'peterngecu001@gmail.com' && activeShop) {
        setUser(activeUser);
        setShop(activeShop);
      }
    };
    void checkExistingAuth();
  }, []);

  const handleAuthenticated = (authenticatedUser: ShopUser, authenticatedShop: ShopMeta) => {
    if (authenticatedUser.email === 'peterngecu001@gmail.com') {
      setUser(authenticatedUser);
      setShop(authenticatedShop);
      setError(null);
    } else {
      setError('Access Denied: Only authorized SmartSort Super-Admins can access this portal.');
    }
  };

  const handleLogout = async () => {
    await db.meta.delete('user_info');
    setUser(null);
    setShop(null);
  };

  if (!user || !shop) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-emerald-500/20 animate-bounce">
            <ShieldCheck className="w-10 h-10" />
          </div>

          <div className="space-y-1">
            <h1 className="text-xl font-black text-white uppercase tracking-tight">
              SmartSort Central Admin
            </h1>
            <p className="text-xs text-slate-400">
              Please log in with your super-admin credentials to continue
            </p>
          </div>

          {error && (
            <div className="p-3.5 bg-red-950/50 border border-red-500/30 text-red-300 rounded-xl text-xs font-semibold flex items-center gap-2 text-left">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <div className="border-t border-slate-800 pt-4">
            <AuthScreen
              onAuthenticated={handleAuthenticated}
              language="en"
              onToggleLanguage={() => {}}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <AdminPortal
      user={user}
      shop={shop}
      language="en"
      onCloseAdminPortal={handleLogout}
      onUpdateShop={(s) => setShop(s)}
    />
  );
};
