import { useEffect, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth } from "./firebase";
import AnalyticsHub from "./pages/AnalyticsHub";
import Dashboard from "./pages/Dashboard";
import Home from "./pages/Home";
import Login from "./pages/Login";
import History from "./pages/History"; // <--- 1. IMPORT YOUR HISTORY PAGE HERE

function AuthGuard({ user, children }: { user: User | null; children: React.ReactNode }) {
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Shell({ user }: { user: User | null }) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut(auth);
    navigate("/login");
  };

  // 2. ADD AN ENTRY TO YOUR TOP NAV SO YOU CAN GET THERE MANUALLY
  const navItems = [
    { to: "/", label: "Home" },
    { to: "/deck", label: "Deck" },
    { to: "/analytics", label: "Analytics" },
    { to: "/history", label: "Archive" }, // Adds "Archive" cleanly into your top bar menu
  ];

  return (
    <>
      <LayoutGroup>
        <nav className="top-nav">
          <NavLink to="/" className="brand-mark">
            <span className="brand-glyph" />
            SmartFocus
          </NavLink>
          <div className="nav-links">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className="nav-link">
                {({ isActive }) => (
                  <>
                    {isActive && <motion.span layoutId="nav-active" className="nav-active" />}
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
          <div className="nav-account">
            {user ? (
              <>
                <span>{user.displayName ?? user.email ?? "Operator"}</span>
                <button onClick={handleSignOut}>Sign out</button>
              </>
            ) : (
              <NavLink to="/login" className="nav-login">
                Sign in
              </NavLink>
            )}
          </div>
        </nav>
      </LayoutGroup>

      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -6, filter: "blur(3px)" }}
          transition={{ type: "spring", duration: 0.28, bounce: 0 }}
        >
          <Routes location={location}>
            <Route path="/" element={<Home user={user} />} />
            <Route path="/login" element={user ? <Navigate to="/deck" replace /> : <Login />} />
            <Route path="/deck" element={<AuthGuard user={user}><Dashboard /></AuthGuard>} />
            <Route path="/analytics" element={<AuthGuard user={user}><AnalyticsHub /></AuthGuard>} />
            
            {/* 3. REPLACED THE OLD REDIRECT ROUTE WITH THE REAL GUARDED COMPONENT */}
            <Route path="/history" element={<AuthGuard user={user}><History /></AuthGuard>} />
            
            <Route path="/dashboard" element={<Navigate to="/deck" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
    </>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  if (loading) {
    return (
      <div className="boot-screen">
        <span>Loading local command surface</span>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Shell user={user} />
    </BrowserRouter>
  );
}