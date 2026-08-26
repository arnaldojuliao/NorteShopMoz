"use client";

import { LoginModal } from "@/components/auth/LoginModal";
import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import { CurrencyProvider } from "@/context/CurrencyContext";
import { FavoritesProvider } from "@/context/FavoritesContext";
import { LoginModalProvider } from "@/context/LoginModalContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { ToastProvider } from "@/context/ToastContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <LoginModalProvider>
            <CurrencyProvider>
              <FavoritesProvider>
                <CartProvider>
                  {children}
                  <LoginModal />
                </CartProvider>
              </FavoritesProvider>
            </CurrencyProvider>
          </LoginModalProvider>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
