import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

export default function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      navigate("/dashboard");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Authentication failed.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      background: "#030712",
    }}>
      <div className="animate-fade-in" style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "2rem",
      }}>
        {/* System identity */}
        <div style={{ textAlign: "center" }}>
          <h1 style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: "1.5rem",
            fontWeight: 600,
            color: "#e5e7eb",
            margin: 0,
            letterSpacing: "0.05em",
          }}>
            Smart FocusDesk
          </h1>
          <p style={{
            color: "#6b7280",
            fontSize: "0.8rem",
            marginTop: "0.5rem",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}>
            Cognitive Tracking System
          </p>
        </div>

        {/* Login button */}
        <button
          id="login-btn"
          onClick={handleGoogleLogin}
          disabled={loading}
          style={{
            background: "transparent",
            border: "1px solid #1e293b",
            color: "#d1d5db",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: "0.875rem",
            fontWeight: 500,
            padding: "0.75rem 2rem",
            borderRadius: "0.5rem",
            cursor: loading ? "wait" : "pointer",
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            opacity: loading ? 0.5 : 1,
            letterSpacing: "0.02em",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "#3b82f6";
            e.currentTarget.style.color = "#f3f4f6";
            e.currentTarget.style.boxShadow = "0 0 20px rgba(59, 130, 246, 0.15)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "#1e293b";
            e.currentTarget.style.color = "#d1d5db";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          {loading ? "Authenticating…" : "Authenticate via Google"}
        </button>

        {error && (
          <p style={{ color: "#ef4444", fontSize: "0.8rem", margin: 0 }}>{error}</p>
        )}
      </div>
    </div>
  );
}
