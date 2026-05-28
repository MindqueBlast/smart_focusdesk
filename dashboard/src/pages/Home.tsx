import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import type { User } from "firebase/auth";

export default function Home({ user }: { user: User | null }) {
  return (
    <main className="home-page" style={{ 
      minHeight: "85vh", 
      display: "flex", 
      flexDirection: "column", 
      justifyContent: "center", // Keeps content centered vertically
      padding: "1rem 2rem" 
    }}>
      
      {/* Top Section: Hero Split */}
      <section className="hero-grid" style={{ 
        display: "grid", 
        gridTemplateColumns: "1.2fr 0.8fr", 
        alignItems: "center", 
        gap: "2rem",
        marginBottom: "3rem" 
      }}>
        <div className="hero-copy">
          <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            Focus with physical feedback.
          </motion.h1>
          <motion.p className="hero-lede" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            SmartFocus watches your posture and eye movement via your webcam, 
            triggering desk hardware alerts when you drift off-task. 
          </motion.p>
          <motion.div className="hero-actions" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            {user ? (
              <div style={{ display: "flex", gap: "1rem" }}>
                <Link className="primary-action" to="/deck">Open Dashboard</Link>
                <Link className="secondary-action" to="/analytics">View Progress</Link>
              </div>
            ) : (
              <Link className="primary-action" to="/login">Get Started</Link>
            )}
          </motion.div>
        </div>

        {/* Pulse Visual - scaled down slightly to save space */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
          <PulseAnimation />
        </motion.div>
      </section>

      {/* Bottom Section: The Step Thing */}
      <section className="system-band" style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(3, 1fr)", 
        gap: "1rem",
        marginTop: "-9rem" // Negative value pulls it physically closer to the hero section above it
      }}>
        <article>
          <span>1. Track</span>
          <strong>Uses your webcam to monitor focus, not to record video.</strong>
        </article>
        <article>
          <span>2. Alert</span>
          <strong>Physical light signals keep you accountable at your desk.</strong>
        </article>
        <article>
          <span>3. Review</span>
          <strong>See how your focus habits improve over time in your dashboard.</strong>
        </article>
      </section>
    </main>
  );
}

function PulseAnimation() {
  return (
    <div style={{ position: "relative", width: "200px", height: "200px", margin: "0 auto", display: "flex", justifyContent: "center", alignItems: "center" }}>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          style={{ position: "absolute", width: "100%", height: "100%", borderRadius: "50%", border: "2px solid #3b82f6" }}
          initial={{ opacity: 0.5, scale: 0.2 }}
          animate={{ opacity: 0, scale: 1.5 }}
          transition={{ duration: 3, repeat: Infinity, delay: i * 1, ease: "circOut" }}
        />
      ))}
      <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: "#3b82f6", boxShadow: "0 0 15px #3b82f6" }} />
    </div>
  );
}

function SystemMonitor() {
  return (
    <div style={{ 
      display: "grid", 
      gridTemplateColumns: "1fr 1fr", 
      gap: "10px", 
      width: "180px", 
      height: "180px",
      margin: "0 auto" 
    }}>
      {[...Array(4)].map((_, i) => (
        <motion.div
          key={i}
          style={{ 
            background: "#1e293b", 
            borderRadius: "4px", 
            border: "1px solid #3b82f644" 
          }}
          animate={{ 
            opacity: [0.3, 1, 0.3],
            borderColor: ["#3b82f644", "#3b82f6", "#3b82f644"]
          }}
          transition={{ 
            duration: 2 + i, 
            repeat: Infinity, 
            ease: "easeInOut" 
          }}
        />
      ))}
    </div>
  );
}
function HologramVisual() {
  return (
    <div style={{ position: "relative", width: "200px", height: "200px", margin: "0 auto" }}>
      {/* Wireframe Silhouette */}
      <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%", stroke: "#3b82f6", fill: "none", strokeWidth: "1.5" }}>
        {/* Chair/Desk Base */}
        <path d="M20 90 L80 90 M50 90 L50 60 M30 60 L70 60" />
        {/* User Wireframe */}
        <path d="M50 55 C 35 55, 35 35, 50 30 C 65 35, 65 55, 50 55" /> {/* Head */}
        <path d="M50 55 L50 35 M50 40 L35 45 M50 40 L65 45" />         {/* Torso/Arms */}
        <path d="M45 60 L40 85 M55 60 L60 85" />                         {/* Legs */}
      </svg>

      {/* Holographic Scanline Overlay */}
      <motion.div 
        style={{ 
          position: "absolute", top: "10%", left: "10%", right: "10%", height: "2px", 
          background: "#60a5fa", boxShadow: "0 0 10px #60a5fa", opacity: 0.6 
        }}
        animate={{ top: ["10%", "85%", "10%"] }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}